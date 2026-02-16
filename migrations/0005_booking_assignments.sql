-- Migration number: 0005 	 2026-02-16T03:18:48.382Z
-- Assign each Cal booking to an employee + store computed pricing snapshot for payroll

CREATE TABLE IF NOT EXISTS booking_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  booking_id INTEGER NOT NULL,          -- references bookings.id
  employee_user_id INTEGER NOT NULL,    -- references users.id (role EMPLOYEE)

  cars_count INTEGER NOT NULL DEFAULT 1,

  -- Stored snapshot amounts in cents (AUD)
  unit_price_cents INTEGER NOT NULL,    -- e.g. $45 -> 4500
  total_price_cents INTEGER NOT NULL,   -- unit * cars_count

  -- Computed payroll snapshot
  employee_pay_cents INTEGER NOT NULL,
  manager_each_cents INTEGER NOT NULL,

  notes TEXT,

  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT,

  UNIQUE(booking_id),

  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assignments_employee ON booking_assignments(employee_user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_assigned_at ON booking_assignments(assigned_at);
