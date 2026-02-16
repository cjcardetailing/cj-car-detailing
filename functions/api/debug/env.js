export async function onRequestGet(context) {
    const { env } = context;
  
    const result = {
      hasDB: !!env.DB,
      has_EMAIL_API_KEY: !!env.EMAIL_API_KEY,
      has_EMAIL_FROM: !!env.EMAIL_FROM,
      has_PUBLIC_BASE_URL: !!env.PUBLIC_BASE_URL,
      emailFrom: env.EMAIL_FROM || null,
      publicBaseUrl: env.PUBLIC_BASE_URL || null,
      tables: null,
      usersTableExists: null,
      passwordResetTableExists: null,
      error: null,
    };
  
    try {
      if (!env.DB) throw new Error("env.DB missing (D1 binding not set in Pages settings)");
  
      const tables = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
      ).all();
  
      result.tables = tables?.results?.map(r => r.name) || [];
  
      result.usersTableExists = result.tables.includes("users");
      result.passwordResetTableExists = result.tables.includes("password_reset_tokens");
    } catch (e) {
      result.error = String(e?.message || e);
    }
  
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  