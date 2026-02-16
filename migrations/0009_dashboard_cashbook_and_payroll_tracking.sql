-- Migration number: 0009   2026-02-16T00:00:00.000Z
-- Dashboard cashbook + payroll payment tracking

CREATE TABLE IF NOT EXISTS cashbook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('CASH','EXPENSE')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  entry_date TEXT NOT NULL, -- YYYY-MM-DD
  category TEXT,
  note TEXT,
  linked_booking_id INTEGER,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(linked_booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cashbook_entry_date ON cashbook_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_cashbook_entry_type_date ON cashbook_entries(entry_type, entry_date);

CREATE TABLE IF NOT EXISTS payroll_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  next_payroll_date TEXT, -- YYYY-MM-DD
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO payroll_settings (id, next_payroll_date) VALUES (1, NULL);

CREATE TABLE IF NOT EXISTS payroll_payment_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_user_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_by_user_id INTEGER NOT NULL,
  note TEXT,
  FOREIGN KEY(employee_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(paid_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payroll_batches_employee_paid_at ON payroll_payment_batches(employee_user_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS payroll_payment_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  employee_user_id INTEGER NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('BOOKING_ASSIGNMENT','MANUAL_PAY')),
  source_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  job_time TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_type, source_id),
  FOREIGN KEY(batch_id) REFERENCES payroll_payment_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee_source ON payroll_payment_items(employee_user_id, source_type, source_id);
