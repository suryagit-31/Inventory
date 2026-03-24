"""
Simple script to run the FastAPI application
"""

import uvicorn
from app.config import settings

if __name__ == "__main__":
    print("=" * 60)
    print("Starting Sample Tracker API")
    print("=" * 60)
    print(f"Host: {settings.API_HOST}")
    print(f"Port: {settings.API_PORT}")
    print(f"Debug: {settings.DEBUG}")
    print(f"Docs: http://localhost:{settings.API_PORT}/docs")
    print("=" * 60)
    print()

    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
        log_level="info"
    )
