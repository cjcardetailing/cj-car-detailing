function hexFromBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return hex;
  }
  
  function timingSafeEqual(a, b) {
    // Constant-time-ish compare for strings of equal length
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return out === 0;
  }
  
  async function computeHmacSha256Hex(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return hexFromBuffer(sig);
  }
  
  function normalizeSigHeader(sigHeaderRaw) {
    if (!sigHeaderRaw) return null;
    // Some systems prefix signatures like "sha256=<hex>".
    // Cal docs just say compare header with computed hash, format may vary.
    // We'll accept either raw hex or "sha256=<hex>" just in case.
    const lower = sigHeaderRaw.trim().toLowerCase();
    if (lower.startsWith("sha256=")) return lower.slice("sha256=".length);
    return lower;
  }
  
  export async function onRequestPost(context) {
    const { request, env } = context;
  
    const sigHeader = request.headers.get("x-cal-signature-256") || request.headers.get("X-Cal-Signature-256");
    const secret = env.CAL_WEBHOOK_SECRET;
  
    if (!secret) {
      console.error("Missing CAL_WEBHOOK_SECRET in environment variables");
      return new Response("server not configured", { status: 500 });
    }
  
    // IMPORTANT: we must use the *raw body text* exactly as received for HMAC
    const rawBody = await request.text();
  
    const headerSig = normalizeSigHeader(sigHeader);
    if (!headerSig) {
      console.warn("Missing signature header");
      return new Response("missing signature", { status: 401 });
    }
  
    const computedSig = await computeHmacSha256Hex(secret, rawBody);
  
    if (!timingSafeEqual(headerSig, computedSig)) {
      console.warn("Invalid signature", { headerSig, computedSig });
      return new Response("invalid signature", { status: 401 });
    }
  
    // Parse JSON
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (e) {
      console.error("Invalid JSON payload", e);
      return new Response("invalid json", { status: 400 });
    }
  
    // Store raw event (audit trail)
    try {
      await env.DB.prepare(
        `INSERT INTO cal_webhook_events (trigger_event, created_at, signature, raw_json)
         VALUES (?, ?, ?, ?)`
      )
        .bind(
          event?.triggerEvent ?? null,
          event?.createdAt ?? null,
          sigHeader ?? null,
          rawBody
        )
        .run();
    } catch (e) {
      console.error("Failed to insert cal_webhook_events", e);
      // continue; don't fail the whole webhook on audit insert
    }
  
    // Extract booking payload
    const payload = event?.payload ?? {};
    const trigger = (event?.triggerEvent ?? "").toUpperCase();
  
    // Try common Cal fields; we keep payload_json anyway so we can adjust later
    const calBookingId =
      payload?.uid ||
      payload?.id ||
      payload?.bookingUid ||
      payload?.bookingId ||
      null;
  
    const startTime = payload?.startTime || payload?.start || payload?.start_time || null;
    const endTime = payload?.endTime || payload?.end || payload?.end_time || null;
  
    const customerName =
      payload?.attendees?.[0]?.name ||
      payload?.responses?.name ||
      payload?.name ||
      null;
  
    const customerEmail =
      payload?.attendees?.[0]?.email ||
      payload?.responses?.email ||
      payload?.email ||
      null;
  
    const title = payload?.title || payload?.eventType?.title || null;
    const location = payload?.location || payload?.metadata?.location || null;
  
    const status = trigger.includes("CANCEL") ? "CANCELLED" : "ACTIVE";
    const payloadJson = JSON.stringify(payload);
  
    // Upsert into bookings
    // If calBookingId is missing, we still store a row (but uniqueness won't apply)
    try {
      if (calBookingId) {
        await env.DB.prepare(
          `INSERT INTO bookings
            (cal_booking_id, status, start_time, end_time, customer_name, customer_email, location, title, payload_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ','now')))
           ON CONFLICT(cal_booking_id) DO UPDATE SET
             status=excluded.status,
             start_time=excluded.start_time,
             end_time=excluded.end_time,
             customer_name=excluded.customer_name,
             customer_email=excluded.customer_email,
             location=excluded.location,
             title=excluded.title,
             payload_json=excluded.payload_json,
             updated_at=(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
        )
          .bind(
            calBookingId,
            status,
            startTime,
            endTime,
            customerName,
            customerEmail,
            location,
            title,
            payloadJson
          )
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO bookings
            (cal_booking_id, status, start_time, end_time, customer_name, customer_email, location, title, payload_json, updated_at)
           VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`
        )
          .bind(
            status,
            startTime,
            endTime,
            customerName,
            customerEmail,
            location,
            title,
            payloadJson
          )
          .run();
      }
    } catch (e) {
      console.error("Failed to upsert booking", e);
      return new Response("db error", { status: 500 });
    }
  
    console.log("Cal webhook saved booking:", { calBookingId, status, trigger });
    return new Response("ok", { status: 200 });
  }
  