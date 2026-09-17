export const ALLOWED_ORIGINS = ["https://howtokissbetter.com", "https://www.howtokissbetter.com"];

export function allowedOrigins(env) {
  const extra = (env?.KISS_EXTRA_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...ALLOWED_ORIGINS, ...extra];
}

export function siteOrigin(env) {
  return env?.KISS_SITE_ORIGIN || "https://howtokissbetter.com";
}

export function originAllowed(origin, env) {
  return typeof origin === "string" && allowedOrigins(env).includes(origin);
}

export function refererAllowed(referer, env) {
  return (
    typeof referer === "string"
    && allowedOrigins(env).some((origin) => referer === origin || referer.startsWith(`${origin}/`))
  );
}

export function corsHeaders(origin, env) {
  if (!originAllowed(origin, env)) {
    return {};
  }
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}

// Returns null when the body is over the cap, by declared or by measured size.
export async function readBody(request, maxBytes) {
  if (Number(request.headers.get("content-length") || 0) > maxBytes) {
    return null;
  }
  const text = await request.text();
  return Buffer.byteLength(text, "utf8") > maxBytes ? null : text;
}

export async function plainRequest(request, maxBytes) {
  return {
    method: request.method,
    headers: Object.fromEntries(request.headers),
    bodyText: await readBody(request, maxBytes),
  };
}

export function emptyResponse(status, headers = {}) {
  return new Response(null, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function redirect(location) {
  return emptyResponse(303, { location });
}

// Last-resort guard for the route adapters: a thrown error inside a handler
// (for example a broken optional module) must still produce our own response,
// never the platform's generic error page.
export async function guarded(run, onError) {
  try {
    return await run();
  } catch {
    return onError();
  }
}
