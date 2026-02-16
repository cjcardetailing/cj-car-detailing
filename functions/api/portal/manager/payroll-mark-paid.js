import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";
import { ensureDashboardTables } from "../../../_lib/dashboard.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  await ensureDashboardTables(env);

  const body = await request.json().catch(() => ({}));
  const employeeUserId = Number(body.employee_user_id);
  const note = String(body.note || "").trim();

  if (!Number.isFinite(employeeUserId) || employeeUserId <= 0) {
    return new Response(JSON.stringify({ error: "employee_user_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const employee = await env.DB.prepare(
    `SELECT u.id, u.username, ep.full_name
     FROM users u
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE u.id = ? AND u.role = 'EMPLOYEE' AND u.is_active = 1`
  ).bind(employeeUserId).first();

  if (!employee) {
    return new Response(JSON.stringify({ error: "Employee not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  let unpaidItems = [];
  try {
    const rows = await env.DB.prepare(
      `WITH unpaid_items AS (
        SELECT
          ba.employee_user_id AS employee_user_id,
          ba.id AS source_id,
          'BOOKING_ASSIGNMENT' AS source_type,
          ba.employee_pay_cents AS amount_cents,
          b.start_time AS job_time
        FROM booking_assignments ba
        JOIN bookings b ON b.id = ba.booking_id
        LEFT JOIN payroll_payment_items ppi
          ON ppi.source_type = 'BOOKING_ASSIGNMENT' AND ppi.source_id = ba.id
        WHERE ba.employee_user_id = ?
          AND ba.completed_at IS NOT NULL
          AND ppi.id IS NULL

        UNION ALL

        SELECT
          mpe.employee_user_id AS employee_user_id,
          mpe.id AS source_id,
          'MANUAL_PAY' AS source_type,
          mpe.pay_cents AS amount_cents,
          mpe.job_time AS job_time
        FROM manual_pay_entries mpe
        LEFT JOIN payroll_payment_items ppi
          ON ppi.source_type = 'MANUAL_PAY' AND ppi.source_id = mpe.id
        WHERE mpe.employee_user_id = ?
          AND ppi.id IS NULL
      )
      SELECT employee_user_id, source_type, source_id, amount_cents, job_time
      FROM unpaid_items
      ORDER BY datetime(job_time) ASC`
    ).bind(employeeUserId, employeeUserId).all();
    unpaidItems = rows.results || [];
  } catch {
    const rows = await env.DB.prepare(
      `SELECT
        ba.employee_user_id AS employee_user_id,
        'BOOKING_ASSIGNMENT' AS source_type,
        ba.id AS source_id,
        ba.employee_pay_cents AS amount_cents,
        b.start_time AS job_time
      FROM booking_assignments ba
      JOIN bookings b ON b.id = ba.booking_id
      LEFT JOIN payroll_payment_items ppi
        ON ppi.source_type = 'BOOKING_ASSIGNMENT' AND ppi.source_id = ba.id
      WHERE ba.employee_user_id = ?
        AND ba.completed_at IS NOT NULL
        AND ppi.id IS NULL
      ORDER BY datetime(b.start_time) ASC`
    ).bind(employeeUserId).all();
    unpaidItems = rows.results || [];
  }

  const amountCents = unpaidItems.reduce((sum, r) => sum + Number(r.amount_cents || 0), 0);
  if (!unpaidItems.length || amountCents <= 0) {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "No unpaid items found for this employee.",
        employee_user_id: employeeUserId,
        employee_name: employee.full_name || employee.username || "",
        amount_cents: 0,
        amount_fmt: formatAUD(0),
        paid_items: 0,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  const batchRes = await env.DB.prepare(
    `INSERT INTO payroll_payment_batches
      (employee_user_id, amount_cents, paid_by_user_id, note)
     VALUES (?, ?, ?, ?)`
  ).bind(employeeUserId, amountCents, auth.user.id, note || null).run();

  const batchId = Number(batchRes.meta?.last_row_id || 0);
  if (!batchId) {
    return new Response(JSON.stringify({ error: "Could not create payment batch" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  for (const item of unpaidItems) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO payroll_payment_items
        (batch_id, employee_user_id, source_type, source_id, amount_cents, job_time)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      batchId,
      employeeUserId,
      item.source_type,
      Number(item.source_id),
      Number(item.amount_cents || 0),
      item.job_time || null
    ).run();
  }

  const totals = await env.DB.prepare(
    `SELECT
      COALESCE(SUM(amount_cents), 0) AS paid_cents,
      COALESCE(COUNT(*), 0) AS paid_items
    FROM payroll_payment_items
    WHERE batch_id = ?`
  ).bind(batchId).first();

  const paidCents = Number(totals?.paid_cents || 0);
  const paidItems = Number(totals?.paid_items || 0);

  await env.DB.prepare(
    `UPDATE payroll_payment_batches SET amount_cents = ? WHERE id = ?`
  ).bind(paidCents, batchId).run();

  return new Response(
    JSON.stringify({
      ok: true,
      batch_id: batchId,
      employee_user_id: employeeUserId,
      employee_name: employee.full_name || employee.username || "",
      paid_at: new Date().toISOString(),
      paid_by_user_id: Number(auth.user.id),
      amount_cents: paidCents,
      amount_fmt: formatAUD(paidCents),
      paid_items: paidItems,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
