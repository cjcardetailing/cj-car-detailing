import { requireRole } from "../../../_lib/requireAuth.js";
import { encryptString } from "../../../_lib/crypto.js";

export async function onRequestPost(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const phone = (body.phone || "").trim();
  const email = (body.email || "").toLowerCase().trim();

  const fullName = (body.full_name || "").trim();
  const dob = (body.dob || "").trim(); // YYYY-MM-DD

  const bsb = (body.bsb || "").trim();
  const acc = (body.account || "").trim();

  const prof = await env.DB.prepare(
    `SELECT bank_locked FROM employee_profiles WHERE user_id = ? LIMIT 1`
  ).bind(auth.user.id).first();

  const bankLocked = prof?.bank_locked === 1;

  // Update email/phone (allowed)
  if (email) {
    await env.DB.prepare(`UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(email, auth.user.id).run();
  }
  if (phone) {
    await env.DB.prepare(`UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(phone, auth.user.id).run();
  }

  // Update profile fields
  if (fullName || dob) {
    await env.DB.prepare(
      `UPDATE employee_profiles
       SET full_name = COALESCE(?, full_name),
           dob = COALESCE(?, dob),
           updated_at = datetime('now')
       WHERE user_id = ?`
    ).bind(fullName || null, dob || null, auth.user.id).run();
  }

  // Bank: only if not locked
  if ((bsb || acc) && bankLocked) {
    return new Response(JSON.stringify({ error: "Bank details are locked. Ask a manager to change them." }), {
      status: 403, headers: { "content-type": "application/json" }
    });
  }

  if (bsb && acc) {
    const bEnc = await encryptString(env, bsb);
    const aEnc = await encryptString(env, acc);

    await env.DB.prepare(
      `UPDATE employee_profiles
       SET bank_bsb_enc = ?, bank_account_enc = ?, bank_locked = 1, updated_at = datetime('now')
       WHERE user_id = ?`
    ).bind(bEnc, aEnc, auth.user.id).run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "content-type": "application/json" }
  });
}
