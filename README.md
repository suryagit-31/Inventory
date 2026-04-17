# Sample Tracker (Inventory)

Web app for tracking sample inventory (issues, add-ons, returns) against MSSQL. **React** frontend + **FastAPI** backend.

---

## Quick start (local)

### 1. Backend

- Install **Python 3.9+** and **ODBC Driver 17 for SQL Server**.
- Copy env template and edit values (database URLs, ports, optional Graph mail):

```bash
cd backend
copy .env.example .env
```

- Install and run:

```bash
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

API: **http://localhost:8000** — OpenAPI: **http://localhost:8000/docs**

Full backend options and tables: **[backend/README.md](backend/README.md)**

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

App: **http://localhost:3000** — Point the UI at your API (see `frontend/.env` / `frontend/src/config/api.ts` if the backend is not on port 8000).

Frontend notes: **[frontend/README.md](frontend/README.md)**

---

## What changed recently

- **Sample Issue email (Microsoft Graph)** — When a new sample issue is submitted as **Issued**, the API sends email via Graph from `BILL_PROCESSING_GRAPH_SENDER` to everyone listed in **`SAMPLE_ISSUE_EMAIL_TO`** (comma-separated). Configure Azure app credentials and optional mail vars in `backend/.env`. See **Graph mail** in [backend/README.md](backend/README.md).
- **Work ID suggestions** — Line-item Work ID suggestions render in a floating list (same idea as project search) so they are not clipped by the form card.

---

## More documentation

| Location | Use |
|----------|-----|
| **[refdocs/](refdocs/)** | Older/long guides: full setup, deployment, features, issues |
| **[backend/README.md](backend/README.md)** | API, env vars, SQL upgrades, troubleshooting |
| **[frontend/README.md](frontend/README.md)** | Frontend-specific notes |

Start with this README and **backend/.env.example**; use **refdocs** only when you need the long guides.
