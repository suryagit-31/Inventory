from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import func
from datetime import date, datetime
from typing import Any, List, Optional
from collections import defaultdict
from uuid import uuid4

from app.database import get_db
from app.models.sample_issue import SampleIssue, SampleIssueLine
from app.models.sample_return import SampleReturn, SampleReturnLine
from app.models.inventory import Item
from app.models.item_stock import ItemStock
from app.schemas.sample_issue import (
    SampleIssueCreate,
    SampleIssueUpdate,
    SampleIssueResponse,
    SampleIssueReturnableLine,
)
from app.utils.doc_number import generate_doc_number
from app.utils.normalize import normalize_item_name
from app.utils.report_xlsx import build_workbook

router = APIRouter(prefix="/api/sample-issues", tags=["Sample Issues"])

_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_LEGACY_WORK_ID = "LEGACY"

def _today_suffix() -> str:
    return date.today().isoformat()

def _effective_issue_status(issued_total: float, returned_total: float) -> str:
    """
    Derive an issue status from movement totals.
    - Issued: nothing returned yet
    - Partial Return: some returned but not all
    - Returned: fully returned
    """
    issued = float(issued_total or 0.0)
    returned = float(returned_total or 0.0)
    if issued <= 0:
        return "Issued"
    if returned >= issued:
        return "Returned"
    if returned > 0:
        return "Partial Return"
    return "Issued"


def _apply_effective_statuses(db: Session, issues: list[SampleIssue]) -> None:
    """
    For legacy data (e.g., before Partial Return existed), compute and override
    response status without writing to DB.
    """
    ids = [i.id for i in issues if i and i.id]
    if not ids:
        return

    issued_rows = (
        db.query(
            SampleIssueLine.header_id.label("issue_id"),
            func.coalesce(func.sum(SampleIssueLine.qty_issue), 0.0).label("qty_issued_total"),
        )
        .filter(SampleIssueLine.header_id.in_(ids))
        .group_by(SampleIssueLine.header_id)
        .all()
    )
    issued_totals = {r.issue_id: float(r.qty_issued_total or 0.0) for r in issued_rows}

    returned_rows = (
        db.query(
            SampleReturn.original_issue_id.label("issue_id"),
            func.coalesce(func.sum(SampleReturnLine.qty_return), 0.0).label("qty_returned_total"),
        )
        .join(SampleReturnLine, SampleReturn.id == SampleReturnLine.header_id)
        .filter(SampleReturn.status == "Returned")
        .filter(SampleReturn.original_issue_id.in_(ids))
        .group_by(SampleReturn.original_issue_id)
        .all()
    )
    returned_totals = {r.issue_id: float(r.qty_returned_total or 0.0) for r in returned_rows}

    for issue in issues:
        if not issue:
            continue
        if issue.status == "Draft":
            continue
        issued_total = issued_totals.get(issue.id, 0.0)
        returned_total = returned_totals.get(issue.id, 0.0)
        issue.status = _effective_issue_status(issued_total, returned_total)


def _available(qty_on_hand: float | None, qty_issued: float | None) -> float:
    return max(float(qty_on_hand or 0.0) - float(qty_issued or 0.0), 0.0)


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

