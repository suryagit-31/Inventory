from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from uuid import uuid4

from app.database import get_db
from app.models.inventory import Item
from app.models.item_stock import ItemStock
from app.schemas.inventory import ItemCreate, ItemUpdate, ItemResponse, ItemSearchResult
from app.utils.normalize import normalize_item_name

router = APIRouter(prefix="/api/items", tags=["Items"])

def _available(qty_on_hand: float | None, qty_issued: float | None) -> float:
    return max(float(qty_on_hand or 0.0) - float(qty_issued or 0.0), 0.0)

def _sum_stocks(db: Session, item_ids: list[str]) -> dict[str, dict]:
    if not item_ids:
        return {}
    stocks = db.query(ItemStock).filter(ItemStock.item_id.in_(item_ids)).all()
    sums: dict[str, dict] = {iid: {"on_hand": 0.0, "issued": 0.0} for iid in item_ids}
    for s in stocks:
        entry = sums.get(s.item_id)
        if not entry:
            continue
        entry["on_hand"] += float(s.qty_on_hand or 0.0)
        entry["issued"] += float(s.qty_issued or 0.0)
    return sums


@router.get("/", response_model=List[ItemResponse])
def get_all_items(
    skip: int = 0,
    limit: int = 100,
    location: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all items with optional location filter"""
    if location:
        loc = location.strip()
        # Only items that exist in this store (i.e., have a stock row for the location).
        query = (
            db.query(Item, ItemStock)
            .join(ItemStock, and_(ItemStock.item_id == Item.id, ItemStock.location == loc))
            .order_by(Item.item_name.asc())
        )
        if skip:
            query = query.offset(skip)
        pairs = query.limit(limit).all()

        result = []
        for (it, stock) in pairs:
            on_hand = float(stock.qty_on_hand or 0.0) if stock else 0.0
            issued = float(stock.qty_issued or 0.0) if stock else 0.0
            desc = (stock.description if stock and (stock.description or "").strip() else it.description)
            result.append(
                {
                    "id": it.id,
                    "item_name": it.item_name,
                    "item_name_key": it.item_name_key,
                    "description": desc,
                    "location": loc,
                    "qty_on_hand": on_hand,
                    "qty_issued": issued,
                    "qty_available": _available(on_hand, issued),
                    "created_at": it.created_at,
                    "updated_at": it.updated_at,
                }
            )
        return result

    # MSSQL requires ORDER BY when using OFFSET/FETCH. Avoid OFFSET when skip=0.
    query = db.query(Item).order_by(Item.item_name.asc())
    if skip:
        query = query.offset(skip)
    items = query.limit(limit).all()

    # No location filter: return totals across all locations.
    sums = _sum_stocks(db, [it.id for it in items])
    return [
        {
            "id": it.id,
            "item_name": it.item_name,
            "item_name_key": it.item_name_key,
            "description": it.description,
            "location": None,
            "qty_on_hand": sums.get(it.id, {}).get("on_hand", 0.0),
            "qty_issued": sums.get(it.id, {}).get("issued", 0.0),
            "qty_available": _available(sums.get(it.id, {}).get("on_hand", 0.0), sums.get(it.id, {}).get("issued", 0.0)),
            "created_at": it.created_at,
            "updated_at": it.updated_at,
        }
        for it in items
    ]


@router.get("/search", response_model=List[ItemSearchResult])
def search_items(
    q: str,
    limit: int = 10,
    location: str | None = None,
    db: Session = Depends(get_db),
):
    """Typeahead search for items by normalized name key."""
    q_key = normalize_item_name(q or "")
    if limit < 1:
        limit = 1
    if limit > 50:
        limit = 50

    if location and location.strip():
        loc = location.strip()
        query = (
            db.query(Item, ItemStock)
            .join(ItemStock, and_(ItemStock.item_id == Item.id, ItemStock.location == loc))
            .order_by(Item.item_name.asc())
        )
        if q_key:
            query = query.filter(Item.item_name_key.like(f"%{q_key}%"))
        pairs = query.limit(limit).all()
        return [
            {
                "id": it.id,
                "item_name": it.item_name,
                "description": (stock.description if (stock.description or "").strip() else it.description),
                "location": loc,
                "qty_on_hand": float(stock.qty_on_hand or 0.0),
                "qty_issued": float(stock.qty_issued or 0.0),
                "qty_available": _available(stock.qty_on_hand, stock.qty_issued),
            }
            for (it, stock) in pairs
        ]

    if not q_key:
        return []

    results = (
        db.query(Item)
        .filter(Item.item_name_key.like(f"%{q_key}%"))
        .order_by(Item.item_name.asc())
        .limit(limit)
        .all()
    )
    sums = _sum_stocks(db, [it.id for it in results])
    return [
        {
            "id": it.id,
            "item_name": it.item_name,
            "description": it.description,
            "location": None,
            "qty_on_hand": sums.get(it.id, {}).get("on_hand", 0.0),
            "qty_issued": sums.get(it.id, {}).get("issued", 0.0),
            "qty_available": _available(sums.get(it.id, {}).get("on_hand", 0.0), sums.get(it.id, {}).get("issued", 0.0)),
        }
        for it in results
    ]


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(item_id: str, db: Session = Depends(get_db)):
    """Get a specific item by ID"""
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with id {item_id} not found"
        )
    sums = _sum_stocks(db, [item.id])
    on_hand = sums.get(item.id, {}).get("on_hand", 0.0)
    issued = sums.get(item.id, {}).get("issued", 0.0)
    return {
        "id": item.id,
        "item_name": item.item_name,
        "item_name_key": item.item_name_key,
        "description": item.description,
        "location": None,
        "qty_on_hand": on_hand,
        "qty_issued": issued,
        "qty_available": _available(on_hand, issued),
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


@router.get("/name/{item_name}", response_model=ItemResponse)
def get_item_by_name(item_name: str, db: Session = Depends(get_db)):
    """Get a specific item by name"""
    key = normalize_item_name(item_name or "")
    item = (
        db.query(Item)
        .filter((Item.item_name_key == key) | (Item.item_name == item_name))
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with name {item_name} not found"
        )
    sums = _sum_stocks(db, [item.id])
    on_hand = sums.get(item.id, {}).get("on_hand", 0.0)
    issued = sums.get(item.id, {}).get("issued", 0.0)
    return {
        "id": item.id,
        "item_name": item.item_name,
        "item_name_key": item.item_name_key,
        "description": item.description,
        "location": None,
        "qty_on_hand": on_hand,
        "qty_issued": issued,
        "qty_available": _available(on_hand, issued),
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(item: ItemCreate, db: Session = Depends(get_db)):
    """Create a new item"""
    key = normalize_item_name(item.item_name)
    if not key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item name cannot be empty")

    # Check if item already exists (case+space-insensitive)
    existing = (
        db.query(Item)
        .filter((Item.item_name_key == key) | (Item.item_name == item.item_name))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Item with name {item.item_name} already exists"
        )

    db_item = Item(
        id=str(uuid4()),
        item_name_key=key,
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
