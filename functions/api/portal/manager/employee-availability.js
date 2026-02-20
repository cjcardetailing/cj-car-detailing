import { requireRole } from "../../../_lib/requireAuth.js";

const RECURRING_WEEK_KEY = "__RECURRING__";

export async function onRequestGet(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const url = new URL(request.url);
  const employeeUserId = Number(url.searchParams.get("employee_user_id") || 0);
  const requestedWeek = String(url.searchParams.get("week_start") || "").trim();

  if (!Number.isInteger(employeeUserId) || employeeUserId <= 0) {
    return new Response(JSON.stringify({ error: "employee_user_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const employee = await env.DB.prepare(
    `SELECT u.id, u.username, ep.full_name
     FROM users u
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE u.id = ? AND u.role='EMPLOYEE' AND u.is_active=1
     LIMIT 1`
  ).bind(employeeUserId).first();

  if (!employee) {
    return new Response(JSON.stringify({ error: "Employee not found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  }

  const firstWeekKey = requestedWeek || RECURRING_WEEK_KEY;
  let row = await env.DB.prepare(
    `SELECT availability_json
     FROM employee_availability
     WHERE employee_user_id = ? AND week_start = ?
     LIMIT 1`
  ).bind(employeeUserId, firstWeekKey).first();

  let resolvedWeekKey = firstWeekKey;
  if (!row && requestedWeek) {
    row = await env.DB.prepare(
      `SELECT availability_json
       FROM employee_availability
       WHERE employee_user_id = ? AND week_start = ?
       LIMIT 1`
    ).bind(employeeUserId, RECURRING_WEEK_KEY).first();
    if (row) resolvedWeekKey = RECURRING_WEEK_KEY;
  }

  let availability = null;
  try {
    availability = row?.availability_json ? JSON.parse(row.availability_json) : null;
  } catch {
    availability = null;
  }

  return new Response(JSON.stringify({
    ok: true,
    employee: {
      id: Number(employee.id),
      username: employee.username || "",
      full_name: employee.full_name || ""
    },
    week_start: requestedWeek || null,
    resolved_week_start: resolvedWeekKey,
    recurring: resolvedWeekKey === RECURRING_WEEK_KEY,
    availability
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
