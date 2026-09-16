-- ============================================================
-- ServeHome Premium — Database Migration v3
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. BOOKINGS TABLE ENHANCEMENTS ─────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS escrow_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_by UUID,
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timeout_notified_24h BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS timeout_notified_48h BOOLEAN DEFAULT FALSE;

-- ─── 2. PAYMENTS TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id          UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  amount              NUMERIC(10,2) NOT NULL,
  platform_fee        NUMERIC(10,2) DEFAULT 0,
  provider_earnings   NUMERIC(10,2) DEFAULT 0,
  escrow_amount       NUMERIC(10,2) NOT NULL,
  payment_status      TEXT NOT NULL DEFAULT 'escrow_held', -- escrow_held, released, refunded, disputed
  transaction_id      TEXT UNIQUE NOT NULL,
  released_at         TIMESTAMPTZ,
  released_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

-- ─── 3. WALLETS TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance             NUMERIC(10,2) DEFAULT 0.00,
  pending_earnings    NUMERIC(10,2) DEFAULT 0.00,
  released_earnings   NUMERIC(10,2) DEFAULT 0.00,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wallets DISABLE ROW LEVEL SECURITY;

-- ─── 4. WALLET TRANSACTIONS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id           UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id          UUID REFERENCES bookings(id) ON DELETE SET NULL,
  amount              NUMERIC(10,2) NOT NULL,
  type                TEXT NOT NULL, -- escrow_held, earnings_released, withdrawal, refund
  status              TEXT DEFAULT 'completed', -- pending, completed, failed, cancelled
  description         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wallet_transactions DISABLE ROW LEVEL SECURITY;

-- ─── 5. WITHDRAWALS TABLE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdrawals (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount              NUMERIC(10,2) NOT NULL,
  bank_name           TEXT NOT NULL,
  account_name        TEXT NOT NULL,
  iban                TEXT NOT NULL,
  status              TEXT DEFAULT 'pending', -- pending, approved, rejected
  processed_at        TIMESTAMPTZ,
  admin_notes         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE withdrawals DISABLE ROW LEVEL SECURITY;

-- ─── 6. CALL HISTORY & SESSIONS ────────────────────────────────
CREATE TABLE IF NOT EXISTS call_history (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id          UUID REFERENCES bookings(id) ON DELETE SET NULL,
  caller_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_seconds    INTEGER DEFAULT 0,
  status              TEXT NOT NULL, -- incoming, outgoing, missed, rejected, completed
  quality             TEXT DEFAULT 'good', -- good, fair, poor
  started_at          TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE call_history DISABLE ROW LEVEL SECURITY;

-- ─── 7. PAYMENT & ADMIN LOGS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id          UUID REFERENCES bookings(id) ON DELETE CASCADE,
  admin_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  action              TEXT NOT NULL, -- escrow_locked, payment_released, payment_rejected, refund_issued
  amount              NUMERIC(10,2) NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE payment_logs DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id            UUID REFERENCES users(id) ON DELETE CASCADE,
  admin_name          TEXT,
  action              TEXT NOT NULL,
  target_type         TEXT,
  target_id           TEXT,
  details             TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE admin_activity_logs DISABLE ROW LEVEL SECURITY;

-- ─── 8. REPORTS TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id          UUID REFERENCES bookings(id) ON DELETE CASCADE,
  reporter_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  reason              TEXT NOT NULL,
  description         TEXT,
  status              TEXT DEFAULT 'open', -- open, under_review, resolved, dismissed
  resolved_at         TIMESTAMPTZ,
  resolution_notes    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reports DISABLE ROW LEVEL SECURITY;

-- ─── 9. INDEXES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_call_history_users ON call_history(caller_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
