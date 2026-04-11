from sqlalchemy import Column, String, DateTime, ForeignKey, Float, func
from sqlalchemy.orm import relationship
from app.database import AppBase


class SampleIssue(AppBase):
    __tablename__ = "ErpSampleTrackerSampleIssues"
    __table_args__ = {"schema": "dbo"}

    id = Column(String(50), primary_key=True, index=True)
    doc_number = Column(String(50), unique=True, nullable=False, index=True)
    project_id = Column(String(50), nullable=False, index=True)
    customer_name = Column(String(200))
    salesperson = Column(String(100))
    project_manager = Column(String(100))
    date_of_issue = Column(DateTime, nullable=False)
    business_unit = Column(String(100))
    subsidiary = Column(String(100))
    location_stored = Column(String(100))
    status = Column(String(20), default="Draft", nullable=False)
    disposition_type = Column(String(50), nullable=False)
    created_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationship
    line_items = relationship("SampleIssueLine", back_populates="header", cascade="all, delete-orphan")


class SampleIssueLine(AppBase):
    __tablename__ = "ErpSampleTrackerSampleIssueLines"
    __table_args__ = {"schema": "dbo"}

    id = Column(String(50), primary_key=True, index=True)
    header_id = Column(String(50), ForeignKey("dbo.ErpSampleTrackerSampleIssues.id"), nullable=False)
    item_name = Column(String(100), nullable=False)
    work_id = Column(String(50), nullable=False)
    description = Column(String(500))
    qty_on_hand = Column(Float, nullable=False)
    qty_issue = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    # Relationship
    header = relationship("SampleIssue", back_populates="line_items")
