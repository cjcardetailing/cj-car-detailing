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

  const completedRevenue = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(ba.total_price_cents), 0) AS revenue_cents,
       COALESCE(SUM(ba.employee_pay_cents), 0) AS booking_wages_cents,
       COALESCE(COUNT(*), 0) AS booking_jobs
     FROM booking_assignments ba
     JOIN bookings b ON b.id = ba.booking_id
     WHERE ba.completed_at IS NOT NULL
       AND datetime(b.start_time, 'localtime') >= datetime(?)
       AND datetime(b.start_time, 'localtime') < datetime(?)`
  ).bind(range.fromDateTime, range.toDateTime).first();

  let manualPay = { wages_cents: 0, jobs: 0 };
  try {
    manualPay = await env.DB.prepare(
      `SELECT
         COALESCE(SUM(mpe.pay_cents), 0) AS wages_cents,
         COALESCE(COUNT(*), 0) AS jobs
       FROM manual_pay_entries mpe
       WHERE datetime(mpe.job_time, 'localtime') >= datetime(?)
         AND datetime(mpe.job_time, 'localtime') < datetime(?)`
    ).bind(range.fromDateTime, range.toDateTime).first();
  } catch {
    manualPay = { wages_cents: 0, jobs: 0 };
  }

  const cashbookSummary = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_type='CASH' THEN amount_cents ELSE 0 END), 0) AS cash_collected_cents,
       COALESCE(SUM(CASE WHEN entry_type='EXPENSE' THEN amount_cents ELSE 0 END), 0) AS expenses_cents
     FROM cashbook_entries
     WHERE datetime(entry_date || ' 00:00:00') >= datetime(?)
       AND datetime(entry_date || ' 00:00:00') < datetime(?)`
  ).bind(range.fromDateTime, range.toDateTime).first();

  let unpaidTotals = { wages_owed_cents: 0, unpaid_jobs: 0 };
  try {
    unpaidTotals = await env.DB.prepare(
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
      )
      SELECT
        COALESCE(SUM(amount_cents), 0) AS wages_owed_cents,
        COALESCE(COUNT(*), 0) AS unpaid_jobs
      FROM unpaid_items`
    ).bind(
      range.fromDateTime,
      range.toDateTime,
      range.fromDateTime,
      range.toDateTime
    ).first();
  } catch {
    unpaidTotals = await env.DB.prepare(
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
      )
      SELECT
        COALESCE(SUM(amount_cents), 0) AS wages_owed_cents,
        COALESCE(COUNT(*), 0) AS unpaid_jobs
      FROM unpaid_items`
    ).bind(range.fromDateTime, range.toDateTime).first();
  }

  const revenueCents = Number(completedRevenue?.revenue_cents || 0);
  const bookingWagesCents = Number(completedRevenue?.booking_wages_cents || 0);
  const manualWagesCents = Number(manualPay?.wages_cents || 0);
  const wagesCents = bookingWagesCents + manualWagesCents;
  const expensesCents = Number(cashbookSummary?.expenses_cents || 0);
  const cashCollectedCents = Number(cashbookSummary?.cash_collected_cents || 0);
  const jobsCompleted = Number(completedRevenue?.booking_jobs || 0) + Number(manualPay?.jobs || 0);
  const wagesOwedCents = Number(unpaidTotals?.wages_owed_cents || 0);
  const profitCents = revenueCents - wagesCents - expensesCents;
  const averageTicketCents = jobsCompleted > 0 ? Math.round(revenueCents / jobsCompleted) : 0;

  return new Response(
    JSON.stringify({
      ok: true,
      period: range.period,
      range: { from: range.fromDate, to: range.toDate, label: range.label },
      kpis: {
        revenue_cents: revenueCents,
        revenue_fmt: formatAUD(revenueCents),
        profit_cents: profitCents,
        profit_fmt: formatAUD(profitCents),
        wages_owed_cents: wagesOwedCents,
        wages_owed_fmt: formatAUD(wagesOwedCents),
        jobs_completed: jobsCompleted,
        average_ticket_cents: averageTicketCents,
        average_ticket_fmt: formatAUD(averageTicketCents),
      },
      cashbook: {
        cash_collected_cents: cashCollectedCents,
        cash_collected_fmt: formatAUD(cashCollectedCents),
        expenses_cents: expensesCents,
        expenses_fmt: formatAUD(expensesCents),
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
