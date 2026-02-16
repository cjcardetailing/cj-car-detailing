-- Migration number: 0006 	 2026-02-16T03:38:42.889Z
-- Employee availability per week
CREATE TABLE IF NOT EXISTS employee_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_user_id INTEGER NOT NULL,

  week_start TEXT NOT NULL,   -- YYYY-MM-DD (Monday)
  availability_json TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  UNIQUE(employee_user_id, week_start),
  FOREIGN KEY(employee_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_availability_employee_week ON employee_availability(employee_user_id, week_start);

-- Optional: store payroll run snapshots (so you can re-open past payroll)
CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,

  total_cents INTEGER NOT NULL,
  employee_total_cents INTEGER NOT NULL,
  manager_each_total_cents INTEGER NOT NULL,

  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

