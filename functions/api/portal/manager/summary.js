import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  // Use AU localtime for both booking time and "now"
  const q = async (whereSql) =>
    env.DB.prepare(
      `SELECT
         COALESCE(SUM(ba.total_price_cents),0) AS total_cents,
         COALESCE(SUM(ba.employee_pay_cents),0) AS employee_cents,
         COALESCE(SUM(ba.manager_each_cents),0) AS manager_each_cents,
         COALESCE(COUNT(*),0) AS jobs
       FROM booking_assignments ba
       JOIN bookings b ON b.id = ba.booking_id
       WHERE ${whereSql}`
    ).first();

  // Week: Monday 00:00 local -> next Monday 00:00 local
  const week = await q(`
    datetime(b.start_time,'localtime') >= datetime('now','localtime','weekday 1','-7 days')
    AND datetime(b.start_time,'localtime') <  datetime('now','localtime','weekday 1')
  `);

  const month = await q(`
    strftime('%Y-%m', datetime(b.start_time,'localtime')) = strftime('%Y-%m','now','localtime')
  `);

  const year = await q(`
    strftime('%Y', datetime(b.start_time,'localtime')) = strftime('%Y','now','localtime')
  `);

  return new Response(JSON.stringify({
    ok: true,
    week:  { ...week,  total_fmt: formatAUD(week.total_cents),  employee_fmt: formatAUD(week.employee_cents),  manager_each_fmt: formatAUD(week.manager_each_cents) },
    month: { ...month, total_fmt: formatAUD(month.total_cents), employee_fmt: formatAUD(month.employee_cents), manager_each_fmt: formatAUD(month.manager_each_cents) },
    year:  { ...year,  total_fmt: formatAUD(year.total_cents),  employee_fmt: formatAUD(year.employee_cents),  manager_each_fmt: formatAUD(year.manager_each_cents) }
  }), { status: 200, headers: { "content-type": "application/json" } });
}
