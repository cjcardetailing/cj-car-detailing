import { requireRole } from "../../../_lib/requireAuth.js";
import { encryptString } from "../../../_lib/crypto.js";

export async function onRequestPost(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const employeeId = Number(body.employee_user_id);
  if (!employeeId) {
    return new Response(JSON.stringify({ error:"Missing employee_user_id" }), { status:400, headers:{ "content-type":"application/json" }});
  }

  const email = (body.email || "").toLowerCase().trim();
  const phone = (body.phone || "").trim();
  const active = body.is_active;

  const fullName = (body.full_name || "").trim();
  const dob = (body.dob || "").trim(); // YYYY-MM-DD

  const bsb = (body.bsb || "").trim();
  const account = (body.account || "").trim();

  // update users fields
  if (email) await env.DB.prepare(`UPDATE users SET email=?, updated_at=datetime('now') WHERE id=?`).bind(email, employeeId).run();
  if (phone) await env.DB.prepare(`UPDATE users SET phone=?, updated_at=datetime('now') WHERE id=?`).bind(phone, employeeId).run();
  if (active === 0 || active === 1) await env.DB.prepare(`UPDATE users SET is_active=?, updated_at=datetime('now') WHERE id=?`).bind(active, employeeId).run();

  // update profile fields
  if (fullName || dob) {
    await env.DB.prepare(
      `UPDATE employee_profiles
       SET full_name = COALESCE(?, full_name),
           dob = COALESCE(?, dob),
           updated_at = datetime('now')
       WHERE user_id = ?`
    ).bind(fullName || null, dob || null, employeeId).run();
  }

  // bank update always allowed for managers
  if (bsb && account) {
    const bEnc = await encryptString(env, bsb);
    const aEnc = await encryptString(env, account);
    await env.DB.prepare(
      `UPDATE employee_profiles
       SET bank_bsb_enc=?, bank_account_enc=?, bank_locked=1, updated_at=datetime('now')
       WHERE user_id=?`
    ).bind(bEnc, aEnc, employeeId).run();
  }

  return new Response(JSON.stringify({ ok:true }), { status:200, headers:{ "content-type":"application/json" }});
}
