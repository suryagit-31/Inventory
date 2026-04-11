from sqlalchemy import Column, String, DateTime, ForeignKey, Float, func
from sqlalchemy.orm import relationship
from app.database import AppBase


class SampleReturn(AppBase):
    __tablename__ = "ErpSampleTrackerSampleReturns"
    __table_args__ = {"schema": "dbo"}

    id = Column(String(50), primary_key=True, index=True)
    doc_number = Column(String(50), unique=True, nullable=False, index=True)
    original_issue_id = Column(String(50), ForeignKey("dbo.ErpSampleTrackerSampleIssues.id"), nullable=False)
    date_of_return = Column(DateTime, nullable=False)
    remarks = Column(String(500))
    reason_for_return = Column(String(500))
    status = Column(String(20), default="Draft", nullable=False)
    created_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationship
    line_items = relationship("SampleReturnLine", back_populates="header", cascade="all, delete-orphan")


class SampleReturnLine(AppBase):
    __tablename__ = "ErpSampleTrackerSampleReturnLines"
    __table_args__ = {"schema": "dbo"}

    id = Column(String(50), primary_key=True, index=True)
    header_id = Column(String(50), ForeignKey("dbo.ErpSampleTrackerSampleReturns.id"), nullable=False)
    item_name = Column(String(100), nullable=False)
    work_id = Column(String(50), nullable=False)
    description = Column(String(500))
    qty_issued = Column(Float, nullable=False)
    qty_return = Column(Float, nullable=False)
    condition = Column(String(20), nullable=False, default="Good")
    created_at = Column(DateTime, server_default=func.now())

    # Relationship
    header = relationship("SampleReturn", back_populates="line_items")
