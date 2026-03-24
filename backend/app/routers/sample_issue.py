from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import func
from typing import List, Optional
from collections import defaultdict
from uuid import uuid4

from app.database import get_db
from app.models.sample_issue import SampleIssue, SampleIssueLine
from app.models.sample_return import SampleReturn, SampleReturnLine
from app.models.inventory import Item
from app.schemas.sample_issue import (
    SampleIssueCreate,
    SampleIssueUpdate,
    SampleIssueResponse,
    SampleIssueReturnableLine,
)
from app.utils.doc_number import generate_doc_number

router = APIRouter(prefix="/api/sample-issues", tags=["Sample Issues"])


def _is_missing_table_error(exc: SQLAlchemyError) -> bool:
    # SQL Server missing-table errors typically show up as 42S02 / "Invalid object name".
    message = str(exc).lower()
    return "invalid object name" in message or "42s02" in message


def _item_available_qty(item: Item) -> float:
    # Prefer persisted qty_available, but fall back to computed value for safety.
    qty_on_hand = float(item.qty_on_hand or 0.0)
    qty_issued = float(item.qty_issued or 0.0)
    qty_available = item.qty_available
    if qty_available is None:
        return max(qty_on_hand - qty_issued, 0.0)
    return float(qty_available)


@router.get("/", response_model=List[SampleIssueResponse])
def get_all_sample_issues(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[str] = None,
    project_number: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all sample issues with optional filters"""
    try:
        query = db.query(SampleIssue)
        if status_filter:
            query = query.filter(SampleIssue.status == status_filter)
        if project_number:
            query = query.filter(SampleIssue.project_number == project_number)
        # MSSQL requires ORDER BY when using OFFSET/FETCH. Avoid OFFSET when skip=0.
        query = query.order_by(SampleIssue.created_at.desc())
        if skip:
            query = query.offset(skip)
        issues = query.limit(limit).all()
        return issues
    except SQLAlchemyError as exc:
        # For the list endpoint, degrade to "no data" on DB errors so the UI can render an empty
        # state (and not spin on repeated 500s during setup/misconfiguration).
        print(f"Warning: failed to query sample_issues: {exc}")
        return []


@router.get("/{issue_id}", response_model=SampleIssueResponse)
def get_sample_issue(issue_id: str, db: Session = Depends(get_db)):
    """Get a specific sample issue by ID"""
    issue = db.query(SampleIssue).filter(SampleIssue.id == issue_id).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample issue with id {issue_id} not found"
        )
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

    issued_by_item: dict[str, float] = defaultdict(float)
    description_by_item: dict[str, str | None] = {}
    for line in issue.line_items:
        issued_by_item[line.item_name] += float(line.qty_issue or 0.0)
        description_by_item.setdefault(line.item_name, line.description)

    returned_rows = (
        db.query(
            SampleReturnLine.item_name,
            func.coalesce(func.sum(SampleReturnLine.qty_return), 0.0).label("qty_returned"),
        )
        .join(SampleReturn, SampleReturn.id == SampleReturnLine.header_id)
        .filter(SampleReturn.original_issue_id == issue_id)
        .filter(SampleReturn.status == "Returned")
        .group_by(SampleReturnLine.item_name)
        .all()
    )
    returned_by_item = {row.item_name: float(row.qty_returned or 0.0) for row in returned_rows}

    inventory_items = (
        db.query(Item)
        .filter(Item.item_name.in_(list(issued_by_item.keys())))
        .all()
    )
    inventory_by_name = {it.item_name: it for it in inventory_items}

    result: list[SampleIssueReturnableLine] = []
    for item_name, issued_total in issued_by_item.items():
        returned_total = float(returned_by_item.get(item_name, 0.0))
        remaining = max(float(issued_total) - returned_total, 0.0)
        inv = inventory_by_name.get(item_name)
        result.append(
            SampleIssueReturnableLine(
                item_name=item_name,
                description=description_by_item.get(item_name),
                qty_issued_total=float(issued_total),
                qty_returned_total=returned_total,
                qty_remaining=remaining,
                inventory_qty_on_hand=float(inv.qty_on_hand) if inv and inv.qty_on_hand is not None else None,
                inventory_qty_issued=float(inv.qty_issued) if inv and inv.qty_issued is not None else None,
                inventory_qty_available=float(inv.qty_available) if inv and inv.qty_available is not None else None,
            )
        )

    # Sort so most-returnable items appear first.
    result.sort(key=lambda r: (-r.qty_remaining, r.item_name))
    return result


@router.post("/", response_model=SampleIssueResponse, status_code=status.HTTP_201_CREATED)
def create_sample_issue(issue: SampleIssueCreate, db: Session = Depends(get_db)):
    """Create a new sample issue"""
    # Generate document number
    doc_number = generate_doc_number(db, SampleIssue, "SI")

    # Pre-validate inventory availability per item (sum across duplicate lines).
    requested_by_item: dict[str, float] = defaultdict(float)
    for line_item in issue.line_items:
        requested_by_item[line_item.item_name] += float(line_item.qty_issue)

    item_by_name: dict[str, Item] = {}
    available_by_item: dict[str, float] = {}
    for item_name, requested_qty in requested_by_item.items():
        item = db.query(Item).filter(Item.item_name == item_name).first()
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item {item_name} not found",
            )
        available = _item_available_qty(item)
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

    # Create line items and update inventory
    for line_item in issue.line_items:
        # Create line item
        payload = line_item.model_dump()
        # Do not trust client-provided qty_on_hand; store a server-side snapshot of availability.
        payload["qty_on_hand"] = available_by_item[line_item.item_name]
        db_line = SampleIssueLine(
            id=str(uuid4()),
            header_id=issue_id,
            **payload
        )
        db.add(db_line)

    # Update inventory if status is 'Issued' (apply once per item to avoid double-counting).
    if issue.status == "Issued":
        for item_name, requested_qty in requested_by_item.items():
            item = item_by_name[item_name]
            item.qty_issued = float(item.qty_issued or 0.0) + requested_qty
            item.qty_available = float(item.qty_on_hand or 0.0) - float(item.qty_issued or 0.0)

    db.commit()
    db.refresh(db_issue)
    return db_issue


@router.put("/{issue_id}", response_model=SampleIssueResponse)
def update_sample_issue(
    issue_id: str,
    issue_update: SampleIssueUpdate,
    db: Session = Depends(get_db)
):
    """Update an existing sample issue (status, business unit, subsidiary)"""
    db_issue = db.query(SampleIssue).filter(SampleIssue.id == issue_id).first()
    if not db_issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample issue with id {issue_id} not found"
        )

    # If changing status from Draft to Issued, update inventory
    if issue_update.status == "Issued" and db_issue.status == "Draft":
        requested_by_item: dict[str, float] = defaultdict(float)
        for line_item in db_issue.line_items:
            requested_by_item[line_item.item_name] += float(line_item.qty_issue)

        item_by_name: dict[str, Item] = {}
        for item_name, requested_qty in requested_by_item.items():
            item = db.query(Item).filter(Item.item_name == item_name).first()
            if not item:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Item {item_name} not found",
                )
            available = _item_available_qty(item)
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
            item.qty_issued = float(item.qty_issued or 0.0) + requested_qty
            item.qty_available = float(item.qty_on_hand or 0.0) - float(item.qty_issued or 0.0)

    update_data = issue_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_issue, field, value)

    db.commit()
    db.refresh(db_issue)
    return db_issue


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