@router.get("/", response_model=List[SampleIssueResponse])
def get_all_sample_issues(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[str] = None,
    project_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all sample issues with optional filters"""
    try:
        query = db.query(SampleIssue)
        if status_filter:
            raw = status_filter.strip()
            if "," in raw:
                statuses = [s.strip() for s in raw.split(",") if s.strip()]
                if statuses:
                    query = query.filter(SampleIssue.status.in_(statuses))
            else:
                query = query.filter(SampleIssue.status == raw)
        if project_id:
            query = query.filter(SampleIssue.project_id == project_id)
        # MSSQL requires ORDER BY when using OFFSET/FETCH. Avoid OFFSET when skip=0.
        query = query.order_by(SampleIssue.created_at.desc())
        if skip:
            query = query.offset(skip)
        issues = query.limit(limit).all()
        _apply_effective_statuses(db, issues)
        return issues
    except SQLAlchemyError as exc:
        # For the list endpoint, degrade to "no data" on DB errors so the UI can render an empty
        # state (and not spin on repeated 500s during setup/misconfiguration).
        print(f"Warning: failed to query sample_issues: {exc}")
        return []


@router.get("/export.xlsx")
def export_sample_issues_xlsx(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[str] = None,
    project_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Export sample issues list as XLSX (intended for the "Latest Issued / Returned" list).
    """
    issues = get_all_sample_issues(
        skip=skip,
        limit=limit,
        status_filter=status_filter,
        project_id=project_id,
        db=db,
    )
    now = datetime.now()

    data: list[dict[str, Any]] = []
    for iss in issues:
        dt = iss.date_of_issue
        aging = (now - dt).days if dt else None
        data.append(
            {
                "doc_number": iss.doc_number,
                "project_id": iss.project_id,
                "customer_name": iss.customer_name,
                "date_of_issue": (dt.isoformat() if dt else None)[:10] if dt else None,
                "status": iss.status,
                "aging_days": aging,
                "location_stored": iss.location_stored,
                "business_unit": iss.business_unit,
            }
        )

    xlsx_bytes = build_workbook(
        report_name="Latest Sample Issues",
        generated_at=now.isoformat(),
        filters={"skip": skip, "limit": limit, "status_filter": status_filter, "project_id": project_id},
        summary={"rows": len(data)},
        rows=data,
        column_order=[
            "doc_number",
            "project_id",
            "customer_name",
            "date_of_issue",
            "status",
            "aging_days",
            "location_stored",
            "business_unit",
        ],
        column_titles={
            "doc_number": "Doc #",
            "project_id": "Project ID",
            "customer_name": "Customer",
            "date_of_issue": "Date",
            "status": "Status",
            "aging_days": "Aging (Days)",
            "location_stored": "Store",
            "business_unit": "Business Unit",
        },
    )
    filename = f"sample-issues-{_today_suffix()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type=_XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{issue_id}", response_model=SampleIssueResponse)
def get_sample_issue(issue_id: str, db: Session = Depends(get_db)):
    """Get a specific sample issue by ID"""
    issue = db.query(SampleIssue).filter(SampleIssue.id == issue_id).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample issue with id {issue_id} not found"
        )
    _apply_effective_statuses(db, [issue])
    return issue


@router.get("/doc/{doc_number}", response_model=SampleIssueResponse)
def get_sample_issue_by_doc_number(doc_number: str, db: Session = Depends(get_db)):
    """Get a specific sample issue by document number"""
    issue = db.query(SampleIssue).filter(SampleIssue.doc_number == doc_number).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample issue with doc number {doc_number} not found",
        )
    _apply_effective_statuses(db, [issue])
    return issue


