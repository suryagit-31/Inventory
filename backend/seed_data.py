"""
Seed script to populate initial data (mock projects and items)
Run this after database initialization to add test data
"""

from uuid import uuid4
from datetime import datetime
from app.database import AppSessionLocal
from app.models.project import Project
from app.models.inventory import Item


def seed_projects(db):
    """Seed mock projects"""
    projects = [
        {
            "id": str(uuid4()),
            "project_number": "PRJ-2026-001",
            "customer_name": "ABC Construction LLC",
            "salesperson": "John Smith",
            "project_manager": "Sarah Johnson",
            "status": "Active",
        },
        {
            "id": str(uuid4()),
            "project_number": "PRJ-2026-002",
            "customer_name": "XYZ Development Corp",
            "salesperson": "Mike Brown",
            "project_manager": "Emily Davis",
            "status": "Active",
        },
        {
            "id": str(uuid4()),
            "project_number": "PRJ-2026-003",
            "customer_name": "Gulf Engineering Solutions",
            "salesperson": "Ahmed Al-Farsi",
            "project_manager": "Mohammed Hassan",
            "status": "Active",
        },
    ]

    for project_data in projects:
        # Check if project already exists
        existing = db.query(Project).filter(
            Project.project_number == project_data["project_number"]
        ).first()
        if not existing:
            project = Project(**project_data)
            db.add(project)
            print(f"✓ Created project: {project_data['project_number']}")
        else:
            print(f"- Project already exists: {project_data['project_number']}")

    db.commit()


def seed_items(db):
    """Seed mock items"""
    items = [
        {
            "id": str(uuid4()),
            "item_name": "Sample 1",
            "description": "High-grade steel sample",
            "location": "Sample Store Dubai",
            "qty_on_hand": 50.0,
            "qty_issued": 0.0,
            "qty_available": 50.0,
        },
        {
            "id": str(uuid4()),
            "item_name": "Sample 123",
            "description": "Aluminum composite panel",
            "location": "Sample Store Dubai",
            "qty_on_hand": 30.0,
            "qty_issued": 0.0,
            "qty_available": 30.0,
        },
        {
            "id": str(uuid4()),
            "item_name": "Sample A-200",
            "description": "Thermal insulation material",
            "location": "Main Store UAQ",
            "qty_on_hand": 100.0,
            "qty_issued": 0.0,
            "qty_available": 100.0,
        },
        {
            "id": str(uuid4()),
            "item_name": "Sample B-150",
            "description": "Waterproofing membrane",
            "location": "Main Store UAQ",
            "qty_on_hand": 75.0,
            "qty_issued": 0.0,
            "qty_available": 75.0,
        },
    ]

    for item_data in items:
        # Check if item already exists
        existing = db.query(Item).filter(
            Item.item_name == item_data["item_name"]
        ).first()
        if not existing:
            item = Item(**item_data)
            db.add(item)
            print(f"✓ Created item: {item_data['item_name']}")
        else:
            print(f"- Item already exists: {item_data['item_name']}")

    db.commit()


def main():
    """Main seed function"""
    print("=" * 60)
    print("Sample Tracker - Database Seed Script")
    print("=" * 60)
    print()

    # Seeds app-owned tables (projects/items) in the configured APP_DB_* database.
    # If you want these tables in ERP-Live, set APP_DB_NAME=ERP-Live (and credentials) in `backend/.env`.
    db = AppSessionLocal()
    try:
        print("Seeding projects...")
        seed_projects(db)
        print()

        print("Seeding items...")
        seed_items(db)
        print()

        print("=" * 60)
        print("✓ Seed completed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"✗ Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    main()
