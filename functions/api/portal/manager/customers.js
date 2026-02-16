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

async function ensureCustomerTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS customer_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      time_since_last_wash TEXT NOT NULL,
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

  const customers = (rows.results || []).map((r) => ({
    id: Number(r.id),
    full_name: r.full_name || "",
    time_since_last_wash: r.time_since_last_wash || "",
    customer_type: r.customer_type || "NORMAL",
    lifetime_value_cents: Number(r.lifetime_value_cents || 0),
    lifetime_value: Number(r.lifetime_value_cents || 0) / 100,
    phone_number: r.phone_number || "",
    created_at: r.created_at || null,
    created_by_username: r.created_by_username || null,
  }));

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
  const timeSinceLastWash = String(body.time_since_last_wash || "").trim();
  const customerType = normalizeCustomerType(body.customer_type);
  const lifetimeValueCents = parseLifetimeValueToCents(body.lifetime_value);
  const phoneNumber = formatPhone(body.phone_number);

  if (!fullName) return badRequest("full_name is required");
  if (!timeSinceLastWash) return badRequest("time_since_last_wash is required");
  if (!customerType) return badRequest("customer_type must be REGULAR or NORMAL");
  if (!Number.isInteger(lifetimeValueCents) || lifetimeValueCents < 0) {
    return badRequest("lifetime_value must be a valid amount");
  }
  if (!phoneNumber) return badRequest("phone_number is required");

  const insert = await env.DB.prepare(
    `INSERT INTO customer_contacts
      (full_name, time_since_last_wash, customer_type, lifetime_value_cents, phone_number, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    fullName,
    timeSinceLastWash,
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
        time_since_last_wash: timeSinceLastWash,
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
