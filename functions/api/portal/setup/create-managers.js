import { sendEmail } from "../../../_lib/email.js";

function randomPassword() {
  // 24 chars, strong. We'll include mixed chars.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  const bytes = new Uint8Array(buf);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
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

// This endpoint is protected by a one-time key so nobody can call it publicly.
function unauthorized() {
  return new Response("unauthorized", { status: 401 });
}

export async function onRequestPost(context) {
  const { env, request } = context;

  const setupKey = env.PORTAL_SETUP_KEY;
  if (!setupKey) {
    return new Response("Missing PORTAL_SETUP_KEY env var", { status: 500 });
  }

  const headerKey = request.headers.get("x-setup-key");
  if (headerKey !== setupKey) return unauthorized();

  const m1 = (env.MANAGER1_EMAIL || "").toLowerCase().trim();
  const m2 = (env.MANAGER2_EMAIL || "").toLowerCase().trim();
  if (!m1 || !m2) return new Response("Missing MANAGER1_EMAIL or MANAGER2_EMAIL", { status: 500 });

  // Prevent running twice: if any manager exists, stop.
  const existing = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE role='MANAGER'"
  ).first();

  if ((existing?.c || 0) > 0) {
    return new Response("Managers already exist", { status: 400 });
  }

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

  // Email both managers
  const portalUrl = (env.PUBLIC_BASE_URL || "https://cjdetailing.shop") + "/portal";

  for (const mgr of created) {
    await sendEmail(env, {
      to: mgr.email,
      subject: "Your CJ Portal manager login",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>CJ Portal Manager Access</h2>
          <p>Use the details below to log in:</p>
          <p><b>Portal:</b> <a href="${portalUrl}">${portalUrl}</a></p>
          <p><b>Username:</b> ${mgr.username}<br/>
             <b>Temporary Password:</b> ${mgr.password}</p>
          <p><i>After you log in, you can change your password.</i></p>
        </div>
      `,
    });
  }

  return new Response(JSON.stringify({ ok: true, created: created.map(c => ({ username: c.username, email: c.email })) }, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
