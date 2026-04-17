# Sample Tracker Module - Backend API

FastAPI backend for the Blue Rhine Industries Sample Tracker Module.

## Features

- RESTful API with FastAPI
- MSSQL database integration using SQLAlchemy
- Auto-generated document numbers
- Comprehensive validation
- CORS enabled for frontend integration
- Three main modules:
  - Sample Issue Management
  - Inventory Add-On Management
  - Sample Return Management
- Reports API for analytics

## Tech Stack

- **Framework**: FastAPI 0.109.0
- **Database**: Microsoft SQL Server (MSSQL)
- **ORM**: SQLAlchemy 2.0.25
- **Database Driver**: pyodbc 5.0.1
- **Validation**: Pydantic 2.5.3

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration settings
│   ├── database.py          # Database connection
│   ├── models/              # SQLAlchemy models
│   │   ├── project.py
│   │   ├── inventory.py
│   │   ├── sample_issue.py
│   │   └── sample_return.py
│   │   └── doc_sequence.py      # Doc-number sequences (SI/IA/SR)
│   ├── schemas/             # Pydantic schemas
│   │   ├── project.py
│   │   ├── inventory.py
│   │   ├── sample_issue.py
│   │   └── sample_return.py
│   ├── routers/             # API endpoints
│   │   ├── projects.py
│   │   ├── items.py
│   │   ├── sample_issue.py
│   │   ├── inventory.py
│   │   ├── sample_return.py
│   │   └── reports.py
│   └── utils/
│       └── doc_number.py    # Document number generation
├── requirements.txt
├── .env.example
├── doc_number_sequence_setup.sql # One-time SQL for existing DBs
├── item_name_key_upgrade.sql      # One-time SQL: item de-dup key
├── item_stock_upgrade.sql         # One-time SQL: per-store stock
├── item_stock_description_upgrade.sql # One-time SQL: store-specific descriptions
└── README.md
```

## Setup Instructions

### 1. Prerequisites

- Python 3.9 or higher
- Microsoft SQL Server
- ODBC Driver 17 for SQL Server

### 2. Install ODBC Driver (if not installed)

**Windows:**
Download from: https://docs.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server

**Linux:**
```bash
curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
curl https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/prod.list > /etc/apt/sources.list.d/mssql-release.list
apt-get update
ACCEPT_EULA=Y apt-get install -y msodbcsql17
```

### 3. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 4. Configure Environment

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
# Sample Tracker DB (app-owned tables)
APP_DB_SERVER=localhost
APP_DB_NAME=SampleTrackerDB
APP_DB_USER=your_username
APP_DB_PASSWORD=your_password
APP_DB_DRIVER=ODBC Driver 17 for SQL Server

# ERP DB (read-only views used for project search/autofill)
ERP_DB_SERVER=localhost
ERP_DB_NAME=ERP-Live
ERP_DB_USER=Reader
ERP_DB_PASSWORD=your_password
ERP_DB_DRIVER=ODBC Driver 17 for SQL Server

API_HOST=0.0.0.0
API_PORT=8000
APP_DEBUG=True

CORS_ORIGINS=http://localhost:3000

# Microsoft Graph mail (for Sample Issue "Issued" notifications)
BILL_PROCESSING_AZURE_TENANT_ID=your_tenant_id
BILL_PROCESSING_AZURE_CLIENT_ID=your_client_id
BILL_PROCESSING_AZURE_CLIENT_SECRET=your_client_secret
BILL_PROCESSING_AZURE_SCOPE=https://graph.microsoft.com/.default
BILL_PROCESSING_GRAPH_SENDER=noreply@brisigns.com
SAMPLE_ISSUE_EMAIL_TO=jobcosting@brisigns.com,Receivables@brisigns.com,denny@brisigns.com,surya@app-brisigns.com
```

For Graph email sending, the Azure app registration must have application permission to send mail and admin consent granted. The sender mailbox (`BILL_PROCESSING_GRAPH_SENDER`) must also be valid for the tenant.

