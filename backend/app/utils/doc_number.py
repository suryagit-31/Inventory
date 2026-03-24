from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func


def generate_doc_number(db: Session, table_model, prefix: str) -> str:
    """
    Generate auto-incremented document number with format: PREFIX-YYYYMM-####

    Args:
        db: Database session
        table_model: SQLAlchemy model to query
        prefix: Document prefix (e.g., 'SI' for Sample Issue, 'IA' for Inventory Add-On)

    Returns:
        Generated document number (e.g., SI-202603-0001)
    """
    now = datetime.now()
    year_month = now.strftime("%Y%m")
    pattern = f"{prefix}-{year_month}-%"

    # Get the last document number for this month
    last_doc = (
        db.query(table_model)
        .filter(table_model.doc_number.like(pattern))
        .order_by(table_model.doc_number.desc())
        .first()
    )

    if last_doc:
        # Extract the sequence number and increment
        last_sequence = int(last_doc.doc_number.split("-")[-1])
        new_sequence = last_sequence + 1
    else:
        # First document of the month
        new_sequence = 1

    # Format: PREFIX-YYYYMM-####
    doc_number = f"{prefix}-{year_month}-{new_sequence:04d}"

    return doc_number
