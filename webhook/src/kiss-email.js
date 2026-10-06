import { corsHeaders, emptyResponse, jsonResponse, originAllowed, refererAllowed, siteOrigin } from "./http.js";
import { loadKissReport, loadKissScore } from "./kiss-engine.js";

const BREVO_DOI_ENDPOINT = "https://api.brevo.com/v3/contacts/doubleOptinConfirmation";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1_000;

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

// "Email me my result" on the free Kiss Test result: one Brevo double opt-in
// whose contact attributes carry the result, computed here from the answers
// (never numbers the browser sends), so the confirmation and the follow-ups
// can quote it. Nothing is stored here; the address and the answers go to
// Brevo only, and neither is ever logged.
export function createKissEmailHandler({
  env,
  fetchImpl = fetch,
  loadScore = loadKissScore,
  loadReport = loadKissReport,
  now = () => Date.now(),
}) {
  // Every send is a Brevo email to whatever address was typed, so one IP gets
  // a few per window. Per instance, like kiss-feedback: a courtesy limit.
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

  return async function handleKissEmail(request) {
    const origin = request.headers?.origin;
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") {
      return emptyResponse(204, cors);
    }
    const fail = (status, error) => jsonResponse(status, { ok: false, error }, cors);
    if (request.method !== "POST") {
      return fail(405, "method_not_allowed");
    }
    if (!(origin ? originAllowed(origin, env) : refererAllowed(request.headers?.referer, env))) {
      return fail(403, "bad_origin");
    }
    if (request.bodyText === null) {
      return fail(413, "too_large");
    }

    let body;
    try {
      body = JSON.parse(request.bodyText);
    } catch {
      return fail(400, "bad_request");
    }
    if (!body || typeof body !== "object") {
      return fail(400, "bad_request");
    }
    // The hidden field only a bot fills: told it worked, nothing sent.
    if (body.website) {
      return jsonResponse(200, { ok: true }, cors);
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (email.length > EMAIL_MAX || !EMAIL.test(email)) {
      return fail(400, "bad_email");
    }
    if (body.adult !== true) {
      return fail(400, "adult_required");
    }
    if (typeof body.answers !== "string") {
      return fail(400, "bad_request");
    }

    const [engine, reporter] = await Promise.all([loadScore(), loadReport()]);
    if (!engine || !reporter) {
      return fail(501, "report_unavailable");
    }
    const answers = body.answers.trim().toLowerCase();
    if (!engine.isValidAnswers(answers)) {
      return fail(400, "bad_request");
    }

    const ip = (request.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    if (overLimit(ip)) {
      return fail(429, "rate_limited");
    }

    const listId = positiveInt(env.BREVO_KISS_TEST_LIST_ID);
    const templateId = positiveInt(env.BREVO_KISS_TEST_DOI_TEMPLATE_ID);
    if (!env.BREVO_API_KEY || !listId || !templateId) {
      return fail(503, "email_unavailable");
    }

    // Every attribute is a string: the KT_* attributes are text-typed in Brevo.
    // A perfect score has no costliest habit, so KT_COSTLIEST is left out.
    const { free } = reporter.buildReport(answers);
    const attributes = {
      KT_ARCHETYPE: free.archetype.name,
      KT_SCORE: String(free.score),
      KT_BAND: free.band.label,
      ...(free.costliestHabit ? { KT_COSTLIEST: engine.applyPronouns(free.costliestHabit.title) } : {}),
      KT_ANSWERS: answers,
      KT_SIGNUP: new Date().toISOString().slice(0, 10),
      KT_SOURCE: "result-email",
    };

    try {
      const response = await fetchImpl(BREVO_DOI_ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          email,
          includeListIds: [listId],
          templateId,
          redirectionUrl: `${siteOrigin(env)}/kiss-test/result/?email=confirmed#a=${answers}`,
          attributes,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status === 201 || response.status === 204) {
        return jsonResponse(200, { ok: true }, cors);
      }
      // Provider status and error code only; never the address or the answers.
      let code = "";
      try {
        code = String((await response.json())?.code ?? "");
      } catch {
        code = "";
      }
      console.warn("brevo_doi_failed", response.status, code);
    } catch (error) {
      console.warn("brevo_doi_failed", "network", error?.name ?? "");
    }
    return fail(502, "email_failed");
  };
}