### 5. Initialize Database

The application will automatically create tables on startup (requires DB permissions to create tables). Alternatively, run:

```bash
python -c "from app.database import init_db; init_db()"
```

If you are upgrading an existing database that already has Sample Tracker tables, run:

```sql
-- in your target DB (SampleTrackerDB or ERP-Live)
backend/doc_number_sequence_setup.sql
```

To enable case/space-insensitive item identity (Samsung s24 == samsung S24), run:

```sql
-- in your target DB (SampleTrackerDB or ERP-Live)
backend/item_name_key_upgrade.sql
```

### 6. Run the Application

**Development Mode (with auto-reload):**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Or using Python:**
```bash
python -m app.main
```

**Production Mode:**
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Documentation

Once running, access:
- **Interactive API docs (Swagger UI)**: http://localhost:8000/docs
- **Alternative docs (ReDoc)**: http://localhost:8000/redoc
- **OpenAPI schema**: http://localhost:8000/openapi.json

## API Endpoints

### Projects
- `GET /api/projects/` - List all projects
- `GET /api/projects/{id}` - Get project by ID
- `GET /api/projects/id/{project_id}` - Get project by ID
- `POST /api/projects/` - Create new project

### Items
- `GET /api/items/` - List all items
- `GET /api/items/{id}` - Get item by ID
- `GET /api/items/name/{item_name}` - Get item by name
- `POST /api/items/` - Create new item
- `PUT /api/items/{id}` - Update item

### Sample Issues
- `GET /api/sample-issues/` - List all sample issues
- `GET /api/sample-issues/{id}` - Get sample issue by ID
- `POST /api/sample-issues/` - Create new sample issue
- `PUT /api/sample-issues/{id}` - Update sample issue
- `DELETE /api/sample-issues/{id}` - Delete draft sample issue

### Inventory Add-Ons
- `GET /api/inventory/` - List all inventory add-ons
- `GET /api/inventory/{id}` - Get inventory add-on by ID
- `POST /api/inventory/` - Create new inventory add-on
- `DELETE /api/inventory/{id}` - Delete inventory add-on

### Sample Returns
- `GET /api/sample-returns/` - List all sample returns
- `GET /api/sample-returns/{id}` - Get sample return by ID
- `POST /api/sample-returns/` - Create new sample return
- `DELETE /api/sample-returns/{id}` - Delete draft sample return

### Reports
- `GET /api/reports/inventory` - Sample Inventory Report
- `GET /api/reports/customer-samples` - Customer-Based Sample Report
- `GET /api/reports/disposition-summary` - Disposition Type Summary

## Database Tables

The following tables will be created automatically:

1. **projects** - Project master data
2. **items** - Item master with inventory quantities
3. **sample_issues** - Sample issue headers
4. **sample_issue_lines** - Sample issue line items
5. **inventory_addons** - Inventory add-on headers
6. **inventory_addon_lines** - Inventory add-on line items
7. **sample_returns** - Sample return headers
8. **sample_return_lines** - Sample return line items

## Business Logic

### Document Number Generation
- Format: `PREFIX-YYYYMM-####`
- Sample Issue: `SI-202603-0001`
- Inventory Add-On: `IA-202603-0001`
- Sample Return: `SR-202603-0001`

### Status Flow
- Sample Issue: `Draft → Issued → Returned → Closed`
- Sample Return: `Draft → Returned`

### Inventory Updates
- **Inventory Add-On**: Increases `qty_on_hand` and `qty_available`
- **Sample Issue (Issued)**: Increases `qty_issued`, decreases `qty_available`
- **Sample Return**: Decreases `qty_issued`, increases `qty_available`

### Validation Rules
- Cannot issue more quantity than available
- Cannot return more quantity than issued
- Only Draft documents can be deleted
- Disposition type is mandatory for sample issues

## Testing

### Using cURL

