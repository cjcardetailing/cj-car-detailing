import { requireRole } from "../../../_lib/requireAuth.js";
import { parsePriceCentsFromTitle, employeePayCents, managerEachCents } from "../../../_lib/money.js";

const CARS_Q = "How many cars need detailing? Price will vary depending on amount of cars";

function extractCarsCount(payload) {
  try {
    if (payload?.responses && payload.responses[CARS_Q]) {
      const n = parseInt(payload.responses[CARS_Q], 10);
      return Number.isFinite(n) && n > 0 ? n : 1;
    }
    const qa = payload?.questionsAndAnswers || payload?.customInputs || payload?.answers;
    if (Array.isArray(qa)) {
      const hit = qa.find(x => (x.question || x.label || "").trim() === CARS_Q);
      const ans = hit?.answer ?? hit?.value;
      const n = parseInt(ans, 10);
      return Number.isFinite(n) && n > 0 ? n : 1;
    }
    if (payload?.metadata && payload.metadata[CARS_Q]) {
      const n = parseInt(payload.metadata[CARS_Q], 10);
      return Number.isFinite(n) && n > 0 ? n : 1;
    }
    return 1;
  } catch { return 1; }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const bookingId = Number(body.booking_id);
  const employeeUserId = Number(body.employee_user_id);
  const notes = (body.notes || "").trim();

  if (!bookingId || !employeeUserId) {
    return new Response(JSON.stringify({ error: "Missing booking_id or employee_user_id" }), {
      status: 400, headers: { "content-type": "application/json" }
    });
  }

  const booking = await env.DB.prepare(
    `SELECT id, title, payload_json
     FROM bookings WHERE id = ? LIMIT 1`
  ).bind(bookingId).first();

  if (!booking) return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404, headers: { "content-type": "application/json" } });

  const employee = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND role='EMPLOYEE' AND is_active=1 LIMIT 1`
  ).bind(employeeUserId).first();

  if (!employee) return new Response(JSON.stringify({ error: "Employee not found" }), { status: 404, headers: { "content-type": "application/json" } });

  const payload = JSON.parse(booking.payload_json || "{}");
  const cars = extractCarsCount(payload);
  const unit = parsePriceCentsFromTitle(booking.title) ?? 0;
  const total = unit * cars;

  const empPay = employeePayCents(total);
  const mgrEach = managerEachCents(total, empPay);

  await env.DB.prepare(
    `INSERT INTO booking_assignments
      (booking_id, employee_user_id, cars_count, unit_price_cents, total_price_cents, employee_pay_cents, manager_each_cents, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(booking_id) DO UPDATE SET
       employee_user_id=excluded.employee_user_id,
       cars_count=excluded.cars_count,
       unit_price_cents=excluded.unit_price_cents,
       total_price_cents=excluded.total_price_cents,
       employee_pay_cents=excluded.employee_pay_cents,
       manager_each_cents=excluded.manager_each_cents,
       notes=excluded.notes,
       assigned_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
  ).bind(bookingId, employeeUserId, cars, unit, total, empPay, mgrEach, notes || null).run();

  return new Response(JSON.stringify({ ok: true, booking_id: bookingId, employee_user_id: employeeUserId, total_price_cents: total }), {
    status: 200, headers: { "content-type": "application/json" }
  });
}
