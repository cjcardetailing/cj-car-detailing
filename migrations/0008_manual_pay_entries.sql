-- Migration number: 0008 	 2026-02-16T00:00:00.000Z
-- Manager-added manual pay entries for missed jobs

CREATE TABLE IF NOT EXISTS manual_pay_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_user_id INTEGER NOT NULL,
  created_by_user_id INTEGER NOT NULL,

  job_time TEXT NOT NULL,                 -- local datetime string
  cars_count INTEGER NOT NULL DEFAULT 1,
  job_type TEXT NOT NULL,
  pay_cents INTEGER NOT NULL,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY(employee_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manual_pay_employee ON manual_pay_entries(employee_user_id);
CREATE INDEX IF NOT EXISTS idx_manual_pay_job_time ON manual_pay_entries(job_time);
