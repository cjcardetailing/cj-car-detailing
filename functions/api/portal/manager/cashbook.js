import { requireRole } from "../../../_lib/requireAuth.js";
import { formatAUD } from "../../../_lib/money.js";
import {
  ensureDashboardTables,
  getPeriodRange,
  parseAmountToCents,
  sanitizeExpenseCategory,
  toISODateLocal,
} from "../../../_lib/dashboard.js";

function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function normalizeEntryType(value) {
  const v = String(value || "").trim().toUpperCase();
  if (v === "CASH") return "CASH";
  if (v === "EXPENSE") return "EXPENSE";
  return null;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  await ensureDashboardTables(env);

  const url = new URL(request.url);
  const range = getPeriodRange(url.searchParams.get("period"));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 15)));

  const summary = await env.DB.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN entry_type='CASH' THEN amount_cents ELSE 0 END), 0) AS cash_collected_cents,
      COALESCE(SUM(CASE WHEN entry_type='EXPENSE' THEN amount_cents ELSE 0 END), 0) AS expenses_cents
    FROM cashbook_entries
    WHERE datetime(entry_date || ' 00:00:00') >= datetime(?)
      AND datetime(entry_date || ' 00:00:00') < datetime(?)`
  ).bind(range.fromDateTime, range.toDateTime).first();

  const rows = await env.DB.prepare(
    `SELECT
      ce.id,
      ce.entry_type,
      ce.entry_date,
      ce.amount_cents,
      ce.category,
      ce.note,
      ce.linked_booking_id,
      b.title AS linked_booking_title
    FROM cashbook_entries ce
    LEFT JOIN bookings b ON b.id = ce.linked_booking_id
    WHERE datetime(ce.entry_date || ' 00:00:00') >= datetime(?)
      AND datetime(ce.entry_date || ' 00:00:00') < datetime(?)
    ORDER BY datetime(ce.entry_date || ' 00:00:00') DESC, ce.id DESC
    LIMIT ?`
  ).bind(range.fromDateTime, range.toDateTime, limit).all();

  const entries = (rows.results || []).map((r) => ({
    id: Number(r.id),
    type: r.entry_type === "EXPENSE" ? "Expense" : "Cash",
    date: r.entry_date || "",
    amount_cents: Number(r.amount_cents || 0),
    amount_fmt: formatAUD(Number(r.amount_cents || 0)),
    category: r.category || null,
    note: r.note || "",
    linked_booking_id: r.linked_booking_id ? Number(r.linked_booking_id) : null,
    linked_booking_label: r.linked_booking_title || null,
  }));

  const cashCollectedCents = Number(summary?.cash_collected_cents || 0);
  const expensesCents = Number(summary?.expenses_cents || 0);

  return new Response(
    JSON.stringify({
      ok: true,
      period: range.period,
      range: { from: range.fromDate, to: range.toDate, label: range.label },
      summary: {
        cash_collected_cents: cashCollectedCents,
        cash_collected_fmt: formatAUD(cashCollectedCents),
        expenses_cents: expensesCents,
        expenses_fmt: formatAUD(expensesCents),
      },
      entries,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  await ensureDashboardTables(env);

  const body = await request.json().catch(() => ({}));
  const entryType = normalizeEntryType(body.type);
  const amountCents = parseAmountToCents(body.amount);
  const today = toISODateLocal(new Date());
  const entryDate = String(body.date || today).trim();
  const note = String(body.note || "").trim();
  const linkedBookingId = body.linked_booking_id ? Number(body.linked_booking_id) : null;

  if (!entryType) {
    return new Response(JSON.stringify({ error: "type must be CASH or EXPENSE" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return new Response(JSON.stringify({ error: "amount must be greater than 0" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!isISODate(entryDate)) {
    return new Response(JSON.stringify({ error: "date must be YYYY-MM-DD" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let category = null;
  if (entryType === "EXPENSE") {
    category = sanitizeExpenseCategory(body.category);
    if (!category) {
      return new Response(
        JSON.stringify({ error: "category must be one of: Materials, Fuel, Supplies, Other" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
  }

  if (linkedBookingId && (!Number.isFinite(linkedBookingId) || linkedBookingId <= 0)) {
    return new Response(JSON.stringify({ error: "linked_booking_id must be a valid booking id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (linkedBookingId) {
    const linked = await env.DB.prepare(
      `SELECT id FROM bookings WHERE id = ?`
    ).bind(linkedBookingId).first();
    if (!linked) {
      return new Response(JSON.stringify({ error: "linked booking was not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
  }

  const insert = await env.DB.prepare(
    `INSERT INTO cashbook_entries
      (entry_type, amount_cents, entry_date, category, note, linked_booking_id, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    entryType,
    amountCents,
    entryDate,
    category,
    note || null,
    linkedBookingId || null,
    Number(auth.user.id)
  ).run();

  return new Response(
    JSON.stringify({
      ok: true,
      entry: {
        id: Number(insert.meta?.last_row_id || 0),
        type: entryType === "EXPENSE" ? "Expense" : "Cash",
        date: entryDate,
        amount_cents: amountCents,
        amount_fmt: formatAUD(amountCents),
        category,
        note,
        linked_booking_id: linkedBookingId || null,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
