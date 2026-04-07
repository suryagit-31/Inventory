from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Any, List, Optional
from datetime import date, datetime, timedelta

from app.database import get_db
from app.models.inventory import InventoryAddOn, InventoryAddOnLine, Item
from app.models.item_stock import ItemStock
from app.models.sample_issue import SampleIssue, SampleIssueLine
from app.models.sample_return import SampleReturn, SampleReturnLine
from app.utils.normalize import normalize_item_name
from app.utils.report_xlsx import build_workbook

router = APIRouter(prefix="/api/reports", tags=["Reports"])

_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _today_filename_suffix() -> str:
    return date.today().isoformat()


def _xlsx_response(report: dict[str, Any], filename_base: str, *, column_order: list[str], column_titles: dict[str, str] | None = None) -> Response:
    xlsx_bytes = build_workbook(
        report_name=str(report.get("report_name") or filename_base),
        generated_at=str(report.get("generated_at") or datetime.now().isoformat()),
        filters=report.get("filters") or {},
        summary=report.get("summary") or {},
        rows=report.get("data") or [],
        column_order=column_order,
        column_titles=column_titles or {},
    )
    filename = f"{filename_base}-{_today_filename_suffix()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type=_XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _parse_iso_datetime(value: str, *, param_name: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {param_name}; expected ISO date or datetime") from None


def _date_range_bounds(date_from: str | None, date_to: str | None) -> tuple[datetime | None, datetime | None]:
    """
    Returns (start_inclusive, end_exclusive) for filtering timestamps.
    If date_to is date-only, we treat it as inclusive and return next-day 00:00 as end_exclusive.
    """
    start = _parse_iso_datetime(date_from, param_name="date_from") if date_from else None
    if not date_to:
        return start, None

    end_raw = _parse_iso_datetime(date_to, param_name="date_to")
    is_date_only = "T" not in date_to and " " not in date_to
    end_exclusive = end_raw + timedelta(days=1) if is_date_only else end_raw
    return start, end_exclusive


