import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const totals = await env.DB.prepare(
    `SELECT
       (
         COALESCE((
           SELECT SUM(ba.employee_pay_cents)
           FROM booking_assignments ba
           JOIN bookings b ON b.id = ba.booking_id
           WHERE ba.employee_user_id = ?
             AND datetime(b.start_time) >= datetime(date('now','localtime','weekday 1','-7 days'))
             AND datetime(b.start_time) <  datetime(date('now','localtime','weekday 1'))
         ), 0)
         +
         COALESCE((
           SELECT SUM(mpe.pay_cents)
           FROM manual_pay_entries mpe
           WHERE mpe.employee_user_id = ?
             AND datetime(mpe.job_time) >= datetime(date('now','localtime','weekday 1','-7 days'))
             AND datetime(mpe.job_time) <  datetime(date('now','localtime','weekday 1'))
         ), 0)
       ) AS pay_cents,
       (
         COALESCE((
           SELECT SUM(ba.cars_count)
           FROM booking_assignments ba
           JOIN bookings b ON b.id = ba.booking_id
           WHERE ba.employee_user_id = ?
             AND datetime(b.start_time) >= datetime(date('now','localtime','weekday 1','-7 days'))
             AND datetime(b.start_time) <  datetime(date('now','localtime','weekday 1'))
         ), 0)
         +
         COALESCE((
           SELECT SUM(mpe.cars_count)
           FROM manual_pay_entries mpe
           WHERE mpe.employee_user_id = ?
             AND datetime(mpe.job_time) >= datetime(date('now','localtime','weekday 1','-7 days'))
             AND datetime(mpe.job_time) <  datetime(date('now','localtime','weekday 1'))
         ), 0)
       ) AS cars_washed,
       (
         COALESCE((
           SELECT COUNT(*)
           FROM booking_assignments ba
           JOIN bookings b ON b.id = ba.booking_id
           WHERE ba.employee_user_id = ?
             AND datetime(b.start_time) >= datetime(date('now','localtime','weekday 1','-7 days'))
             AND datetime(b.start_time) <  datetime(date('now','localtime','weekday 1'))
         ), 0)
         +
         COALESCE((
           SELECT COUNT(*)
           FROM manual_pay_entries mpe
           WHERE mpe.employee_user_id = ?
             AND datetime(mpe.job_time) >= datetime(date('now','localtime','weekday 1','-7 days'))
             AND datetime(mpe.job_time) <  datetime(date('now','localtime','weekday 1'))
         ), 0)
       ) AS jobs,
       date('now','localtime','weekday 1','-7 days') AS from_date,
       date('now','localtime','weekday 1') AS to_date_exclusive`
  ).bind(auth.user.id, auth.user.id, auth.user.id, auth.user.id, auth.user.id, auth.user.id).first();

  const rows = await env.DB.prepare(
    `SELECT
       start_time,
       title,
       location,
       cars_count,
       employee_pay_cents
     FROM (
       SELECT
         b.start_time AS start_time,
         b.title AS title,
         b.location AS location,
         ba.cars_count AS cars_count,
         ba.employee_pay_cents AS employee_pay_cents
       FROM booking_assignments ba
       JOIN bookings b ON b.id = ba.booking_id
       WHERE ba.employee_user_id = ?
         AND datetime(b.start_time) >= datetime(date('now','localtime','weekday 1','-7 days'))
         AND datetime(b.start_time) <  datetime(date('now','localtime','weekday 1'))

       UNION ALL

       SELECT
         mpe.job_time AS start_time,
         mpe.job_type AS title,
         'Manual entry' AS location,
         mpe.cars_count AS cars_count,
         mpe.pay_cents AS employee_pay_cents
       FROM manual_pay_entries mpe
       WHERE mpe.employee_user_id = ?
         AND datetime(mpe.job_time) >= datetime(date('now','localtime','weekday 1','-7 days'))
         AND datetime(mpe.job_time) <  datetime(date('now','localtime','weekday 1'))
     )
     ORDER BY datetime(start_time) DESC
     LIMIT 100`
  ).bind(auth.user.id, auth.user.id).all();

  return new Response(JSON.stringify({
    ok: true,
    paycheck: {
      period: "week_sunday",
      from: totals?.from_date || "",
      to: totals?.to_date_exclusive || "",
      pay_cents: totals?.pay_cents || 0,
      pay_fmt: formatAUD(totals?.pay_cents || 0),
      jobs: totals?.jobs || 0,
      cars_washed: totals?.cars_washed || 0,
      pay_rule: "Auto: 20% rounded up to nearest $5 per booking + manual pay entries",
    },
    entries: (rows.results || []).map((r) => ({
      start_time: r.start_time,
      title: r.title,
      location: r.location,
      cars_count: r.cars_count,
      employee_pay_cents: r.employee_pay_cents,
    })),
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
