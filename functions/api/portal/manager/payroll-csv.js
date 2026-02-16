import { requireRole } from "../../../_lib/requireAuth.js";
import { decryptString } from "../../../_lib/crypto.js";
import { formatAUD } from "../../../_lib/money.js";

function csvEscape(v){
  const s = String(v ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

export async function onRequestGet(context){
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return new Response("Missing from/to", { status:400 });

  const rows = await env.DB.prepare(
    `SELECT
        ba.employee_user_id,
        u.username,
        u.email,
        u.phone,
        ep.full_name,
        ep.bank_bsb_enc,
        ep.bank_account_enc,
        SUM(ba.employee_pay_cents) AS employee_pay_cents,
        COUNT(*) AS jobs
     FROM booking_assignments ba
     JOIN bookings b ON b.id = ba.booking_id
     JOIN users u ON u.id = ba.employee_user_id
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE datetime(b.start_time) >= datetime(?) AND datetime(b.start_time) < datetime(?)
     GROUP BY ba.employee_user_id
     ORDER BY employee_pay_cents DESC`
  ).bind(from, to).all();

  let csv = "username,full_name,email,phone,bsb,account,owed,owed_fmt,jobs\n";
  for (const r of (rows.results || [])) {
    const bsb = r.bank_bsb_enc ? await decryptString(env, r.bank_bsb_enc) : "";
    const acc = r.bank_account_enc ? await decryptString(env, r.bank_account_enc) : "";
    const owed = r.employee_pay_cents || 0;
    csv += [
      r.username,
      r.full_name || "",
      r.email || "",
      r.phone || "",
      bsb,
      acc,
      owed,
      formatAUD(owed),
      r.jobs || 0
    ].map(csvEscape).join(",") + "\n";
  }

  return new Response(csv, {
    status:200,
    headers:{
      "content-type":"text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payroll_${from}_to_${to}.csv"`
    }
  });
}
