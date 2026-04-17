# Sample Tracker – Codebase Issues & Risks

Date: 2026-03-24

This document summarizes notable issues/risks found during a static read-through of the repository (backend + frontend). It focuses on correctness, data integrity, scalability, and operational concerns.

---

## Executive Summary

1. **Document number generation is not concurrency-safe** (risk of duplicates and 500s under load).
2. **Inventory updates are not atomic under concurrency** (risk of oversubscription / negative availability with parallel requests).
3. **`/health` reports “database connected” even when DB init fails** (false-positive monitoring).
4. **Reports use `created_at` instead of the business date** (aging calculations can be wrong).
5. **Sample Return UI fetches a fixed page and filters client-side** (breaks when data grows beyond the limit).
6. **Workspace contains temp folders with permission issues** (tooling/scans show “Access is denied”; potential operational annoyance).

---

## Fixes Implemented (in this workspace)

The following fixes have been applied in code:

- **Concurrency-safe doc numbers**: Added `backend/app/models/doc_sequence.py` and updated `backend/app/utils/doc_number.py` to allocate numbers from a locked sequence row per `{prefix, YYYYMM}`.
- **Inventory row locking + rollback safety**: Updated `backend/app/routers/sample_issue.py`, `backend/app/routers/sample_return.py`, and `backend/app/routers/inventory.py` to lock `Item` rows during validate/update and rollback on failures.
- **Scalable Sample Return issue lookup**: Added `GET /api/sample-issues/doc/{doc_number}` in `backend/app/routers/sample_issue.py` and updated `frontend/src/pages/SampleReturnPage.tsx` to use it (no more `limit=100` client-side search).
- **Backend-owned doc numbers in UI**: Updated `frontend/src/pages/SampleReturnPage.tsx` to stop generating doc numbers client-side; UI shows doc number after save/submit response.
- **Accurate health check**: Updated `backend/app/main.py` `/health` to actually ping APP + ERP DBs and return `503` when degraded.
- **Report aging**: Updated `backend/app/routers/reports.py` to compute aging from `date_of_issue` (fallback to `created_at`).

---

## Backend Issues

### 1) Doc-number generation race condition

**Where**
- `backend/app/utils/doc_number.py` (`generate_doc_number`)

**What happens**
- The function looks up the latest doc number for the month, increments it, and returns the new value.
- With concurrent requests, two transactions can read the same “last doc”, both generate the same next value, then one fails on the DB unique constraint (or both succeed if uniqueness is not enforced correctly).

**Impact**
- Intermittent failures during bursts of create operations (`Sample Issue`, `Inventory Add-On`, `Sample Return`).
- Hard-to-reproduce issues in production; users may see random “already exists”/500 errors.

**Recommended fix**
- Move sequence generation into the database (recommended):
  - Use a dedicated sequence table keyed by `{prefix, year_month}` with an atomic increment (e.g., `UPDATE ... OUTPUT inserted.next_value`).
  - Or use a SQL Server `SEQUENCE` / stored procedure per prefix/month.
- If keeping app-side generation:
  - Use serializable transactions + row locks on a sequence row (still DB-assisted).
  - Add a retry-on-unique-violation loop (mitigation, not a full fix).


### 2) Inventory integrity under concurrent “issue” / “return”

**Where**
- `backend/app/routers/sample_issue.py` (issue creation / status update sets `qty_issued`, `qty_available`)
- `backend/app/routers/sample_return.py` (return reduces `qty_issued`, recalculates `qty_available`)
- `backend/app/routers/inventory.py` (add-on increments `qty_on_hand`, recomputes `qty_available`)

**What happens**
- The code:
  1) reads current quantities,
  2) validates,
  3) writes updated quantities,
  without DB-level locking or a transaction isolation strategy to prevent races.
- Example: two “Issue” requests for the same item can both pass validation against the same `qty_available` snapshot and then both decrement, oversubscribing inventory.

**Impact**
- `qty_issued` and `qty_available` can drift from reality.
- Negative availability/issued counts are possible if multiple operations interleave.

