-- ============================================================================
-- SUPABASE POSTGRESQL MIGRATION V5: REAL-TIME MARKETPLACE BIDDING, REVIEWS & WALLETS
-- ============================================================================

-- 1. ADD MARKETPLACE COLUMNS TO BOOKINGS TABLE
ALTER TABLE IF EXISTS bookings
  ADD COLUMN IF NOT EXISTS budget NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS selected_offer_id UUID,
  ADD COLUMN IF NOT EXISTS selected_provider_id UUID,
  ADD COLUMN IF NOT EXISTS duration_hours NUMERIC(4,1) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS revision_notes TEXT;

-- Drop existing status check constraints if they exist
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check1;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check2;

-- Re-create constraint to support new real-time order lifecycle statuses
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN (
  'OPEN',
  'BIDDING',
  'OFFER_ACCEPTED',
  'PAYMENT_PENDING',
  'VERIFIED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'WAITING_CUSTOMER_CONFIRMATION',
  'CUSTOMER_CONFIRMED',
  'REVISION_REQUESTED',
  'completed',
  'completed_by_provider',
  'accepted',
  'pending',
  'disputed',
  'cancelled'
));

-- 2. CREATE BOOKING OFFERS (BIDDING) TABLE
CREATE TABLE IF NOT EXISTS booking_offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_name VARCHAR(255) NOT NULL,
  provider_avatar TEXT,
  price NUMERIC(10,2) NOT NULL,
  eta_minutes INT NOT NULL DEFAULT 15,
  completion_hours NUMERIC(4,1) DEFAULT 1.0,
  message TEXT,
  rating NUMERIC(3,2) DEFAULT 4.90,
  completed_jobs INT DEFAULT 0,
  distance_km NUMERIC(4,1) DEFAULT 2.5,
  verified_badge BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'updated'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_provider_offer_per_booking UNIQUE(booking_id, provider_id)
);

-- 3. CREATE REVIEWS & RATINGS TABLE
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  recommend BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_review_per_booking UNIQUE(booking_id)
);

-- 4. CREATE WALLETS & TRANSACTIONS TABLE
DROP TABLE IF EXISTS wallet_transactions CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;

CREATE TABLE wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  available_balance NUMERIC(10,2) DEFAULT 0.00,
  pending_balance NUMERIC(10,2) DEFAULT 0.00,
  released_balance NUMERIC(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE wallet_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'escrow_credit', 'payout_release', 'withdrawal', 'refund'
  amount NUMERIC(10,2) NOT NULL,
  reference_id VARCHAR(255),
  note TEXT,
  status VARCHAR(50) DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CREATE BOOKING STATUS HISTORY AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS booking_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status VARCHAR(100) NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES FOR FAST REAL-TIME LOOKUPS
CREATE INDEX IF NOT EXISTS idx_booking_offers_booking ON booking_offers(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_offers_provider ON booking_offers(provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_provider ON reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id);
