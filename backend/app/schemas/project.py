from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ProjectBase(BaseModel):
    project_number: str = Field(..., max_length=50)
    customer_name: str = Field(..., max_length=200)
    salesperson: str = Field(..., max_length=100)
    project_manager: str = Field(..., max_length=100)
    status: Optional[str] = Field(default="Active", max_length=20)


class ProjectCreate(ProjectBase):
    pass


class ProjectResponse(ProjectBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