**Recommended fix**
- Make inventory updates atomic:
  - Use `SELECT ... WITH (UPDLOCK, ROWLOCK)` (or SQLAlchemy equivalents) when reading rows that will be updated.
  - Wrap each create/update in a single transaction with appropriate isolation.
  - Consider computing `qty_available` as a derived value (`qty_on_hand - qty_issued`) rather than persisting it, or enforce consistency via DB constraints/triggers.
- Add server-side guards:
  - Ensure `qty_on_hand >= 0`, `qty_issued >= 0`, and `qty_on_hand - qty_issued >= 0` (DB constraints if possible).


### 3) `/health` returns a false-positive DB status

**Where**
- `backend/app/main.py` (`/health`)

**What happens**
- `/health` always returns `{"status":"healthy","database":"connected"}`.
- Startup (`lifespan`) intentionally doesn’t fail even if `init_db()` fails; that’s fine, but then health should reflect that.

**Impact**
- Monitoring/health checks can show “healthy” while the app DB is unreachable/misconfigured.

**Recommended fix**
- Implement a lightweight DB check:
  - e.g., execute `SELECT 1` on the APP DB and ERP DB and report their status separately.
  - Return `503` if critical DB checks fail (or return a structured “degraded” health state).


### 4) Report “aging_days” uses `created_at` instead of `date_of_issue`

**Where**
- `backend/app/routers/reports.py` (`/customer-samples`)

**What happens**
- `aging_days` is computed using `datetime.now() - issue.created_at`.
- From a business perspective, “aging” should likely use `issue.date_of_issue` (the user-selected business date).

**Impact**
- Aging values can be wrong, especially if records were created later than the issue date, imported, or edited.

**Recommended fix**
- Compute aging from `issue.date_of_issue` (or document why `created_at` is the intended business meaning).


### 5) Dead code / unused helper

**Where**
- `backend/app/routers/sample_issue.py` defines `_is_missing_table_error` but does not use it.

**Impact**
- Minor: adds noise and confusion; can mislead future maintainers.

**Recommended fix**
- Remove it or use it where DB errors are handled (if you intended special-case behavior during initial setup).

---

## Frontend Issues

### 1) Sample Return: non-scalable issue lookup

**Where**
- `frontend/src/pages/SampleReturnPage.tsx`

**What happens**
- For the “open by doc number” flow, the page fetches `GET /api/sample-issues/?limit=100` and then searches client-side for a matching `doc_number`.
- If there are more than 100 issues, a valid `doc_number` may not be found.

**Impact**
- Users can’t open older issued documents reliably once the dataset grows.

**Recommended fix**
- Add a backend endpoint to fetch a sample issue by `doc_number` (or search endpoint), then call that directly.
- Or enhance the list endpoint with a `doc_number` filter.


### 2) Sample Return: doc numbers generated from mock logic

**Where**
- `frontend/src/pages/SampleReturnPage.tsx` uses `generateDocNumber()` from `frontend/src/data/mockData.ts`

**What happens**
- The UI generates an `SR-...` number client-side, but the backend assigns doc numbers server-side on create.

**Impact**
- Confusing UX: UI may show one doc number pre-save, but the saved record may have another.

**Recommended fix**
- Treat doc numbers as backend-owned:
  - Display blank/“Auto-generated” until the create call returns the created record.
  - Or call a backend “reserve doc number” endpoint if you need a number before save/print.

---

## Repo / Operational Issues

### Temp folders with “Access is denied” warnings

**Where**
- `temp/` and `pytemp/` at repo root (example: `temp/tmp...`, `pytemp/tmp...`)

**What happens**
- Some tooling operations (e.g., `git status`, search scans) emit permission errors when entering these directories.

**Impact**
- No direct runtime impact, but it disrupts development workflows and automated scanning/indexing.

**Recommended fix**
- Delete these directories if they are not required artifacts.
- Ensure they are ignored (`.gitignore`) and that directory ACLs allow developer tools to traverse them.

---

## Suggested Priority Order

1. **Doc-number concurrency safety** (prevents user-facing create failures).
2. **Inventory atomicity & constraints** (protects data integrity).
3. **Fix Sample Return lookup scalability** (prevents functional breakage as data grows).
4. **Health check accuracy** (prevents operational blind spots).
5. **Report aging correction** (business correctness).
6. **Cleanup temp/permissions** (developer experience).
