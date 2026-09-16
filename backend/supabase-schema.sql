-- ============================================================================
-- ServeHome — complete database schema (idempotent)
--
-- Run in Supabase Dashboard → SQL Editor. Safe to run on a brand-new project
-- AND on a database that already ran migrations v2–v5: every statement is
-- "IF NOT EXISTS"/"ADD COLUMN IF NOT EXISTS", and nothing is dropped.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT UNIQUE NOT NULL,
  password           TEXT,
  name               TEXT NOT NULL,
  phone              TEXT,
  role               TEXT NOT NULL DEFAULT 'customer',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS iqama_number       TEXT,
  ADD COLUMN IF NOT EXISTS profile_picture    TEXT,
  ADD COLUMN IF NOT EXISTS google_id          TEXT,
  ADD COLUMN IF NOT EXISTS status             TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS rating             NUMERIC(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bio                TEXT,
  ADD COLUMN IF NOT EXISTS city               TEXT,
  ADD COLUMN IF NOT EXISTS service_categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_prices     JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS experience_years   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nationality        TEXT,
  ADD COLUMN IF NOT EXISTS languages          TEXT[] DEFAULT '{"Arabic","English"}';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer', 'provider', 'admin'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IS NULL OR status IN ('active', 'suspended'));

-- ─── BOOKINGS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'pending',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_name         TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone        TEXT,
  ADD COLUMN IF NOT EXISTS provider_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_name         TEXT,
  ADD COLUMN IF NOT EXISTS category              TEXT,
  ADD COLUMN IF NOT EXISTS category_name         TEXT,
  ADD COLUMN IF NOT EXISTS service_option        TEXT,
  ADD COLUMN IF NOT EXISTS price                 NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget                NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission            NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_earnings     NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_date        TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_time        TEXT,
  ADD COLUMN IF NOT EXISTS address               TEXT,
  ADD COLUMN IF NOT EXISTS notes                 TEXT,
  ADD COLUMN IF NOT EXISTS payment_status        TEXT DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS payment_slip          TEXT,
  ADD COLUMN IF NOT EXISTS earnings_released     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escrow_amount         NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS released_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_by           UUID,
  ADD COLUMN IF NOT EXISTS transaction_id        TEXT,
  ADD COLUMN IF NOT EXISTS completed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timeout_notified_24h  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS timeout_notified_48h  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS selected_offer_id     UUID,
  ADD COLUMN IF NOT EXISTS selected_provider_id  UUID,
  ADD COLUMN IF NOT EXISTS duration_hours        NUMERIC(4,1) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS revision_notes        TEXT;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check1;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check2;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN (
  'pending', 'OPEN', 'BIDDING', 'accepted', 'OFFER_ACCEPTED', 'PAYMENT_PENDING', 'VERIFIED',
  'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'in-progress', 'WAITING_CUSTOMER_CONFIRMATION',
  'completed_by_provider', 'REVISION_REQUESTED', 'CUSTOMER_CONFIRMED', 'customer_confirmed',
  'completed', 'disputed', 'cancelled'
));

-- ─── MESSAGES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_name  TEXT,
  sender_role  TEXT,
  text         TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS image          TEXT,
  ADD COLUMN IF NOT EXISTS location       JSONB,
  ADD COLUMN IF NOT EXISTS voice_url      TEXT,
  ADD COLUMN IF NOT EXISTS voice_duration INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS document_url   TEXT,
  ADD COLUMN IF NOT EXISTS document_name  TEXT,
  ADD COLUMN IF NOT EXISTS reply_to       JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reactions      JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS seen           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS seen_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivered_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted        BOOLEAN DEFAULT FALSE;

-- ─── OFFERS (bidding) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_offers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name    VARCHAR(255) NOT NULL,
  provider_avatar  TEXT,
  price            NUMERIC(10,2) NOT NULL,
  eta_minutes      INT NOT NULL DEFAULT 15,
  completion_hours NUMERIC(4,1) DEFAULT 1.0,
  message          TEXT,
  rating           NUMERIC(3,2) DEFAULT 0,
  completed_jobs   INT DEFAULT 0,
  distance_km      NUMERIC(4,1),
  verified_badge   BOOLEAN DEFAULT FALSE,
  status           VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_provider_offer_per_booking UNIQUE (booking_id, provider_id)
);

-- ─── REVIEWS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS comment     TEXT,
  ADD COLUMN IF NOT EXISTS review_text TEXT,
  ADD COLUMN IF NOT EXISTS hire_again  BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS recommend   BOOLEAN DEFAULT TRUE;

-- ─── NOTIFICATIONS / FAVORITES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  type        TEXT,
  read        BOOLEAN DEFAULT FALSE,
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (customer_id, provider_id)
);

-- ─── PAYMENTS, WALLETS, WITHDRAWALS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  amount            NUMERIC(10,2) NOT NULL,
  platform_fee      NUMERIC(10,2) DEFAULT 0,
  provider_earnings NUMERIC(10,2) DEFAULT 0,
  escrow_amount     NUMERIC(10,2) NOT NULL,
  payment_status    TEXT NOT NULL DEFAULT 'escrow_held',
  transaction_id    TEXT UNIQUE NOT NULL,
  released_at       TIMESTAMPTZ,
  released_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  available_balance NUMERIC(10,2) DEFAULT 0.00,
  pending_balance   NUMERIC(10,2) DEFAULT 0.00,
  released_balance  NUMERIC(10,2) DEFAULT 0.00,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
