import { requireRole } from "../../../_lib/requireAuth.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const rows = await env.DB.prepare(
    `SELECT date, pay_cents
     FROM (
       SELECT
         b.start_time AS date,
         ba.employee_pay_cents AS pay_cents
       FROM booking_assignments ba
       JOIN bookings b ON b.id = ba.booking_id
       WHERE ba.employee_user_id = ?
         AND ba.completed_at IS NOT NULL

       UNION ALL

       SELECT
         mpe.job_time AS date,
         mpe.pay_cents AS pay_cents
       FROM manual_pay_entries mpe
       WHERE mpe.employee_user_id = ?
     )
     ORDER BY datetime(date) ASC
     LIMIT 500`
  ).bind(auth.user.id, auth.user.id).all();

  const entries = (rows.results || []).map(r => ({
    date: r.date,
    pay_cents: r.pay_cents,
  }));

  return new Response(JSON.stringify({ ok: true, entries }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
