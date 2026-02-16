import { getSessionUser } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { env, request } = context;

  const user = await getSessionUser(env, request);
  if (!user) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });

  return new Response(JSON.stringify({ ok: true, user: { username: user.username, email: user.email, role: user.role } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
