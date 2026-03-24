from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from contextlib import asynccontextmanager

from app.config import settings
from app.database import init_db
from app.routers import (
    projects,
    items,
    sample_issue,
    inventory,
    sample_return,
    reports,
    erp_projects,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events for the application"""
    # Startup: Initialize Sample Tracker tables (ERP DB stays read-only).
    # Don't fail startup if the app DB isn't reachable; ERP endpoints can still run.
    print("Starting up...")
    if settings.DEBUG:
        print(f"Resolved settings (safe): {settings.safe_log_dict()}")
    try:
        init_db()
        print("Initialized Sample Tracker tables (if missing).")
    except Exception as exc:
        print(f"Warning: failed to initialize Sample Tracker tables: {exc}")
    print("Ready to serve requests!")
    yield
    # Shutdown: Cleanup if needed
    print("Shutting down...")


# Create FastAPI application
app = FastAPI(
    title="Sample Tracker API",
    description="Backend API for Blue Rhine Industries Sample Tracker Module",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _apply_cors_headers(response: JSONResponse, origin: str | None) -> None:
    if not origin:
        return
    allowed = settings.cors_origins_list
    if "*" in allowed or origin in allowed:
        response.headers["Access-Control-Allow-Origin"] = origin if origin != "null" else "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"


@app.middleware("http")
async def catch_unhandled_exceptions(request, call_next):
    try:
        return await call_next(request)
    except SQLAlchemyError as exc:
        # Ensure the browser sees a JSON error (and CORS headers) instead of opaque failures.
        payload = {"detail": "Database error"}
        if settings.DEBUG:
            payload["error"] = str(exc)
        response = JSONResponse(status_code=500, content=payload)
        _apply_cors_headers(response, request.headers.get("origin"))
        return response
    except Exception as exc:
        payload = {"detail": "Internal Server Error"}
        if settings.DEBUG:
            payload["error"] = str(exc)
        response = JSONResponse(status_code=500, content=payload)
        _apply_cors_headers(response, request.headers.get("origin"))
        return response

# Include routers
app.include_router(erp_projects.router)
app.include_router(projects.router)
app.include_router(items.router)
app.include_router(sample_issue.router)
app.include_router(inventory.router)
app.include_router(sample_return.router)
app.include_router(reports.router)


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "Sample Tracker API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "connected",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
    )
