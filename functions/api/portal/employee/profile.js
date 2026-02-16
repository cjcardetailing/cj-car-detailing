import { requireRole } from "../../../_lib/requireAuth.js";
import { decryptString, maskBank } from "../../../_lib/crypto.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "EMPLOYEE");
  if (!auth.ok) return auth.res;

  const row = await env.DB.prepare(
    `SELECT u.username, u.email, u.phone,
            ep.full_name, ep.dob, ep.age_years, ep.age_months,
            ep.bank_bsb_enc, ep.bank_account_enc, ep.bank_locked
     FROM users u
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`
  ).bind(auth.user.id).first();

  let bank = { bsbMasked: "••••••", accountMasked: "••••••••", hasBank: false };

  if (row?.bank_bsb_enc && row?.bank_account_enc) {
    const bsb = await decryptString(env, row.bank_bsb_enc);
    const acc = await decryptString(env, row.bank_account_enc);
    bank = { ...maskBank(bsb, acc), hasBank: true };
  }

  return new Response(JSON.stringify({
    ok: true,
    profile: {
      username: row.username,
      email: row.email,
      phone: row.phone,
      full_name: row.full_name,
      dob: row.dob,
      age_years: row.age_years,
      age_months: row.age_months,
      bank_locked: row.bank_locked,
      bank,
    }
  }), { status: 200, headers: { "content-type": "application/json" } });
}
