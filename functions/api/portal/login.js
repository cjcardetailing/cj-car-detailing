import { verifyPasswordPBKDF2, createSession, isTrustedDevice } from "../../_lib/auth.js";
import { sendEmail } from "../../_lib/email.js";

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

function genOtp() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
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
    const password = body.password || "";
    const rememberMe = !!body.rememberMe;

    if (!username || !password) return json(400, { error: "Missing username or password" });

    const user = await env.DB.prepare(
      `SELECT id, username, email, role, password_hash, is_active
       FROM users
       WHERE username = ?
       LIMIT 1`
    ).bind(username).first();

    if (!user || user.is_active !== 1) return json(401, { error: "Invalid login" });

    const ok = await verifyPasswordPBKDF2(password, user.password_hash);
    if (!ok) return json(401, { error: "Invalid login" });

    // Manager 2FA unless trusted device
    if (user.role === "MANAGER") {
      const trusted = await isTrustedDevice(env, request, user.id);
      if (!trusted) {
        const otp = genOtp();
        const otpHash = await sha256Hex(otp);

        await env.DB.prepare(
          `INSERT INTO manager_otp (user_id, otp_hash, expires_at)
           VALUES (?, ?, datetime('now', '+10 minutes'))`
        ).bind(user.id, otpHash).run();

        await sendEmail(env, {
          to: user.email,
          subject: "Your CJ Portal login code",
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5">
              <h2>Login verification code</h2>
              <p>Your code is:</p>
              <p style="font-size:24px;letter-spacing:2px;"><b>${otp}</b></p>
              <p>This code expires in 10 minutes.</p>
            </div>
          `,
        });

        // tell frontend to prompt for OTP
        return json(200, { needsOtp: true });
      }
    }

    const { setCookie } = await createSession(env, user.id, rememberMe);

    return new Response(JSON.stringify({ ok: true, role: user.role }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": setCookie,
      },
    });
  } catch (err) {
    console.error("login crashed:", err);
    return json(500, { error: "server error" });
  }
}
