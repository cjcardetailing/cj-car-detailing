import { requireRole } from "../../../_lib/requireAuth.js";

function badRequest(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

function formatPhone(value) {
  return String(value || "").trim();
}

function normalizeCustomerType(value) {
  const type = String(value || "").trim().toUpperCase();
  if (type === "REGULAR") return "REGULAR";
  if (type === "NORMAL") return "NORMAL";
  return null;
}

function parseLifetimeValueToCents(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100);
  }
  const raw = String(value ?? "").trim().replace(/[$,\s]/g, "");
  if (!raw) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function todayISODateUTC() {
  return new Date().toISOString().slice(0, 10);
}

function daysSinceDate(isoDate) {
  const start = new Date(`${isoDate}T00:00:00Z`);
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffMs = end.getTime() - start.getTime();
  const days = Math.floor(diffMs / 86400000);
  return Math.max(0, days);
}

function humanizeDaysSince(days) {
  if (!Number.isInteger(days) || days < 0) return "Unknown";
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ${days % 7 ? `${days % 7} day${days % 7 === 1 ? "" : "s"}` : ""}`.trim();
  }
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ${days % 30 ? `${days % 30} day${days % 30 === 1 ? "" : "s"}` : ""}`.trim();
}

async function ensureCustomerTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS customer_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      time_since_last_wash TEXT NOT NULL,
      last_wash_date TEXT,
      customer_type TEXT NOT NULL CHECK(customer_type IN ('REGULAR', 'NORMAL')),
      lifetime_value_cents INTEGER NOT NULL DEFAULT 0 CHECK(lifetime_value_cents >= 0),
      phone_number TEXT NOT NULL,
      created_by_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_customer_contacts_created_at ON customer_contacts(created_at DESC)`
  ).run();

  const cols = await env.DB.prepare(`PRAGMA table_info(customer_contacts)`).all();
  const names = new Set((cols.results || []).map((c) => String(c.name || "")));
  if (!names.has("last_wash_date")) {
    await env.DB.prepare(`ALTER TABLE customer_contacts ADD COLUMN last_wash_date TEXT`).run();
    await env.DB.prepare(
      `UPDATE customer_contacts
       SET last_wash_date = COALESCE(substr(created_at, 1, 10), strftime('%Y-%m-%d','now'))
       WHERE last_wash_date IS NULL OR trim(last_wash_date) = ''`
    ).run();
  }
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  await ensureCustomerTable(env);

  const rows = await env.DB.prepare(
    `SELECT
      cc.id,
      cc.full_name,
      cc.time_since_last_wash,
      cc.last_wash_date,
      cc.customer_type,
      cc.lifetime_value_cents,
      cc.phone_number,
      cc.created_at,
      u.username AS created_by_username
     FROM customer_contacts cc
     LEFT JOIN users u ON u.id = cc.created_by_user_id
     ORDER BY datetime(cc.created_at) DESC, cc.id DESC
     LIMIT 300`
  ).all();

  const customers = (rows.results || []).map((r) => {
    const lastWashDate = r.last_wash_date || (r.created_at ? String(r.created_at).slice(0, 10) : null) || todayISODateUTC();
    const sinceDays = daysSinceDate(lastWashDate);
    const computedSince = humanizeDaysSince(sinceDays);
    return {
      id: Number(r.id),
      full_name: r.full_name || "",
      time_since_last_wash: computedSince,
      time_since_last_wash_days: Number.isInteger(sinceDays) ? sinceDays : null,
      last_wash_date: lastWashDate,
      customer_type: r.customer_type || "NORMAL",
      lifetime_value_cents: Number(r.lifetime_value_cents || 0),
      lifetime_value: Number(r.lifetime_value_cents || 0) / 100,
      phone_number: r.phone_number || "",
      created_at: r.created_at || null,
      created_by_username: r.created_by_username || null,
    };
  });

  return new Response(JSON.stringify({ ok: true, customers }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  await ensureCustomerTable(env);

  const body = await request.json().catch(() => ({}));
  const fullName = String(body.full_name || "").trim();
  const lastWashDateRaw = String(body.last_wash_date || "").trim();
  const lastWashDate = isISODate(lastWashDateRaw) ? lastWashDateRaw : todayISODateUTC();
  const customerType = normalizeCustomerType(body.customer_type);
  const lifetimeValueCents = parseLifetimeValueToCents(body.lifetime_value);
  const phoneNumber = formatPhone(body.phone_number);

  if (!fullName) return badRequest("full_name is required");
  if (!customerType) return badRequest("customer_type must be REGULAR or NORMAL");
  if (!Number.isInteger(lifetimeValueCents) || lifetimeValueCents < 0) {
    return badRequest("lifetime_value must be a valid amount");
  }
  if (!phoneNumber) return badRequest("phone_number is required");

  const insert = await env.DB.prepare(
    `INSERT INTO customer_contacts
      (full_name, time_since_last_wash, last_wash_date, customer_type, lifetime_value_cents, phone_number, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    fullName,
    "Today",
    lastWashDate,
    customerType,
    lifetimeValueCents,
    phoneNumber,
    Number(auth.user.id)
  ).run();

  return new Response(
    JSON.stringify({
      ok: true,
      customer: {
        id: Number(insert.meta?.last_row_id || 0),
        full_name: fullName,
        time_since_last_wash: "Today",
        time_since_last_wash_days: 0,
        last_wash_date: lastWashDate,
        customer_type: customerType,
        lifetime_value_cents: lifetimeValueCents,
        lifetime_value: lifetimeValueCents / 100,
        phone_number: phoneNumber,
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}

export async function onRequestPut(context) {
  const { env, request } = context;
  const auth = await requireRole(env, request, "MANAGER");
  if (!auth.ok) return auth.res;

  await ensureCustomerTable(env);

  const body = await request.json().catch(() => ({}));
  const customerId = Number(body.id || 0);
  const lastWashDate = String(body.last_wash_date || "").trim();

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return badRequest("id must be a valid customer id");
  }
  if (!isISODate(lastWashDate)) {
    return badRequest("last_wash_date must be YYYY-MM-DD");
  }

  const updated = await env.DB.prepare(
    `UPDATE customer_contacts
     SET last_wash_date = ?, time_since_last_wash = 'Today'
     WHERE id = ?`
  ).bind(lastWashDate, customerId).run();

  if (!updated.meta?.changes) {
    return new Response(JSON.stringify({ error: "customer not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
