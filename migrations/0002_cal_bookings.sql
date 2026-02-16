-- Migration number: 0002 	 2026-02-16T01:32:51.864Z
-- Stores Cal.com webhook events + a normalized booking record

CREATE TABLE IF NOT EXISTS cal_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  trigger_event TEXT,
  created_at TEXT,
  signature TEXT,
  raw_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- A stable ID from Cal payload if available
  cal_booking_id TEXT UNIQUE,

  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | CANCELLED
  start_time TEXT,
  end_time TEXT,

  customer_name TEXT,
  customer_email TEXT,

  location TEXT,
  title TEXT,

  -- Keep full payload for later (custom questions like "how many cars")
  payload_json TEXT NOT NULL,

  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings(start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
