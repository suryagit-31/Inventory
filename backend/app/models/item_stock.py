from sqlalchemy import Column, String, Float, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import AppBase


class ItemStock(AppBase):
    """
    Per-location stock for an item.

    item_name_key de-dupes the master item (Item). This table holds quantities per store/location.
    """
    __tablename__ = "ErpSampleTrackerItemStocks"
    __table_args__ = (
        UniqueConstraint("item_id", "location", name="uq_itemstocks_item_location"),
        {"schema": "dbo"},
    )

    id = Column(String(50), primary_key=True, index=True)
    item_id = Column(String(50), ForeignKey("dbo.ErpSampleTrackerItems.id"), nullable=False, index=True)
    location = Column(String(100), nullable=False, index=True)
    description = Column(String(500))
    qty_on_hand = Column(Float, default=0.0)
    qty_issued = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    item = relationship("Item")
