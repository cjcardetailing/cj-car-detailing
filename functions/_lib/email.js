export async function sendEmail(env, { to, subject, html }) {
    const apiKey = env.EMAIL_API_KEY;
    const from = env.EMAIL_FROM;
  
    if (!apiKey || !from) {
      throw new Error("Missing EMAIL_API_KEY or EMAIL_FROM");
    }
  
    const payload = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };
  
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`Resend error (${resp.status}): ${text}`);
    }
  
    return text;
  }
  