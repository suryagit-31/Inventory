from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date, datetime
from typing import List
from uuid import uuid4

from app.config import settings
from app.database import get_db, get_erp_db
from app.models.inventory import InventoryAddOn, InventoryAddOnLine, Item
from app.models.item_stock import ItemStock
from app.schemas.inventory import InventoryAddOnCreate, InventoryAddOnResponse, InventoryAddOnLineListItem
from app.utils.doc_number import generate_doc_number
from app.utils.erp_completed_samples_import import import_completed_sample_workorders
from app.utils.normalize import normalize_item_name
from app.utils.report_xlsx import build_workbook

router = APIRouter(prefix="/api/inventory", tags=["Inventory"])

_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

def _today_suffix() -> str:
    return date.today().isoformat()

def _get_item_for_update(db: Session, item_name_key: str) -> Item | None:
    return (
        db.query(Item)
        .with_hint(Item, "WITH (UPDLOCK, ROWLOCK)", "mssql")
        .filter(Item.item_name_key == item_name_key)
        .first()
    )

def _get_stock_for_update(db: Session, item_id: str, location: str) -> ItemStock | None:
    return (
        db.query(ItemStock)
        .with_hint(ItemStock, "WITH (UPDLOCK, ROWLOCK)", "mssql")
        .filter(ItemStock.item_id == item_id)
        .filter(ItemStock.location == location)
        .first()
    )

def _available(qty_on_hand: float | None, qty_issued: float | None) -> float:
    return max(float(qty_on_hand or 0.0) - float(qty_issued or 0.0), 0.0)


@router.get("/", response_model=List[InventoryAddOnResponse])
def get_all_inventory_addons(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all inventory add-ons"""
    # MSSQL requires ORDER BY when using OFFSET/FETCH. Avoid OFFSET when skip=0.
    query = db.query(InventoryAddOn).order_by(InventoryAddOn.created_at.desc())
    if skip:
        query = query.offset(skip)
    addons = query.limit(limit).all()
    return addons


@router.get("/lines", response_model=List[InventoryAddOnLineListItem])
def get_recent_inventory_addon_lines(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    List recent inventory add-on line items (flattened).
    Ordered newest-first by header created_at.
    """
    # MSSQL requires ORDER BY when using OFFSET/FETCH. Avoid OFFSET when skip=0.
    query = (
        db.query(InventoryAddOnLine, InventoryAddOn)
        .join(InventoryAddOn, InventoryAddOn.id == InventoryAddOnLine.header_id)
        .order_by(
            InventoryAddOn.created_at.desc(),
            InventoryAddOnLine.created_at.desc(),
            InventoryAddOnLine.id.desc(),
        )
    )
    if skip:
        query = query.offset(skip)
    rows = query.limit(limit).all()

    return [
        InventoryAddOnLineListItem(
            header_id=line.header_id,
            line_id=line.id,
            doc_number=header.doc_number,
            date=header.date,
            location_store=header.location_store,
            item_name=line.item_name,
            work_id=line.work_id,
            description=line.description,
            quantity=int(line.quantity),
            created_at=line.created_at,
        )
        for (line, header) in rows
    ]


@router.get("/lines.xlsx")
def get_recent_inventory_addon_lines_xlsx(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    lines = get_recent_inventory_addon_lines(skip=skip, limit=limit, db=db)
    rows = [
        {
            "doc_number": li.doc_number,
            "location_store": li.location_store,
            "item_name": li.item_name,
            "work_id": li.work_id,
            "description": li.description,
            "quantity": li.quantity,
            "date": (li.date.isoformat() if hasattr(li.date, "isoformat") else str(li.date))[:10],
        }
        for li in lines
    ]
    xlsx_bytes = build_workbook(
        report_name="Recent Inventory Add-Ons",
        generated_at=datetime.now().isoformat(),
        filters={"skip": skip, "limit": limit},
        summary={"rows": len(rows)},
        rows=rows,
        column_order=["doc_number", "location_store", "item_name", "work_id", "description", "quantity", "date"],
        column_titles={
            "doc_number": "Doc #",
            "location_store": "Store",
            "item_name": "Item",
            "work_id": "Work ID",
            "description": "Description",
            "quantity": "Qty",
            "date": "Date",
        },
    )
    filename = f"recent-inventory-addons-{_today_suffix()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type=_XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{addon_id}", response_model=InventoryAddOnResponse)
def get_inventory_addon(addon_id: str, db: Session = Depends(get_db)):
    """Get a specific inventory add-on by ID"""
    addon = db.query(InventoryAddOn).filter(InventoryAddOn.id == addon_id).first()
    if not addon:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory add-on with id {addon_id} not found"
        )
    return addon


