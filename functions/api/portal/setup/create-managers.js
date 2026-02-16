import { sendEmail } from "../../../_lib/email.js";

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    key,
    256
  );
  const hashBytes = new Uint8Array(bits);

  const saltHex = [...salt].map(b => b.toString(16).padStart(2,"0")).join("");
  const hashHex = [...hashBytes].map(b => b.toString(16).padStart(2,"0")).join("");
  return `pbkdf2_sha256$150000$${saltHex}$${hashHex}`;
}

function json(status, obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    // ---- Config checks ----
    const setupKey = env.PORTAL_SETUP_KEY;
    if (!setupKey) return json(500, { error: "Missing PORTAL_SETUP_KEY env var" });

    const headerKey = request.headers.get("x-setup-key");
    if (headerKey !== setupKey) return json(401, { error: "unauthorized" });

    const m1 = (env.MANAGER1_EMAIL || "").toLowerCase().trim();
    const m2 = (env.MANAGER2_EMAIL || "").toLowerCase().trim();
    if (!m1 || !m2) return json(500, { error: "Missing MANAGER1_EMAIL or MANAGER2_EMAIL" });

    if (!env.DB) return json(500, { error: "Missing DB binding (env.DB undefined)" });

    // ---- Prevent running twice ----
    const existing = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM users WHERE role='MANAGER'"
    ).first();

    if ((existing?.c || 0) > 0) {
      return json(400, { error: "Managers already exist" });
    }

    // ---- Create managers ----
    const managers = [
      { username: "cj000001", email: m1 },
      { username: "cj000002", email: m2 },
    ];

    const created = [];

    for (const mgr of managers) {
      const pw = randomPassword();
      const pwHash = await hashPassword(pw);

      await env.DB.prepare(
        `INSERT INTO users (username, email, role, password_hash, is_active)
         VALUES (?, ?, 'MANAGER', ?, 1)`
      ).bind(mgr.username, mgr.email, pwHash).run();

      created.push({ ...mgr, password: pw });
    }

    // ---- Email credentials ----
    const portalUrl = (env.PUBLIC_BASE_URL || "https://cjdetailing.shop") + "/portal";

    for (const mgr of created) {
      try {
        const resendResp = await sendEmail(env, {
          to: mgr.email,
          subject: "Your CJ Portal manager login",
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5">
              <h2>CJ Portal Manager Access</h2>
              <p><b>Portal:</b> <a href="${portalUrl}">${portalUrl}</a></p>
              <p><b>Username:</b> ${mgr.username}<br/>
                 <b>Temporary Password:</b> ${mgr.password}</p>
              <p><i>Please change your password after logging in.</i></p>
            </div>
          `,
        });

        console.log("Resend OK:", resendResp);
      } catch (emailErr) {
        // If email fails, we still return success but report email failure
        console.error("Resend FAILED:", emailErr);
        return json(500, {
          error: "Managers created, but email sending failed",
          details: String(emailErr?.message || emailErr),
          created: created.map(c => ({ username: c.username, email: c.email })),
        });
      }
    }

    return json(200, {
      ok: true,
      created: created.map(c => ({ username: c.username, email: c.email })),
    });
  } catch (err) {
    console.error("create-managers crashed:", err);
    return json(500, { error: "server error", details: String(err?.message || err) });
  }
}
