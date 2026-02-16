import { deleteSession, parseCookies, clearCookie } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { env, request } = context;

  const cookies = parseCookies(request.headers.get("cookie"));
  const raw = cookies["cj_portal_session"];

  if (raw) await deleteSession(env, raw);

  return new Response("ok", {
    status: 200,
    headers: {
      "set-cookie": clearCookie("cj_portal_session"),
      "content-type": "text/plain",
    },
  });
}
