import { getSessionUser } from "./auth.js";

export async function requireUser(env, request) {
  const user = await getSessionUser(env, request);
  if (!user) return { ok: false, res: new Response("unauthorized", { status: 401 }) };
  return { ok: true, user };
}

export async function requireRole(env, request, role) {
  const r = await requireUser(env, request);
  if (!r.ok) return r;
  if (r.user.role !== role) return { ok: false, res: new Response("forbidden", { status: 403 }) };
  return r;
}