@router.get("/inventory")
def get_inventory_report(
    location: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Sample Inventory Report
    Shows current inventory status by item and location
    """
    query = (
        db.query(ItemStock, Item)
        .join(Item, Item.id == ItemStock.item_id)
        .order_by(ItemStock.location.asc(), Item.item_name.asc())
    )
    if location:
        query = query.filter(ItemStock.location == location)

    rows = query.all()

    report_data = []
    for (stock, item) in rows:
        qty_on_hand = float(stock.qty_on_hand or 0.0)
        qty_issued = float(stock.qty_issued or 0.0)
        report_data.append({
            "item_name": item.item_name,
            "description": stock.description if (stock.description or "").strip() else item.description,
            "location": stock.location,
            "qty_on_hand": qty_on_hand,
            "qty_issued": qty_issued,
            "qty_available": max(qty_on_hand - qty_issued, 0.0),
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


@router.get("/inventory.xlsx")
def get_inventory_report_xlsx(location: Optional[str] = None, db: Session = Depends(get_db)):
    report = get_inventory_report(location=location, db=db)
    return _xlsx_response(
        report,
        "sample-inventory-report",
        column_order=["item_name", "location", "qty_on_hand", "qty_issued"],
        column_titles={
            "item_name": "Item Name",
            "location": "Location",
            "qty_on_hand": "Qty On Hand",
            "qty_issued": "Qty Issued",
        },
    )


@router.get("/customer-samples")
def get_customer_sample_report(
    customer_name: Optional[str] = None,
    project_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Customer-Based Sample Report
    Shows samples issued to customers with aging information
    """
    query = db.query(SampleIssue).filter(SampleIssue.status.in_(["Issued", "Partial Return", "Returned"]))

    if customer_name:
        query = query.filter(SampleIssue.customer_name.like(f"%{customer_name}%"))
    if project_id:
        query = query.filter(SampleIssue.project_id == project_id)
    if date_from:
        query = query.filter(SampleIssue.date_of_issue >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.filter(SampleIssue.date_of_issue <= datetime.fromisoformat(date_to))

    issues = query.all()

    issue_ids = [i.id for i in issues]
    returned_totals: dict[tuple[str, str], float] = {}
    if issue_ids:
        rows = (
            db.query(
                SampleReturn.original_issue_id,
                SampleReturnLine.item_name,
                func.coalesce(func.sum(SampleReturnLine.qty_return), 0.0).label("qty_returned"),
            )
            .join(SampleReturnLine, SampleReturn.id == SampleReturnLine.header_id)
            .filter(SampleReturn.status == "Returned")
            .filter(SampleReturn.original_issue_id.in_(issue_ids))
            .group_by(SampleReturn.original_issue_id, SampleReturnLine.item_name)
            .all()
        )
        returned_totals = {(r.original_issue_id, r.item_name): float(r.qty_returned or 0.0) for r in rows}

    report_data: list[dict[str, Any]] = []
    for issue in issues:
        base_date = issue.date_of_issue or issue.created_at
        aging_days = (datetime.now() - base_date).days if base_date else None

        issued_by_item: dict[str, float] = {}
        for line in issue.line_items:
            issued_by_item[line.item_name] = issued_by_item.get(line.item_name, 0.0) + float(line.qty_issue or 0.0)

        for item_name, issued_qty in issued_by_item.items():
            returned_qty = float(returned_totals.get((issue.id, item_name), 0.0))
            balance = max(float(issued_qty) - float(returned_qty), 0.0)
            if balance <= 0:
                continue
            report_data.append(
                {
                    "customer": issue.customer_name,
                    "project_id": issue.project_id,
                    "item_name": item_name,
                    "qty_issued": float(issued_qty),
                    "qty_returned": returned_qty,
                    "balance_with_customer": balance,
                    "disposition_type": issue.disposition_type,
                    "aging_days": aging_days,
                }
            )

    return {
        "report_name": "Customer-Based Sample Report",
        "generated_at": datetime.now().isoformat(),
        "filters": {
            "customer_name": customer_name,
            "project_id": project_id,
            "date_from": date_from,
            "date_to": date_to,
        },
        "data": report_data,
        "summary": {
            "total_records": len(report_data),
            "total_qty_issued": sum(float(item["qty_issued"] or 0.0) for item in report_data),
            "total_qty_returned": sum(float(item["qty_returned"] or 0.0) for item in report_data),
            "total_balance_with_customer": sum(float(item["balance_with_customer"] or 0.0) for item in report_data),
            "unique_customers": len(set(item["customer"] for item in report_data)),
            "unique_projects": len(set(item["project_id"] for item in report_data)),
        }
    }


@router.get("/customer-samples/suggestions")
def get_customer_sample_suggestions(
    customer_q: Optional[str] = None,
    project_q: Optional[str] = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """
    Lightweight typeahead suggestions for Customer-Based Sample Report filters.
    Uses distinct values from SampleIssue.
    """
    if limit < 1:
        limit = 1
    if limit > 50:
        limit = 50

    customers: list[str] = []
    projects: list[str] = []

    if customer_q and customer_q.strip():
        needle = f"%{customer_q.strip()}%"
        rows = (
            db.query(SampleIssue.customer_name)
            .filter(SampleIssue.customer_name.isnot(None))
            .filter(SampleIssue.customer_name != "")
            .filter(SampleIssue.customer_name.like(needle))
            .distinct()
            .order_by(SampleIssue.customer_name.asc())
            .limit(limit)
            .all()
        )
        customers = [r[0] for r in rows if r and r[0]]

    if project_q and project_q.strip():
        needle = f"%{project_q.strip()}%"
        rows = (
            db.query(SampleIssue.project_id)
            .filter(SampleIssue.project_id.isnot(None))
            .filter(SampleIssue.project_id != "")
            .filter(SampleIssue.project_id.like(needle))
            .distinct()
            .order_by(SampleIssue.project_id.asc())
            .limit(limit)
            .all()
        )
        projects = [r[0] for r in rows if r and r[0]]

    return {"customers": customers, "projects": projects}


@router.get("/customer-samples.xlsx")
def get_customer_sample_report_xlsx(
    customer_name: Optional[str] = None,
    project_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    report = get_customer_sample_report(
        customer_name=customer_name,
        project_id=project_id,
        date_from=date_from,
        date_to=date_to,
        db=db,
    )
    return _xlsx_response(
        report,
        "customer-samples-report",
        column_order=[
            "customer",
            "project_id",
            "item_name",
            "qty_issued",
            "qty_returned",
            "balance_with_customer",
            "disposition_type",
            "aging_days",
        ],
        column_titles={
            "qty_issued": "Issued Qty",
            "qty_returned": "Returned Qty",
            "balance_with_customer": "Balance With Customer",
            "aging_days": "Aging (Days)",
        },
    )


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


@router.get("/disposition-summary.xlsx")
def get_disposition_summary_report_xlsx(db: Session = Depends(get_db)):
    report = get_disposition_summary_report(db=db)
    return _xlsx_response(
        report,
        "disposition-summary",
        column_order=["disposition_type", "issue_count", "total_quantity"],
        column_titles={
            "disposition_type": "Disposition Type",
            "issue_count": "Issue Count",
            "total_quantity": "Total Quantity",
        },
    )


@router.get("/item-tracking")
def get_item_tracking_report(
    item_name: str,
    location: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Item tracking (movement ledger) report.

    Returns a chronological ledger of inventory movements for a single item, with per-location running balances.
    """
    needle = (item_name or "").strip()
    if not needle:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="item_name is required")

    key = normalize_item_name(needle)
    item = (
        db.query(Item)
        .filter((Item.item_name == needle) | (Item.item_name_key == key))
        .order_by(Item.item_name.asc())
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Item {needle} not found")

    start_dt, end_exclusive = _date_range_bounds(date_from, date_to)
    if start_dt and end_exclusive and start_dt >= end_exclusive:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="date_from must be <= date_to")

    # Current balances per location (used to back-calculate balances at a historical start).
    stock_query = db.query(ItemStock).filter(ItemStock.item_id == item.id)
    if location:
        stock_query = stock_query.filter(ItemStock.location == location)
    stocks = stock_query.all()
    current_by_location: dict[str, dict[str, float]] = {
        s.location: {"qty_on_hand": float(s.qty_on_hand or 0.0), "qty_issued": float(s.qty_issued or 0.0)}
        for s in stocks
    }

    events: list[dict[str, Any]] = []

    # Inventory Add-Ons (always included)
    add_q = (
        db.query(InventoryAddOn.date, InventoryAddOn.doc_number, InventoryAddOn.location_store, InventoryAddOnLine.quantity)
        .join(InventoryAddOnLine, InventoryAddOn.id == InventoryAddOnLine.header_id)
        .filter(InventoryAddOnLine.item_name == item.item_name)
    )
    if location:
        add_q = add_q.filter(InventoryAddOn.location_store == location)
    add_rows = add_q.all()
    for (dt, doc, loc, qty) in add_rows:
        events.append(
            {
                "event_date": dt,
                "event_type": "ADDON",
                "doc_number": doc,
                "location": loc,
                "qty_on_hand_delta": float(qty or 0.0),
                "qty_issued_delta": 0.0,
                "project_id": None,
                "customer_name": None,
                "original_issue_doc_number": None,
            }
        )

    # Sample Issues (effective only when not Draft)
    issue_q = (
        db.query(
            SampleIssue.date_of_issue,
            SampleIssue.doc_number,
            SampleIssue.location_stored,
            SampleIssue.project_id,
            SampleIssue.customer_name,
            SampleIssue.status,
            SampleIssueLine.qty_issue,
        )
        .join(SampleIssueLine, SampleIssue.id == SampleIssueLine.header_id)
        .filter(SampleIssueLine.item_name == item.item_name)
        .filter(SampleIssue.status != "Draft")
    )
    if location:
        issue_q = issue_q.filter(SampleIssue.location_stored == location)
    issue_rows = issue_q.all()
    for (dt, doc, loc, proj, cust, st, qty) in issue_rows:
        events.append(
            {
                "event_date": dt,
                "event_type": "ISSUE",
                "doc_number": doc,
                "location": loc,
                "status": st,
                "qty_on_hand_delta": 0.0,
                "qty_issued_delta": float(qty or 0.0),
                "project_id": proj,
                "customer_name": cust,
                "original_issue_doc_number": None,
            }
        )

    # Sample Returns (effective only when Returned)
    ret_q = (
        db.query(
            SampleReturn.date_of_return,
            SampleReturn.doc_number,
            SampleIssue.doc_number,
            SampleIssue.location_stored,
            SampleIssue.project_id,
            SampleIssue.customer_name,
            SampleReturn.status,
            SampleReturnLine.qty_return,
        )
        .join(SampleReturnLine, SampleReturn.id == SampleReturnLine.header_id)
        .join(SampleIssue, SampleIssue.id == SampleReturn.original_issue_id)
        .filter(SampleReturnLine.item_name == item.item_name)
        .filter(SampleReturn.status == "Returned")
    )
    if location:
        ret_q = ret_q.filter(SampleIssue.location_stored == location)
    ret_rows = ret_q.all()
    for (dt, ret_doc, issue_doc, loc, proj, cust, st, qty) in ret_rows:
        events.append(
            {
                "event_date": dt,
                "event_type": "RETURN",
                "doc_number": ret_doc,
                "location": loc,
                "status": st,
                "qty_on_hand_delta": 0.0,
                "qty_issued_delta": -float(qty or 0.0),
                "project_id": proj,
                "customer_name": cust,
                "original_issue_doc_number": issue_doc,
            }
        )

    # Apply date filters to output range (while keeping full history in `events` for balance back-calc).
    def _in_range(dt: datetime) -> bool:
        if start_dt and dt < start_dt:
            return False
        if end_exclusive and dt >= end_exclusive:
            return False
        return True

    events_in_range = [e for e in events if isinstance(e.get("event_date"), datetime) and _in_range(e["event_date"])]

    type_order = {"ADDON": 1, "ISSUE": 2, "RETURN": 3}
    events.sort(key=lambda e: (e["event_date"], type_order.get(e["event_type"], 9), str(e.get("doc_number") or "")))
    events_in_range.sort(key=lambda e: (e["event_date"], type_order.get(e["event_type"], 9), str(e.get("doc_number") or "")))

    # Ensure we have current balances for any location appearing in events.
    for e in events:
        loc = str(e.get("location") or "")
        if loc and loc not in current_by_location:
            current_by_location[loc] = {"qty_on_hand": 0.0, "qty_issued": 0.0}

    # Compute starting balances per location by reversing events from "now/current" back to the requested start.
    end_excl_for_balance = end_exclusive or datetime.max
    start_for_balance = start_dt or datetime.min

    events_by_location: dict[str, list[dict[str, Any]]] = {}
    for e in events:
        loc = str(e.get("location") or "")
        if not loc:
            continue
        events_by_location.setdefault(loc, []).append(e)
    for loc in events_by_location:
        events_by_location[loc].sort(key=lambda e: e["event_date"], reverse=True)

    starting_by_location: dict[str, dict[str, float]] = {}
    for loc, cur in current_by_location.items():
        qty_on_hand = float(cur.get("qty_on_hand", 0.0))
        qty_issued = float(cur.get("qty_issued", 0.0))
        for e in events_by_location.get(loc, []):
            dt = e["event_date"]
            if dt >= end_excl_for_balance:
                qty_on_hand -= float(e.get("qty_on_hand_delta") or 0.0)
                qty_issued -= float(e.get("qty_issued_delta") or 0.0)
        for e in events_by_location.get(loc, []):
            dt = e["event_date"]
            if start_for_balance <= dt < end_excl_for_balance:
                qty_on_hand -= float(e.get("qty_on_hand_delta") or 0.0)
                qty_issued -= float(e.get("qty_issued_delta") or 0.0)
        starting_by_location[loc] = {"qty_on_hand": qty_on_hand, "qty_issued": qty_issued}

    running_by_location: dict[str, dict[str, float]] = {loc: cur.copy() for loc, cur in starting_by_location.items()}

    output_rows: list[dict[str, Any]] = []
    for e in events_in_range:
        loc = str(e.get("location") or "")
        running = running_by_location.setdefault(loc, {"qty_on_hand": 0.0, "qty_issued": 0.0})

        running["qty_on_hand"] = float(running.get("qty_on_hand") or 0.0) + float(e.get("qty_on_hand_delta") or 0.0)
        running["qty_issued"] = float(running.get("qty_issued") or 0.0) + float(e.get("qty_issued_delta") or 0.0)
        available = max(float(running["qty_on_hand"]) - float(running["qty_issued"]), 0.0)

        output_rows.append(
            {
                "event_date": e["event_date"].isoformat(),
                "event_type": e["event_type"],
                "doc_number": e.get("doc_number"),
                "location": loc,
                "qty_on_hand_delta": float(e.get("qty_on_hand_delta") or 0.0),
                "qty_issued_delta": float(e.get("qty_issued_delta") or 0.0),
                "qty_on_hand_after": float(running["qty_on_hand"]),
                "qty_issued_after": float(running["qty_issued"]),
                "qty_available_after": float(available),
                "project_id": e.get("project_id"),
                "customer_name": e.get("customer_name"),
                "original_issue_doc_number": e.get("original_issue_doc_number"),
            }
        )

    report = {
        "report_name": "Item Tracking (Movement Ledger)",
        "generated_at": datetime.now().isoformat(),
        "filters": {
            "item_name": item.item_name,
            "location": location,
            "date_from": date_from,
            "date_to": date_to,
        },
        "data": output_rows,
        "summary": {
            "total_events": len(output_rows),
            "total_qty_on_hand_added": sum(max(0.0, float(r["qty_on_hand_delta"])) for r in output_rows),
            "total_qty_issued": sum(max(0.0, float(r["qty_issued_delta"])) for r in output_rows),
            "total_qty_returned": sum(max(0.0, -float(r["qty_issued_delta"])) for r in output_rows),
        },
    }
    return report


@router.get("/item-tracking.xlsx")
def get_item_tracking_report_xlsx(
    item_name: str,
    location: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    report = get_item_tracking_report(
        item_name=item_name,
        location=location,
        date_from=date_from,
        date_to=date_to,
        db=db,
    )
    return _xlsx_response(
        report,
        "item-tracking",
        column_order=[
            "event_date",
            "event_type",
            "doc_number",
            "original_issue_doc_number",
            "project_id",
            "customer_name",
            "location",
            "qty_on_hand_delta",
            "qty_issued_delta",
            "qty_on_hand_after",
            "qty_issued_after",
            "qty_available_after",
        ],
        column_titles={
            "doc_number": "Doc #",
            "original_issue_doc_number": "Original Issue Doc #",
            "project_id": "Project ID",
            "customer_name": "Customer",
            "qty_on_hand_delta": "Qty On Hand Δ",
            "qty_issued_delta": "Qty Issued Δ",
            "qty_on_hand_after": "Qty On Hand After",
            "qty_issued_after": "Qty Issued After",
            "qty_available_after": "Qty Available After",
        },
    )
