function sha256Hex(str) {
    const enc = new TextEncoder();
    return crypto.subtle.digest("SHA-256", enc.encode(str)).then((buf) => {
      const bytes = new Uint8Array(buf);
      return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    });
  }
  
  async function hashPassword(password) {
    // Cloudflare Workers: we can use WebCrypto PBKDF2
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      key,
      256
    );
    const hashBytes = new Uint8Array(bits);
  
    const saltHex = [...salt].map(b => b.toString(16).padStart(2,"0")).join("");
    const hashHex = [...hashBytes].map(b => b.toString(16).padStart(2,"0")).join("");
    return `pbkdf2_sha256$100000$${saltHex}$${hashHex}`;
  }
  
  export async function onRequestPost(context) {
    const { env, request } = context;
    const { token, newPassword } = await request.json().catch(() => ({}));
  
    if (!token || !newPassword || newPassword.length < 10) {
      return new Response("Invalid request", { status: 400 });
    }
  
    const tokenHash = await sha256Hex(token);
  
    const row = await env.DB.prepare(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = ?
       LIMIT 1`
    ).bind(tokenHash).first();
  
    if (!row) return new Response("Invalid token", { status: 400 });
    if (row.used_at) return new Response("Token already used", { status: 400 });
  
    // expires_at stored as SQLite datetime string
    const expired = await env.DB.prepare(
      `SELECT CASE WHEN datetime('now') > datetime(?) THEN 1 ELSE 0 END AS expired`
    ).bind(row.expires_at).first();
  
    if (expired?.expired === 1) return new Response("Token expired", { status: 400 });
  
    const pwHash = await hashPassword(newPassword);
  
    // Update password + mark token used
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(pwHash, row.user_id),
      env.DB.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`).bind(row.id),
    ]);
  
    return new Response("ok", { status: 200 });
  }
  