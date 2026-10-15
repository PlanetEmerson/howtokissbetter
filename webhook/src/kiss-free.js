import { clientIdFor, postGaEvents, validGaEnvironment } from "./ga4.js";
import { corsHeaders, emptyResponse, jsonResponse, originAllowed } from "./http.js";
import { loadKissReport, loadKissScore } from "./kiss-engine.js";

const ENTRIES = new Set(["inline", "article", "direct", "share"]);
const VARIANT = /^[a-z0-9-]{1,24}$/;
const COUNT_TIMEOUT_MS = 2_000;
// Every count shares one synthetic GA client: the counts are aggregates, so they never
// join a reader's GA session, and they add one user to GA4 rather than one per result.
const SERVER_CLIENT_ID = clientIdFor("kiss-free-server");

// The paywall denominator GA4 cannot see: blockers hide about half the result views
// from the browser tag, while Stripe sees every sale. A reload or a return in the
// same tab arrives with repeat: true and is counted under its own name.
export function buildResultServed(body) {
  return {
    client_id: SERVER_CLIENT_ID,
    events: [{
      name: body.repeat === true ? "result_served_repeat" : "result_served",
      params: {
        variant: typeof body.variant === "string" && VARIANT.test(body.variant) ? body.variant : "unknown",
        entry: ENTRIES.has(body.entry) ? body.entry : "other",
      },
    }],
  };
}

// The free tier of the result page: the two strongest-habit blurbs and the
// name of the single costliest habit (title and points, never its fix),
// computed server side so the blurb library never ships to the browser.
// Answers only; no pronoun, no identity, nothing stored. Each valid result
// also posts one aggregate GA4 count (variant and entry, never the answers).
export function createKissFreeHandler({ env, fetchImpl = fetch, loadScore = loadKissScore, loadReport = loadKissReport }) {
  return async function handleKissFree(request) {
    const origin = request.headers?.origin;
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") {
      return emptyResponse(204, cors);
    }
    const fail = (status, error) => jsonResponse(status, { ok: false, error }, cors);
    if (request.method !== "POST") {
      return fail(405, "method_not_allowed");
    }
    if (origin !== undefined && !originAllowed(origin, env)) {
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
    if (!body || typeof body !== "object" || typeof body.answers !== "string") {
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

    // A failed or slow count never holds back or breaks the result.
    const counted = validGaEnvironment(env)
      ? postGaEvents(env, fetchImpl, buildResultServed(body), COUNT_TIMEOUT_MS)
      : null;
    const free = reporter.buildReport(answers).free || {};
    const tier = { strongestBlurbs: free.strongestBlurbs || [] };
    if (free.costliestHabit) {
      const { title, points, max } = free.costliestHabit;
      tier.costliestHabit = { title, points, max };
    }
    await counted;
    return jsonResponse(200, { ok: true, free: tier }, cors);
  };
}