-- Databases that only ran migration v3 have the old wallet column names.
ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS available_balance NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS pending_balance   NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS released_balance  NUMERIC(10,2) DEFAULT 0.00;
UPDATE wallets SET available_balance = 0 WHERE available_balance IS NULL;
UPDATE wallets SET pending_balance = 0 WHERE pending_balance IS NULL;
UPDATE wallets SET released_balance = 0 WHERE released_balance IS NULL;
ALTER TABLE wallets ALTER COLUMN available_balance SET NOT NULL;
ALTER TABLE wallets ALTER COLUMN pending_balance SET NOT NULL;
ALTER TABLE wallets ALTER COLUMN released_balance SET NOT NULL;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id    UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS reference_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS note         TEXT,
  ADD COLUMN IF NOT EXISTS status       VARCHAR(50) DEFAULT 'completed';

CREATE TABLE IF NOT EXISTS withdrawals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  bank_name    TEXT NOT NULL,
  status       TEXT DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS provider_name  TEXT,
  ADD COLUMN IF NOT EXISTS account_name   TEXT,
  ADD COLUMN IF NOT EXISTS account_holder TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS iban           TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes    TEXT,
  ADD COLUMN IF NOT EXISTS note           TEXT,
  ADD COLUMN IF NOT EXISTS processed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

-- ─── CALLS, LOGS, REPORTS, CHAT EXTRAS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID REFERENCES bookings(id) ON DELETE SET NULL,
  caller_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_seconds INTEGER DEFAULT 0,
  status           TEXT NOT NULL,
  quality          TEXT DEFAULT 'good',
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID REFERENCES bookings(id) ON DELETE CASCADE,
  admin_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_name  TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID REFERENCES bookings(id) ON DELETE CASCADE,
  reporter_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason           TEXT NOT NULL,
  description      TEXT,
  status           TEXT DEFAULT 'open',
  resolved_at      TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status      VARCHAR(100) NOT NULL,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_pinned (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  booking_id  UUID REFERENCES bookings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, booking_id)
);

CREATE TABLE IF NOT EXISTS user_push_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL UNIQUE,
  expo_push_token TEXT NOT NULL,
  platform        TEXT DEFAULT 'expo',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_role_city            ON users(role, city);
