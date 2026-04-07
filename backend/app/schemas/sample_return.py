from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime


# Sample Return Line Item Schemas
class SampleReturnLineBase(BaseModel):
    item_name: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    qty_issued: float = Field(..., gt=0)
    qty_return: float = Field(..., gt=0)

    @field_validator('qty_return')
    @classmethod
    def validate_qty_return(cls, v, info):
        qty_issued = info.data.get('qty_issued')
        if qty_issued is not None and v > qty_issued:
            raise ValueError('Quantity to return cannot exceed quantity issued')
        return v


class SampleReturnLineCreate(SampleReturnLineBase):
    work_id: str = Field(..., max_length=50)

    @field_validator("work_id")
    @classmethod
    def validate_work_id(cls, v):
        work_id = (v or "").strip()
        if not work_id:
            raise ValueError("Work ID is required")
        return work_id


class SampleReturnLineResponse(SampleReturnLineBase):
    id: str
    header_id: str
    work_id: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Sample Return Header Schemas
class SampleReturnBase(BaseModel):
    original_issue_id: str = Field(..., max_length=50)
    date_of_return: datetime
    remarks: Optional[str] = Field(None, max_length=500)
    reason_for_return: Optional[str] = Field(None, max_length=500)


class SampleReturnCreate(SampleReturnBase):
    status: Optional[str] = Field(default="Draft", max_length=20)
    line_items: List[SampleReturnLineCreate] = Field(..., min_length=1)

    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        allowed_statuses = ['Draft', 'Returned']
        if v not in allowed_statuses:
            raise ValueError(f'Status must be one of: {", ".join(allowed_statuses)}')
        return v


class SampleReturnResponse(SampleReturnBase):
    id: str
    doc_number: str
    status: str
    created_by: Optional[str]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    line_items: List[SampleReturnLineResponse]

    class Config:
        from_attributes = True


class SampleReturnSummary(BaseModel):
    id: str
    doc_number: str
    original_issue_id: str
    original_issue_doc_number: str
    store_location: Optional[str] = None
    date_of_return: datetime
    status: str
    return_scope: str  # Draft | Partial | Full
    line_count: int
    total_qty_return: float
