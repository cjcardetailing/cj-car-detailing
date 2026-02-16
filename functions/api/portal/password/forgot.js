import { sendEmail } from "../../../_lib/email.js";

function sha256Hex(str) {
  // Cloudflare Workers runtime supports crypto.subtle
  const enc = new TextEncoder();
  return crypto.subtle.digest("SHA-256", enc.encode(str)).then((buf) => {
    const bytes = new Uint8Array(buf);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const { email } = await request.json().catch(() => ({}));

  if (!email) return new Response("Missing email", { status: 400 });

  // Always respond 200 to avoid account enumeration
  const ok = new Response("ok", { status: 200 });

  // Find user
  const user = await env.DB.prepare(
    "SELECT id, email, username FROM users WHERE email = ? LIMIT 1"
  ).bind(email.toLowerCase()).first();

  if (!user) return ok;

  const token = randomToken();
  const tokenHash = await sha256Hex(token);

  // 1 hour expiry
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
        <p>Click the link below to reset your CJ Portal password. This link expires in 1 hour.</p>
        <p><a href="${resetUrl}">Reset password</a></p>
        <p>If you didn’t request this, you can ignore this email.</p>
      </div>
    `,
  });

  return ok;
}
