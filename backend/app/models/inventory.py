from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import AppBase


class Item(AppBase):
    __tablename__ = "ErpSampleTrackerItems"
    __table_args__ = {"schema": "dbo"}

    id = Column(String(50), primary_key=True, index=True)
    item_name = Column(String(100), unique=True, nullable=False, index=True)
    item_name_key = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(500))
    location = Column(String(100))
    qty_on_hand = Column(Float, default=0.0)
    qty_issued = Column(Float, default=0.0)
    qty_available = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class InventoryAddOn(AppBase):
    __tablename__ = "ErpSampleTrackerInventoryAddOns"
    __table_args__ = {"schema": "dbo"}

    id = Column(String(50), primary_key=True, index=True)
    doc_number = Column(String(50), unique=True, nullable=False, index=True)
    date = Column(DateTime, nullable=False)
    location_store = Column(String(100), nullable=False)
    created_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationship
    line_items = relationship("InventoryAddOnLine", back_populates="header", cascade="all, delete-orphan")


class InventoryAddOnLine(AppBase):
    __tablename__ = "ErpSampleTrackerInventoryAddOnLines"
    __table_args__ = {"schema": "dbo"}

    id = Column(String(50), primary_key=True, index=True)
    header_id = Column(String(50), ForeignKey("dbo.ErpSampleTrackerInventoryAddOns.id"), nullable=False)
    item_name = Column(String(100), nullable=False)
    work_id = Column(String(50))
    description = Column(String(500))
    quantity = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    # Relationship
    header = relationship("InventoryAddOn", back_populates="line_items")
