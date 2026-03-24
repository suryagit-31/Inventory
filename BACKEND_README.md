# Sample Tracker Backend - Quick Start Guide

## Overview

Complete FastAPI backend for the Sample Tracker Module with MSSQL database integration.

## What's Been Built

### Backend Structure
```
backend/
├── app/
│   ├── main.py              # FastAPI application
│   ├── config.py            # Settings & environment
│   ├── database.py          # Database connection
│   ├── models/              # SQLAlchemy models (8 tables)
│   ├── schemas/             # Pydantic validation schemas
│   ├── routers/             # API endpoints (6 routers)
│   └── utils/               # Helper functions
├── requirements.txt         # Python dependencies
├── .env.example            # Environment template
├── seed_data.py            # Initial data script
├── run.py                  # Quick start script
├── database_setup.sql      # Manual SQL setup
└── README.md               # Full documentation
```

### API Endpoints Created

**Projects API** (`/api/projects`)
- GET all projects, GET by ID, GET by number, POST create

**Items API** (`/api/items`)
- GET all items, GET by ID, GET by name, POST create, PUT update

**Sample Issues API** (`/api/sample-issues`)
- GET all, GET by ID, POST create, PUT update, DELETE
- Auto-generates doc numbers (SI-202603-0001)
- Updates inventory on issue

**Inventory Add-On API** (`/api/inventory`)
- GET all, GET by ID, POST create, DELETE
- Auto-generates doc numbers (IA-202603-0001)
- Creates/updates items automatically

**Sample Returns API** (`/api/sample-returns`)
- GET all, GET by ID, POST create, DELETE
- Auto-generates doc numbers (SR-202603-0001)
- Updates inventory on return

**Reports API** (`/api/reports`)
- `/inventory` - Sample inventory report
- `/customer-samples` - Customer-based report
- `/disposition-summary` - Disposition breakdown

## Installation Steps

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Setup Database

**Option A: Let SQLAlchemy create tables automatically**
- The app will create tables on first run

**Option B: Run SQL script manually**
```bash
# Connect to SQL Server and run:
database_setup.sql
```

### 3. Configure Environment

```bash
# Copy example file
cp .env.example .env

# Edit with your database credentials
# Windows: notepad .env
# Linux/Mac: nano .env
```

Required settings:
```env
DB_SERVER=localhost
DB_NAME=SampleTrackerDB
DB_USER=your_username
DB_PASSWORD=your_password
```

### 4. Seed Initial Data (Optional)

```bash
python seed_data.py
```

This creates:
- 3 mock projects
- 4 mock items with inventory

### 5. Run the Server

**Quick start:**
```bash
python run.py
```

**Or with uvicorn:**
```bash
uvicorn app.main:app --reload
```

## Testing the API

### Access Documentation
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Quick Test

**1. Create an item:**
```bash
curl -X POST http://localhost:8000/api/items/ \
  -H "Content-Type: application/json" \
  -d '{
    "item_name": "Test Sample",
    "description": "Test description",
    "location": "Sample Store Dubai"
  }'
```

**2. Add inventory:**
```bash
curl -X POST http://localhost:8000/api/inventory/ \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2026-03-09T12:00:00",
    "location_store": "Sample Store Dubai",
    "line_items": [
      {
        "item_name": "Test Sample",
        "description": "Test description",
        "quantity": 100
      }
    ]
  }'
```

**3. Get all items:**
```bash
curl http://localhost:8000/api/items/
```

## Key Features Implemented

### 1. Auto Document Numbering
- Format: PREFIX-YYYYMM-XXXX
- Auto-increments per month
- Thread-safe generation

### 2. Inventory Management
- Real-time quantity tracking
- Automatic calculations (qty_available = qty_on_hand - qty_issued)
- Create items on-the-fly via inventory add-on

### 3. Validation
- Pydantic schemas for all requests
- Cannot issue more than available
- Cannot return more than issued
- Status flow enforcement

### 4. Business Logic
- Sample Issue: Reduces inventory when status = "Issued"
- Sample Return: Increases inventory when status = "Returned"
- Inventory Add-On: Increases inventory immediately

### 5. Database Integration
- SQLAlchemy ORM with MSSQL
- Relationships and cascade deletes
- Automatic timestamps
- Connection pooling

## Connecting to Frontend

Update frontend to use backend API:

```typescript
// In frontend/src/data/mockData.ts or create api.ts
const API_BASE_URL = 'http://localhost:8000/api';

export const fetchProjects = async () => {
  const response = await fetch(`${API_BASE_URL}/projects/`);
  return response.json();
};

export const fetchItems = async () => {
  const response = await fetch(`${API_BASE_URL}/items/`);
  return response.json();
};

export const createSampleIssue = async (data) => {
  const response = await fetch(`${API_BASE_URL}/sample-issues/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
};
```

## Database Tables

8 tables created automatically:
1. **projects** - Project master
2. **items** - Item master with quantities
3. **sample_issues** - Sample issue headers
4. **sample_issue_lines** - Sample issue details
5. **inventory_addons** - Inventory add-on headers
6. **inventory_addon_lines** - Inventory add-on details
7. **sample_returns** - Sample return headers
8. **sample_return_lines** - Sample return details

## Common Issues & Solutions

### Issue: "Module not found"
```bash
pip install -r requirements.txt
```

### Issue: "ODBC Driver not found"
- Windows: Download from Microsoft
- Linux: `apt-get install msodbcsql17`

### Issue: "Database connection failed"
- Check SQL Server is running
- Verify credentials in `.env`
- Test connection: `sqlcmd -S localhost -U sa -P password`

### Issue: "Port 8000 already in use"
```bash
# Change port in .env
API_PORT=8001
```

## Production Checklist

- [ ] Update `DEBUG=False` in `.env`
- [ ] Set strong `DB_PASSWORD`
- [ ] Configure proper CORS origins
- [ ] Use environment secrets (not `.env` file)
- [ ] Setup reverse proxy (nginx)
- [ ] Enable HTTPS
- [ ] Configure logging
- [ ] Setup monitoring
- [ ] Backup database regularly

## Next Steps

1. ✅ Backend is complete and running
2. Test all endpoints in Swagger UI
3. Update frontend to consume backend API
4. Deploy to production server
5. Configure database backups

## Status

✅ **Backend Development Complete**
- All models created
- All endpoints implemented
- Validation in place
- Documentation generated
- Ready for integration

---

**Need Help?**
- Check `/docs` for interactive API testing
- See `backend/README.md` for detailed documentation
- Review code comments in source files
