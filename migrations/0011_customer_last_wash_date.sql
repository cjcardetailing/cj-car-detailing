-- Migration number: 0011   2026-02-17T00:00:00.000Z
-- Add last_wash_date for auto-updating customer wash recency

ALTER TABLE customer_contacts ADD COLUMN last_wash_date TEXT;

UPDATE customer_contacts
SET last_wash_date = COALESCE(substr(created_at, 1, 10), strftime('%Y-%m-%d','now'))
WHERE last_wash_date IS NULL OR trim(last_wash_date) = '';
