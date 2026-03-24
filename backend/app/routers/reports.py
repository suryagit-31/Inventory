from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.inventory import Item
from app.models.sample_issue import SampleIssue, SampleIssueLine

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.get("/inventory")
def get_inventory_report(
    location: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Sample Inventory Report
    Shows current inventory status by item and location
    """
    query = db.query(Item)
    if location:
        query = query.filter(Item.location == location)

    items = query.all()

    report_data = []
    for item in items:
        report_data.append({
            "item_name": item.item_name,
            "description": item.description,
            "location": item.location,
            "qty_on_hand": item.qty_on_hand,
            "qty_issued": item.qty_issued,
            "qty_available": item.qty_available,
        })

    return {
        "report_name": "Sample Inventory Report",
        "generated_at": datetime.now().isoformat(),
        "filters": {"location": location} if location else {},
        "data": report_data,
        "summary": {
            "total_items": len(report_data),
            "total_qty_on_hand": sum(item["qty_on_hand"] for item in report_data),
            "total_qty_issued": sum(item["qty_issued"] for item in report_data),
            "total_qty_available": sum(item["qty_available"] for item in report_data),
        }
    }


@router.get("/customer-samples")
def get_customer_sample_report(
    customer_name: Optional[str] = None,
    project_number: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Customer-Based Sample Report
    Shows samples issued to customers with aging information
    """
    query = db.query(SampleIssue).filter(SampleIssue.status.in_(["Issued", "Returned"]))

    if customer_name:
        query = query.filter(SampleIssue.customer_name.like(f"%{customer_name}%"))
    if project_number:
        query = query.filter(SampleIssue.project_number == project_number)
    if date_from:
        query = query.filter(SampleIssue.date_of_issue >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.filter(SampleIssue.date_of_issue <= datetime.fromisoformat(date_to))

    issues = query.all()

    report_data = []
    for issue in issues:
        for line in issue.line_items:
            aging_days = (datetime.now() - issue.created_at).days

            report_data.append({
                "customer": issue.customer_name,
                "project_number": issue.project_number,
                "doc_number": issue.doc_number,
                "item_name": line.item_name,
                "description": line.description,
                "qty_issued": line.qty_issue,
                "disposition_type": issue.disposition_type,
                "date_of_issue": issue.date_of_issue.isoformat(),
                "status": issue.status,
                "aging_days": aging_days,
                "location_stored": issue.location_stored,
            })

    return {
        "report_name": "Customer-Based Sample Report",
        "generated_at": datetime.now().isoformat(),
        "filters": {
            "customer_name": customer_name,
            "project_number": project_number,
            "date_from": date_from,
            "date_to": date_to,
        },
        "data": report_data,
        "summary": {
            "total_records": len(report_data),
            "total_qty_issued": sum(item["qty_issued"] for item in report_data),
            "unique_customers": len(set(item["customer"] for item in report_data)),
            "unique_projects": len(set(item["project_number"] for item in report_data)),
        }
    }


@router.get("/disposition-summary")
def get_disposition_summary_report(db: Session = Depends(get_db)):
    """
    Disposition Type Summary Report
    Shows quantity breakdown by disposition type
    """
    results = (
        db.query(
            SampleIssue.disposition_type,
            func.count(SampleIssue.id).label("issue_count"),
            func.sum(SampleIssueLine.qty_issue).label("total_qty")
        )
        .join(SampleIssueLine, SampleIssue.id == SampleIssueLine.header_id)
        .filter(SampleIssue.status == "Issued")
        .group_by(SampleIssue.disposition_type)
        .all()
    )

    report_data = []
    for result in results:
        report_data.append({
            "disposition_type": result.disposition_type,
            "issue_count": result.issue_count,
            "total_quantity": float(result.total_qty) if result.total_qty else 0.0,
        })

    return {
        "report_name": "Disposition Type Summary Report",
        "generated_at": datetime.now().isoformat(),
        "data": report_data,
        "summary": {
            "total_dispositions": len(report_data),
            "total_issues": sum(item["issue_count"] for item in report_data),
            "total_quantity": sum(item["total_quantity"] for item in report_data),
        }
    }
