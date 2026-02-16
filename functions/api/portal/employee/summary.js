import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";
import { isManualPayTableMissingError } from "../../../_lib/manualPay.js";
import { getPeriodRange } from "../../../_lib/dashboard.js";

export async function onRequestGet(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

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
           SELECT ba.employee_pay_cents
           FROM booking_assignments ba
           JOIN bookings b ON b.id = ba.booking_id
           WHERE ba.employee_user_id = ?
             AND ba.completed_at IS NOT NULL
             AND datetime(b.start_time, 'localtime') >= datetime(?)
             AND datetime(b.start_time, 'localtime') < datetime(?)
         ),
         manual_rows AS (
           SELECT mpe.pay_cents
           FROM manual_pay_entries mpe
           WHERE mpe.employee_user_id = ?
             AND datetime(mpe.job_time, 'localtime') >= datetime(?)
             AND datetime(mpe.job_time, 'localtime') < datetime(?)
         )
         SELECT
           COALESCE((SELECT SUM(employee_pay_cents) FROM booking_rows), 0)
             + COALESCE((SELECT SUM(pay_cents) FROM manual_rows), 0) AS pay_cents,
           COALESCE((SELECT COUNT(*) FROM booking_rows), 0)
             + COALESCE((SELECT COUNT(*) FROM manual_rows), 0) AS jobs`
      ).bind(
        auth.user.id,
        fromDateTime,
        toDateTime,
        auth.user.id,
        fromDateTime,
        toDateTime
      ).first();

    for (const [key, range] of Object.entries(ranges)) {
      totals[key] = await q(range.fromDateTime, range.toDateTime);
    }
  } catch (err) {
    if (!isManualPayTableMissingError(err)) throw err;
    const q = async (fromDateTime, toDateTime) =>
      env.DB.prepare(
        `SELECT
                COALESCE(SUM(ba.employee_pay_cents), 0) AS pay_cents,
                COALESCE(COUNT(*), 0) AS jobs
         FROM booking_assignments ba
         JOIN bookings b ON b.id = ba.booking_id
         WHERE ba.employee_user_id = ?
           AND ba.completed_at IS NOT NULL
           AND datetime(b.start_time, 'localtime') >= datetime(?)
           AND datetime(b.start_time, 'localtime') < datetime(?)`
      ).bind(auth.user.id, fromDateTime, toDateTime).first();

    for (const [key, range] of Object.entries(ranges)) {
      totals[key] = await q(range.fromDateTime, range.toDateTime);
    }
  }

  return new Response(JSON.stringify({
    ok:true,
    week: { ...totals.week, pay_fmt: formatAUD(totals.week.pay_cents) },
    month:{ ...totals.month, pay_fmt: formatAUD(totals.month.pay_cents) },
    year: { ...totals.year, pay_fmt: formatAUD(totals.year.pay_cents) }
  }), { status:200, headers:{ "content-type":"application/json" }});
}
