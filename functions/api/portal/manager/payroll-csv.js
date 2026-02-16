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
  const employeeUserIdRaw = url.searchParams.get("employee_user_id");
  const employeeUserId = employeeUserIdRaw ? Number(employeeUserIdRaw) : null;
  if (!from || !to || (employeeUserIdRaw && !Number.isFinite(employeeUserId))) return new Response("Missing/invalid from/to", { status:400 });

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
        SUM(ba.total_price_cents) AS total_price_cents,
        SUM(ba.cars_count) AS cars_washed,
        COUNT(*) AS jobs
     FROM booking_assignments ba
     JOIN bookings b ON b.id = ba.booking_id
     JOIN users u ON u.id = ba.employee_user_id
     LEFT JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE datetime(b.start_time) >= datetime(?) AND datetime(b.start_time) < datetime(?)
       AND (? IS NULL OR ba.employee_user_id = ?)
     GROUP BY ba.employee_user_id
     ORDER BY employee_pay_cents DESC`
  ).bind(from, to, employeeUserId, employeeUserId).all();

  let csv = "username,full_name,email,phone,bsb,account,money_earned,money_earned_fmt,cars_washed,jobs,effective_rate_pct,pay_rule\n";
  for (const r of (rows.results || [])) {
    const bsb = r.bank_bsb_enc ? await decryptString(env, r.bank_bsb_enc) : "";
    const acc = r.bank_account_enc ? await decryptString(env, r.bank_account_enc) : "";
    const owed = r.employee_pay_cents || 0;
    const total = r.total_price_cents || 0;
    const effectiveRate = total > 0 ? Math.round((owed / total) * 1000) / 10 : 0;
    csv += [
      r.username,
      r.full_name || "",
      r.email || "",
      r.phone || "",
      bsb,
      acc,
      owed,
      formatAUD(owed),
      r.cars_washed || 0,
      r.jobs || 0,
      effectiveRate,
      "20% rounded up to nearest $5 per booking",
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