@router.post("/", response_model=InventoryAddOnResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_addon(addon: InventoryAddOnCreate, db: Session = Depends(get_db)):
    """Create a new inventory add-on"""
    try:
        doc_number = generate_doc_number(db, InventoryAddOn, "IA")

        addon_id = str(uuid4())
        db_addon = InventoryAddOn(
            id=addon_id,
            doc_number=doc_number,
            **addon.model_dump(exclude={'line_items'})
        )
        db.add(db_addon)

        # Merge duplicate item lines by (normalized item key, work_id).
        merged: dict[str, dict] = {}
        for line_item in addon.line_items:
            display = (line_item.item_name or "").strip()
            key = normalize_item_name(display)
            if not key:
                raise HTTPException(status_code=400, detail="Item name cannot be empty")

            work_id = (line_item.work_id or "").strip()
            if not work_id:
                raise HTTPException(status_code=400, detail="Work ID is required")

            merge_key = f"{key}|{work_id}"
            entry = merged.get(merge_key)
            if entry is None:
                merged[merge_key] = {
                    "item_name_key": key,
                    "display_name": display,
                    "work_id": work_id,
                    "description": (line_item.description or "").strip() or None,
                    "quantity": int(line_item.quantity),
                }
            else:
                entry["quantity"] += int(line_item.quantity)
                if not entry["description"] and (line_item.description or "").strip():
                    entry["description"] = (line_item.description or "").strip()

        location = (addon.location_store or "").strip()
        if not location:
            raise HTTPException(status_code=400, detail="location_store is required")

        for entry in merged.values():
            item = _get_item_for_update(db, entry["item_name_key"])
            if item:
                # Keep item master description stable; store-specific description is on ItemStock.
                # If the master has no description yet, accept the first provided one as default.
                if entry["description"] and not (item.description or "").strip():
                    item.description = entry["description"]
                line_item_name = item.item_name
                line_item_desc = entry["description"] if entry["description"] is not None else (item.description or None)
            else:
                new_item = Item(
                    id=str(uuid4()),
                    item_name=entry["display_name"],
                    item_name_key=entry["item_name_key"],
                    description=entry["description"],
                    location=location,
                    qty_on_hand=0.0,
                    qty_issued=0.0,
                    qty_available=0.0,
                )
                db.add(new_item)
                db.flush()
                item = new_item
                line_item_name = entry["display_name"]
                line_item_desc = entry["description"]

            stock = _get_stock_for_update(db, item.id, location)
            if stock:
                stock.qty_on_hand = float(stock.qty_on_hand or 0.0) + float(entry["quantity"])
                stock.qty_issued = float(stock.qty_issued or 0.0)
                if entry["description"]:
                    stock.description = entry["description"]
            else:
                stock = ItemStock(
                    id=str(uuid4()),
                    item_id=item.id,
                    location=location,
                    description=entry["description"],
                    qty_on_hand=float(entry["quantity"]),
                    qty_issued=0.0,
                )
                db.add(stock)

            db_line = InventoryAddOnLine(
                id=str(uuid4()),
                header_id=addon_id,
                item_name=line_item_name,
                work_id=entry["work_id"],
                description=line_item_desc,
                quantity=int(entry["quantity"]),
            )
            db.add(db_line)

        db.commit()
        db.refresh(db_addon)
        return db_addon
    except Exception:
        db.rollback()
        raise


@router.post("/import/erp-completed-samples/run")
def run_erp_completed_samples_import(
    db: Session = Depends(get_db),
    erp_db: Session = Depends(get_erp_db),
    x_import_token: str | None = Header(default=None, alias="X-Import-Token"),
):
    """
    Import ERP "Completed Sample" workorders into Inventory Add-Ons.

    Designed to be triggered by cron/systemd timer (no UI required).
    If IMPORT_TOKEN is set, callers must supply X-Import-Token.
    """
    expected = (getattr(settings, "IMPORT_TOKEN", "") or "").strip()
    if expected:
        if (x_import_token or "").strip() != expected:
            raise HTTPException(status_code=401, detail="Unauthorized")

    lock_acquired = False
    try:
        # Optional single-run protection (works only if SQL Server allows sp_getapplock).
        try:
            lock_result = db.execute(
                text(
                    "DECLARE @r int; "
                    "EXEC @r = sp_getapplock "
                    "  @Resource=:resource, "
                    "  @LockMode='Exclusive', "
                    "  @LockOwner='Session', "
                    "  @LockTimeout=0; "
                    "SELECT @r AS r;"
                ),
                {"resource": "erp_completed_samples_import"},
            ).scalar()
            if lock_result is not None and int(lock_result) >= 0:
                lock_acquired = True
            elif lock_result is not None and int(lock_result) < 0:
                raise HTTPException(status_code=409, detail="Import already running")
        except HTTPException:
            raise
        except Exception:
            # If not permitted / not supported, run without lock.
            lock_acquired = False

        summary = import_completed_sample_workorders(db, erp_db)
        db.commit()
        return summary.to_dict()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}")
    finally:
        if lock_acquired:
            try:
                db.execute(
                    text(
                        "EXEC sp_releaseapplock "
                        "  @Resource=:resource, "
                        "  @LockOwner='Session';"
                    ),
                    {"resource": "erp_completed_samples_import"},
                )
            except Exception:
                pass

@router.delete("/{addon_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory_addon(addon_id: str, db: Session = Depends(get_db)):
    """Delete an inventory add-on"""
    try:
        db_addon = db.query(InventoryAddOn).filter(InventoryAddOn.id == addon_id).first()
        if not db_addon:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Inventory add-on with id {addon_id} not found"
            )

        location = (db_addon.location_store or "").strip()
        for line_item in db_addon.line_items:
            item_key = normalize_item_name(line_item.item_name or "")
            item = _get_item_for_update(db, item_key) if item_key else None
            if not item:
                continue

            stock = _get_stock_for_update(db, item.id, location) if location else None
            if stock:
                stock.qty_on_hand = float(stock.qty_on_hand or 0.0) - float(line_item.quantity)
                stock.qty_issued = float(stock.qty_issued or 0.0)

        db.delete(db_addon)
        db.commit()
        return None
    except Exception:
        db.rollback()
        raise
