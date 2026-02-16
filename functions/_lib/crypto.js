function b64encode(bytes) {
    let s = "";
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s);
  }
  
  function b64decode(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  
  function hexToBytes(hex) {
    const pairs = hex.match(/.{1,2}/g) || [];
    return new Uint8Array(pairs.map((p) => parseInt(p, 16)));
  }
  
  async function getAesKey(env) {
    const hex = env.ENCRYPTION_KEY;
    if (!hex) throw new Error("Missing ENCRYPTION_KEY");
    const raw = hexToBytes(hex);
    // Use first 32 bytes for AES-256
    const keyBytes = raw.length >= 32 ? raw.slice(0, 32) : raw;
    return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  
  export async function encryptString(env, plaintext) {
    if (plaintext == null || plaintext === "") return null;
    const key = await getAesKey(env);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
    const out = new Uint8Array(iv.length + ct.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(ct), iv.length);
    return b64encode(out);
  }
  
  export async function decryptString(env, b64) {
    if (!b64) return null;
    const key = await getAesKey(env);
    const bytes = b64decode(b64);
    const iv = bytes.slice(0, 12);
    const ct = bytes.slice(12);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  }
  
  export function maskBank(bsb, account) {
    const b = (bsb || "").replace(/\D/g, "");
    const a = (account || "").replace(/\D/g, "");
    const bMasked = b.length >= 6 ? `${b.slice(0,2)}••••` : "••••••";
    const aMasked = a.length >= 4 ? `•••••${a.slice(-4)}` : "••••••••";
    return { bsbMasked: bMasked, accountMasked: aMasked };
  }
  