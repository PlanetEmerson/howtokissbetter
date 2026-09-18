import { corsHeaders, emptyResponse, jsonResponse, originAllowed } from "./http.js";
import { loadKissReport, loadKissScore } from "./kiss-engine.js";

// The free tier of the result page: the two strongest-habit blurbs, computed
// server side so the blurb library never ships to the browser. Answers only;
// no pronoun, no identity, nothing stored.
export function createKissFreeHandler({ env, loadScore = loadKissScore, loadReport = loadKissReport }) {
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

    const free = reporter.buildReport(answers).free || {};
    return jsonResponse(200, { ok: true, free: { strongestBlurbs: free.strongestBlurbs || [] } }, cors);
  };
}
