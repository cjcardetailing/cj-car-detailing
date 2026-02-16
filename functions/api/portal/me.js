import { getSessionUser } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { env, request } = context;

  const user = await getSessionUser(env, request);
  if (!user) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });

  let full_name = null;
  if (user.role === "MANAGER") {
    const profile = await env.DB.prepare(
      "SELECT full_name FROM manager_profiles WHERE user_id = ?"
    ).bind(user.id).first();
    full_name = profile?.full_name || null;
  }

  const displayName = full_name || user.username;

  return new Response(JSON.stringify({
    ok: true,
    user: {
      username: user.username,
      email: user.email,
      role: user.role,
      full_name: full_name,
      display_name: displayName
    }
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
