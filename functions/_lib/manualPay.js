export function isManualPayTableMissingError(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("no such table: manual_pay_entries");
}

export async function ensureManualPayTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS manual_pay_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_user_id INTEGER NOT NULL,
      created_by_user_id INTEGER NOT NULL,
      job_time TEXT NOT NULL,
      cars_count INTEGER NOT NULL DEFAULT 1,
      job_type TEXT NOT NULL,
      pay_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY(employee_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_manual_pay_employee ON manual_pay_entries(employee_user_id)`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_manual_pay_job_time ON manual_pay_entries(job_time)`
  ).run();
}
