# Newtonite Operations — Operations Work Management

A compact, runnable full-stack implementation for the Newtonite Software Engineering Challenge. It includes work-item CRUD, team membership, role-based authorization, comments, activity history, filtering/pagination, optimistic concurrency, idempotent create requests, automated tests, and setup instructions.

## Stack
- React + Vite
- Node.js + Express
- MySQL 8+
- JWT authentication and bcrypt password hashing
- Node's built-in test runner + Supertest

## Prerequisites
- Node.js 20+
- MySQL 8+
- npm

## Quick start

### 1. Create the database
```sql
CREATE DATABASE newtonite_ops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Configure backend
```bash
cd backend
cp .env.example .env
```
Edit `.env` with your MySQL credentials and a long random `JWT_SECRET`.

### 3. Install, create schema, seed demo data, and run API
```bash
npm install
npm run db:setup
npm run seed
npm run dev
```
API defaults to `http://localhost:4000`.

Demo accounts (change their passwords before any real use):
- `admin@newtonite.local` / `Admin123!`
- `manager@newtonite.local` / `Manager123!`
- `lead@newtonite.local` / `Lead123!`
- `member@newtonite.local` / `Member123!`

Optional local MySQL container:
```bash
docker compose up -d mysql
```
The Compose credentials are for local development only. If using Compose's MySQL, match `DB_PASSWORD` in `backend/.env` to `local_dev_only_change_me`.

### 4. Run frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the URL Vite prints (usually `http://localhost:5173`). The frontend uses the API at `http://localhost:4000/api` by default. Set `VITE_API_URL` if needed.

### 5. Run automated tests
```bash
cd backend
npm test
```
The included tests cover workflow transitions and approval-role policy, team authorization decisions, stale-version handling, and claim preconditions. They are unit tests and do not require a running database. They do not replace live MySQL integration tests for simultaneous claims or idempotency; verify those behaviours against a disposable database before final submission.

## Core API
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/teams`
- `GET /api/work-items?status=OPEN&priority=HIGH&search=payment&page=1&limit=20`
- `POST /api/work-items` (supports `Idempotency-Key` header)
- `GET /api/work-items/:id`
- `PATCH /api/work-items/:id` (requires `version`; stale version returns `409`)
- `POST /api/work-items/:id/claim` (atomically claims an unassigned item; one claimant wins)
- `POST /api/work-items/:id/assign`
- `POST /api/work-items/:id/comments`
- `GET /api/work-items/:id/activity`

## Design highlights
1. **Authorization is enforced in API middleware and resource checks**, not merely in the UI. Admins can access all items; other users must belong to a team attached to the item.
2. **Optimistic locking:** each work item has an integer `version`. Updates require the client's version and update with `WHERE id = ? AND version = ?`; stale writes return `409 Conflict`.
3. **Idempotent creation:** clients may send `Idempotency-Key`. The server stores the key and response in the same transaction as creation, preventing a retried request from creating a second item.
4. **Auditable history:** important work-item changes and comments write activity records. Activity rows are append-only at the application layer.
5. **Pagination and indexed filters:** APIs return a bounded page instead of loading every row. Search, status, priority, team, and assignee filters are supported.
6. **Workflow rules:** explicit transition validation blocks invalid status changes.

## Advisory-aligned scope
- Work-item types: task, incident, customer issue, payment, and compliance.
- Workflow includes `AWAITING_APPROVAL`; only a `LEAD` or `ADMIN` can approve it to `RESOLVED`.
- Atomic claim endpoint: `POST /api/work-items/:id/claim` checks the expected version and unassigned state inside a transaction.
- Seed includes three teams, Admin/Manager/Lead/Member demo roles, two initial hand-written examples, and 1,000 varied sample work items for pagination and filter demonstrations.
- Local MySQL can be started with Docker Compose; the app itself is run with the commands above.

## Known limitations
- This is an assessment-sized application, not a production deployment. Add HTTPS, secret management, rate limiting, CSRF strategy appropriate to the chosen auth transport, structured observability, and database migration tooling before production.
- JWTs are stored in browser localStorage for simplicity; a production application should consider secure, HttpOnly cookies and a CSRF strategy.
- Notifications and background jobs are intentionally omitted to keep the one-day scope focused on correctness of primary actions.
- Team management UI is minimal; team membership is seeded and can be managed with the API/database.
- Search uses MySQL `LIKE`; a larger deployment may adopt full-text search.
