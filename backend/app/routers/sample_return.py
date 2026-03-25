from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List
from collections import defaultdict
from uuid import uuid4

from app.database import get_db
from app.models.sample_return import SampleReturn, SampleReturnLine
from app.models.sample_issue import SampleIssue
from app.models.inventory import Item
from app.models.item_stock import ItemStock
from app.schemas.sample_return import SampleReturnCreate, SampleReturnResponse, SampleReturnSummary
from app.utils.doc_number import generate_doc_number
from app.utils.normalize import normalize_item_name

router = APIRouter(prefix="/api/sample-returns", tags=["Sample Returns"])

def _get_item_for_update(db: Session, item_name: str) -> Item | None:
    key = normalize_item_name(item_name or "")
    query = db.query(Item).with_hint(Item, "WITH (UPDLOCK, ROWLOCK)", "mssql")
    if key:
        return query.filter((Item.item_name_key == key) | (Item.item_name == item_name)).first()
    return query.filter(Item.item_name == item_name).first()


def _get_stock_for_update(db: Session, item_id: str, location: str) -> ItemStock | None:
    return (
        db.query(ItemStock)
        .with_hint(ItemStock, "WITH (UPDLOCK, ROWLOCK)", "mssql")
        .filter(ItemStock.item_id == item_id)
        .filter(ItemStock.location == location)
        .first()
    )


