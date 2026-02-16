const SESSION_COOKIE = "cj_portal_session";
const TRUST_COOKIE = "cj_portal_trust";

function hexFromBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return hexFromBuffer(buf);
}

function randomToken(bytesLen = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLen));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(";");

  for (const p of parts) {
    const [k, ...rest] = p.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("=") || "");
  }
  return out;
}

function cookie(name, value, { maxAgeSeconds, path = "/", httpOnly = true, secure = true, sameSite = "Lax" } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) c += "; HttpOnly";
  if (secure) c += "; Secure";
  if (typeof maxAgeSeconds === "number") c += `; Max-Age=${maxAgeSeconds}`;
  return c;
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure`;
}

async function hashPasswordPBKDF2(password, iterations = 100000) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256
  );
  const saltHex = [...salt].map(b => b.toString(16).padStart(2,"0")).join("");
  const hashHex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2,"0")).join("");
  return `pbkdf2_sha256$${iterations}$${saltHex}$${hashHex}`;
}

async function verifyPasswordPBKDF2(password, stored) {
  // stored format: pbkdf2_sha256$<iter>$<saltHex>$<hashHex>
  const parts = (stored || "").split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2_sha256" || parts[1] !== "") return false;

  const iterations = parseInt(parts[2], 10);
  const saltHex = parts[3];
  const expectedHex = parts[4];

  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256
  );
  const actualHex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2,"0")).join("");

  // timing-safe-ish compare
  if (actualHex.length !== expectedHex.length) return false;
  let out = 0;
  for (let i = 0; i < actualHex.length; i++) out |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return out === 0;
}

async function createSession(env, userId, rememberMe) {
  const raw = randomToken(32);
  const hash = await sha256Hex(raw);

  const maxAgeSeconds = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24; // 30d or 1d
  // store expiry in DB
  await env.DB.prepare(
    `INSERT INTO sessions (user_id, session_token_hash, expires_at, last_seen_at)
     VALUES (?, ?, datetime('now', ?), datetime('now'))`
  ).bind(userId, hash, `+${maxAgeSeconds} seconds`).run();

  const setCookie = cookie(SESSION_COOKIE, raw, { maxAgeSeconds });
  return { setCookie, maxAgeSeconds };
}

async function deleteSession(env, rawToken) {
  if (!rawToken) return;
  const hash = await sha256Hex(rawToken);
  await env.DB.prepare("DELETE FROM sessions WHERE session_token_hash = ?").bind(hash).run();
}

async function getSessionUser(env, request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;

  const hash = await sha256Hex(raw);

  const row = await env.DB.prepare(
    `SELECT s.user_id, u.username, u.email, u.role, u.is_active, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_token_hash = ?
     LIMIT 1`
  ).bind(hash).first();

  if (!row) return null;

  // expire check (SQLite comparison)
  const exp = await env.DB.prepare(
    `SELECT CASE WHEN datetime('now') > datetime(?) THEN 1 ELSE 0 END AS expired`
  ).bind(row.expires_at).first();

  if (exp?.expired === 1 || row.is_active !== 1) {
    await env.DB.prepare("DELETE FROM sessions WHERE session_token_hash = ?").bind(hash).run();
    return null;
  }

  // update last seen
  await env.DB.prepare(
    `UPDATE sessions SET last_seen_at = datetime('now') WHERE session_token_hash = ?`
  ).bind(hash).run();

  return { id: row.user_id, username: row.username, email: row.email, role: row.role, rawSession: raw };
}

// Trusted device (manager 2FA skip)
async function isTrustedDevice(env, request, userId) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const raw = cookies[TRUST_COOKIE];
  if (!raw) return false;

  const hash = await sha256Hex(raw);
  const row = await env.DB.prepare(
    `SELECT expires_at FROM trusted_devices WHERE user_id = ? AND device_token_hash = ? LIMIT 1`
  ).bind(userId, hash).first();

  if (!row) return false;

  const exp = await env.DB.prepare(
    `SELECT CASE WHEN datetime('now') > datetime(?) THEN 1 ELSE 0 END AS expired`
  ).bind(row.expires_at).first();

  return exp?.expired === 0;
}

async function createTrustedDevice(env, userId) {
  const raw = randomToken(32);
  const hash = await sha256Hex(raw);
  const maxAgeSeconds = 60 * 60 * 24 * 30; // 30d

  await env.DB.prepare(
    `INSERT INTO trusted_devices (user_id, device_token_hash, expires_at)
     VALUES (?, ?, datetime('now', '+30 days'))`
  ).bind(userId, hash).run();

  const setCookie = cookie(TRUST_COOKIE, raw, { maxAgeSeconds });
  return { setCookie, maxAgeSeconds };
}

export {
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
  createSession,
  deleteSession,
  getSessionUser,
  isTrustedDevice,
  createTrustedDevice,
  parseCookies,
  clearCookie,
};
