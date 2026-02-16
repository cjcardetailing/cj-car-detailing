import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";
import { isManualPayTableMissingError } from "../../../_lib/manualPay.js";

function parseAmountToCents(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 0) return null;
    return Math.round(value * 100);
  }
  const raw = String(value ?? "").trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const employeeUserId = Number(body.employee_user_id);
  const jobTime = String(body.job_time || "").trim();
  const carsCount = Number(body.cars_count);
  const jobType = String(body.job_type || "").trim();
  const payCents = parseAmountToCents(body.pay_amount);

  if (!Number.isFinite(employeeUserId) || employeeUserId <= 0) {
    return new Response(JSON.stringify({ error: "employee_user_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!jobTime) {
    return new Response(JSON.stringify({ error: "job_time is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!Number.isInteger(carsCount) || carsCount <= 0 || carsCount > 100) {
    return new Response(JSON.stringify({ error: "cars_count must be an integer from 1 to 100" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!jobType || jobType.length > 120) {
    return new Response(JSON.stringify({ error: "job_type is required (max 120 chars)" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!Number.isInteger(payCents) || payCents < 0) {
    return new Response(JSON.stringify({ error: "pay_amount must be a valid amount (e.g. 120 or 120.50)" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const employee = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND role = 'EMPLOYEE' AND is_active = 1`
  ).bind(employeeUserId).first();
  if (!employee) {
    return new Response(JSON.stringify({ error: "Employee not found or inactive" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  let insert;
  try {
    insert = await env.DB.prepare(
      `INSERT INTO manual_pay_entries
        (employee_user_id, created_by_user_id, job_time, cars_count, job_type, pay_cents)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(employeeUserId, auth.user.id, jobTime, carsCount, jobType, payCents).run();
  } catch (err) {
    if (!isManualPayTableMissingError(err)) throw err;
    return new Response(JSON.stringify({
      error: "Manual pay is not available yet. Please run the latest database migration and try again.",
    }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    entry: {
      id: insert.meta?.last_row_id || null,
      employee_user_id: employeeUserId,
      job_time: jobTime,
      cars_count: carsCount,
      job_type: jobType,
      pay_cents: payCents,
      pay_fmt: formatAUD(payCents),
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
