const EXPENSE_CATEGORIES = new Set(["Materials", "Fuel", "Supplies", "Other"]);

export function toISODateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getPeriodRange(periodRaw) {
  const period = String(periodRaw || "week").toLowerCase();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return {
      period: "month",
      label: "This month",
      fromDate: toISODateLocal(from),
      toDate: toISODateLocal(to),
      fromDateTime: `${toISODateLocal(from)} 00:00:00`,
      toDateTime: `${toISODateLocal(to)} 00:00:00`,
    };
  }

  if (period === "year") {
    const from = new Date(today.getFullYear(), 0, 1);
    const to = new Date(today.getFullYear() + 1, 0, 1);
    return {
      period: "year",
      label: "This year",
      fromDate: toISODateLocal(from),
      toDate: toISODateLocal(to),
      fromDateTime: `${toISODateLocal(from)} 00:00:00`,
      toDateTime: `${toISODateLocal(to)} 00:00:00`,
    };
  }

  // Week starts Monday in AU context.
  const day = today.getDay(); // Sun=0
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const from = new Date(today);
  from.setDate(today.getDate() + diffToMonday);
  const to = new Date(from);
  to.setDate(from.getDate() + 7);
  return {
    period: "week",
    label: "This week",
    fromDate: toISODateLocal(from),
    toDate: toISODateLocal(to),
    fromDateTime: `${toISODateLocal(from)} 00:00:00`,
    toDateTime: `${toISODateLocal(to)} 00:00:00`,
  };
}

export function parseAmountToCents(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    return Math.round(value * 100);
  }
  const raw = String(value ?? "").trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const cents = Math.round(Number(raw) * 100);
  return cents > 0 ? cents : null;
}

export function sanitizeExpenseCategory(value) {
  const category = String(value || "").trim();
  return EXPENSE_CATEGORIES.has(category) ? category : null;
}

export async function ensureDashboardTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS cashbook_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('CASH','EXPENSE')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      entry_date TEXT NOT NULL, -- YYYY-MM-DD
      category TEXT,            -- expense only
      note TEXT,
      linked_booking_id INTEGER,
      created_by_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY(linked_booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
      FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_cashbook_entry_date ON cashbook_entries(entry_date)`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_cashbook_entry_type_date ON cashbook_entries(entry_type, entry_date)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payroll_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      next_payroll_date TEXT, -- YYYY-MM-DD
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`
  ).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO payroll_settings (id, next_payroll_date) VALUES (1, NULL)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payroll_payment_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_user_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      paid_by_user_id INTEGER NOT NULL,
      note TEXT,
      FOREIGN KEY(employee_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(paid_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_payroll_batches_employee_paid_at ON payroll_payment_batches(employee_user_id, paid_at DESC)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payroll_payment_items (
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
    )`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_payroll_items_employee_source ON payroll_payment_items(employee_user_id, source_type, source_id)`
  ).run();
}
