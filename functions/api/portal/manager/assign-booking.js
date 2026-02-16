import { requireRole } from "../../../_lib/requireAuth.js";
import { parsePriceCentsFromTitle, employeePayCents, managerEachCents } from "../../../_lib/money.js";
import { extractCarsCount } from "../../../_lib/bookingCars.js";
const RECURRING_WEEK_KEY = "__RECURRING__";

function parseDateTime(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;

  const m = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const hh = Number(m[4] || 0);
  const mm = Number(m[5] || 0);
  const ss = Number(m[6] || 0);
  const dt = new Date(y, mo, d, hh, mm, ss, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toYmdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mondayWeekStartYmd(date) {
  const d = new Date(date.getTime());
  const dayFromMonday = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - dayFromMonday);
  return toYmdLocal(d);
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function normalizeRanges(ranges) {
  const clean = [];
  for (const item of ranges || []) {
    const start = String(item?.start || "");
    const end = String(item?.end || "");
    const sm = start.match(/^(\d{2}):(\d{2})$/);
    const em = end.match(/^(\d{2}):(\d{2})$/);
    if (!sm || !em) continue;
    const startMin = Number(sm[1]) * 60 + Number(sm[2]);
    const endMin = Number(em[1]) * 60 + Number(em[2]);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin >= endMin) continue;
    clean.push({ startMin, endMin });
  }
  clean.sort((a, b) => a.startMin - b.startMin);
  const merged = [];
  for (const r of clean) {
    if (!merged.length || r.startMin > merged[merged.length - 1].endMin) {
      merged.push({ startMin: r.startMin, endMin: r.endMin });
    } else {
      merged[merged.length - 1].endMin = Math.max(merged[merged.length - 1].endMin, r.endMin);
    }
  }
  return merged;
}

function weekdayKey(date) {
  const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[date.getDay()] || "";
}

function getRangesForBooking(availabilityPayload, startAt) {
  if (!availabilityPayload || typeof availabilityPayload !== "object") return [];

  const day = weekdayKey(startAt);
  if (availabilityPayload.by_weekday && typeof availabilityPayload.by_weekday === "object") {
    return normalizeRanges(availabilityPayload.by_weekday[day] || []);
  }

  if (availabilityPayload.by_day && typeof availabilityPayload.by_day === "object") {
    return normalizeRanges(availabilityPayload.by_day[toYmdLocal(startAt)] || []);
  }

  return [];
}

function isWithinAvailability(ranges, startAt, endAt) {
  const startMin = minutesOfDay(startAt);
  const endMin = endAt ? minutesOfDay(endAt) : startMin;
  return ranges.some((r) => startMin >= r.startMin && endMin <= r.endMin);
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
    `SELECT id, title, payload_json, start_time, end_time
     FROM bookings WHERE id = ? LIMIT 1`
  ).bind(bookingId).first();

  if (!booking) return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404, headers: { "content-type": "application/json" } });

  const employee = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND role='EMPLOYEE' AND is_active=1 LIMIT 1`
  ).bind(employeeUserId).first();

  if (!employee) return new Response(JSON.stringify({ error: "Employee not found" }), { status: 404, headers: { "content-type": "application/json" } });

  const startAt = parseDateTime(booking.start_time);
  if (!startAt) {
    return new Response(JSON.stringify({ error: "Booking has an invalid start_time." }), {
      status: 400, headers: { "content-type": "application/json" }
    });
  }
  const endAt = parseDateTime(booking.end_time);

  const weekStart = mondayWeekStartYmd(startAt);
  const availRows = await env.DB.prepare(
    `SELECT week_start, availability_json
     FROM employee_availability
     WHERE employee_user_id = ? AND week_start IN (?, ?)`
  ).bind(employeeUserId, weekStart, RECURRING_WEEK_KEY).all();

  const rows = availRows.results || [];
  const weekRow = rows.find((r) => r.week_start === weekStart);
  const recurringRow = rows.find((r) => r.week_start === RECURRING_WEEK_KEY);
  const chosen = weekRow || recurringRow || null;

  let availabilityPayload = null;
  try {
    availabilityPayload = chosen?.availability_json ? JSON.parse(chosen.availability_json) : null;
  } catch {
    availabilityPayload = null;
  }
  const ranges = getRangesForBooking(availabilityPayload, startAt);
  const hasAvailabilityConfigured = ranges.length > 0;

  // Only enforce the time window when availability is actually configured.
  // If the employee has not saved availability yet, allow managers to assign.
  if (hasAvailabilityConfigured && !isWithinAvailability(ranges, startAt, endAt)) {
    return new Response(JSON.stringify({
      error: "You can't assign this booking because it is outside that employee's saved availability."
    }), {
      status: 409, headers: { "content-type": "application/json" }
    });
  }

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
