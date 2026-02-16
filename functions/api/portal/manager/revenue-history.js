import { requireRole } from "../../../_lib/requireAuth.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;
  const managerUserId = Number(auth.user.id) || 0;

  const bookingRows = await env.DB.prepare(
    `SELECT b.start_time AS date, ba.total_price_cents, ba.manager_each_cents
     FROM booking_assignments ba
     JOIN bookings b ON b.id = ba.booking_id
     WHERE ba.completed_at IS NOT NULL
     ORDER BY datetime(b.start_time) ASC
     LIMIT 500`
  ).all();

  let manualRows = { results: [] };
  try {
    manualRows = await env.DB.prepare(
      `SELECT
         mpe.job_time AS date,
         0 AS total_price_cents,
         mpe.pay_cents AS manager_each_cents
       FROM manual_pay_entries mpe
       WHERE mpe.employee_user_id = ?
       ORDER BY datetime(mpe.job_time) ASC
       LIMIT 500`
    ).bind(managerUserId).all();
  } catch {
    manualRows = { results: [] };
  }

  const entries = [
    ...(bookingRows.results || []),
    ...(manualRows.results || []),
  ]
    .map((r) => ({
      date: r.date,
      total_cents: r.total_price_cents,
      manager_each_cents: r.manager_each_cents,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-1000);

  return new Response(JSON.stringify({ ok: true, entries }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
