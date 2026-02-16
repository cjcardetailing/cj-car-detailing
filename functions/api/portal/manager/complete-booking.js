import { requireRole } from "../../../_lib/requireAuth.js";

export async function onRequestPost(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const bookingId = Number(body.booking_id);
  if (!bookingId) return new Response(JSON.stringify({ error:"Missing booking_id" }), { status:400, headers:{ "content-type":"application/json" }});

  await env.DB.prepare(
    `UPDATE booking_assignments SET completed_at = datetime('now') WHERE booking_id = ?`
  ).bind(bookingId).run();

  return new Response(JSON.stringify({ ok:true }), { status:200, headers:{ "content-type":"application/json" }});
}
