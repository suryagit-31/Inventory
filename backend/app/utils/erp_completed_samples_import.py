from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session
from uuid import uuid4

from app.models.inventory import InventoryAddOn, InventoryAddOnLine, Item
from app.models.item_stock import ItemStock
from app.utils.doc_number import generate_doc_number
from app.utils.normalize import normalize_item_name


DEFAULT_ERP_IMPORT_LOCATION = "Sample Store Dubai"
_IN_CLAUSE_CHUNK = 900  # keep under SQL Server parameter limits


def _limit(value: Any, max_len: int) -> str | None:
    if value is None:
        return None
    s = str(value)
    s = s.strip()
    if not s:
        return None
    if len(s) <= max_len:
        return s
    return s[:max_len]


@dataclass
class ImportSummary:
    imported_count: int
    skipped_duplicates: int
    skipped_wrong_location: int
    skipped_missing_fields: int
    per_project: dict[str, dict[str, int]]

    def to_dict(self) -> dict:
        return {
            "imported_count": int(self.imported_count),
            "skipped_duplicates": int(self.skipped_duplicates),
            "skipped_wrong_location": int(self.skipped_wrong_location),
            "skipped_missing_fields": int(self.skipped_missing_fields),
            "per_project": self.per_project,
            "location_store": DEFAULT_ERP_IMPORT_LOCATION,
        }


ERP_COMPLETED_SAMPLES_SQL = """
SELECT
    mp.projectCode AS projectCode,
    ow.workorderNumber AS workorderNumber,
    mp.projectName AS projectName,
    (em.firstName + ' ' + em.lastName) AS salesRep,
    ow.signType AS signType,
    mt.taxnomyCode AS taxnomyCode,
    ow.productionType AS productionType,
    ow.quantity AS quantity,
    ow.completedon AS completedon,
    ts.Durationinmts AS durationInMts
FROM ErpOperationWorkOrder ow
LEFT JOIN ErpMasterProject mp
    ON ow.projectId = mp.projectId
LEFT JOIN ErpMasterTaxnomy mt
    ON mt.taxnomyId = ow.statusId
LEFT JOIN (
    SELECT
        mot.workorderId,
        SUM(mol.duration) AS Durationinmts
    FROM ErpOperationTimesheet mot
    INNER JOIN ErpOperationTimesheetLabour mol
        ON mol.timesheetId = mot.timesheetId
    GROUP BY mot.workorderId
) ts ON ts.workorderId = ow.workorderId
LEFT JOIN erpmasteremployee em
    ON ow.salesRepId = em.employeeId
WHERE ow.statusId IN (1034) -- completed
  AND ow.iscompleted = 1
  AND ow.productionType = 'Sample'
GROUP BY
    mp.projectCode,
    ow.workorderNumber,
    mp.projectName,
    em.firstName,
    em.lastName,
    ow.signType,
    mt.taxnomyCode,
    ow.productionType,
    ow.quantity,
    ow.completedon,
    ts.Durationinmts
"""


