import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";
import { ensureDashboardTables, getPeriodRange } from "../../../_lib/dashboard.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  await ensureDashboardTables(env);

  const url = new URL(request.url);
  const range = getPeriodRange(url.searchParams.get("period"));

  const settings = await env.DB.prepare(
    `SELECT next_payroll_date FROM payroll_settings WHERE id = 1`
  ).first();

  let rows = { results: [] };
  try {
    rows = await env.DB.prepare(
      `WITH unpaid_items AS (
        SELECT
          ba.employee_user_id AS employee_user_id,
          ba.id AS source_id,
          'BOOKING_ASSIGNMENT' AS source_type,
          ba.employee_pay_cents AS amount_cents
        FROM booking_assignments ba
        JOIN bookings b ON b.id = ba.booking_id
        JOIN users u ON u.id = ba.employee_user_id AND u.role = 'EMPLOYEE'
        LEFT JOIN payroll_payment_items ppi
          ON ppi.source_type = 'BOOKING_ASSIGNMENT' AND ppi.source_id = ba.id
        WHERE ba.completed_at IS NOT NULL
          AND ppi.id IS NULL
          AND datetime(b.start_time, 'localtime') >= datetime(?)
          AND datetime(b.start_time, 'localtime') < datetime(?)

        UNION ALL

        SELECT
          mpe.employee_user_id AS employee_user_id,
          mpe.id AS source_id,
          'MANUAL_PAY' AS source_type,
          mpe.pay_cents AS amount_cents
        FROM manual_pay_entries mpe
        JOIN users u ON u.id = mpe.employee_user_id AND u.role = 'EMPLOYEE'
        LEFT JOIN payroll_payment_items ppi
          ON ppi.source_type = 'MANUAL_PAY' AND ppi.source_id = mpe.id
        WHERE ppi.id IS NULL
          AND datetime(mpe.job_time, 'localtime') >= datetime(?)
          AND datetime(mpe.job_time, 'localtime') < datetime(?)
      ),
      unpaid_by_employee AS (
        SELECT
          employee_user_id,
          COALESCE(SUM(amount_cents), 0) AS unpaid_amount_cents,
          COALESCE(COUNT(*), 0) AS unpaid_jobs
        FROM unpaid_items
        GROUP BY employee_user_id
      )
      SELECT
        u.id AS employee_user_id,
        u.username,
        ep.full_name,
        COALESCE(ube.unpaid_amount_cents, 0) AS unpaid_amount_cents,
        COALESCE(ube.unpaid_jobs, 0) AS unpaid_jobs
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN unpaid_by_employee ube ON ube.employee_user_id = u.id
      WHERE u.role = 'EMPLOYEE' AND u.is_active = 1
      ORDER BY unpaid_amount_cents DESC, u.username ASC`
    ).bind(
      range.fromDateTime,
      range.toDateTime,
      range.fromDateTime,
      range.toDateTime
    ).all();
  } catch {
    rows = await env.DB.prepare(
      `WITH unpaid_items AS (
        SELECT
          ba.employee_user_id AS employee_user_id,
          ba.id AS source_id,
          ba.employee_pay_cents AS amount_cents
        FROM booking_assignments ba
        JOIN bookings b ON b.id = ba.booking_id
        JOIN users u ON u.id = ba.employee_user_id AND u.role = 'EMPLOYEE'
        LEFT JOIN payroll_payment_items ppi
          ON ppi.source_type = 'BOOKING_ASSIGNMENT' AND ppi.source_id = ba.id
        WHERE ba.completed_at IS NOT NULL
          AND ppi.id IS NULL
          AND datetime(b.start_time, 'localtime') >= datetime(?)
          AND datetime(b.start_time, 'localtime') < datetime(?)
      ),
      unpaid_by_employee AS (
        SELECT
          employee_user_id,
          COALESCE(SUM(amount_cents), 0) AS unpaid_amount_cents,
          COALESCE(COUNT(*), 0) AS unpaid_jobs
        FROM unpaid_items
        GROUP BY employee_user_id
      )
      SELECT
        u.id AS employee_user_id,
        u.username,
        ep.full_name,
        COALESCE(ube.unpaid_amount_cents, 0) AS unpaid_amount_cents,
        COALESCE(ube.unpaid_jobs, 0) AS unpaid_jobs
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN unpaid_by_employee ube ON ube.employee_user_id = u.id
      WHERE u.role = 'EMPLOYEE' AND u.is_active = 1
      ORDER BY unpaid_amount_cents DESC, u.username ASC`
    ).bind(range.fromDateTime, range.toDateTime).all();
  }

  const employees = (rows.results || []).map((r) => {
    const unpaidCents = Number(r.unpaid_amount_cents || 0);
    const unpaidJobs = Number(r.unpaid_jobs || 0);
    return {
      employee_user_id: Number(r.employee_user_id),
      username: r.username || "",
      full_name: r.full_name || "",
      unpaid_amount_cents: unpaidCents,
      unpaid_amount_fmt: formatAUD(unpaidCents),
      unpaid_jobs: unpaidJobs,
      status: unpaidCents > 0 ? "Unpaid" : "Paid",
    };
  });

  const totalWagesOwed = employees.reduce((sum, e) => sum + Number(e.unpaid_amount_cents || 0), 0);

  return new Response(
    JSON.stringify({
      ok: true,
      period: range.period,
      range: { from: range.fromDate, to: range.toDate, label: range.label },
      next_payroll_date: settings?.next_payroll_date || null,
      total_wages_owed_cents: totalWagesOwed,
      total_wages_owed_fmt: formatAUD(totalWagesOwed),
      employees,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