@router.get("/{issue_id}/returnable", response_model=List[SampleIssueReturnableLine])
def get_issue_returnable_quantities(issue_id: str, db: Session = Depends(get_db)):
    """
    Return per-item quantities for creating returns:
    - total issued on this document
    - total already returned (only Returned returns)
    - remaining returnable
    - current inventory qty snapshot (on_hand / issued / available)
    """
    issue = db.query(SampleIssue).filter(SampleIssue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail=f"Sample issue with id {issue_id} not found")

    issued_by_item_work: dict[tuple[str, str], float] = defaultdict(float)
    description_by_item_work: dict[tuple[str, str], str | None] = {}
    for line in issue.line_items:
        work_id = (line.work_id or "").strip() or _LEGACY_WORK_ID
        key = (line.item_name, work_id)
        issued_by_item_work[key] += float(line.qty_issue or 0.0)
        description_by_item_work.setdefault(key, line.description)

    returned_rows = (
        db.query(
            SampleReturnLine.item_name,
            SampleReturnLine.work_id,
            func.coalesce(func.sum(SampleReturnLine.qty_return), 0.0).label("qty_returned"),
        )
        .join(SampleReturn, SampleReturn.id == SampleReturnLine.header_id)
        .filter(SampleReturn.original_issue_id == issue_id)
        .filter(SampleReturn.status == "Returned")
        .group_by(SampleReturnLine.item_name, SampleReturnLine.work_id)
        .all()
    )
    returned_by_item_work = {
        (row.item_name, ((row.work_id or "").strip() or _LEGACY_WORK_ID)): float(row.qty_returned or 0.0)
        for row in returned_rows
    }

    item_names = sorted({name for (name, _work_id) in issued_by_item_work.keys()})
    inventory_items = db.query(Item).filter(Item.item_name.in_(item_names)).all()
    item_by_name = {it.item_name: it for it in inventory_items}

    location = (issue.location_stored or "").strip()
    stock_by_item_id: dict[str, ItemStock] = {}
    if location and inventory_items:
        stocks = (
            db.query(ItemStock)
            .filter(ItemStock.location == location)
            .filter(ItemStock.item_id.in_([it.id for it in inventory_items]))
            .all()
        )
        stock_by_item_id = {s.item_id: s for s in stocks}

    result: list[SampleIssueReturnableLine] = []
    for (item_name, work_id), issued_total in issued_by_item_work.items():
        returned_total = float(returned_by_item_work.get((item_name, work_id), 0.0))
        remaining = max(float(issued_total) - returned_total, 0.0)
        inv_item = item_by_name.get(item_name)
        inv_stock = stock_by_item_id.get(inv_item.id) if inv_item and location else None
        inv_on_hand = float(inv_stock.qty_on_hand) if inv_stock and inv_stock.qty_on_hand is not None else None
        inv_issued = float(inv_stock.qty_issued) if inv_stock and inv_stock.qty_issued is not None else None
        inv_available = _available(inv_on_hand, inv_issued) if inv_stock else None
        result.append(
            SampleIssueReturnableLine(
                item_name=item_name,
                work_id=work_id,
                description=description_by_item_work.get((item_name, work_id)),
                qty_issued_total=float(issued_total),
                qty_returned_total=returned_total,
                qty_remaining=remaining,
                inventory_qty_on_hand=inv_on_hand,
                inventory_qty_issued=inv_issued,
                inventory_qty_available=inv_available,
            )
        )

    # Sort so most-returnable items appear first.
    result.sort(key=lambda r: (-r.qty_remaining, r.item_name, r.work_id))
    return result


