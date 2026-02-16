import { requireRole } from "../../../_lib/requireAuth.js";

export async function onRequestGet(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const rows = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.role, ep.full_name
     FROM users u
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE u.role IN ('EMPLOYEE','MANAGER') AND u.is_active=1
     ORDER BY u.username ASC`
  ).all();

  return new Response(JSON.stringify({ ok:true, employees: rows.results || [] }), {
    status:200, headers:{ "content-type":"application/json" }
  });
}