def import_completed_sample_workorders(app_db: Session, erp_db: Session) -> ImportSummary:
    """
    Import ERP "Completed Sample" workorders into the app-owned Inventory Add-On tables.

    Idempotency:
    - De-dupe by workorderNumber -> InventoryAddOnLine.work_id (global).

    Mapping:
    - InventoryAddOn.doc_number = generated via IA sequence
    - InventoryAddOn.location_store = DEFAULT_ERP_IMPORT_LOCATION
    - InventoryAddOn.date = max(completedon) among imported rows per project
    - InventoryAddOnLine.work_id = workorderNumber
    - InventoryAddOnLine.item_name = projectCode (truncated to 100)
    - InventoryAddOnLine.description = signType (truncated to 500)
    - InventoryAddOnLine.quantity = quantity (int)
    """
    rows = erp_db.execute(text(ERP_COMPLETED_SAMPLES_SQL)).mappings().all()

    summary = ImportSummary(
        imported_count=0,
        skipped_duplicates=0,
        skipped_wrong_location=0,
        skipped_missing_fields=0,
        per_project={},
    )

    if not rows:
        return summary

    # Existing work IDs (workorder numbers) already imported.
    # Important: only query for work IDs we are about to consider, to avoid scanning huge tables.
    candidate_work_ids: list[str] = []
    seen_candidates: set[str] = set()
    for row in rows:
        wid = _limit(row.get("workorderNumber"), 50)
        if not wid or wid in seen_candidates:
            continue
        seen_candidates.add(wid)
        candidate_work_ids.append(wid)

    existing_work_ids: set[str] = set()
    if candidate_work_ids:
        for i in range(0, len(candidate_work_ids), _IN_CLAUSE_CHUNK):
            chunk = candidate_work_ids[i : i + _IN_CLAUSE_CHUNK]
            existing_work_ids.update(
                [
                    r[0]
                    for r in (
                        app_db.query(InventoryAddOnLine.work_id)
                        .filter(InventoryAddOnLine.work_id.in_(chunk))
                        .distinct()
                        .all()
                    )
                    if r and r[0]
                ]
            )

    # Group by projectCode.
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        project_code = _limit(row.get("projectCode"), 50)
        work_id = _limit(row.get("workorderNumber"), 50)
        completedon = row.get("completedon")

        if not project_code or not work_id:
            summary.skipped_missing_fields += 1
            continue

        # Normalize completedon to datetime when possible; allow None.
        if completedon is not None and not isinstance(completedon, datetime):
            try:
                completedon = datetime.fromisoformat(str(completedon))
            except Exception:
                completedon = None

        grouped.setdefault(project_code, []).append(
            {
                "project_code": project_code,
                "work_id": work_id,
                "project_name": _limit(row.get("projectName"), 100),
                "item_name": _limit(project_code, 100),
                "sign_type": _limit(row.get("signType"), 500),
                "quantity": row.get("quantity"),
                "completedon": completedon,
            }
        )

    # Small caches to reduce round-trips during big imports.
    item_by_key: dict[str, Item] = {}
    stock_by_item_location: dict[tuple[str, str], ItemStock] = {}
    header_by_project: dict[str, InventoryAddOn] = {}

    for project_code, items in grouped.items():
        project_bucket = summary.per_project.setdefault(
            project_code,
            {"imported": 0, "skipped_duplicates": 0, "skipped_wrong_location": 0, "skipped_missing_fields": 0},
        )

        header = header_by_project.get(project_code)

        # Compute header date (max completedon among items that will be imported).
        max_completed = None
        for it in items:
            if it["completedon"] is None:
                continue
            if max_completed is None or it["completedon"] > max_completed:
                max_completed = it["completedon"]

        # Import lines
        for it in items:
            work_id = it["work_id"]
            if not work_id:
                summary.skipped_missing_fields += 1
                project_bucket["skipped_missing_fields"] += 1
                continue

            if work_id in existing_work_ids:
                summary.skipped_duplicates += 1
                project_bucket["skipped_duplicates"] += 1
                continue

            item_name = it["item_name"] or ""
            if not item_name:
                # Ensure we still have a non-empty item_name for the inventory master.
                item_name = f"Project {project_code}"
                item_name = _limit(item_name, 100) or "Project"

            qty_raw = it["quantity"]
            try:
                quantity = int(float(qty_raw or 0))
            except Exception:
                quantity = 0
            if quantity <= 0:
                summary.skipped_missing_fields += 1
                project_bucket["skipped_missing_fields"] += 1
                continue

            # Create/update item master + stock (same behavior as manual inventory add-ons).
            key = normalize_item_name(item_name)
            if not key:
                summary.skipped_missing_fields += 1
                project_bucket["skipped_missing_fields"] += 1
                continue

            item = item_by_key.get(key)
            if item is None:
                item = app_db.query(Item).filter(Item.item_name_key == key).first()
                if item is not None:
                    item_by_key[key] = item

            if not item:
                item = Item(
                    id=str(uuid4()),
                    item_name=item_name,
                    item_name_key=key,
                    description=it["sign_type"],
                    location=DEFAULT_ERP_IMPORT_LOCATION,
                    qty_on_hand=0.0,
                    qty_issued=0.0,
                    qty_available=0.0,
                )
                app_db.add(item)
                app_db.flush()
                item_by_key[key] = item

            stock_key = (item.id, DEFAULT_ERP_IMPORT_LOCATION)
            stock = stock_by_item_location.get(stock_key)
            if stock is None:
                stock = (
                    app_db.query(ItemStock)
                    .filter(ItemStock.item_id == item.id)
                    .filter(ItemStock.location == DEFAULT_ERP_IMPORT_LOCATION)
                    .first()
                )
                if stock is not None:
                    stock_by_item_location[stock_key] = stock

            if stock:
                stock.qty_on_hand = float(stock.qty_on_hand or 0.0) + float(quantity)
                stock.qty_issued = float(stock.qty_issued or 0.0)
                if it["sign_type"]:
                    stock.description = it["sign_type"]
            else:
                stock = ItemStock(
                    id=str(uuid4()),
                    item_id=item.id,
                    location=DEFAULT_ERP_IMPORT_LOCATION,
                    description=it["sign_type"],
                    qty_on_hand=float(quantity),
                    qty_issued=0.0,
                )
                app_db.add(stock)
                stock_by_item_location[stock_key] = stock

            # Add inventory add-on line.
            if header is None:
                doc_number = generate_doc_number(app_db, InventoryAddOn, "IA")
                header = InventoryAddOn(
                    id=str(uuid4()),
                    doc_number=doc_number,
                    date=datetime.now(),
                    location_store=DEFAULT_ERP_IMPORT_LOCATION,
                )
                app_db.add(header)
                app_db.flush()
                header_by_project[project_code] = header

            line = InventoryAddOnLine(
                id=str(uuid4()),
                header_id=header.id,
                item_name=item.item_name,
                work_id=work_id,
                description=it["sign_type"],
                quantity=quantity,
            )
            app_db.add(line)

            existing_work_ids.add(work_id)
            summary.imported_count += 1
            project_bucket["imported"] += 1

        if project_bucket["imported"] > 0:
            if max_completed is not None:
                header.date = max_completed
            else:
                header.date = datetime.now()

    return summary
