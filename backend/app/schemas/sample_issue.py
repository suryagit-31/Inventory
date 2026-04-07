from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime


# Sample Issue Line Item Schemas
class SampleLineItemBase(BaseModel):
    item_name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    qty_on_hand: float = Field(..., ge=0)
    qty_issue: float = Field(..., gt=0)


class SampleLineItemCreate(SampleLineItemBase):
    work_id: str = Field(..., max_length=50)

    @field_validator("work_id")
    @classmethod
    def validate_work_id(cls, v):
        work_id = (v or "").strip()
        if not work_id:
            raise ValueError("Work ID is required")
        return work_id

    @field_validator('qty_issue')
    @classmethod
    def validate_qty_issue(cls, v, info):
        qty_on_hand = info.data.get('qty_on_hand')
        if qty_on_hand is not None and v > qty_on_hand:
            raise ValueError('Quantity to issue cannot exceed quantity on hand')
        return v


class SampleLineItemResponse(SampleLineItemBase):
    id: str
    header_id: str
    work_id: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Sample Issue Header Schemas
class SampleIssueBase(BaseModel):
    project_id: str = Field(..., max_length=50)
    customer_name: Optional[str] = Field(None, max_length=200)
    salesperson: Optional[str] = Field(None, max_length=100)
    project_manager: Optional[str] = Field(None, max_length=100)
    date_of_issue: datetime
    business_unit: Optional[str] = Field(None, max_length=100)
    subsidiary: Optional[str] = Field(None, max_length=100)
    location_stored: Optional[str] = Field(None, max_length=100)
    disposition_type: str = Field(..., max_length=50)


class SampleIssueCreate(SampleIssueBase):
    status: Optional[str] = Field(default="Draft", max_length=20)
    line_items: List[SampleLineItemCreate] = Field(..., min_length=1)

    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        allowed_statuses = ['Draft', 'Issued', 'Partial Return', 'Returned']
        if v not in allowed_statuses:
            raise ValueError(f'Status must be one of: {", ".join(allowed_statuses)}')
        return v

    @field_validator('disposition_type')
    @classmethod
    def validate_disposition_type(cls, v):
        allowed_types = [
            'Scrapping',
            'Used in Main Project',
            'Missing',
            'Issued to Customer',
            'Issued out for Rework',
        ]
        if v not in allowed_types:
            raise ValueError(f'Disposition type must be one of: {", ".join(allowed_types)}')
        return v


class SampleIssueUpdate(BaseModel):
    status: Optional[str] = Field(None, max_length=20)
    business_unit: Optional[str] = Field(None, max_length=100)
    subsidiary: Optional[str] = Field(None, max_length=100)

    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        if v is not None:
            allowed_statuses = ['Draft', 'Issued', 'Partial Return', 'Returned']
            if v not in allowed_statuses:
                raise ValueError(f'Status must be one of: {", ".join(allowed_statuses)}')
        return v


class SampleIssueResponse(SampleIssueBase):
    id: str
    doc_number: str
    status: str
    created_by: Optional[str]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    line_items: List[SampleLineItemResponse]

    class Config:
        from_attributes = True


class SampleIssueReturnableLine(BaseModel):
    item_name: str
    work_id: str
    description: Optional[str] = None
    qty_issued_total: float
    qty_returned_total: float
    qty_remaining: float
    inventory_qty_on_hand: Optional[float] = None
    inventory_qty_issued: Optional[float] = None
    inventory_qty_available: Optional[float] = None
