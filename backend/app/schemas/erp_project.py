from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ERPProjectDetailBase(BaseModel):
    """Schema for ERP Project Detail - using exact DB field names"""
    ProjectId: str
    CustomerName: Optional[str] = None
    SalesPerson: Optional[str] = None
    BRCompany: Optional[str] = None
    Businessunit: Optional[str] = None
    ProjectManager: Optional[str] = None
    createdOn: Optional[datetime] = None

    class Config:
        from_attributes = True


class ERPProjectDetailResponse(ERPProjectDetailBase):
    """Response schema for project details"""
    pass


class ERPProjectSearchResult(BaseModel):
    """Simplified schema for search results"""
    ProjectId: str
    CustomerName: Optional[str] = None
    Businessunit: Optional[str] = None

    class Config:
        from_attributes = True
