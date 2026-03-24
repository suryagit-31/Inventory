from sqlalchemy import Column, String, DateTime
from app.database import ERPBase


class ERPProjectDetail(ERPBase):
    """Model for ERP_Project_Detail_View - using exact DB field names"""
    __tablename__ = "ERP_Project_Detail_View"

    ProjectId = Column(String(50), primary_key=True)
    CustomerName = Column(String(200))
    SalesPerson = Column(String(100))
    BRCompany = Column(String(100))
    Businessunit = Column(String(100))
    ProjectManager = Column(String(100))
    createdOn = Column(DateTime)
