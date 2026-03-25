from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from uuid import uuid4

from app.models.doc_sequence import DocNumberSequence


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

    # Concurrency-safe allocation using a dedicated sequence table.
    #
    # Note: SQL Server doesn't support SELECT ... FOR UPDATE in the same way as some DBs.
    # We use MSSQL locking hints to serialize increments for a given {prefix, year_month}.
    for attempt in range(5):
        try:
            with db.begin_nested():
                seq = (
                    db.query(DocNumberSequence)
                    .with_hint(DocNumberSequence, "WITH (UPDLOCK, HOLDLOCK)", "mssql")
                    .filter(DocNumberSequence.prefix == prefix)
                    .filter(DocNumberSequence.year_month == year_month)
                    .first()
                )

                if seq is None:
                    # Seed from existing documents (if any) so deploying to an existing DB
                    # doesn't start again at 0001 and collide.
                    last_doc = (
                        db.query(table_model.doc_number)
                        .filter(table_model.doc_number.like(pattern))
                        .order_by(table_model.doc_number.desc())
                        .first()
                    )
                    last_sequence = int(last_doc[0].split("-")[-1]) if last_doc and last_doc[0] else 0
                    allocated = last_sequence + 1
                    seq = DocNumberSequence(
                        id=str(uuid4()),
                        prefix=prefix,
                        year_month=year_month,
                        next_value=allocated + 1,
                    )
                    db.add(seq)
                else:
                    # If sequence is behind actual docs (manual inserts/imports), jump forward safely.
                    last_doc = (
                        db.query(table_model.doc_number)
                        .filter(table_model.doc_number.like(pattern))
                        .order_by(table_model.doc_number.desc())
                        .first()
                    )
                    last_sequence = int(last_doc[0].split("-")[-1]) if last_doc and last_doc[0] else 0
                    min_required = last_sequence + 1
                    allocated = max(int(seq.next_value), min_required)
                    seq.next_value = allocated + 1

                db.flush()

            return f"{prefix}-{year_month}-{allocated:04d}"
        except IntegrityError:
            # Most likely a concurrent insert into the sequence table.
            # Retry after rolling back to a clean state.
            db.rollback()
            if attempt >= 4:
                raise

    raise RuntimeError("Failed to allocate a document number after retries")
