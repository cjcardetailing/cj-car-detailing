export async function onRequestPost(context) {
    try {
      // This is just a temporary "plumbing test" handler.
      // We'll add Cal signature verification + DB writing next.
      const bodyText = await context.request.text();
  
      // Log something small (don't spam huge payloads)
      console.log("Cal webhook hit:", {
        length: bodyText.length,
        hasSig: !!context.request.headers.get("x-cal-signature-256"),
        contentType: context.request.headers.get("content-type"),
      });
  
      return new Response("ok", { status: 200 });
    } catch (err) {
      console.error("Webhook error:", err);
      return new Response("error", { status: 500 });
    }
  }
  