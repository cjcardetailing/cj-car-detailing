import { sendEmail } from "../../../_lib/email.js";

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
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
    const email = (body.email || "").toLowerCase().trim();

    if (!email) return new Response("Missing email", { status: 400 });

    // Always return OK to avoid email enumeration
    const ok = new Response("ok", { status: 200 });

    // Sanity log (helps debugging)
    if (!env.DB) console.error("env.DB is missing (D1 binding not set)");
    if (!env.EMAIL_API_KEY) console.error("EMAIL_API_KEY missing");
    if (!env.EMAIL_FROM) console.error("EMAIL_FROM missing");

    const user = await env.DB.prepare(
      "SELECT id, email, username FROM users WHERE email = ? AND is_active = 1 LIMIT 1"
    ).bind(email).first();

    if (!user) return ok;

    const token = randomToken();
    const tokenHash = await sha256Hex(token);

    await env.DB.prepare(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, datetime('now', '+1 hour'))`
    ).bind(user.id, tokenHash).run();

    const base = env.PUBLIC_BASE_URL || "https://cjdetailing.shop";
    const resetUrl = `${base}/portal/reset?token=${encodeURIComponent(token)}`;

    await sendEmail(env, {
      to: user.email,
      subject: "Reset your CJ Portal password",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>Reset your password</h2>
          <p>This link expires in 1 hour.</p>
          <p><a href="${resetUrl}">Reset password</a></p>
          <p>If you didn’t request this, ignore this email.</p>
        </div>
      `,
    });

    return ok;
  } catch (err) {
    console.error("Forgot password handler crashed:", err);
    return new Response("server error", { status: 500 });
  }
}
