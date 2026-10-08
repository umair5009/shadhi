# Shadi Hall — Wedding Hall Management System

Technical architecture, data model, API surface and delivery roadmap.

Stack: **Vite + React 19** (frontend) · **Express 5** (API) · **MongoDB / Mongoose 9** (database) · Node 24.

---

## 1. Requirements analysis — what the system is really for

The owner opens the app in the morning and needs answers, not tables:

| Question | Where the answer comes from |
|---|---|
| How much money came in? | `Payment` ledger (net of refunds, voids excluded) for a date range |
| How much money went out? | `Expense` ledger (voids excluded) — salary payments and inventory purchases post here automatically |
| How much profit? | Collected revenue − expenses (cash basis). Per event: contracted revenue − event-linked expenses |
| What events are coming? | `Booking` where `eventDate ≥ today` and status in inquiry/tentative/confirmed |
| Who owes money? | `Booking.totals.balance > 0` on non-cancelled bookings |
| Which hall is available? | Overlap query on `Booking.startAt/endAt` per hall |
| What needs to be purchased? | `InventoryItem.currentQuantity ≤ minimumQuantity` |
| Which employees are working? | `Attendance` for today |
| How is the business performing? | Reports: monthly series, event-type mix, hall utilisation, customer spend |

Every module feeds these answers, which is why modules are wired together rather than built as isolated CRUD:

```
Customer ─┬─< Booking >── Hall
          │     │  ├── menu (package snapshot / custom lines)  ── MenuPackage / MenuItem
          │     │  ├── services, charges, totals (computed)
          │     │  ├──< Payment ──(refund/void)          → revenue
          │     │  ├──< Invoice (snapshot)
          │     │  ├──< Expense (event-linked)           → event profitability
          │     │  └──< InventoryTransaction (stock out for event)
          │
Supplier ─< InventoryTransaction(purchase) ──auto──> Expense (Inventory Purchase)
Staff ────< SalaryPayment ──auto──> Expense (Salary)
Staff ────< Attendance
Everything ──> AuditLog (who/what/when, before/after)  → "Recent activity"
Scheduler ──> auto-complete finished events
```

> **Scope note:** the Notifications module (notification centre, preferences, scheduled reminders, SMS/WhatsApp
> channels) is **deferred** at the owner's request. Low stock, overdue balances and upcoming events are still surfaced
> directly from live data on the dashboard, inventory and reports screens. Password-reset email (part of
> authentication) uses a small provider-agnostic mailer.

---

## 2. System architecture

```
┌────────────────────────── Browser ──────────────────────────┐
│ React 19 SPA (Vite)                                         │
│  features/*  → pages + feature components                   │
│  api/*       → typed fetch client (cookie auth, auto-refresh)│
│  React Query → server-state cache                           │
│  shared/     → booking finance + enums (same file as API)   │
└───────────────▲─────────────────────────────────────────────┘
                │ /api (JSON, httpOnly cookies)
┌───────────────┴──────────── Express 5 API ──────────────────┐
│ helmet · cors allow-list · rate limits · json size limit    │
│ authenticate (JWT) → authorize(permission) → validate(zod)  │
│ routes → controllers (HTTP only) → services (business logic)│
│ services → models (Mongoose, tenant-scoped)                 │
│ mailer (console / Resend) → password reset email            │
│ scheduler (node-cron) → auto-complete finished events       │
└───────────────▲─────────────────────────────────────────────┘
                │
        ┌───────┴────────┐
        │   MongoDB      │  every business document carries organizationId
        └────────────────┘
```

**Layering rules**

* **Controllers** read the validated request, call one service function, shape the response. No business rules.
* **Services** own business rules (double booking, overpayment, stock guards, numbering). Services receive a
  `ctx = { organizationId, userId, permissions }` so every query is tenant-scoped and audited.
