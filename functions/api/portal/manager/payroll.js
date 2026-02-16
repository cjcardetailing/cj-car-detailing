import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";
import { decryptString } from "../../../_lib/crypto.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const url = new URL(request.url);
  const from = url.searchParams.get("from"); // YYYY-MM-DD
  const to = url.searchParams.get("to");     // YYYY-MM-DD
  const employeeUserIdRaw = url.searchParams.get("employee_user_id");
  const employeeUserId = employeeUserIdRaw ? Number(employeeUserIdRaw) : null;

  if (!from || !to || (employeeUserIdRaw && !Number.isFinite(employeeUserId))) {
    return new Response(JSON.stringify({ error: "Missing from/to (YYYY-MM-DD)" }), {
      status: 400, headers: { "content-type": "application/json" }
    });
  }

  // Include both booking assignments and manager-entered manual pay entries.
  const rows = await env.DB.prepare(
    `WITH payroll_rows AS (
      SELECT
        ba.employee_user_id AS employee_user_id,
        ba.employee_pay_cents AS employee_pay_cents,
        ba.total_price_cents AS total_price_cents,
        ba.manager_each_cents AS manager_each_cents,
        ba.cars_count AS cars_count,
        1 AS jobs
      FROM booking_assignments ba
      JOIN bookings b ON b.id = ba.booking_id
      WHERE datetime(b.start_time) >= datetime(?) AND datetime(b.start_time) < datetime(?)
        AND (? IS NULL OR ba.employee_user_id = ?)

      UNION ALL

      SELECT
        mpe.employee_user_id AS employee_user_id,
        mpe.pay_cents AS employee_pay_cents,
        0 AS total_price_cents,
        0 AS manager_each_cents,
        mpe.cars_count AS cars_count,
        1 AS jobs
      FROM manual_pay_entries mpe
      WHERE datetime(mpe.job_time) >= datetime(?) AND datetime(mpe.job_time) < datetime(?)
        AND (? IS NULL OR mpe.employee_user_id = ?)
    )
    SELECT
        pr.employee_user_id,
        u.username,
        u.email,
        u.phone,
        ep.full_name,
        ep.bank_bsb_enc,
        ep.bank_account_enc,
        SUM(pr.employee_pay_cents) AS employee_pay_cents,
        SUM(pr.total_price_cents) AS total_price_cents,
        SUM(pr.cars_count) AS cars_washed,
        SUM(pr.jobs) AS jobs
     FROM payroll_rows pr
     JOIN users u ON u.id = pr.employee_user_id
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     GROUP BY pr.employee_user_id
     ORDER BY employee_pay_cents DESC`
  ).bind(
    from, to, employeeUserId, employeeUserId,
    from, to, employeeUserId, employeeUserId
  ).all();

  const totals = await env.DB.prepare(
    `WITH total_rows AS (
      SELECT
        ba.employee_user_id AS employee_user_id,
        ba.total_price_cents AS total_price_cents,
        ba.employee_pay_cents AS employee_pay_cents,
        ba.manager_each_cents AS manager_each_cents,
        ba.cars_count AS cars_count
      FROM booking_assignments ba
      JOIN bookings b ON b.id = ba.booking_id
      WHERE datetime(b.start_time) >= datetime(?) AND datetime(b.start_time) < datetime(?)
        AND (? IS NULL OR ba.employee_user_id = ?)

      UNION ALL

      SELECT
        mpe.employee_user_id AS employee_user_id,
        0 AS total_price_cents,
        mpe.pay_cents AS employee_pay_cents,
        0 AS manager_each_cents,
        mpe.cars_count AS cars_count
      FROM manual_pay_entries mpe
      WHERE datetime(mpe.job_time) >= datetime(?) AND datetime(mpe.job_time) < datetime(?)
        AND (? IS NULL OR mpe.employee_user_id = ?)
    )
    SELECT
       SUM(total_price_cents) AS total_cents,
       SUM(employee_pay_cents) AS employee_cents,
       SUM(manager_each_cents) AS manager_each_sum,
       SUM(cars_count) AS cars_washed
    FROM total_rows`
  ).bind(
    from, to, employeeUserId, employeeUserId,
    from, to, employeeUserId, employeeUserId
  ).first();

  const employees = [];
  for (const r of (rows.results || [])) {
    const bsb = r.bank_bsb_enc ? await decryptString(env, r.bank_bsb_enc) : "";
    const account = r.bank_account_enc ? await decryptString(env, r.bank_account_enc) : "";
    employees.push({
      employee_user_id: r.employee_user_id,
      username: r.username,
      email: r.email,
      phone: r.phone,
      full_name: r.full_name,
      employee_pay_cents: r.employee_pay_cents || 0,
      total_price_cents: r.total_price_cents || 0,
      cars_washed: r.cars_washed || 0,
      effective_rate_pct: (r.total_price_cents || 0) > 0
        ? Math.round(((r.employee_pay_cents || 0) / r.total_price_cents) * 1000) / 10
        : 0,
      jobs: r.jobs || 0,
      bank: {
        hasBank: !!(bsb || account),
        bsb,
        account,
      },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    range: { from, to },
    filter: { employee_user_id: employeeUserId },
    pay_rule: "Auto: 20% rounded up to nearest $5 per booking + manual pay entries",
    totals: {
      total_cents: totals?.total_cents || 0,
      employee_cents: totals?.employee_cents || 0,
      // manager_each_sum is "sum of each booking's each-manager share"
      manager_each_cents: totals?.manager_each_sum || 0,
      cars_washed: totals?.cars_washed || 0,
      total_fmt: formatAUD(totals?.total_cents || 0),
      employee_fmt: formatAUD(totals?.employee_cents || 0),
      manager_each_fmt: formatAUD(totals?.manager_each_sum || 0),
    },
    employees,
  }), { status: 200, headers: { "content-type": "application/json" } });
}
