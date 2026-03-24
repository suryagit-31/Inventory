from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import uuid4

from app.database import get_db
from app.models.inventory import InventoryAddOn, InventoryAddOnLine, Item
from app.schemas.inventory import InventoryAddOnCreate, InventoryAddOnResponse
from app.utils.doc_number import generate_doc_number

router = APIRouter(prefix="/api/inventory", tags=["Inventory"])


@router.get("/", response_model=List[InventoryAddOnResponse])
def get_all_inventory_addons(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all inventory add-ons"""
    # MSSQL requires ORDER BY when using OFFSET/FETCH. Avoid OFFSET when skip=0.
    query = db.query(InventoryAddOn).order_by(InventoryAddOn.created_at.desc())
    if skip:
        query = query.offset(skip)
    addons = query.limit(limit).all()
    return addons


@router.get("/{addon_id}", response_model=InventoryAddOnResponse)
def get_inventory_addon(addon_id: str, db: Session = Depends(get_db)):
    """Get a specific inventory add-on by ID"""
    addon = db.query(InventoryAddOn).filter(InventoryAddOn.id == addon_id).first()
    if not addon:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory add-on with id {addon_id} not found"
        )
    return addon


@router.post("/", response_model=InventoryAddOnResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_addon(addon: InventoryAddOnCreate, db: Session = Depends(get_db)):
    """Create a new inventory add-on"""
    # Generate document number
    doc_number = generate_doc_number(db, InventoryAddOn, "IA")

    # Create header
    addon_id = str(uuid4())
    db_addon = InventoryAddOn(
        id=addon_id,
        doc_number=doc_number,
        **addon.model_dump(exclude={'line_items'})
    )
    db.add(db_addon)

    # Create line items and update inventory
    for line_item in addon.line_items:
        # Create line item
        db_line = InventoryAddOnLine(
            id=str(uuid4()),
            header_id=addon_id,
            **line_item.model_dump()
        )
        db.add(db_line)

        # Check if item exists, if not create it
        item = db.query(Item).filter(Item.item_name == line_item.item_name).first()
        if item:
            # Update existing item
            item.qty_on_hand += line_item.quantity
            item.qty_available = item.qty_on_hand - item.qty_issued
            if line_item.description:
                item.description = line_item.description
            item.location = addon.location_store
        else:
            # Create new item
            new_item = Item(
                id=str(uuid4()),
                item_name=line_item.item_name,
                description=line_item.description,
                location=addon.location_store,
                qty_on_hand=line_item.quantity,
                qty_issued=0.0,
                qty_available=line_item.quantity
            )
            db.add(new_item)

    db.commit()
    db.refresh(db_addon)
    return db_addon


@router.delete("/{addon_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory_addon(addon_id: str, db: Session = Depends(get_db)):
    """Delete an inventory add-on"""
    db_addon = db.query(InventoryAddOn).filter(InventoryAddOn.id == addon_id).first()
    if not db_addon:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory add-on with id {addon_id} not found"
        )

    # Reverse inventory changes
    for line_item in db_addon.line_items:
        item = db.query(Item).filter(Item.item_name == line_item.item_name).first()
        if item:
            item.qty_on_hand -= line_item.quantity
            item.qty_available = item.qty_on_hand - item.qty_issued

    db.delete(db_addon)
    db.commit()
    return None