CREATE INDEX IF NOT EXISTS idx_users_rating               ON users(rating DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_customer          ON bookings(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_provider          ON bookings(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status            ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_messages_booking_created   ON messages(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread            ON messages(booking_id, seen, sender_id);
CREATE INDEX IF NOT EXISTS idx_booking_offers_booking     ON booking_offers(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_offers_provider    ON booking_offers(provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_provider           ON reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read    ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_type         ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_favorites_customer         ON favorites(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet           ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_reference        ON wallet_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_provider       ON withdrawals(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status         ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_call_history_caller        ON call_history(caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_receiver      ON call_history(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created     ON admin_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_pinned_user           ON chat_pinned(user_id);

-- ============================================================================
-- MARKETPLACE WORKFLOW (payment verification → communication unlock → payout)
-- ============================================================================

-- ─── Order numbers, payment/communication/payout state ─────────────────────
CREATE SEQUENCE IF NOT EXISTS booking_order_seq START 10001;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS order_number               TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference          TEXT,
  ADD COLUMN IF NOT EXISTS payment_transaction_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_rejection_reason   TEXT,
  ADD COLUMN IF NOT EXISTS communication_status       TEXT,
  ADD COLUMN IF NOT EXISTS payout_status              TEXT,
  ADD COLUMN IF NOT EXISTS commission_rate            NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS description                TEXT,
  ADD COLUMN IF NOT EXISTS city                       TEXT,
  ADD COLUMN IF NOT EXISTS area                       TEXT,
  ADD COLUMN IF NOT EXISTS latitude                   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude                  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS paid_at                    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trip_started_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS service_started_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_at                TIMESTAMPTZ;

ALTER TABLE bookings ALTER COLUMN order_number SET DEFAULT ('BP-' || nextval('booking_order_seq'));
UPDATE bookings SET order_number = 'BP-' || nextval('booking_order_seq') WHERE order_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_order_number ON bookings(order_number);

-- Normalise legacy payment statuses into the new state machine.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_unlock_requires_payment;
UPDATE bookings SET payment_status = CASE
  WHEN payment_status IN ('paid', 'escrow_held', 'payment_released', 'released') THEN 'PAID'
  WHEN payment_status = 'pending-verification' THEN 'PENDING_VERIFICATION'
  WHEN payment_status = 'refunded' THEN 'REFUNDED'
  WHEN payment_status = 'disputed' THEN CASE WHEN transaction_id IS NOT NULL THEN 'PAID' ELSE 'UNPAID' END
  WHEN payment_status IN ('PAID', 'PENDING_VERIFICATION', 'PAYMENT_SUBMITTED', 'REJECTED', 'REFUNDED', 'UNPAID') THEN payment_status
  ELSE 'UNPAID'
END;
UPDATE bookings SET payout_status = CASE
  WHEN earnings_released IS TRUE THEN 'PAID'
  WHEN status IN ('CUSTOMER_CONFIRMED', 'customer_confirmed') AND payment_status = 'PAID' THEN 'PENDING'
  ELSE 'NONE'
END WHERE payout_status IS NULL;
UPDATE bookings SET communication_status = CASE WHEN payment_status = 'PAID' AND status <> 'cancelled' THEN 'UNLOCKED' ELSE 'LOCKED' END
WHERE communication_status IS NULL;
UPDATE bookings SET payment_reference = order_number WHERE payment_reference IS NULL AND provider_id IS NOT NULL;

ALTER TABLE bookings ALTER COLUMN payment_status SET DEFAULT 'UNPAID';
ALTER TABLE bookings ALTER COLUMN payment_status SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN communication_status SET DEFAULT 'LOCKED';
ALTER TABLE bookings ALTER COLUMN communication_status SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN payout_status SET DEFAULT 'NONE';
ALTER TABLE bookings ALTER COLUMN payout_status SET NOT NULL;

ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('UNPAID', 'PAYMENT_SUBMITTED', 'PENDING_VERIFICATION', 'PAID', 'REJECTED', 'REFUNDED'));
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_communication_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_communication_status_check CHECK (communication_status IN ('LOCKED', 'UNLOCKED'));
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payout_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payout_status_check CHECK (payout_status IN ('NONE', 'PENDING', 'PAID', 'CANCELLED'));
-- Defence in depth: communication can only ever be unlocked on a paid order.
ALTER TABLE bookings ADD CONSTRAINT bookings_unlock_requires_payment CHECK (communication_status = 'LOCKED' OR payment_status = 'PAID');

-- ─── Providers: approval + completed jobs ───────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS completed_jobs  INTEGER DEFAULT 0;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_approval_status_check;
ALTER TABLE users ADD CONSTRAINT users_approval_status_check CHECK (approval_status IS NULL OR approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));

-- ─── Proposals: extra notes ─────────────────────────────────────────────────
ALTER TABLE booking_offers ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── Reviews: category ratings ──────────────────────────────────────────────
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS quality         INTEGER CHECK (quality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS professionalism INTEGER CHECK (professionalism BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS punctuality     INTEGER CHECK (punctuality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS value_rating    INTEGER CHECK (value_rating BETWEEN 1 AND 5);

-- ─── Platform settings (bank details, default commission) ───────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT UNIQUE NOT NULL,
  percent     NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 50),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Payment proofs (bank transfer receipts) ────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_proofs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path          TEXT NOT NULL,
  transaction_number TEXT NOT NULL,
  amount             NUMERIC(10,2) NOT NULL,
  status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  rejection_reason   TEXT,
  reviewed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
-- At most one receipt awaiting verification per order (prevents duplicate submissions).
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_proofs_one_pending ON payment_proofs(booking_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON payment_proofs(status, created_at DESC);

-- ─── Financial ledger ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id     TEXT UNIQUE NOT NULL,
  booking_id         UUID REFERENCES bookings(id) ON DELETE SET NULL,
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  amount             NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency           TEXT NOT NULL DEFAULT 'SAR',
  type               TEXT NOT NULL CHECK (type IN ('CUSTOMER_PAYMENT', 'PLATFORM_COMMISSION', 'PROVIDER_EARNING', 'PAYOUT', 'REFUND', 'ADJUSTMENT')),
  status             TEXT NOT NULL DEFAULT 'COMPLETED',
  note               TEXT,
  external_reference TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
-- One payment / commission / earning / payout / refund entry per order: duplicates are impossible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_once_per_order ON ledger_entries(booking_id, type) WHERE type <> 'ADJUSTMENT';
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger_entries(user_id, created_at DESC);

-- ─── Provider payouts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_payment   NUMERIC(10,2) NOT NULL,
  commission         NUMERIC(10,2) NOT NULL,
  commission_rate    NUMERIC(5,2),
  amount             NUMERIC(10,2) NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'SAR',
  status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'CANCELLED')),
  external_reference TEXT,
  paid_at            TIMESTAMPTZ,
  paid_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_provider ON payouts(provider_id, created_at DESC);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
-- The API server uses the service-role key, which bypasses RLS. Enabling RLS with
-- no policies ensures the public "anon" key can never read tables directly
-- (earlier migrations disabled RLS, which exposed password hashes via the REST API).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'bookings', 'messages', 'booking_offers', 'reviews', 'notifications', 'favorites',
    'payments', 'wallets', 'wallet_transactions', 'withdrawals', 'call_history', 'payment_logs',
    'admin_activity_logs', 'reports', 'booking_status_history', 'chat_pinned', 'user_push_tokens',
    'platform_settings', 'commission_rules', 'payment_proofs', 'ledger_entries', 'payouts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Done ✅
