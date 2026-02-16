export async function onRequestPost(context) {
    const { env, request } = context;
  
    const apiKey = env.EMAIL_API_KEY;
    const from = env.EMAIL_FROM;
  
    if (!apiKey || !from) {
      return new Response("Missing EMAIL_API_KEY or EMAIL_FROM", { status: 500 });
    }
  
    const body = await request.json().catch(() => ({}));
    const to = body.to;
  
    if (!to) {
      return new Response('Send JSON like: {"to":"you@example.com"}', { status: 400 });
    }
  
    const payload = {
      from,
      to: [to],
      subject: "CJ Portal: Resend test",
      html: "<p>If you received this, Resend + Cloudflare Pages Functions are working ✅</p>",
    };
  
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  
    const text = await resp.text();
    return new Response(text, { status: resp.status });
  }
  