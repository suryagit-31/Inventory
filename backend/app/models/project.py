from sqlalchemy import Column, String, DateTime, func
from app.database import AppBase


class Project(AppBase):
    __tablename__ = "ErpSampleTrackerProjects"
    __table_args__ = {"schema": "dbo"}

    id = Column(String(50), primary_key=True, index=True)
    project_number = Column(String(50), unique=True, nullable=False, index=True)
    customer_name = Column(String(200), nullable=False)
    salesperson = Column(String(100), nullable=False)
    project_manager = Column(String(100), nullable=False)
    status = Column(String(20), default="Active")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
