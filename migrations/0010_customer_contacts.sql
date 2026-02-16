-- Migration number: 0010   2026-02-17T00:00:00.000Z
-- Manager customer contacts for portal CRM tab

CREATE TABLE IF NOT EXISTS customer_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  time_since_last_wash TEXT NOT NULL,
  customer_type TEXT NOT NULL CHECK(customer_type IN ('REGULAR', 'NORMAL')),
  lifetime_value_cents INTEGER NOT NULL DEFAULT 0 CHECK(lifetime_value_cents >= 0),
  phone_number TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_created_at
  ON customer_contacts(created_at DESC);
