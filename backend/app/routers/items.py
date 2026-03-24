from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import uuid4

from app.database import get_db
from app.models.inventory import Item
from app.schemas.inventory import ItemCreate, ItemUpdate, ItemResponse

router = APIRouter(prefix="/api/items", tags=["Items"])


@router.get("/", response_model=List[ItemResponse])
def get_all_items(
    skip: int = 0,
    limit: int = 100,
    location: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all items with optional location filter"""
    query = db.query(Item)
    if location:
        query = query.filter(Item.location == location)

    # MSSQL requires ORDER BY when using OFFSET/FETCH. Avoid OFFSET when skip=0.
    query = query.order_by(Item.item_name.asc())
    if skip:
        query = query.offset(skip)
    items = query.limit(limit).all()
    return items


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(item_id: str, db: Session = Depends(get_db)):
    """Get a specific item by ID"""
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with id {item_id} not found"
        )
    return item


@router.get("/name/{item_name}", response_model=ItemResponse)
def get_item_by_name(item_name: str, db: Session = Depends(get_db)):
    """Get a specific item by name"""
    item = db.query(Item).filter(Item.item_name == item_name).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with name {item_name} not found"
        )
    return item


@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(item: ItemCreate, db: Session = Depends(get_db)):
    """Create a new item"""
    # Check if item already exists
    existing = db.query(Item).filter(Item.item_name == item.item_name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Item with name {item.item_name} already exists"
        )

    db_item = Item(
        id=str(uuid4()),
        qty_on_hand=0.0,
        qty_issued=0.0,
        qty_available=0.0,
        **item.model_dump()
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.put("/{item_id}", response_model=ItemResponse)
def update_item(item_id: str, item_update: ItemUpdate, db: Session = Depends(get_db)):
    """Update an existing item"""
    db_item = db.query(Item).filter(Item.id == item_id).first()
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with id {item_id} not found"
        )

    update_data = item_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_item, field, value)

    db.commit()
    db.refresh(db_item)
    return db_item