@router.post("/", response_model=SampleIssueResponse, status_code=status.HTTP_201_CREATED)
def create_sample_issue(issue: SampleIssueCreate, db: Session = Depends(get_db)):
    """Create a new sample issue"""
    try:
        if issue.status == "Issued" and not (issue.location_stored or "").strip():
            raise HTTPException(status_code=400, detail="location_stored is required when issuing samples")

        # Generate document number
        doc_number = generate_doc_number(db, SampleIssue, "SI")

        # Pre-validate inventory availability per item (sum across duplicate lines).
        requested_by_item: dict[str, float] = defaultdict(float)
        for line_item in issue.line_items:
            requested_by_item[line_item.item_name] += float(line_item.qty_issue)

        item_by_name: dict[str, Item] = {}
        available_by_item: dict[str, float] = {}
        for item_name, requested_qty in requested_by_item.items():
            item = _get_item_for_update(db, item_name)
            if not item:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Item {item_name} not found",
                )
            available = 0.0
            if issue.status == "Issued":
                location = (issue.location_stored or "").strip()
                stock = _get_stock_for_update(db, item.id, location)
                available = _available(stock.qty_on_hand if stock else 0.0, stock.qty_issued if stock else 0.0)
                if requested_qty > available:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Insufficient available quantity for item {item_name}. "
                            f"Available: {available}, Requested: {requested_qty}"
                        ),
                    )
            item_by_name[item_name] = item
            available_by_item[item_name] = available

        # Create header
        issue_id = str(uuid4())
        db_issue = SampleIssue(
            id=issue_id,
            doc_number=doc_number,
            **issue.model_dump(exclude={'line_items'})
        )
        db.add(db_issue)

        # Create line items
        for line_item in issue.line_items:
            payload = line_item.model_dump()
            # For Issued documents, store a server-side snapshot of available qty.
            # For Draft documents, keep the client-supplied qty_on_hand so drafts can be saved without
            # hard-blocking on availability checks (the final Issued transition enforces stock).
            if issue.status == "Issued":
                payload["qty_on_hand"] = available_by_item[line_item.item_name]
            db_line = SampleIssueLine(
                id=str(uuid4()),
                header_id=issue_id,
                **payload
            )
            db.add(db_line)

        # Update inventory if status is 'Issued' (apply once per item to avoid double-counting).
        if issue.status == "Issued":
            location = (issue.location_stored or "").strip()
            for item_name, requested_qty in requested_by_item.items():
                item = item_by_name[item_name]
                stock = _get_stock_for_update(db, item.id, location)
                if not stock:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"No stock record for item {item_name} at location {location}",
                    )
                stock.qty_issued = float(stock.qty_issued or 0.0) + requested_qty

        db.commit()
        db.refresh(db_issue)
        return db_issue
    except Exception:
        db.rollback()
        raise


@router.put("/{issue_id}", response_model=SampleIssueResponse)
def update_sample_issue(
    issue_id: str,
    issue_update: SampleIssueUpdate,
    db: Session = Depends(get_db)
):
    """Update an existing sample issue (status, business unit, subsidiary)"""
    try:
        db_issue = db.query(SampleIssue).filter(SampleIssue.id == issue_id).first()
        if not db_issue:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sample issue with id {issue_id} not found"
            )

        # If changing status from Draft to Issued, update inventory
        if issue_update.status == "Issued" and db_issue.status == "Draft":
            location = (db_issue.location_stored or "").strip()
            if not location:
                raise HTTPException(status_code=400, detail="location_stored is required when issuing samples")

            requested_by_item: dict[str, float] = defaultdict(float)
            for line_item in db_issue.line_items:
                work_id = (line_item.work_id or "").strip()
                if not work_id:
                    raise HTTPException(status_code=400, detail="Work ID is required for all line items before issuing")
                requested_by_item[line_item.item_name] += float(line_item.qty_issue)

            item_by_name: dict[str, Item] = {}
            for item_name, requested_qty in requested_by_item.items():
                item = _get_item_for_update(db, item_name)
                if not item:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Item {item_name} not found",
                    )
                stock = _get_stock_for_update(db, item.id, location)
                available = _available(stock.qty_on_hand if stock else 0.0, stock.qty_issued if stock else 0.0)
                if requested_qty > available:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Insufficient available quantity for item {item_name}. "
                            f"Available: {available}, Requested: {requested_qty}"
                        ),
                    )
                item_by_name[item_name] = item

            for item_name, requested_qty in requested_by_item.items():
                item = item_by_name[item_name]
                stock = _get_stock_for_update(db, item.id, location)
                if not stock:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"No stock record for item {item_name} at location {location}",
                    )
                stock.qty_issued = float(stock.qty_issued or 0.0) + requested_qty

        update_data = issue_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_issue, field, value)

        db.commit()
        db.refresh(db_issue)
        return db_issue
    except Exception:
        db.rollback()
        raise


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sample_issue(issue_id: str, db: Session = Depends(get_db)):
    """Delete a sample issue (only if status is Draft)"""
    db_issue = db.query(SampleIssue).filter(SampleIssue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample issue with id {issue_id} not found"
        )

    if db_issue.status != "Draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft sample issues can be deleted"
        )

    db.delete(db_issue)
    db.commit()
    return None
