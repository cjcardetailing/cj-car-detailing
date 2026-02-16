import { requireRole } from "../../../_lib/requireAuth.js";
import { sendEmail } from "../../../_lib/email.js";
import { hashPasswordPBKDF2 } from "../../../_lib/auth.js";

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function calcAge(dobISO) {
  const dob = new Date(dobISO + "T00:00:00Z");
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  let months = now.getUTCMonth() - dob.getUTCMonth();
  if (now.getUTCDate() < dob.getUTCDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  return { years: Math.max(0, years), months: Math.max(0, months) };
}

async function nextEmployeeUsername(env) {
  const row = await env.DB.prepare(
    `SELECT MAX(CAST(SUBSTR(username, 3) AS INTEGER)) AS mx
     FROM users
     WHERE username LIKE 'cj1%'`
  ).first();

  const mx = row?.mx ? Number(row.mx) : 100000; // employees start cj100001
  const next = mx + 1;
  return `cj${String(next).padStart(6, "0")}`;
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const fullName = (body.full_name || "").trim();
  const dob = (body.dob || "").trim(); // YYYY-MM-DD
  const email = (body.email || "").toLowerCase().trim();
  const phone = (body.phone || "").trim();

  if (!fullName || !dob || !email) {
    return new Response(JSON.stringify({ error: "Missing full_name, dob, or email" }), {
      status: 400, headers: { "content-type": "application/json" }
    });
  }

  const username = await nextEmployeeUsername(env);
  const password = randomPassword();
  const pwHash = await hashPasswordPBKDF2(password, 100000);
  const age = calcAge(dob);

  const res = await env.DB.prepare(
    `INSERT INTO users (username, email, phone, role, password_hash, is_active)
     VALUES (?, ?, ?, 'EMPLOYEE', ?, 1)`
  ).bind(username, email, phone || null, pwHash).run();

  const userId = res.meta.last_row_id;

  await env.DB.prepare(
    `INSERT INTO employee_profiles (user_id, full_name, dob, age_years, age_months, bank_locked)
     VALUES (?, ?, ?, ?, ?, 0)`
  ).bind(userId, fullName, dob, age.years, age.months).run();

  const portalUrl = (env.PUBLIC_BASE_URL || "https://cjdetailing.shop") + "/portal/";

  await sendEmail(env, {
    to: email,
    subject: "Your CJ Portal employee login",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Welcome to CJ Detailing</h2>
        <p>Your employee portal login details:</p>
        <p><b>Portal:</b> <a href="${portalUrl}">${portalUrl}</a></p>
        <p><b>Username:</b> ${username}<br/>
           <b>Temporary Password:</b> ${password}</p>
        <p>After logging in, please fill in your profile details.</p>
      </div>
    `,
  });

  return new Response(JSON.stringify({
    ok: true,
    employee: { username, email, full_name: fullName, age_years: age.years, age_months: age.months }
  }), { status: 200, headers: { "content-type": "application/json" } });
}
