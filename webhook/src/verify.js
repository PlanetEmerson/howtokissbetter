import { bookDownloads } from "./delivery.js";
import { corsHeaders, emptyResponse, jsonResponse, originAllowed, siteOrigin } from "./http.js";
import { loadKissReport, loadKissScore } from "./kiss-engine.js";
import { PRODUCTS, isKissSession, productForKind } from "./products.js";
import { StripeError, sessionSettled, stripeRequest } from "./stripe.js";
import { SESSION_ID_PATTERN, signToken, verifyToken } from "./unlock-token.js";

async function grantFromSession({ env, fetchImpl, now }, sessionId) {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return { status: 400, error: "bad_request" };
  }
  if (!env.STRIPE_SECRET_KEY) {
    return { status: 500, error: "server_config" };
  }

  let session;
  try {
    session = await stripeRequest({ env, fetchImpl }, "GET", `/checkout/sessions/${sessionId}`);
  } catch (error) {
    if (error instanceof StripeError && error.status === 404) {
      return { status: 404, error: "not_found" };
    }
    return { status: 502, error: "stripe_unavailable" };
  }

  const product = isKissSession(session) ? productForKind(session.metadata.kind) : null;
  if (!product) {
    return { status: 404, error: "not_found" };
  }
  if (session.status !== "complete" || !sessionSettled(session)) {
    return { status: 402, error: "not_paid" };
  }

  const grant = { s: sessionId, p: product.key, t: now() };
  if (product.key === "report") {
    grant.a = String(session.metadata.answers ?? "");
    grant.v = String(session.metadata.v ?? "");
  }
  return { grant };
}

async function reportPayload({ loadScore, loadReport }, grant, requestedAnswers) {
  const [engine, reporter] = await Promise.all([loadScore(), loadReport()]);
  if (!engine || !reporter) {
    return { status: 501, error: "report_unavailable" };
  }
  if (String(grant.v) !== String(engine.VERSION) || !engine.isValidAnswers(grant.a)) {
    return { status: 409, error: "engine_mismatch" };
  }

  let answers = grant.a;
  if (requestedAnswers !== undefined) {
    answers = typeof requestedAnswers === "string" ? requestedAnswers.trim().toLowerCase() : "";
    if (!engine.isValidAnswers(answers)) {
      return { status: 400, error: "bad_request" };
    }
  }
  return { answers, payload: { report: reporter.buildReport(answers) } };
}

export function createVerifyHandler({
  env,
  fetchImpl = fetch,
  presignImpl,
  loadScore = loadKissScore,
  loadReport = loadKissReport,
  now = () => Math.floor(Date.now() / 1000),
}) {
  return async function handleVerify(request) {
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
    if (!env.KISS_UNLOCK_SECRET) {
      return fail(500, "server_config");
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

    let grant;
    if (typeof body.token === "string") {
      grant = verifyToken(env.KISS_UNLOCK_SECRET, body.token, now());
      if (!grant) {
        return fail(401, "bad_token");
      }
    } else if (typeof body.session_id === "string") {
      const result = await grantFromSession({ env, fetchImpl, now }, body.session_id);
      if (result.error) {
        return fail(result.status, result.error);
      }
      grant = result.grant;
    } else {
      return fail(400, "bad_request");
    }

    const product = PRODUCTS[grant.p];
    let payload;
    let tokenPayload = grant;
    if (product.key === "book") {
      const { downloads, error } = await bookDownloads(env, presignImpl);
      payload = { downloads, thanks_url: `${siteOrigin(env)}/book/thanks/?session_id=${grant.s}` };
      if (error) {
        payload.downloads_error = true;
      }
    } else {
      const result = await reportPayload({ loadScore, loadReport }, grant, body.answers);
      if (result.error) {
        return fail(result.status, result.error);
      }
      payload = result.payload;
      tokenPayload = { ...grant, a: result.answers };
    }

    // A retake keeps the original issue time, so the 30-day window does not slide.
    const token = typeof body.token === "string" && tokenPayload.a === grant.a
      ? body.token
      : signToken(env.KISS_UNLOCK_SECRET, tokenPayload);
    return jsonResponse(200, { ok: true, product: product.key, token, payload }, cors);
  };
}
