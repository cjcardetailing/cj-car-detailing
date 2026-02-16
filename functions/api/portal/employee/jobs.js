import { requireRole } from "../../../_lib/requireAuth.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const rows = await env.DB.prepare(
    `SELECT b.start_time, b.end_time, b.title, b.location,
            ba.cars_count, ba.total_price_cents, ba.employee_pay_cents
     FROM booking_assignments ba
     JOIN bookings b ON b.id = ba.booking_id
     WHERE ba.employee_user_id = ?
     ORDER BY datetime(b.start_time) ASC
     LIMIT 200`
  ).bind(auth.user.id).all();

  return new Response(JSON.stringify({ ok: true, jobs: rows.results || [] }), {
    status: 200, headers: { "content-type": "application/json" }
  });
}
