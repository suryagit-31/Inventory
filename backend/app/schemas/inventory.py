from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# Item Schemas
class ItemBase(BaseModel):
    item_name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = Field(None, max_length=100)


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    description: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = Field(None, max_length=100)


class ItemResponse(ItemBase):
    id: str
    item_name_key: str | None = None
    qty_on_hand: float
    qty_issued: float
    qty_available: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ItemSearchResult(BaseModel):
    id: str
    item_name: str
    description: Optional[str] = None
    location: Optional[str] = None
    qty_on_hand: float
    qty_issued: float
    qty_available: float

    class Config:
        from_attributes = True


# Inventory Add-On Line Item Schemas
class InventoryLineItemBase(BaseModel):
    item_name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    quantity: int = Field(..., gt=0)


class InventoryLineItemCreate(InventoryLineItemBase):
    pass


class InventoryLineItemResponse(InventoryLineItemBase):
    id: str
    header_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# Inventory Add-On Header Schemas
class InventoryAddOnBase(BaseModel):
    date: datetime
    location_store: str = Field(..., max_length=100)


class InventoryAddOnCreate(InventoryAddOnBase):
    line_items: List[InventoryLineItemCreate] = Field(..., min_length=1)


class InventoryAddOnResponse(InventoryAddOnBase):
    id: str
    doc_number: str
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    line_items: List[InventoryLineItemResponse]

    class Config:
        from_attributes = True


class InventoryAddOnLineListItem(BaseModel):
    """Flattened view for listing recent add-on lines (newest first)."""
    header_id: str
    line_id: str
    doc_number: str
    date: datetime
    location_store: str
    item_name: str
    description: Optional[str] = None
    quantity: int
    created_at: datetime
