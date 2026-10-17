# Newtonite Operations — Operations Work Management

A compact, runnable full-stack implementation for the Newtonite Software Engineering Challenge. It includes work-item CRUD, team-based authorization, comments, activity history, filtering/pagination, optimistic concurrency, idempotent create requests, and automated tests.

## Stack

- React + Vite
- Node.js + Express
- MySQL 8+
- JWT authentication and bcrypt password hashing
- Node's built-in test runner + Supertest

## Prerequisites

- Node.js 20 or newer and npm
- MySQL 8 or newer, running locally **or** Docker Desktop with Docker Compose
- Git

Check your Node/npm installation:

```powershell
node --version
npm --version
```

## Quick start (Windows PowerShell)

Run the commands in this section from the cloned repository unless another directory is specified. If you use macOS/Linux, adapt the two `Copy-Item` commands to `cp`.

### 1. Clone the repository

```powershell
git clone https://github.com/mabeg03/Newtonite-operations.git
cd Newtonite-operations
```

If you already cloned the repository, open PowerShell in that repository's root folder instead.

### 2. Start MySQL and create the database

Use either an existing local MySQL 8+ server or the optional Docker Compose service below.

**Option A — existing local MySQL:** make sure the MySQL service is running, then connect using MySQL Workbench or the MySQL command-line client and run:

```sql
CREATE DATABASE newtonite_ops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**Option B — Docker Compose:** from the repository root, run:

```powershell
docker compose up -d mysql
```

The Compose database credentials are for local development only. If you use this service, match the database password in `backend/.env` to `local_dev_only_change_me`. Do not use these credentials in a deployed environment.

### 3. Create and configure environment files

Create local environment files from the checked-in examples:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Open `backend/.env` and set the MySQL connection values to match your database, plus a long, random `JWT_SECRET` (at least 32 characters). Use the variable names already present in `backend/.env.example`; do not rename them. If the example includes a frontend-origin/CORS setting, set it to the local Vite origin, normally `http://localhost:5173`.

Open `frontend/.env` and check the API base URL. For a local backend, it should point to `http://localhost:4000/api`, using the variable name shown in `frontend/.env.example`.

**Important:** `.env` files contain local configuration and must not be committed. Only commit the `.env.example` templates. Never put real passwords, tokens, or secrets in Git.

### 4. Install dependencies, initialize the schema, and seed demo data

From the repository root:

```powershell
npm install
npm run db:setup
npm run seed
```

These commands install the project dependencies, create the database schema, and insert the demo data. If a command fails, check the database connection settings in `backend/.env` and confirm MySQL is running before continuing.

### 5. Start the backend

From the repository root, run:

```powershell
npm run dev
```

The API is expected at `http://localhost:4000`. Keep this terminal open while using the application.

### 6. Start the frontend

Open a **second** PowerShell terminal at the repository root and run:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`. Keep the backend terminal running as well.

### 7. Sign in with a demo account

| Role | Email | Password |
|---|---|---|
| Admin | `admin@newtonite.local` | `Admin123!` |
| Manager | `manager@newtonite.local` | `Manager123!` |
| Lead | `lead@newtonite.local` | `Lead123!` |
| Member | `member@newtonite.local` | `Member123!` |

These credentials are for local assessment/demo use only. Do not reuse them in a real deployment.

## Run automated tests

From the repository root:

```powershell
cd backend
npm test
```

The included tests cover workflow transitions and approval-role policy, team authorization decisions, stale-version handling, and claim preconditions. These are unit tests and do not require a running database. They do **not** replace live MySQL integration tests for simultaneous claims or idempotency. Do not describe those live scenarios as verified unless you have run and recorded those tests separately.

To build the frontend:

```powershell
cd ..\frontend
npm run build
```

## Core API

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/teams`
- `GET /api/work-items?status=OPEN&priority=HIGH&search=payment&page=1&limit=20`
- `POST /api/work-items` (supports the `Idempotency-Key` header)
- `GET /api/work-items/:id`
- `PATCH /api/work-items/:id` (requires `version`; a stale version returns `409`)
- `POST /api/work-items/:id/claim` (atomically claims an unassigned item; one claimant should win)
- `POST /api/work-items/:id/assign`
- `POST /api/work-items/:id/comments`
- `GET /api/work-items/:id/activity`

## Design highlights

1. **Server-side authorization:** authorization is enforced in API middleware and resource checks, not only in the UI. Admins can access all items; other users must belong to a team attached to the item.
2. **Optimistic locking:** each work item has an integer `version`. Updates require the client's version and use a version-checked update; stale writes return `409 Conflict`.
3. **Idempotent creation:** clients may send `Idempotency-Key`. The server stores the key and response in the same transaction as creation to prevent a retried request from creating a second item.
4. **Auditable history:** important work-item changes and comments write activity records. Activity rows are append-only at the application layer.
5. **Pagination and filters:** APIs return a bounded page instead of loading every row. Search, status, priority, team, and assignee filters are supported.
6. **Workflow rules:** explicit transition validation blocks invalid status changes.
7. **Atomic claim path:** the claim endpoint locks and validates the work item inside a transaction before assigning it and recording activity.

## Assessment scope

- Work-item types include task, incident, customer issue, payment, and compliance.
- Workflow includes `AWAITING_APPROVAL`; only a `LEAD` or `ADMIN` can approve it to `RESOLVED`.
- Seed data includes three teams, Admin/Manager/Lead/Member demo roles, hand-written examples, and 1,000 varied sample work items for pagination and filter demonstrations.

## Troubleshooting

- **Database connection errors:** confirm MySQL is running and that the host, port, database, username, and password in `backend/.env` match your local setup.
- **Frontend cannot reach the API / CORS error:** confirm the backend is running on port `4000`, the frontend API URL points to `http://localhost:4000/api`, and the backend's allowed frontend origin matches the Vite URL shown in the browser.
- **Port already in use:** stop the other process using the port or configure the application to use an available port, updating the matching environment settings as needed.
- **Missing `.env` file:** repeat Step 3 to copy the example files. Do not copy your personal `.env` files into a fresh clone.
- **Seed/setup command fails:** check the error output and confirm the database exists and the configured database user has permission to create tables and insert records.

## Known limitations

- This is an assessment-sized application, not a production deployment. Add HTTPS, secret management, rate limiting, a CSRF strategy appropriate to the chosen auth transport, structured observability, and database migration tooling before production.
- JWTs are stored in browser `localStorage` for simplicity; a production application should consider secure, HttpOnly cookies and a suitable CSRF strategy.
- Notifications and background jobs are intentionally omitted to keep the scope focused on correctness of primary actions.
- Team management UI is minimal; team membership is seeded and can be managed with the API/database.
