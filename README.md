# 🏠 ServeHome — Home Services Marketplace (Saudi Arabia)

[![CI](https://github.com/akkhan312/Home-sevices-KSA/actions/workflows/ci.yml/badge.svg)](https://github.com/akkhan312/Home-sevices-KSA/actions/workflows/ci.yml)
[![CD](https://github.com/akkhan312/Home-sevices-KSA/actions/workflows/cd.yml/badge.svg)](https://github.com/akkhan312/Home-sevices-KSA/actions/workflows/cd.yml)

A bilingual (Arabic / English) marketplace that connects **customers** with **service providers** (AC repair, plumbing, cleaning, electrical …) and gives **admins** full control over payments, payouts and disputes.

Built with **React Native (Expo SDK 54)** for Android, iOS and web, and a **Node.js / Express 5 + Socket.IO** API backed by **Supabase (PostgreSQL)**.

---

## ✨ The core flow

```
Customer requests a service
      ↓
Matching providers receive it and send proposals (price · arrival · duration)
      ↓
Customer compares proposals and selects a provider
      ↓
Payment required → customer transfers to the platform bank account and uploads the receipt
      ↓
Admin verifies the payment  ──►  🔓 chat · call · exact location unlock
      ↓
Provider: Start trip (live location) → Arrived → Start service → Complete service
      ↓
Customer confirms (or reports a problem → dispute)
      ↓
Commission is recorded · provider payout becomes pending
      ↓
Admin pays the provider and marks the payout as paid
      ↓
Customer rates the provider (overall, quality, professionalism, punctuality, value)
```

### What makes it safe

| Guarantee | How it is enforced |
|---|---|
| No contact before payment | Chat, calls, live location, exact address and phone are locked **on the server** (REST and every Socket.IO event) until the order is `PAID` **and** `UNLOCKED`. The database itself rejects `UNLOCKED` on an unpaid order. |
| Receipts can't unlock anything | Uploading a receipt only sets `PENDING_VERIFICATION`. Only an admin approval (or a verified Stripe payment) sets `PAID`. |
| Price & commission can't be tampered with | Commission is calculated on the server in halalas (integer maths) from admin-configured rules and **frozen into the order** when the provider is selected. |
| No duplicate money movements | Unique indexes allow one pending receipt, one payout and one ledger entry of each type per order; state changes use conditional updates. |
| Private files stay private | Payment receipts and chat media are served only through short-lived signed URLs. |
| Users only see their own orders | Every order, proposal, chat and call event checks ownership and role. |

---

## 🧩 Features

**Customers** — service requests, live proposal comparison, provider profiles, bank-transfer payment with copy buttons and receipt upload, communication lock/unlock, chat (text, photos, voice, location), voice calls, live provider tracking, completion confirmation, problem reports, category ratings, wallet for refunds.

**Providers** — request feed filtered by their services and city, proposals, waiting-for-payment state, trip/arrival/service controls, live location sharing that stops automatically, earnings dashboard (pending, paid out, commission), admin approval before receiving work.

**Admins** — payment verification with receipt preview (approve / reject with reason), provider payouts (mark as paid with bank reference), bank details & commission settings (global and per category), provider approval, disputes (release or refund), refunds, users, analytics and an audit log.

---

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| Mobile & web app | React Native 0.81, Expo SDK 54, Expo Router, Zustand, i18next (Arabic RTL / English) |
| API | Node.js 22, Express 5, Socket.IO 4, Helmet, express-rate-limit, Multer |
| Database | Supabase PostgreSQL (row level security enabled, service-role access from the API) |
| Payments | Manual bank transfer with admin verification · optional Stripe PaymentSheet (server-verified + webhook) |
| CI/CD | GitHub Actions: tests, schema validation on PostgreSQL 16, app typecheck/doctor/web build, Docker image to GHCR, optional deploy hook and EAS builds |

---

## 📂 Project structure

```
Home Services/
├── .github/workflows/        CI (every PR/branch) and CD (main)
├── backend/
│   ├── app.js                Express app + Socket.IO (authorization for every event)
│   ├── server.js             Process entry point
│   ├── config.js             Validated environment configuration
│   ├── middleware/           Auth (JWT + live account status), uploads
│   ├── routes/               auth, bookings, chat, admin, reviews, wallets, …
│   ├── services/             access (lock policy), payment, payout, ledger, money, settings, files, …
│   ├── supabase-schema.sql   Complete, idempotent database schema + migration of old data
│   ├── test/                 Workflow & security tests, SQL constraint assertions
│   └── Dockerfile
└── home-services-app/
    ├── app/                  Screens: (auth) (customer) (provider) (admin)
    └── src/
        ├── components/order/ PaymentPanel, CommunicationBar, ActiveOrderCard
        ├── services/         API client, WebRTC calls
        └── i18n/             English & Arabic translations
```

---

## 🚀 Getting started

### 1. Database
1. Create a Supabase project.
2. Open **SQL Editor** and run [`backend/supabase-schema.sql`](backend/supabase-schema.sql). It is safe to run on a new project and on a database that already ran the older `supabase-migration-v*.sql` files.

### 2. Backend
```bash
cd backend
cp .env.example .env        # fill in Supabase URL/service key, JWT_SECRET, email, (optional) Stripe
npm install
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run seed   # create the admin account
npm run dev                 # http://localhost:5000
```
Then sign in as admin and open **Bank & Commission** to enter the platform bank details and commission rates. Customers cannot pay until bank details are configured.

### 3. App
```bash
cd home-services-app
cp .env.example .env        # EXPO_PUBLIC_API_URL=http://<your-computer-ip>:5000 for devices on your Wi-Fi
npm install
npx expo start              # press a (Android), i (iOS) or w (web)
```
Card payments, Google Sign-In and native calling need a development build (`eas build --profile development`); Expo Go and web fall back to bank transfer.

---

## 🔐 Environment variables

**Backend** ([`backend/.env.example`](backend/.env.example))

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Database access |
| `JWT_SECRET` | ✅ | Session signing (≥ 32 chars in production); also derives signed file URLs |
| `API_HOST` | ✅ prod | Public HTTPS URL of the API |
| `CORS_ORIGINS` | prod | Allowed browser origins for the web app |
| `SMTP_*` or `GMAIL_USER`/`GMAIL_PASS` | ✅ prod | Password reset codes |
| `DEFAULT_COMMISSION_PERCENT` | | Used until an admin saves commission settings (default 10) |
| `REQUIRE_PROVIDER_APPROVAL` | | `false` to auto-approve new providers |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` | | Optional card payments |
| `UPLOAD_DIR`, `TRUST_PROXY`, `PORT` | | Hosting details |

**App** ([`home-services-app/.env.example`](home-services-app/.env.example)): `EXPO_PUBLIC_API_URL` (required for builds), `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (optional).

---

## 🧪 Tests

```bash
cd backend && npm test
```

The suite boots the real API and Socket.IO server against an in-memory PostgREST-compatible database and walks the complete marketplace journey, including:

- chat, calls and live location are **locked for both sides** before payment (REST and sockets), and a receipt upload does not unlock them
- only admin approval unlocks; commission 10 % of SAR 500 → platform SAR 50, provider SAR 450
- payout can be marked paid exactly once; the provider's wallet shows +SAR 450
- users cannot read or change orders that are not theirs; providers cannot change prices or complete other providers' jobs
- reviews only after confirmation, once; category commission rules don't change historical orders
- payment rejection and resubmission, refunds relocking communication, disputes blocking payouts
- no admin self-signup, no password reset without a verified code, signed URLs for receipts

CI additionally applies `supabase-schema.sql` twice to PostgreSQL 16 and runs [`test/sql/constraints.sql`](backend/test/sql/constraints.sql).

---

## 🚢 Deployment (CI/CD)

| Workflow | Trigger | What it does |
|---|---|---|
| **CI** | pull requests, non-main branches | Backend syntax + tests + `npm audit`; schema validation on PostgreSQL; app `tsc`, `expo-doctor`, web export |
| **CD** | push to `main`, manual | Runs CI → builds and pushes `ghcr.io/<owner>/<repo>/backend` → calls `BACKEND_DEPLOY_HOOK_URL` (if set) → optionally starts EAS Android/iOS builds |

Repository settings to configure (environment **production**):
- Secret `BACKEND_DEPLOY_HOOK_URL` — deploy webhook of your host (Render, Railway, Coolify, …) that pulls the new image.
- Secret `EXPO_TOKEN` and variables `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` — for mobile builds (run `eas init` once locally to link the Expo project).

Run the backend container with the variables above and a persistent volume mounted at `/app/uploads`.

---

## 📌 Status & roadmap

Implemented and tested: the payment → verification → communication-unlock → service → confirmation → commission → payout → review workflow described above.

Planned next: step-by-step request wizard with photos and map pin, map-based live tracking screen, push notifications (Expo/FCM), provider availability & service areas, full RTL review of every legacy screen, object storage (S3/Supabase Storage) for uploads.