**Create a project:**
```bash
curl -X POST http://localhost:8000/api/projects/ \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "PRJ-2026-001",
    "customer_name": "ABC Construction LLC",
    "salesperson": "John Smith",
    "project_manager": "Sarah Johnson"
  }'
```

**Get all items:**
```bash
curl http://localhost:8000/api/items/
```

### Using Python

```python
import requests

# Create inventory add-on
response = requests.post(
    "http://localhost:8000/api/inventory/",
    json={
        "date": "2026-03-09T12:00:00",
        "location_store": "Sample Store Dubai",
        "line_items": [
            {
                "item_name": "Sample 1",
                "description": "High-grade steel sample",
                "quantity": 50
            }
        ]
    }
)
print(response.json())
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_DB_SERVER` | Sample Tracker MSSQL server address | (falls back to `DB_SERVER`) |
| `APP_DB_NAME` | Sample Tracker database name | (falls back to `DB_NAME`) |
| `APP_DB_USER` | Sample Tracker database username | (falls back to `DB_USER`) |
| `APP_DB_PASSWORD` | Sample Tracker database password | (falls back to `DB_PASSWORD`) |
| `APP_DB_DRIVER` | Sample Tracker ODBC driver name | (falls back to `DB_DRIVER`) |
| `ERP_DB_SERVER` | ERP MSSQL server address | (falls back to `DB_SERVER`) |
| `ERP_DB_NAME` | ERP database name | (falls back to `DB_NAME`) |
| `ERP_DB_USER` | ERP database username | (falls back to `DB_USER`) |
| `ERP_DB_PASSWORD` | ERP database password | (falls back to `DB_PASSWORD`) |
| `ERP_DB_DRIVER` | ERP ODBC driver name | (falls back to `DB_DRIVER`) |
| `DB_SERVER` | MSSQL server address | localhost |
| `DB_NAME` | Database name | SampleTrackerDB |
| `DB_USER` | Database username | - |
| `DB_PASSWORD` | Database password | - |
| `DB_DRIVER` | ODBC driver name | ODBC Driver 17 for SQL Server |
| `API_HOST` | API host address | 0.0.0.0 |
| `API_PORT` | API port number | 8000 |
| `APP_DEBUG` | Debug mode | True |
| `DEBUG` | Legacy debug mode (if `APP_DEBUG` unset) | True |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | http://localhost:3000 |
| `BILL_PROCESSING_AZURE_TENANT_ID` | Azure tenant ID used for Graph token | - |
| `BILL_PROCESSING_AZURE_CLIENT_ID` | Azure app/client ID used for Graph token | - |
| `BILL_PROCESSING_AZURE_CLIENT_SECRET` | Azure app/client secret used for Graph token | - |
| `BILL_PROCESSING_AZURE_SCOPE` | Graph OAuth scope for app token | https://graph.microsoft.com/.default |
| `BILL_PROCESSING_GRAPH_SENDER` | Sender mailbox used in Graph `/users/{sender}/sendMail` | noreply@brisigns.com |
| `SAMPLE_ISSUE_EMAIL_TO` | Comma-separated recipient list for Sample Issue issued notifications | jobcosting@brisigns.com |

## Troubleshooting

### Database Connection Issues

**Error: "Data source name not found"**
- Install ODBC Driver 17 for SQL Server
- Update `DB_DRIVER` in `.env` to match installed driver

**Error: "Login failed for user"**
- Verify database credentials in `.env`
- Ensure SQL Server allows SQL authentication

### Import Errors

```bash
pip install --upgrade pip
pip install -r requirements.txt --force-reinstall
```

### Port Already in Use

```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:8000 | xargs kill -9
```

## Production Deployment

### Using Gunicorn (Linux)

```bash
pip install gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Using Docker

```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Next Steps

1. Configure your MSSQL database
2. Update `.env` with your credentials
3. Run the application
4. Test endpoints using `/docs`
5. Connect frontend to backend
6. Deploy to production server

## Support

For issues or questions, contact the development team.

---

**Version**: 1.0.0
**Last Updated**: 2026-03-09
**Status**: Production Ready
