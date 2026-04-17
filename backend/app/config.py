from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AliasChoices, Field, field_validator
from typing import List
from pathlib import Path
from urllib.parse import quote_plus

_ENV_FILE = str((Path(__file__).resolve().parents[1] / ".env"))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Always load the backend env file regardless of process working directory.
        env_file=_ENV_FILE,
        case_sensitive=True,
        # Allow adding new env vars in production without crashing the app.
        # (Unknown keys are ignored; known keys are still parsed.)
        extra="ignore",
    )
    # Sample Tracker database (app-owned tables)
    # If APP_* variables are not set, falls back to legacy DB_* variables.
    APP_DB_SERVER: str = ""
    APP_DB_NAME: str = ""
    APP_DB_USER: str = ""
    APP_DB_PASSWORD: str = ""
    APP_DB_DRIVER: str = ""

    # ERP database (read-only views)
    # If ERP_* variables are not set, falls back to legacy DB_* variables.
    ERP_DB_SERVER: str = ""
    ERP_DB_NAME: str = ""
    ERP_DB_USER: str = ""
    ERP_DB_PASSWORD: str = ""
    ERP_DB_DRIVER: str = ""

    # Legacy single-database configuration (kept for backward compatibility)
    DB_SERVER: str = "localhost"
    DB_NAME: str = "SampleTrackerDB"
    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DB_DRIVER: str = "ODBC Driver 17 for SQL Server"

    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = Field(default=True, validation_alias=AliasChoices("APP_DEBUG", "DEBUG"))

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"

    # Scheduled import trigger protection (optional but recommended in production)
    IMPORT_TOKEN: str = ""

    # Microsoft Graph mail (used for Sample Issue submit notifications)
    BILL_PROCESSING_AZURE_TENANT_ID: str = ""
    BILL_PROCESSING_AZURE_CLIENT_ID: str = ""
    BILL_PROCESSING_AZURE_CLIENT_SECRET: str = ""
    BILL_PROCESSING_AZURE_SCOPE: str = "https://graph.microsoft.com/.default"
    BILL_PROCESSING_GRAPH_SENDER: str = "noreply@brisigns.com"
    SAMPLE_ISSUE_EMAIL_TO: str = (
        "jobcosting@brisigns.com,Receivables@brisigns.com,denny@brisigns.com,surya@app-brisigns.com"
    )

    @property
    def app_database_url(self) -> str:
        """Generate SQLAlchemy database URL for the Sample Tracker DB."""
        server = self.APP_DB_SERVER or self.DB_SERVER
        name = self.APP_DB_NAME or self.DB_NAME
        user = self.APP_DB_USER or self.DB_USER
        password = self.APP_DB_PASSWORD or self.DB_PASSWORD
        driver = self.APP_DB_DRIVER or self.DB_DRIVER
        # SQLAlchemy URLs are URL-parsed; credentials must be escaped (e.g. passwords containing '@' or '#').
        user_escaped = quote_plus(user)
        password_escaped = quote_plus(password)
        return (
            f"mssql+pyodbc://{user_escaped}:{password_escaped}@"
            f"{server}/{name}?"
            f"driver={driver.replace(' ', '+')}"
        )

    @property
    def erp_database_url(self) -> str:
        """Generate SQLAlchemy database URL for the ERP DB (read-only)."""
        server = self.ERP_DB_SERVER or self.DB_SERVER
        name = self.ERP_DB_NAME or self.DB_NAME
        user = self.ERP_DB_USER or self.DB_USER
        password = self.ERP_DB_PASSWORD or self.DB_PASSWORD
        driver = self.ERP_DB_DRIVER or self.DB_DRIVER
        user_escaped = quote_plus(user)
        password_escaped = quote_plus(password)
        return (
            f"mssql+pyodbc://{user_escaped}:{password_escaped}@"
            f"{server}/{name}?"
            f"driver={driver.replace(' ', '+')}"
        )

    @property
    def database_url(self) -> str:
        """Backward-compatible alias for older code paths (app DB)."""
        return self.app_database_url

    @property
    def cors_origins_list(self) -> List[str]:
        """Convert comma-separated CORS origins to list"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    def safe_log_dict(self) -> dict:
        """
        Safe-to-print settings snapshot (masks secrets).

        Note: This shows the *resolved* values (e.g., APP_DB_* falling back to DB_*).
        """
        def _mask(value: str) -> str:
            if not value:
                return ""
            return "********"

        return {
            "DEBUG": bool(self.DEBUG),
            "API_HOST": self.API_HOST,
            "API_PORT": int(self.API_PORT),
            "CORS_ORIGINS": self.CORS_ORIGINS,
            "APP_DB_SERVER": self.APP_DB_SERVER or self.DB_SERVER,
            "APP_DB_NAME": self.APP_DB_NAME or self.DB_NAME,
            "APP_DB_USER": self.APP_DB_USER or self.DB_USER,
            "APP_DB_PASSWORD": _mask(self.APP_DB_PASSWORD or self.DB_PASSWORD),
            "APP_DB_DRIVER": self.APP_DB_DRIVER or self.DB_DRIVER,
            "ERP_DB_SERVER": self.ERP_DB_SERVER or self.DB_SERVER,
            "ERP_DB_NAME": self.ERP_DB_NAME or self.DB_NAME,
            "ERP_DB_USER": self.ERP_DB_USER or self.DB_USER,
            "ERP_DB_PASSWORD": _mask(self.ERP_DB_PASSWORD or self.DB_PASSWORD),
            "ERP_DB_DRIVER": self.ERP_DB_DRIVER or self.DB_DRIVER,
            "BILL_PROCESSING_AZURE_TENANT_ID": self.BILL_PROCESSING_AZURE_TENANT_ID,
            "BILL_PROCESSING_AZURE_CLIENT_ID": self.BILL_PROCESSING_AZURE_CLIENT_ID,
            "BILL_PROCESSING_AZURE_CLIENT_SECRET": _mask(self.BILL_PROCESSING_AZURE_CLIENT_SECRET),
            "BILL_PROCESSING_AZURE_SCOPE": self.BILL_PROCESSING_AZURE_SCOPE,
            "BILL_PROCESSING_GRAPH_SENDER": self.BILL_PROCESSING_GRAPH_SENDER,
            "SAMPLE_ISSUE_EMAIL_TO": self.SAMPLE_ISSUE_EMAIL_TO,
        }

    @field_validator("DEBUG", mode="before")
    @classmethod
    def _parse_debug(cls, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"1", "true", "t", "yes", "y", "on", "debug"}:
                return True
            if lowered in {"0", "false", "f", "no", "n", "off", "release", "prod", "production"}:
                return False
        return value


settings = Settings()
