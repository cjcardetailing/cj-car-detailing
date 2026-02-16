import { requireRole } from "../../../_lib/requireAuth.js";
import { parsePriceCentsFromTitle } from "../../../_lib/money.js";
import { extractCarsCount } from "../../../_lib/bookingCars.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const url = new URL(request.url);
  const mode = (url.searchParams.get("mode") || "upcoming").toLowerCase();
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

  let rows;
  if (mode === "past") {
    rows = await env.DB.prepare(
      `SELECT
         b.id, b.cal_booking_id, b.status, b.start_time, b.end_time, b.title, b.location, b.payload_json,
         ba.employee_user_id, ba.completed_at,
         u.username AS assigned_username,
         ep.full_name AS assigned_full_name
       FROM bookings b
       LEFT JOIN booking_assignments ba ON ba.booking_id = b.id
       LEFT JOIN users u ON u.id = ba.employee_user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = ba.employee_user_id
       WHERE b.start_time < datetime('now') AND b.status='ACTIVE'
       ORDER BY b.start_time DESC
       LIMIT ?`
    ).bind(limit).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT
         b.id, b.cal_booking_id, b.status, b.start_time, b.end_time, b.title, b.location, b.payload_json,
         ba.employee_user_id, ba.completed_at,
         u.username AS assigned_username,
         ep.full_name AS assigned_full_name
       FROM bookings b
       LEFT JOIN booking_assignments ba ON ba.booking_id = b.id
       LEFT JOIN users u ON u.id = ba.employee_user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = ba.employee_user_id
       WHERE b.start_time >= datetime('now')
         AND b.status='ACTIVE'
         AND (ba.completed_at IS NULL OR ba.booking_id IS NULL)
       ORDER BY b.start_time ASC
       LIMIT ?`
    ).bind(limit).all();
  }

  const data = (rows.results || []).map(r => {
    const payload = JSON.parse(r.payload_json || "{}");
    const cars = extractCarsCount(payload);
    const unit = parsePriceCentsFromTitle(r.title) ?? 0;
    const total = unit * cars;
    return {
      id: r.id,
      cal_booking_id: r.cal_booking_id,
      start_time: r.start_time,
      end_time: r.end_time,
      title: r.title,
      location: r.location,
      cars_count: cars,
      unit_price_cents: unit,
      total_price_cents: total,
      employee_user_id: r.employee_user_id ? Number(r.employee_user_id) : null,
      completed_at: r.completed_at || null,
      assigned_employee: r.employee_user_id
        ? {
            user_id: Number(r.employee_user_id),
            username: r.assigned_username || "",
            full_name: r.assigned_full_name || "",
          }
        : null,
    };
  });

  return new Response(JSON.stringify({ ok: true, bookings: data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