* **Models** own persistence rules (types, enums, indexes, immutability guards).
* **shared/** holds the pure booking-finance calculation and all enums, imported by both backend (`require`) and
  frontend (`import`). The live total on the booking form and the stored total on the server come from the same
  function, so they cannot disagree.

**No transactions required.** Consistency is kept without multi-document transactions, so the app works on a
standalone local `mongod` as well as a replica set / Atlas:

* **Per-booking lock** (`modules/bookings/bookingLock.js`): payments, refunds, voids, booking edits and status
  changes take a short-lived lock on the booking, then read the payment ledger, validate (e.g. amount ≤ balance),
  write, and recompute the booking totals from the ledger. Concurrent requests on the same booking are serialised;
  a lock abandoned by a crashed request expires after 15 s. Verified by tests firing 8 simultaneous payments.
* **Double booking**: availability is checked before the write and re-checked after it; if a concurrent request
  confirmed an overlapping event, the later write is reverted. A double booking is never left behind.
* **Stock-out guard**: conditional `$inc` with `currentQuantity ≥ qty`.
* **Document numbers**: per-org, per-year counter document incremented atomically; unique index as last line of defence.

---

## 3. Multi-tenancy (SaaS-ready)

* `Organization` is the tenant. Every business collection has `organizationId` (required, indexed, first key of
  every compound index).
* The JWT carries `org`; `authenticate` loads the user and pins `req.ctx.organizationId`. Services never accept an
  organization id from the request body.
* A `tenant` Mongoose plugin adds the field and index to each schema; unique constraints are per tenant
  (e.g. `{ organizationId, invoiceNumber }`).
* Uploaded files are stored under `uploads/<organizationId>/…` and served only to users of that organization.

---

## 4. Database schema (MongoDB)

Conventions

* All models: `organizationId`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt` (via `tenant` + `audit` plugins).
* **Business dates** (event date, payment date, expense date, attendance date) are stored as UTC-midnight `Date`s
  that represent a calendar day. **Instants** (`startAt`, `endAt`, `createdAt`) are real timestamps computed in the
  organization's timezone (default `Asia/Karachi`).
* Money is stored in major units (rupees) rounded to 2 decimals by a single `roundMoney` helper.
* Financial documents are never hard-deleted. They are **voided** (with reason, who, when) and excluded from totals.
* Snapshots are deliberate: a booking stores the package name and price *at the time of booking*, an invoice stores
  the business/customer/charges *at the time of issue*. Prices change later; history must not.

### Identity & access

| Collection | Key fields | Indexes |
|---|---|---|
| **Organization** | name, slug, isActive | slug unique |
| **User** | organizationId, name, email, phone, passwordHash (`select:false`), role→Role, isActive, lastLoginAt, passwordChangedAt, resetTokenHash, resetTokenExpiresAt | email unique |
| **Role** | organizationId, key, name, description, permissions[string], isSystem | {org, key} unique |
| **Permission** | Code-level catalog (`config/permissions.js`) — `resource.action` strings grouped by module. Kept in code (not a collection) so permission checks never depend on DB state; roles store the granted keys. |
| **Session** | userId, organizationId, refreshTokenHash, userAgent, ip, expiresAt (TTL), revokedAt, lastUsedAt | refreshTokenHash unique; TTL on expiresAt |

### Settings

| Collection | Key fields |
|---|---|
| **BusinessSetting** (1 per org) | name, logo{key,url}, address, city, phone, email, website, tax{ntn, strn, defaultRate, label}, currency{code:'PKR', symbol:'Rs.', locale:'en-PK', decimals:0}, invoice{prefix:'INV', receiptPrefix:'RCP', startingNumber, footer, terms, dueDays} |
| **SystemSetting** (1 per org) | timezone, dateFormat, booking{bufferMinutes, defaultStartTime, defaultEndTime, autoCompleteEvents}, payments{allowOverpayment} |
| **Counter** | organizationId, key (`invoice:2026`), seq — atomic numbering |

### Customers & halls

| Collection | Key fields | Indexes |
|---|---|---|
| **Customer** | fullName, phone, phoneDigits, alternatePhone, email, cnic, address, city, notes | {org, phoneDigits} unique · {org, fullName} · text(fullName, phone) |
| **Hall** | name, description, capacity, basePrice, hourlyPrice, facilities[enum], images[{key,url}], status(active/maintenance/inactive), color | {org, name} unique |

### Bookings (core)

**Booking**

```
bookingNumber      BK-2026-00001 (unique per org)
customer → Customer, hall → Hall
eventType          wedding|mehndi|baraat|walima|engagement|birthday|corporate|other
eventDate          calendar day
startTime, endTime "HH:mm" (end < start ⇒ ends next day)
startAt, endAt     instants used for overlap checks
guestCount
menu (BookingMenu, embedded)
  mode             package|custom|none
  package          → MenuPackage (BookingPackage snapshot: name, pricingType, rate)
  items[]          { menuItem→MenuItem, name, category, source: package|extra|custom,
                     quantity, unit, unitPrice, total }
services[] (BookingService, embedded) { name, quantity, unitPrice, total }
charges            { hall, decoration, other, discount, taxRate }        ← user input
totals             { menu, services, subtotal, discount, taxable, tax,   ← computed (shared/bookingFinance.js)
                     grandTotal, paid, refunded, netPaid, balance }
paymentStatus      unpaid|partial|paid|overpaid                          ← computed
status             inquiry|tentative|confirmed|completed|cancelled
statusHistory[]    { from, to, at, by, note }
cancellation       { reason, at, by }
notes
```

Indexes: `{org, bookingNumber}` unique · `{org, hall, startAt, endAt}` (overlap) · `{org, eventDate}` ·
`{org, customer}` · `{org, status, eventDate}` · `{org, paymentStatus}`.

`BookingService`, `BookingMenu` and `BookingPackage` are **embedded sub-schemas** (separate schema files). They are
owned by exactly one booking and always read with it — embedding avoids joins and keeps the booking atomic.

### Menu

| Collection | Key fields |
|---|---|
| **MenuCategory** | name, description, sortOrder, isActive |
| **MenuItem** | name, category→MenuCategory, description, image, price, unit(per_person/per_plate/per_kg/per_piece/per_dish/per_litre), isAvailable, ingredients[], notes |
| **MenuPackage** | name, description, pricingType(per_person/fixed), price, minGuests, items[{ menuItem→MenuItem, isOptional, extraPrice }], isActive |

### Money

| Collection | Key fields | Indexes |
|---|---|---|
| **Payment** | receiptNumber, booking, customer, type(advance/installment/final/refund), amount(>0), method(cash/bank_transfer/jazzcash/easypaisa/card/other), paidOn, reference, notes, receivedBy→User, void{at,by,reason} | {org, receiptNumber} unique · {org, booking} · {org, paidOn} · {org, customer} |
| **Invoice** | invoiceNumber, booking, customer, issueDate, dueDate, snapshot{business, customer, event, menu, services, charges, totals}, status(issued/void), voidReason, supersededBy | {org, invoiceNumber} unique · {org, booking} |
| **ExpenseCategory** | name, key, isSystem, isActive | {org, key} unique |
| **Expense** | expenseNumber, category, amount, date, description, vendor, supplier, paymentMethod, receipt{key,url,name,mime}, booking(optional), staff(optional), source(manual/inventory_purchase/salary), sourceRef, void{at,by,reason} | {org, date} · {org, category} · {org, booking} |

Payments are immutable: the model rejects updates to any field except the one-time `void` stamp. Refunds are their
own negative-direction records.

### Inventory

| Collection | Key fields |
|---|---|
| **Supplier** | name, contactPerson, phone, email, address, notes, isActive |
| **InventoryItem** | name, kind(food/equipment), category, sku (unique per org), unit, currentQuantity (cache), minimumQuantity, costPerUnit, supplier, location, isActive |
| **InventoryTransaction** | item, type(stock_in/stock_out/adjustment/damaged/purchase), quantityChange(signed), balanceAfter, unitCost, totalCost, supplier, booking, expense, date, reference, notes |

`currentQuantity` is a cache of Σ `quantityChange`; it is updated atomically with each transaction and can be
re-verified from the ledger (`POST /api/inventory/:id/reconcile`).

### Staff

| Collection | Key fields | Indexes |
|---|---|---|
| **Staff** | employeeCode, name, phone, cnic, position, salary, joiningDate, status(active/on_leave/terminated), address, notes, user(optional) | {org, employeeCode} unique |
| **Attendance** | staff, date, status(present/absent/half_day/leave/late), checkIn, checkOut, notes | {org, staff, date} unique |
| **SalaryPayment** | staff, period(YYYY-MM), grossAmount, bonus, deductions, netAmount, paidOn, method, reference, notes, expense→Expense, void{…} | {org, staff, period} |

### Audit

| Collection | Key fields |
|---|---|
| **AuditLog** | actor, action (`booking.created`, `payment.voided` …), entity{kind,id,label}, summary, changes{before,after}, ip — powers both the audit trail and the dashboard's Recent Activity |

---

## 5. Business rules (enforced server-side)

1. **Booking finance** (`shared/bookingFinance.js`)
   `subtotal = hall + menu + decoration + services + other`
   `taxable = subtotal − discount` (discount ≤ subtotal)
   `tax = taxable × taxRate%`, `grandTotal = taxable + tax`
   `netPaid = Σ payments − Σ refunds` (voided excluded), `balance = grandTotal − netPaid`.
   Menu: package per-person → `rate × guests`; fixed → `rate`; plus extras; custom → Σ lines. Totals are
   **never accepted from the client** — the server always recomputes.
2. **Double booking**: a hall cannot hold two `confirmed`/`completed` bookings whose `[startAt − buffer, endAt + buffer)`
   overlap. Overlaps with inquiry/tentative holds are returned as warnings. Checked on create, update and on
   status → confirmed, and re-verified after write to close race windows.
3. **Payments**: amount > 0; non-refund amount ≤ balance (unless `allowOverpayment`); refund ≤ net paid; no new
   payments on cancelled bookings except refunds. Payments are immutable; mistakes are voided with a reason.
4. **Booking edits** cannot push `grandTotal` below the amount already collected.
5. **Cancellation** keeps the booking and its payments (reporting/history). Cancelled bookings drop out of outstanding
   balances; any refund is recorded explicitly.
6. **Invoices**: unique number `INV-YYYY-NNNNN` per org from an atomic counter (respecting the configured starting
   number); regenerating voids the previous invoice and links it (`supersededBy`).
7. **Expenses**: every create/update/void writes an `AuditLog` with before/after. Auto-generated expenses (salary,
   inventory purchase) can only be changed through their source.
8. **Inventory**: stock-out/damaged cannot exceed stock; purchase optionally posts an Expense; low/out-of-stock
   status is derived from `currentQuantity` vs `minimumQuantity`.
9. **Profit**: business profit = revenue − expenses; event profit = event revenue (grand total) − event-linked expenses.
10. **Auditability**: `createdBy/updatedBy/createdAt/updatedAt` on every document; financial changes are logged.

---

## 6. API structure

Base `/api`. JSON envelope: success `{ data, meta? }`, error `{ error: { code, message, details? } }`.
Lists accept `page, limit, sort (field or -field), q` plus module filters and return
`meta: { page, limit, total, totalPages }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/logout` · `POST /auth/refresh` · `GET /auth/me` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `POST /auth/change-password` · `GET /auth/sessions` · `DELETE /auth/sessions/:id` |
| Dashboard | `GET /dashboard?range=` |
| Customers | `GET/POST /customers` · `GET/PATCH/DELETE /customers/:id` · `GET /customers/:id/summary` |
| Halls | `GET/POST /halls` · `GET/PATCH/DELETE /halls/:id` · `GET /halls/availability?date&startTime&endTime` |
| Bookings | `GET/POST /bookings` · `GET/PATCH /bookings/:id` · `POST /bookings/quote` · `POST /bookings/check-availability` · `POST /bookings/:id/status` · `GET /bookings/calendar?from&to&hall` · `GET /bookings/:id/profitability` |
| Events | `GET /events` — alias of bookings scoped to upcoming/today |
| Payments | `GET/POST /payments` · `GET /payments/:id` · `POST /payments/:id/void` · `GET /payments/:id/receipt.pdf` |
| Invoices | `GET/POST /invoices` · `GET /invoices/:id` · `POST /invoices/:id/void` · `GET /invoices/:id/pdf` |
| Menu | `GET/POST /menu/categories` · `PATCH/DELETE /menu/categories/:id` · `GET/POST /menu/items` · `GET/PATCH/DELETE /menu/items/:id` · `GET/POST /menu/packages` · `GET/PATCH/DELETE /menu/packages/:id` · `GET /menu/usage` |
| Inventory | `GET/POST /inventory/items` · `GET/PATCH/DELETE /inventory/items/:id` · `GET/POST /inventory/transactions` · `POST /inventory/items/:id/reconcile` · `GET/POST /inventory/suppliers` · `PATCH/DELETE /inventory/suppliers/:id` |
| Expenses | `GET/POST /expenses` · `GET/PATCH /expenses/:id` · `POST /expenses/:id/void` · `GET/POST /expenses/categories` · `PATCH /expenses/categories/:id` |
| Staff | `GET/POST /staff` · `GET/PATCH/DELETE /staff/:id` · `GET/PUT /staff/attendance?date` · `GET /staff/:id/attendance` · `GET/POST /staff/salaries` · `GET /staff/salaries/summary?period` · `POST /staff/salaries/:id/void` |
| Reports | `GET /reports/financial` · `/reports/bookings` · `/reports/customers` · `/reports/events` · `/reports/inventory` · `/reports/outstanding` — each accepts `format=csv|pdf` |
| Settings | `GET/PUT /settings/business` · `POST /settings/business/logo` · `GET/PUT /settings/system` · `GET/POST /users` · `PATCH /users/:id` · `POST /users/:id/reset-password` · `GET/POST /roles` · `PATCH/DELETE /roles/:id` · `GET /roles/permissions` |
| Files | `GET /files/:orgId/:file` (authenticated, tenant-checked) |
| Audit | `GET /audit` |

Middleware chain per route: `authenticate → authorize('bookings.create') → validate({ body, query, params }) → controller`.

---

## 7. Security

* bcrypt (cost 12) password hashing; passwords never returned (`select:false`).
* Access token: JWT (15 min) in an `httpOnly`, `SameSite=Lax` cookie; refresh token: random 256-bit value, stored
  **hashed** in `Session`, rotated on every refresh, 7-day expiry, revocable (logout, "sign out other sessions",
  password change revokes all).
* Password reset: single-use random token, stored hashed, 30-minute expiry, generic response (no account enumeration).
* `helmet`, strict CORS allow-list from env, `express-rate-limit` (global + strict on login/forgot-password), 1 MB JSON
  limit, rejection of `$`-prefixed keys, Zod validation on every body/query/param, `strictQuery`.
* Uploads: type allow-list (png/jpg/webp/pdf), 5 MB limit, random file names, tenant-scoped authenticated serving.
* All secrets from environment variables (validated at boot; the server refuses to start with missing/weak secrets
  in production).

---

## 8. Folder structure

```
shadi-hall/
├── ARCHITECTURE.md
├── README.md
├── shared/                       # ESM, imported by backend and frontend
│   ├── package.json              # { "type": "module" }
│   ├── constants.js              # enums + labels (event types, statuses, methods…)
│   └── bookingFinance.js         # the one finance calculation
├── backend/
│   ├── server.js                 # boot: env → db → http → scheduler
│   ├── .env.example
│   ├── scripts/
│   │   ├── dev-db.js             # local persistent mongod without Docker
│   │   └── seed.js               # realistic demo data
│   ├── src/
│   │   ├── app.js
│   │   ├── config/               # env, db, permissions catalog, default roles
│   │   ├── middleware/           # auth, authorize, validate, errors, rate limits, upload
│   │   ├── models/               # Mongoose models (+ plugins/)
│   │   ├── modules/<module>/     # routes · controller · service · schemas
│   │   ├── services/             # numbering, audit, settings cache, storage, mailer, tokens
│   │   ├── jobs/                 # scheduler (auto-complete events)
│   │   ├── pdf/                  # invoice, receipt, report renderers
│   │   └── utils/                # ApiError, money, dates, list query, csv, numbering, audit
│   └── tests/                    # node:test + supertest + in-memory MongoDB
└── frontend/shadi-hall/
    ├── vite.config.js            # /api proxy, @shared alias
    └── src/
        ├── main.jsx
        ├── app/                  # router, providers, route guards
        ├── api/                  # http client + one module per resource
        ├── components/
        │   ├── layout/           # AppShell, Sidebar, Topbar
        │   ├── ui/               # Button, Dialog, DataTable, Badge, Tabs, …
        │   └── form/             # RHF-bound fields: Money, Date, Time, Select, Combobox
        ├── features/<module>/    # pages + feature components + hooks
        ├── lib/                  # formatting, dates, permissions, query keys
        └── styles/               # design tokens + component styles
```

---

## 9. Frontend page map

| Route | Page | Permission |
|---|---|---|
| `/login`, `/forgot-password`, `/reset-password` | Auth | public |
| `/` | Dashboard | dashboard.view (financial cards: dashboard.financials) |
| `/halls`, `/halls/:id` | Halls, hall detail + availability calendar | halls.view |
| `/bookings`, `/bookings/new`, `/bookings/:id`, `/bookings/:id/edit` | Bookings list, booking form, booking detail (overview · payments · expenses & profit · invoices · history) | bookings.* |
| `/calendar` | Month / week / day (day = hall columns) | bookings.view |
| `/customers`, `/customers/:id` | Customers, profile (history + financial summary) | customers.* |
| `/payments` | Payments ledger + "Collect payment" | payments.* |
| `/invoices`, `/invoices/:id` | Invoices, printable invoice | invoices.* |
| `/expenses` | Expenses + categories | expenses.* |
| `/reports` | Financial · Bookings · Customers · Events · Inventory · Outstanding | reports.view |
| `/menu`, `/menu/packages` | Menu items & categories, packages | menu.* |
| `/inventory`, `/inventory/:id`, `/inventory/suppliers` | Stock, item ledger, suppliers | inventory.* |
| `/staff`, `/staff/attendance`, `/staff/salaries` | Employees, daily attendance sheet, payroll by month | staff.* |
| `/settings/business`, `/settings/users`, `/settings/roles`, `/settings/system` | Settings | settings.* / users.manage / roles.manage |

Global: "New booking" and "Collect payment" actions in the top bar.

---

## 10. Dependencies

Backend (already installed): express 5, mongoose 9, zod 4, jsonwebtoken, bcryptjs, cookie-parser, cors, helmet,
express-rate-limit, morgan, multer, node-cron, pdfkit, resend, dotenv. Dev: nodemon, supertest,
**mongodb-memory-server** (added — local database without Docker and real-DB integration tests).

Frontend (already installed): react 19, react-router 8, @tanstack/react-query, react-hook-form + zod resolver,
recharts, date-fns, lucide-react, sonner, clsx. No UI kit — the component library is written in-house so the product
has its own look.

---

## 11. Roadmap

| Phase | Scope |
|---|---|
| 1 | Auth (login/refresh/logout/reset, sessions), users, roles & permissions, business & system settings |
| 2 | Halls, customers, bookings (finance, conflicts, status workflow), calendar |
| 3 | Payments (immutable ledger, void, refunds, receipts), invoices (numbering, snapshot, PDF, print) |
| 4 | Menu categories/items, packages, package & custom menus on bookings |
| 5 | Suppliers, inventory items, stock transactions, low-stock alerts |
| 6 | Expenses, categories, receipts, event profitability |
| 7 | Staff, attendance, salary payments (→ expenses) |
| 8 | Dashboard, reports, charts, CSV/PDF export |
| 9 | ~~Notifications, preferences, scheduled reminders, channel providers~~ — deferred |
| 10 | Hardening, tests, seed data, production build & deployment notes |
