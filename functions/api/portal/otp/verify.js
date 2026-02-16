import { createSession, createTrustedDevice } from "../../../_lib/auth.js";

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  const bytes = new Uint8Array(buf);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json().catch(() => ({}));
    const username = (body.username || "").trim();
    const otp = (body.otp || "").trim();
    const rememberMe = !!body.rememberMe;
    const trustDevice = !!body.trustDevice;

    if (!username || !otp) return json(400, { error: "Missing username or code" });

    const user = await env.DB.prepare(
      `SELECT id, username, email, role, is_active
       FROM users WHERE username = ? LIMIT 1`
    ).bind(username).first();

    if (!user || user.is_active !== 1 || user.role !== "MANAGER") return json(401, { error: "Invalid" });

    const otpHash = await sha256Hex(otp);

    const row = await env.DB.prepare(
      `SELECT id, expires_at, used_at
       FROM manager_otp
       WHERE user_id = ? AND otp_hash = ?
       ORDER BY id DESC
       LIMIT 1`
    ).bind(user.id, otpHash).first();

    if (!row || row.used_at) return json(401, { error: "Invalid code" });

    const expired = await env.DB.prepare(
      `SELECT CASE WHEN datetime('now') > datetime(?) THEN 1 ELSE 0 END AS expired`
    ).bind(row.expires_at).first();

    if (expired?.expired === 1) return json(401, { error: "Code expired" });

    await env.DB.prepare(
      `UPDATE manager_otp SET used_at = datetime('now') WHERE id = ?`
    ).bind(row.id).run();

    const { setCookie } = await createSession(env, user.id, rememberMe);

    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", setCookie);

    if (trustDevice) {
      const { setCookie: trustCookie } = await createTrustedDevice(env, user.id);
      headers.append("set-cookie", trustCookie);
    }

    return new Response(JSON.stringify({ ok: true, role: "MANAGER" }), { status: 200, headers });
  } catch (err) {
    console.error("otp verify crashed:", err);
    return json(500, { error: "server error" });
  }
}
