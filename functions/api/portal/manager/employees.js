import { requireRole } from "../../../_lib/requireAuth.js";
import { decryptString, maskBank } from "../../../_lib/crypto.js";

export async function onRequestGet(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const rows = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.phone, u.is_active,
            ep.full_name, ep.dob, ep.age_years, ep.age_months,
            ep.bank_bsb_enc, ep.bank_account_enc, ep.bank_locked
     FROM users u
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE u.role='EMPLOYEE'
     ORDER BY u.username ASC`
  ).all();

  const out = [];
  for (const r of (rows.results || [])) {
    let bank = { hasBank: false, bsbMasked: "••••••", accountMasked: "••••••••" };
    if (r.bank_bsb_enc && r.bank_account_enc) {
      const bsb = await decryptString(env, r.bank_bsb_enc);
      const acc = await decryptString(env, r.bank_account_enc);
      bank = { hasBank: true, ...maskBank(bsb, acc) };
    }
    out.push({
      id: r.id,
      username: r.username,
      email: r.email,
      phone: r.phone,
      is_active: r.is_active,
      full_name: r.full_name,
      dob: r.dob,
      age_years: r.age_years,
      age_months: r.age_months,
      bank_locked: r.bank_locked,
      bank
    });
  }

  return new Response(JSON.stringify({ ok:true, employees: out }), {
    status:200, headers:{ "content-type":"application/json" }
  });
}