@router.get("/", response_model=List[SampleReturnResponse])
def get_all_sample_returns(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all sample returns"""
    # MSSQL requires ORDER BY when using OFFSET/FETCH. Avoid OFFSET when skip=0.
    query = db.query(SampleReturn).order_by(SampleReturn.created_at.desc())
    if skip:
        query = query.offset(skip)
    returns = query.limit(limit).all()
    return returns


@router.get("/summaries", response_model=List[SampleReturnSummary])
def list_sample_return_summaries(
    skip: int = 0,
    limit: int = 50,
    q: str | None = None,
    db: Session = Depends(get_db),
):
    """
    List recent sample returns with store + partial/full classification.
    """
    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200

    latest_returned = (
        db.query(
            SampleReturn.original_issue_id.label("issue_id"),
            func.max(SampleReturn.created_at).label("max_created_at"),
        )
        .filter(SampleReturn.status == "Returned")
        .group_by(SampleReturn.original_issue_id)
        .subquery()
    )

    totals_by_header = (
        db.query(
            SampleReturnLine.header_id.label("header_id"),
            func.count(SampleReturnLine.id).label("line_count"),
            func.coalesce(func.sum(SampleReturnLine.qty_return), 0.0).label("total_qty_return"),
        )
        .group_by(SampleReturnLine.header_id)
        .subquery()
    )

    query = (
        db.query(
            SampleReturn,
            SampleIssue,
            latest_returned.c.max_created_at,
            totals_by_header.c.line_count,
            totals_by_header.c.total_qty_return,
        )
        .join(SampleIssue, SampleIssue.id == SampleReturn.original_issue_id)
        .outerjoin(latest_returned, latest_returned.c.issue_id == SampleReturn.original_issue_id)
        .outerjoin(totals_by_header, totals_by_header.c.header_id == SampleReturn.id)
        .order_by(SampleReturn.created_at.desc())
    )

    if q and q.strip():
        needle = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(SampleReturn.doc_number).like(needle),
                func.lower(SampleIssue.doc_number).like(needle),
                func.lower(func.coalesce(SampleIssue.location_stored, "")).like(needle),
                func.lower(func.coalesce(SampleReturn.status, "")).like(needle),
            )
        )
    if skip:
        query = query.offset(skip)
    rows = query.limit(limit).all()

    result: list[SampleReturnSummary] = []
    for (ret, issue, max_created_at, line_count, total_qty_return) in rows:
        if ret.status != "Returned":
            scope = "Draft"
        else:
            is_latest = bool(max_created_at) and (ret.created_at == max_created_at)
            scope = "Full" if (issue.status == "Returned" and is_latest) else "Partial"

        result.append(
            SampleReturnSummary(
                id=ret.id,
                doc_number=ret.doc_number,
                original_issue_id=ret.original_issue_id,
                original_issue_doc_number=issue.doc_number,
                store_location=issue.location_stored,
                date_of_return=ret.date_of_return,
                status=ret.status,
                return_scope=scope,
                line_count=int(line_count or 0),
                total_qty_return=float(total_qty_return or 0.0),
            )
        )
    return result


@router.get("/{return_id}", response_model=SampleReturnResponse)
def get_sample_return(return_id: str, db: Session = Depends(get_db)):
    """Get a specific sample return by ID"""
    sample_return = db.query(SampleReturn).filter(SampleReturn.id == return_id).first()
    if not sample_return:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample return with id {return_id} not found"
        )
    return sample_return


@router.post("/", response_model=SampleReturnResponse, status_code=status.HTTP_201_CREATED)
def create_sample_return(sample_return: SampleReturnCreate, db: Session = Depends(get_db)):
    """Create a new sample return"""
    try:
        # Validate original issue exists
        original_issue = db.query(SampleIssue).filter(
            SampleIssue.id == sample_return.original_issue_id
        ).first()
        if not original_issue:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Original sample issue with id {sample_return.original_issue_id} not found"
            )

        if original_issue.status != "Issued":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Can only create returns for issued samples (current status: {original_issue.status})"
            )

        location = (original_issue.location_stored or "").strip()
        if sample_return.status == "Returned" and not location:
            raise HTTPException(status_code=400, detail="Original issue has no location_stored; cannot apply return to inventory")

        # Compute issued quantities per item for the original issue (sum across lines).
        issued_by_item: dict[str, float] = defaultdict(float)
        for issue_line in original_issue.line_items:
            issued_by_item[issue_line.item_name] += float(issue_line.qty_issue)

        # Compute already-returned quantities per item for this original issue (only Returned returns).
        returned_rows = (
            db.query(
                SampleReturnLine.item_name,
                func.coalesce(func.sum(SampleReturnLine.qty_return), 0.0).label("qty_returned"),
            )
            .join(SampleReturn, SampleReturn.id == SampleReturnLine.header_id)
            .filter(SampleReturn.original_issue_id == sample_return.original_issue_id)
            .filter(SampleReturn.status == "Returned")
            .group_by(SampleReturnLine.item_name)
            .all()
        )
        already_returned_by_item = {row.item_name: float(row.qty_returned or 0.0) for row in returned_rows}

        # Sum requested returns per item (avoid bypass via duplicate lines).
        requested_by_item: dict[str, float] = defaultdict(float)
        for line_item in sample_return.line_items:
            requested_by_item[line_item.item_name] += float(line_item.qty_return)

        # Validate each requested item exists on the original issue and has remaining quantity.
        for item_name, requested_qty in requested_by_item.items():
            issued_qty = issued_by_item.get(item_name)
            if issued_qty is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item {item_name} was not issued on the original document",
                )

            already_returned = already_returned_by_item.get(item_name, 0.0)
            remaining = issued_qty - already_returned
            if remaining <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"No remaining quantity to return for item {item_name}",
                )
            if requested_qty > remaining:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Return quantity exceeds remaining for item {item_name}. "
                        f"Issued: {issued_qty}, Already Returned: {already_returned}, "
                        f"Remaining: {remaining}, Requested: {requested_qty}"
                    ),
                )

        # Generate document number
        doc_number = generate_doc_number(db, SampleReturn, "SR")

        # Create header
        return_id = str(uuid4())
        db_return = SampleReturn(
            id=return_id,
            doc_number=doc_number,
            **sample_return.model_dump(exclude={'line_items'})
        )
        db.add(db_return)

        # Create line items and update inventory
        for line_item in sample_return.line_items:
            issued_qty = issued_by_item.get(line_item.item_name, 0.0)
            payload = line_item.model_dump()
            payload["qty_issued"] = issued_qty
            db_line = SampleReturnLine(
                id=str(uuid4()),
                header_id=return_id,
                **payload
            )
            db.add(db_line)

            if sample_return.status == "Returned":
                item = _get_item_for_update(db, line_item.item_name)
                if item:
                    stock = _get_stock_for_update(db, item.id, location)
                    if not stock:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"No stock record for item {line_item.item_name} at location {location}",
                        )
                    current_issued = float(stock.qty_issued or 0.0)
                    qty_to_return = float(line_item.qty_return)
                    if qty_to_return > current_issued:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Return would make item {line_item.item_name} issued quantity negative",
                        )
                    stock.qty_issued = current_issued - qty_to_return

        # Update original issue status if all items returned
        if sample_return.status == "Returned":
            total_issued = sum(issued_by_item.values())
            total_already_returned = sum(already_returned_by_item.values())
            total_requested = sum(requested_by_item.values())
            if (total_already_returned + total_requested) >= total_issued:
                original_issue.status = "Returned"

        db.commit()
        db.refresh(db_return)
        return db_return
    except Exception:
        db.rollback()
        raise


@router.delete("/{return_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sample_return(return_id: str, db: Session = Depends(get_db)):
    """Delete a sample return (only if status is Draft)"""
    db_return = db.query(SampleReturn).filter(SampleReturn.id == return_id).first()
    if not db_return:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample return with id {return_id} not found"
        )

    if db_return.status != "Draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft sample returns can be deleted"
        )

    db.delete(db_return)
    db.commit()
    return None
