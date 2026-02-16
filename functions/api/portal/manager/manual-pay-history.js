import { requireRole } from "../../../_lib/requireAuth.js";
import { isManualPayTableMissingError } from "../../../_lib/manualPay.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  let rows;
  try {
    rows = await env.DB.prepare(
      `SELECT
          mpe.id,
          mpe.employee_user_id,
          mpe.job_time,
          mpe.cars_count,
          mpe.job_type,
          mpe.pay_cents,
          mpe.created_at,
          u.username AS employee_username,
          ep.full_name AS employee_full_name,
          mu.username AS created_by_username
       FROM manual_pay_entries mpe
       JOIN users u ON u.id = mpe.employee_user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN users mu ON mu.id = mpe.created_by_user_id
       ORDER BY datetime(mpe.job_time) DESC, mpe.id DESC
       LIMIT 200`
    ).all();
  } catch (err) {
    if (!isManualPayTableMissingError(err)) throw err;
    return new Response(JSON.stringify({
      ok: false,
      entries: [],
      message: "Manual pay is not available yet. Run the latest migration to enable it.",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, entries: rows.results || [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
