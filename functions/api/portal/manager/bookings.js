import { requireRole } from "../../../_lib/requireAuth.js";
import { parsePriceCentsFromTitle } from "../../../_lib/money.js";

const CARS_Q = "How many cars need detailing? Price will vary depending on amount of cars";

function extractCarsCount(payload) {
  try {
    // payload_json contains Cal payload
    // Your screenshot shows this as a question/answer entry.
    // We’ll search common shapes safely.
    if (!payload) return 1;

    // 1) payload.responses?.[question] = "1"
    if (payload.responses && payload.responses[CARS_Q]) {
      const n = parseInt(payload.responses[CARS_Q], 10);
      return Number.isFinite(n) && n > 0 ? n : 1;
    }

    // 2) payload.questionsAndAnswers: [{question, answer}]
    const qa = payload.questionsAndAnswers || payload.customInputs || payload.answers;
    if (Array.isArray(qa)) {
      const hit = qa.find(x => (x.question || x.label || "").trim() === CARS_Q);
      const ans = hit?.answer ?? hit?.value;
      const n = parseInt(ans, 10);
      return Number.isFinite(n) && n > 0 ? n : 1;
    }

    // 3) payload.metadata?.[question]
    if (payload.metadata && payload.metadata[CARS_Q]) {
      const n = parseInt(payload.metadata[CARS_Q], 10);
      return Number.isFinite(n) && n > 0 ? n : 1;
    }

    return 1;
  } catch {
    return 1;
  }
}

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
      `SELECT id, cal_booking_id, status, start_time, end_time, title, location, payload_json
       FROM bookings
       WHERE start_time < datetime('now') AND status='ACTIVE'
       ORDER BY start_time DESC
       LIMIT ?`
    ).bind(limit).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT id, cal_booking_id, status, start_time, end_time, title, location, payload_json
       FROM bookings
       WHERE start_time >= datetime('now') AND status='ACTIVE'
       ORDER BY start_time ASC
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
    };
  });

  return new Response(JSON.stringify({ ok: true, bookings: data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
