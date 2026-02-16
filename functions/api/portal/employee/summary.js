import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";

export async function onRequestGet(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const q = async (rangeSql) =>
    env.DB.prepare(
      `SELECT COALESCE(SUM(ba.employee_pay_cents),0) AS pay_cents,
              COALESCE(COUNT(*),0) AS jobs
       FROM booking_assignments ba
       JOIN bookings b ON b.id = ba.booking_id
       WHERE ba.employee_user_id = ?
         AND ${rangeSql}`
    ).bind(auth.user.id).first();

  const week = await q(`datetime(b.start_time) >= datetime('now','weekday 1','-7 days') AND datetime(b.start_time) < datetime('now','weekday 1')`);
  const month = await q(`strftime('%Y-%m', b.start_time) = strftime('%Y-%m','now')`);
  const year = await q(`strftime('%Y', b.start_time) = strftime('%Y','now')`);

  return new Response(JSON.stringify({
    ok:true,
    week: { ...week, pay_fmt: formatAUD(week.pay_cents) },
    month:{ ...month, pay_fmt: formatAUD(month.pay_cents) },
    year: { ...year, pay_fmt: formatAUD(year.pay_cents) }
  }), { status:200, headers:{ "content-type":"application/json" }});
}
