# Deployment Guide (Ubuntu + WinSCP + PuTTY) — Sample Tracker

This document captures the exact steps we followed to deploy:

- **Backend**: FastAPI (`app.main:app`) + MSSQL (via `pyodbc` + Microsoft ODBC driver)
- **Process manager**: `pm2` running `gunicorn` with `uvicorn.workers.UvicornWorker`
- **Reverse proxy + TLS**: `nginx` + `certbot` (Let’s Encrypt)
- **Frontend**: CRA (Create React App) hosted on **Vercel**

---

## 1) What to upload (WinSCP)

Upload **only** what the server needs to run. Keep the folder structure intact.

### Backend (required)

Upload these from your local repo:

- `backend/app/` (all Python source code)
- `backend/requirements.txt`
- `backend/run.py` (optional, but fine to upload)
- `backend/.env.example` (template)

Optional uploads (only if you will use them):

- `backend/seed_data.py`
- `backend/database_setup.sql`
- `backend/erp_live_table_setup.sql`
- `backend/README.md`

### Do NOT upload

- Any virtualenv folder: `backend/venv/`, `backend/.venv/`
- Cache: `__pycache__/`
- Local secrets: `backend/.env` (create/edit `.env` on the server)

---

## 2) Server prerequisites (Ubuntu)

### Check/Install OS packages

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip curl ca-certificates gnupg unixodbc unixodbc-dev
```

### MSSQL ODBC driver (must exist)

Verify driver:

```bash
odbcinst -q -d
```

We used:

- `ODBC Driver 17 for SQL Server`

If you don’t see it, install Microsoft’s driver (choose 17 or 18) using your company SOP or Microsoft repo instructions.

---

## 3) Create Python venv and install dependencies

Go to your uploaded backend folder on the server (example path):

```bash
cd ~/bri-erp-api/api-inventory
```

Create and activate venv:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

### If an old `venv/` exists

Sometimes an older folder named `venv/` exists. Remove it:

```bash
rm -rf venv
```

Use only `.venv/`.

---

## 4) Configure environment (`.env`)

Create `.env` (or edit it):

```bash
nano .env
```

Minimum working example:

```env
# Database Configuration (legacy single DB values)
DB_SERVER=13.234.241.125
DB_NAME=ERP-Dev
DB_USER=eljossqladmin
DB_PASSWORD=@#syghe884osk
DB_DRIVER=ODBC Driver 17 for SQL Server

# CORS Origins (comma-separated)
CORS_ORIGINS=https://inventory-chi-lemon.vercel.app

# Production recommendation
APP_DEBUG=False
```

Important notes:

- **Do not put quotes** around the driver name.
  - Good: `DB_DRIVER=ODBC Driver 17 for SQL Server`
  - Avoid: `DB_DRIVER="ODBC Driver 17 for SQL Server"`
- Passwords containing special characters (like `@#`) are OK for this codebase.
- If you want to use separate DBs, set `APP_DB_*` and `ERP_DB_*`. If you only set `DB_*`, the backend uses those values as fallback for both connections.

---

## 5) Run backend with PM2 (gunicorn + uvicorn worker)

### Verify `gunicorn` path

Inside the venv:

```bash
source .venv/bin/activate
which gunicorn
```

Expected:

- `.../.venv/bin/gunicorn`

### PM2 start command (bind to port 8005)

We ran the backend on `127.0.0.1:8005`:

```bash
pm2 start /home/ubuntu/bri-erp-api/api-inventory/.venv/bin/gunicorn \
  --name api-inventory \
  --interpreter none \
  -- -k uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8005 \
  app.main:app
```

Key detail:

- The app target must be `app.main:app` (NOT `main:app`), otherwise you get:
  - `ModuleNotFoundError: No module named 'main'`

Persist PM2 processes across reboot:

```bash
pm2 save
```

---

## 6) Verify backend is running

### Local (on server)

```bash
curl -I http://127.0.0.1:8005/docs
```

Expected:

- `HTTP/1.1 200 OK`

### Verify CORS (from server)

```bash
curl -i -H "Origin: https://inventory-chi-lemon.vercel.app" \
  "http://127.0.0.1:8005/api/sample-issues/?skip=0&limit=1&status_filter=Issued" | head -n 20
```

Expected header:

- `access-control-allow-origin: https://inventory-chi-lemon.vercel.app`

---

## 7) Link domain to backend (nginx reverse proxy)

### Create nginx site for HTTP → proxy to 8005

```bash
sudo nano /etc/nginx/sites-available/sample-tracker.app-brisigns.com
```

Paste:

```nginx
server {
  listen 80;
  server_name sample-tracker.app-brisigns.com;

  location / {
    proxy_pass http://127.0.0.1:8005;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable site + reload:

```bash
sudo ln -s /etc/nginx/sites-available/sample-tracker.app-brisigns.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Verify HTTP:

```bash
curl -I http://sample-tracker.app-brisigns.com/docs
```

---

## 8) Enable HTTPS (certbot)

Install certbot (if missing):

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Issue and auto-configure TLS:

```bash
sudo certbot --nginx -d sample-tracker.app-brisigns.com
```

Verify HTTPS:

```bash
curl -I https://sample-tracker.app-brisigns.com/docs
```

If you ever see a TLS error like “certificate subject name mismatch”, HTTPS is not correctly configured for that hostname.

---

## 9) Frontend on Vercel (CRA)

### Set the API URL in Vercel

In Vercel → Project → Settings → Environment Variables:

- `REACT_APP_API_URL=https://sample-tracker.app-brisigns.com`

Then redeploy.

### CORS must allow Vercel origin

In backend `.env`:

- `CORS_ORIGINS=https://inventory-chi-lemon.vercel.app`

If you add a custom frontend domain, include it too (comma-separated).

---

## 10) Restart / update workflow

### After uploading backend changes (WinSCP)

1) Upload changed files to the server folder (same paths).
2) If dependencies changed:

```bash
cd ~/bri-erp-api/api-inventory
source .venv/bin/activate
pip install -r requirements.txt
```

3) Restart:

```bash
pm2 restart api-inventory
```

### View logs

```bash
pm2 logs api-inventory --lines 80
```

### Clear old logs (optional)

```bash
pm2 flush api-inventory
```

---

## 11) Common issues

### A) `No module named 'main'`

Cause: started gunicorn as `main:app`.

Fix: use `app.main:app` in PM2 args.

### B) CORS works on `127.0.0.1:8005` but not on domain

Cause: nginx/domain not proxying to the service or HTTPS is misconfigured.

Fix:

- Ensure nginx `proxy_pass http://127.0.0.1:8005;`
- Ensure TLS cert matches the hostname (`certbot --nginx -d <domain>`)

### C) Vim swap file like `..env.swp`

Safe to delete; it’s an editor temp file:

```bash
rm -f ..env.swp
```

