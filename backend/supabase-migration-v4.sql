-- ==========================================================
-- SUPABASE / POSTGRESQL MIGRATION V4 — PRODUCTION CHAT SYSTEM
-- Run this script in Supabase SQL Editor
-- ==========================================================

-- 1. ADD CHAT ENHANCEMENT COLUMNS TO MESSAGES TABLE
ALTER TABLE messages 
  ADD COLUMN IF NOT EXISTS image TEXT,
  ADD COLUMN IF NOT EXISTS location JSONB,
  ADD COLUMN IF NOT EXISTS voice_url TEXT,
  ADD COLUMN IF NOT EXISTS voice_duration INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS document_url TEXT,
  ADD COLUMN IF NOT EXISTS document_name TEXT,
  ADD COLUMN IF NOT EXISTS reply_to JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS seen BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

-- 2. CREATE CHAT PINNED TABLE FOR FAVORITE / PINNED CONVERSATIONS
CREATE TABLE IF NOT EXISTS chat_pinned (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, booking_id)
);

-- 3. CREATE USER PUSH TOKENS TABLE FOR EXPO PUSH NOTIFICATIONS
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  expo_push_token TEXT NOT NULL,
  platform TEXT DEFAULT 'expo',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. INDEXES FOR HIGH-SPEED MESSAGING & READ RECEIPTS
CREATE INDEX IF NOT EXISTS idx_messages_booking_id_created ON messages(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(booking_id, seen, sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_pinned_user ON chat_pinned(user_id);
