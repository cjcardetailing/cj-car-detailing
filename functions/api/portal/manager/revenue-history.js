import { requireRole } from "../../../_lib/requireAuth.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const rows = await env.DB.prepare(
    `SELECT b.start_time, ba.total_price_cents, ba.manager_each_cents
     FROM booking_assignments ba
     JOIN bookings b ON b.id = ba.booking_id
     WHERE ba.completed_at IS NOT NULL
     ORDER BY datetime(b.start_time) ASC
     LIMIT 500`
  ).all();

  const entries = (rows.results || []).map(r => ({
    date: r.start_time,
    total_cents: r.total_price_cents,
    manager_each_cents: r.manager_each_cents,
  }));

  return new Response(JSON.stringify({ ok: true, entries }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
