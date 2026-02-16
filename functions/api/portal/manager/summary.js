import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";
import { isManualPayTableMissingError } from "../../../_lib/manualPay.js";
import { getPeriodRange } from "../../../_lib/dashboard.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;
  const managerUserId = Number(auth.user.id) || 0;

  const ranges = {
    week: getPeriodRange("week"),
    month: getPeriodRange("month"),
    year: getPeriodRange("year"),
  };
  const totals = {};
  try {
    const q = async (fromDateTime, toDateTime) =>
      env.DB.prepare(
        `WITH booking_rows AS (
           SELECT ba.total_price_cents, ba.employee_pay_cents, ba.manager_each_cents
           FROM booking_assignments ba
           JOIN bookings b ON b.id = ba.booking_id
           WHERE ba.completed_at IS NOT NULL
             AND datetime(b.start_time, 'localtime') >= datetime(?)
             AND datetime(b.start_time, 'localtime') < datetime(?)
         ),
         manual_rows AS (
           SELECT mpe.employee_user_id, mpe.pay_cents
           FROM manual_pay_entries mpe
           WHERE datetime(mpe.job_time, 'localtime') >= datetime(?)
             AND datetime(mpe.job_time, 'localtime') < datetime(?)
         )
         SELECT
           COALESCE((SELECT SUM(total_price_cents) FROM booking_rows), 0) AS total_cents,
           COALESCE((SELECT SUM(employee_pay_cents) FROM booking_rows), 0)
             + COALESCE((SELECT SUM(pay_cents) FROM manual_rows), 0) AS employee_cents,
           COALESCE((SELECT SUM(manager_each_cents) FROM booking_rows), 0) AS manager_each_cents,
           COALESCE((SELECT SUM(pay_cents) FROM manual_rows WHERE employee_user_id = ?), 0) AS my_manual_cents,
           COALESCE((SELECT COUNT(*) FROM manual_rows WHERE employee_user_id = ?), 0) AS my_manual_jobs,
           COALESCE((SELECT COUNT(*) FROM booking_rows), 0)
             + COALESCE((SELECT COUNT(*) FROM manual_rows), 0) AS jobs`
      ).bind(
        fromDateTime,
        toDateTime,
        fromDateTime,
        toDateTime,
        managerUserId,
        managerUserId
      ).first();

    for (const [key, range] of Object.entries(ranges)) {
      totals[key] = await q(range.fromDateTime, range.toDateTime);
    }

    // Dashboard card represents "Your earnings".
    // Add manual pay rows that were assigned directly to this manager account.
    for (const bucket of Object.values(totals)) {
      bucket.manager_each_cents = Number(bucket.manager_each_cents || 0) + Number(bucket.my_manual_cents || 0);
    }
  } catch (err) {
    if (!isManualPayTableMissingError(err)) throw err;
    const q = async (fromDateTime, toDateTime) =>
      env.DB.prepare(
        `SELECT
           COALESCE(SUM(ba.total_price_cents),0) AS total_cents,
           COALESCE(SUM(ba.employee_pay_cents),0) AS employee_cents,
           COALESCE(SUM(ba.manager_each_cents),0) AS manager_each_cents,
           COALESCE(COUNT(*),0) AS jobs
         FROM booking_assignments ba
         JOIN bookings b ON b.id = ba.booking_id
         WHERE ba.completed_at IS NOT NULL
           AND datetime(b.start_time, 'localtime') >= datetime(?)
           AND datetime(b.start_time, 'localtime') < datetime(?)`
      ).bind(fromDateTime, toDateTime).first();

    for (const [key, range] of Object.entries(ranges)) {
      totals[key] = await q(range.fromDateTime, range.toDateTime);
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    week:  { ...totals.week,  total_fmt: formatAUD(totals.week.total_cents),  employee_fmt: formatAUD(totals.week.employee_cents),  manager_each_fmt: formatAUD(totals.week.manager_each_cents) },
    month: { ...totals.month, total_fmt: formatAUD(totals.month.total_cents), employee_fmt: formatAUD(totals.month.employee_cents), manager_each_fmt: formatAUD(totals.month.manager_each_cents) },
    year:  { ...totals.year,  total_fmt: formatAUD(totals.year.total_cents),  employee_fmt: formatAUD(totals.year.employee_cents),  manager_each_fmt: formatAUD(totals.year.manager_each_cents) }
  }), { status: 200, headers: { "content-type": "application/json" } });
}
