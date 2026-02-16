import { requireRole } from "../../../_lib/requireAuth.js";

const RECURRING_WEEK_KEY = "__RECURRING__";

export async function onRequestGet(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const url = new URL(request.url);
  const requestedWeek = String(url.searchParams.get("week_start") || "").trim();
  const firstWeekKey = requestedWeek || RECURRING_WEEK_KEY;
  let row = await env.DB.prepare(
    `SELECT availability_json FROM employee_availability WHERE employee_user_id=? AND week_start=? LIMIT 1`
  ).bind(auth.user.id, firstWeekKey).first();

  // If a specific week was requested but no row exists, fall back to recurring template.
  let resolvedWeekKey = firstWeekKey;
  if (!row && requestedWeek) {
    row = await env.DB.prepare(
      `SELECT availability_json FROM employee_availability WHERE employee_user_id=? AND week_start=? LIMIT 1`
    ).bind(auth.user.id, RECURRING_WEEK_KEY).first();
    if (row) resolvedWeekKey = RECURRING_WEEK_KEY;
  }

  return new Response(JSON.stringify({
    ok:true,
    week_start: resolvedWeekKey,
    recurring: resolvedWeekKey === RECURRING_WEEK_KEY,
    availability: row ? JSON.parse(row.availability_json) : null
  }), {
    status:200, headers:{ "content-type":"application/json" }
  });
}

export async function onRequestPost(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const requestedWeek = String(body.week_start || "").trim();
  const isRecurring = body.recurring === true || !requestedWeek;
  const week = isRecurring ? RECURRING_WEEK_KEY : requestedWeek;
  const availability = body.availability;
  if (!availability) return new Response(JSON.stringify({ error:"Missing availability" }), { status:400, headers:{ "content-type":"application/json" }});

  await env.DB.prepare(
    `INSERT INTO employee_availability (employee_user_id, week_start, availability_json)
     VALUES (?, ?, ?)
     ON CONFLICT(employee_user_id, week_start) DO UPDATE SET
       availability_json=excluded.availability_json,
       updated_at=datetime('now')`
  ).bind(auth.user.id, week, JSON.stringify(availability)).run();

  return new Response(JSON.stringify({ ok:true, week_start: week, recurring: isRecurring }), { status:200, headers:{ "content-type":"application/json" }});
}
