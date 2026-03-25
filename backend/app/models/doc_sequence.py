from sqlalchemy import Column, String, Integer, DateTime, UniqueConstraint, func

from app.database import AppBase


class DocNumberSequence(AppBase):
    __tablename__ = "ErpSampleTrackerDocNumberSequences"
    __table_args__ = (
        UniqueConstraint("prefix", "year_month", name="uq_docseq_prefix_yearmonth"),
        {"schema": "dbo"},
    )

    id = Column(String(50), primary_key=True)
    prefix = Column(String(10), nullable=False, index=True)
    year_month = Column(String(6), nullable=False, index=True)  # YYYYMM
    next_value = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

