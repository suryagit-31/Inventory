from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from collections import defaultdict
from uuid import uuid4

from app.database import get_db
from app.models.sample_return import SampleReturn, SampleReturnLine
from app.models.sample_issue import SampleIssue
from app.models.inventory import Item
from app.schemas.sample_return import SampleReturnCreate, SampleReturnResponse
from app.utils.doc_number import generate_doc_number

router = APIRouter(prefix="/api/sample-returns", tags=["Sample Returns"])


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
        # Create line item
        payload = line_item.model_dump()
        # Do not trust client-provided qty_issued; store server-side snapshot from original issue.
        payload["qty_issued"] = issued_qty
        db_line = SampleReturnLine(
            id=str(uuid4()),
            header_id=return_id,
            **payload
        )
        db.add(db_line)

        # Update inventory if status is 'Returned'
        if sample_return.status == "Returned":
            item = db.query(Item).filter(Item.item_name == line_item.item_name).first()
            if item:
                current_issued = float(item.qty_issued or 0.0)
                qty_to_return = float(line_item.qty_return)
                if qty_to_return > current_issued:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Return would make item {line_item.item_name} issued quantity negative",
                    )
                item.qty_issued = current_issued - qty_to_return
                item.qty_available = float(item.qty_on_hand or 0.0) - float(item.qty_issued or 0.0)

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
