import { requireRole } from "../../../_lib/requireAuth.js";

function getMondayISO(d=new Date()){
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay(); // 0 Sun..6 Sat
  const diff = (day === 0 ? -6 : 1 - day); // move to Monday
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0,10);
}

export async function onRequestGet(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const url = new URL(request.url);
  const week = url.searchParams.get("week_start") || getMondayISO();
  const row = await env.DB.prepare(
    `SELECT availability_json FROM employee_availability WHERE employee_user_id=? AND week_start=? LIMIT 1`
  ).bind(auth.user.id, week).first();

  return new Response(JSON.stringify({ ok:true, week_start: week, availability: row ? JSON.parse(row.availability_json) : null }), {
    status:200, headers:{ "content-type":"application/json" }
  });
}

export async function onRequestPost(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const week = (body.week_start || getMondayISO()).trim();
  const availability = body.availability;
  if (!availability) return new Response(JSON.stringify({ error:"Missing availability" }), { status:400, headers:{ "content-type":"application/json" }});

  await env.DB.prepare(
    `INSERT INTO employee_availability (employee_user_id, week_start, availability_json)
     VALUES (?, ?, ?)
     ON CONFLICT(employee_user_id, week_start) DO UPDATE SET
       availability_json=excluded.availability_json,
       updated_at=datetime('now')`
  ).bind(auth.user.id, week, JSON.stringify(availability)).run();

  return new Response(JSON.stringify({ ok:true }), { status:200, headers:{ "content-type":"application/json" }});
}
