# Shadi Hall Manager

Wedding hall management system: bookings and calendar, customers, payments and invoices, menu and packages,
inventory, expenses, staff, dashboard and reports — for one business today, built to become multi-tenant SaaS.

- **Frontend:** Vite + React 19 (`frontend/shadi-hall`)
- **API:** Express 5 + Mongoose 9 (`backend`)
- **Database:** MongoDB
- **Shared rules:** `shared/` — booking finance calculation, enums and money formatting used by both sides

Design, data model, business rules and API reference: [ARCHITECTURE.md](ARCHITECTURE.md).

## Requirements

- Node.js **22.12 or newer** (tested on 24)
- MongoDB — any of:
  - the bundled local database (`npm run db`, no Docker or install needed), or
  - a local MongoDB install, or
  - MongoDB Atlas

## Quick start (development)

```bash
# 1. API config (a dev .env with a random secret is already created; otherwise:)
cd backend
cp .env.example .env          # then set JWT_ACCESS_SECRET to a long random value

# 2. Database — leave running in its own terminal (skip if you use your own MongoDB/Atlas)
npm run db                    # MongoDB on 127.0.0.1:27017, data kept in backend/.data/db

# 3. Demo data (drops and recreates the database in MONGODB_URI)
npm run seed

# 4. API — its own terminal
npm run dev                   # http://localhost:5000

# 5. Web app — its own terminal
cd ../frontend/shadi-hall
npm run dev                   # http://localhost:5173 (proxies /api to the API)
```

Open http://localhost:5173 and sign in:

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@shadihall.pk | Admin@12345 |
| Manager | manager@shadihall.pk | Demo@12345 |
| Accountant | accounts@shadihall.pk | Demo@12345 |
| Receptionist | frontdesk@shadihall.pk | Demo@12345 |
| Staff | staff@shadihall.pk | Demo@12345 |

The seed creates 3 halls, 37 dishes, 4 packages, 18 customers, 28 bookings (past, today and upcoming, including
a cancellation with a refund), payments, invoices, ~160 expenses, 22 inventory items with stock movements,
13 employees with 30 days of attendance and 3 months of salaries. Dates are relative to the day you run it.

## Scripts

| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` | API with auto-reload (watches `src/` and `shared/`) |
| backend | `npm start` | API for production |
| backend | `npm run db` | Local MongoDB without Docker (persistent) |
| backend | `npm run seed` | Reset the database and load demo data (refuses in production) |
| backend | `npm test` | Integration tests against a throwaway in-memory MongoDB |
| frontend | `npm run dev` | Web app dev server |
| frontend | `npm run build` | Production build into `dist/` |
| frontend | `npm run lint` | ESLint incl. React hooks / React Compiler rules |

## Tests

`npm test` in `backend` runs 50 integration tests over real HTTP against a real (in-memory) MongoDB, covering:
authentication and sessions, privilege-escalation guards, tenant isolation, booking totals, overnight events,
double-booking prevention (including racing requests), package snapshots, overpayment prevention under
concurrent payments, refunds and voids, invoice numbering under concurrency, PDFs, expenses and audit trail,
inventory stock guards, payroll → expenses, dashboard figures, report exports and export permissions.

## Configuration

All settings are environment variables in `backend/.env` (see `.env.example`). The API refuses to start with
missing or invalid values. Important ones:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Database connection string |
| `JWT_ACCESS_SECRET` | Signs access tokens — at least 32 random characters, never commit it |
| `CORS_ORIGINS` / `APP_URL` | Web app origin(s) allowed to call the API; base URL for password-reset links |
| `COOKIE_SECURE` | `true` in production (HTTPS-only cookies) |
| `TRUST_PROXY` | Number of reverse proxies in front of the API (for correct client IPs / rate limits) |
| `EMAIL_PROVIDER` | `console` (prints emails to the log), `resend`, or `none` — used for password reset |
| `SCHEDULER_ENABLED` | Background job that marks finished events as completed |

Business settings (name, logo, address, tax numbers, currency, invoice prefix/numbering/terms) and system
settings (timezone, gap between events, auto-complete, overpayment) are edited in the app under **Settings**.

## Production notes

1. Use a managed MongoDB (Atlas) or a replica set with backups; set `MONGODB_URI`.
2. Set `NODE_ENV=production`, a strong `JWT_ACCESS_SECRET`, `COOKIE_SECURE=true`, `CORS_ORIGINS`, `APP_URL`,
   `TRUST_PROXY` and an email provider.
3. Build the web app (`npm run build`) and serve `dist/` from the same domain as the API, forwarding `/api` to
   the Node process (e.g. nginx). Same-origin keeps the httpOnly `SameSite=Lax` cookies working.
4. Uploaded files (logos, hall photos, receipts) are stored under `UPLOAD_DIR`; put it on persistent storage and
   include it in backups (or swap `backend/src/services/storage.js` for S3-compatible storage).
5. Run `npm run seed` only in development — it wipes the database.

## Phones and tablets

The web app is responsive down to 360 px wide (phone styles live in `frontend/shadi-hall/src/styles/mobile.css`):

- Top-bar actions become icon buttons; the sidebar slides in from the menu button.
- Data tables turn into labelled cards (one per row on phones, two per row on tablets). A table column can set
  `mobile: 'title'` to head the card or `mobile: 'hide'` to drop out on phones.
- Dialogs open as bottom sheets; inputs use 16 px text so iPhones don't zoom in.
- The booking form keeps the grand total and **Save** pinned to the bottom; detail pages show the money/contact
  summary before the tabs.
- The calendar switches to a phone layout: month grid with coloured dots (tap a day to list its events), a week
  agenda, and a per-hall "free / booked" day view.

## Scope notes

- **Notifications** (notification centre, preferences, scheduled reminders, SMS/WhatsApp) are deferred by
  request. Low stock, overdue balances and upcoming events are still surfaced from live data on the dashboard,
  inventory and reports screens.
- Money is stored in rupees rounded to 2 decimals; booking totals are always computed on the server with the same
  function the booking form uses for its live preview.
