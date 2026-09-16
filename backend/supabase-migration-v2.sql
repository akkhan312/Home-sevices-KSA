-- ============================================================
-- ServeHome Premium — Database Migration
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Add new columns to existing tables ─────────────────────

-- Add rating, review_count, bio, city, service_categories to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS service_categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_prices JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT '{"Arabic","English"}';

-- ─── Reviews table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  hire_again  BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reviews DISABLE ROW LEVEL SECURITY;

-- ─── Notifications table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  type        TEXT,
  read        BOOLEAN DEFAULT FALSE,
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- ─── Favorites table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favorites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, provider_id)
);
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;

-- ─── Indexes for performance ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reviews_provider_id ON reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_favorites_customer_id ON favorites(customer_id);
CREATE INDEX IF NOT EXISTS idx_users_role_city ON users(role, city);
CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);

-- ─── Verify migration ────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM reviews) AS reviews_count,
  (SELECT COUNT(*) FROM notifications) AS notifications_count,
  (SELECT COUNT(*) FROM favorites) AS favorites_count;

-- Done ✅
