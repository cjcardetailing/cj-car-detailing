import { requireRole } from "../../../_lib/requireAuth.js";
import { getPeriodRange } from "../../../_lib/dashboard.js";

function bookingStatusLabel(row) {
  if (String(row.status || "").toUpperCase() === "CANCELLED") return "Cancelled";
  if (row.completed_at) return "Completed";

  const start = new Date(row.start_time || "");
  if (!isNaN(start.getTime()) && start.getTime() <= Date.now() && row.employee_user_id) {
    return "In progress";
  }
  return "Scheduled";
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  const url = new URL(request.url);
  const range = getPeriodRange(url.searchParams.get("period"));

  const todayRows = await env.DB.prepare(
    `SELECT
      b.id,
      b.start_time,
      b.customer_name,
      b.title,
      b.status,
      ba.employee_user_id,
      ba.completed_at,
      u.username AS employee_username,
      ep.full_name AS employee_full_name
    FROM bookings b
    LEFT JOIN booking_assignments ba ON ba.booking_id = b.id
    LEFT JOIN users u ON u.id = ba.employee_user_id
    LEFT JOIN employee_profiles ep ON ep.user_id = ba.employee_user_id
    WHERE date(datetime(b.start_time, 'localtime')) = date('now', 'localtime')
    ORDER BY datetime(b.start_time, 'localtime') ASC
    LIMIT 200`
  ).all();

  let list = todayRows.results || [];
  let usingUpcomingFallback = false;

  if (!list.length) {
    const upcomingRows = await env.DB.prepare(
      `SELECT
        b.id,
        b.start_time,
        b.customer_name,
        b.title,
        b.status,
        ba.employee_user_id,
        ba.completed_at,
        u.username AS employee_username,
        ep.full_name AS employee_full_name
      FROM bookings b
      LEFT JOIN booking_assignments ba ON ba.booking_id = b.id
      LEFT JOIN users u ON u.id = ba.employee_user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = ba.employee_user_id
      WHERE datetime(b.start_time, 'localtime') >= datetime('now', 'localtime')
      ORDER BY datetime(b.start_time, 'localtime') ASC
      LIMIT 5`
    ).all();
    list = upcomingRows.results || [];
    usingUpcomingFallback = true;
  }

  const unassignedCounter = await env.DB.prepare(
    `SELECT COALESCE(COUNT(*), 0) AS count
     FROM bookings b
     LEFT JOIN booking_assignments ba ON ba.booking_id = b.id
     WHERE b.status = 'ACTIVE'
       AND ba.employee_user_id IS NULL
       AND datetime(b.start_time, 'localtime') >= datetime(?)
       AND datetime(b.start_time, 'localtime') < datetime(?)`
  ).bind(range.fromDateTime, range.toDateTime).first();

  const lateCounter = await env.DB.prepare(
    `SELECT COALESCE(COUNT(*), 0) AS count
     FROM bookings b
     LEFT JOIN booking_assignments ba ON ba.booking_id = b.id
     WHERE b.status = 'ACTIVE'
       AND datetime(b.start_time, 'localtime') < datetime('now', 'localtime')
       AND (ba.completed_at IS NULL OR ba.booking_id IS NULL)
       AND datetime(b.start_time, 'localtime') >= datetime(?)
       AND datetime(b.start_time, 'localtime') < datetime(?)`
  ).bind(range.fromDateTime, range.toDateTime).first();

  const bookings = list.map((r) => ({
    id: Number(r.id),
    start_time: r.start_time || "",
    customer_name: r.customer_name || "Customer",
    service_name: r.title || "Detail Service",
    assigned_employee: r.employee_full_name || r.employee_username || "Unassigned",
    employee_user_id: r.employee_user_id ? Number(r.employee_user_id) : null,
    status: bookingStatusLabel(r),
  }));

  return new Response(
    JSON.stringify({
      ok: true,
      period: range.period,
      range: { from: range.fromDate, to: range.toDate, label: range.label },
      using_upcoming_fallback: usingUpcomingFallback,
      bookings,
      counters: {
        unassigned_jobs: Number(unassignedCounter?.count || 0),
        late_jobs: Number(lateCounter?.count || 0),
      },
      awaiting_manager_approval_supported: false,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
