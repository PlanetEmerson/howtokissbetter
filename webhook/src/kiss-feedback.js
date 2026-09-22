import { sendFeedbackEmail } from "./delivery.js";
import {
  corsHeaders,
  emptyResponse,
  jsonResponse,
  originAllowed,
  redirect,
  refererAllowed,
  siteOrigin,
} from "./http.js";

const PRODUCTS = new Set(["book", "report"]);
const BACK_PATHS = new Set(["/book/thanks/", "/kiss-test/result/"]);
const WORTH = new Set(["yes", "no"]);
const NAME = /^[A-Za-z .'-]{0,40}$/;
const NOTE_MAX = 500;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1_000;

// Post-purchase feedback: a plain form post from the download page or the
// paid report, forwarded to the owner as one email. Nothing is stored; the
// sender's address is never known and the IP lives only in the rate map.
export function createKissFeedbackHandler({
  env,
  sendEmail = (fields) => sendFeedbackEmail(env, fetch, fields),
  now = () => Date.now(),
}) {
  // Per instance: a warm function remembers recent posters, a cold start
  // forgets them. A courtesy limit, not a wall.
  const recent = new Map();

  function overLimit(ip) {
    const stamp = now();
    const cutoff = stamp - RATE_WINDOW_MS;
    for (const [key, stamps] of recent) {
      if (stamps[stamps.length - 1] < cutoff) {
        recent.delete(key);
      }
    }
    const stamps = (recent.get(ip) || []).filter((seen) => seen >= cutoff);
    recent.set(ip, stamps);
    if (stamps.length >= RATE_LIMIT) {
      return true;
    }
    stamps.push(stamp);
    return false;
  }

  return async function handleKissFeedback(request) {
    const origin = request.headers?.origin;
    if (request.method === "OPTIONS") {
      return emptyResponse(204, corsHeaders(origin, env));
    }
    if (request.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    }
    if (!(origin ? originAllowed(origin, env) : refererAllowed(request.headers?.referer, env))) {
      return jsonResponse(403, { ok: false, error: "bad_origin" });
    }
    if (request.bodyText === null) {
      return jsonResponse(413, { ok: false, error: "too_large" });
    }

    // A form post cannot consume JSON, so every outcome from here is a
    // redirect back to the page; an unknown back path lands on the homepage.
    const form = new URLSearchParams(request.bodyText);
    const back = form.get("back") || "";
    const landing = `${siteOrigin(env)}${BACK_PATHS.has(back) ? back : "/"}`;
    if (form.get("website")) {
      return redirect(`${landing}?feedback=sent`);
    }

    const fields = {
      product: form.get("product") || "",
      worth: form.get("worth") || "",
      note: (form.get("note") || "").replace(/\s+/g, " ").trim(),
      quoteOk: form.get("quote_ok") === "1",
      name: (form.get("name") || "").trim(),
    };
    const valid = PRODUCTS.has(fields.product)
      && WORTH.has(fields.worth)
      && BACK_PATHS.has(back)
      && fields.note.length <= NOTE_MAX
      && NAME.test(fields.name);
    if (!valid) {
      return redirect(`${landing}?feedback=invalid`);
    }

    const ip = (request.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    if (!overLimit(ip)) {
      await sendEmail(fields);
    }
    return redirect(`${landing}?feedback=sent`);
  };
}
