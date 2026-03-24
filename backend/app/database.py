from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

AppBase = declarative_base()
ERPBase = declarative_base()

# Sample Tracker engine/session (app-owned tables)
app_engine = create_engine(
    settings.app_database_url,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_recycle=3600,
)
AppSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=app_engine)

# ERP engine/session (read-only views)
erp_engine = create_engine(
    settings.erp_database_url,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_recycle=3600,
)
ERPSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=erp_engine)

# Backward-compatible alias (older scripts expect `SessionLocal`).
# This always points to the app-owned DB session (APP_DB_* settings).
SessionLocal = AppSessionLocal


def get_db():
    """Dependency to get Sample Tracker DB session."""
    db = AppSessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_erp_db():
    """Dependency to get ERP DB session (read-only)."""
    db = ERPSessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize Sample Tracker DB tables."""
    AppBase.metadata.create_all(bind=app_engine)
