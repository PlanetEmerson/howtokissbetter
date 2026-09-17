import { sendBookEmail } from "./delivery.js";
import { clientIdFor, postGaEvents, validGaEnvironment } from "./ga4.js";
import { jsonResponse, siteOrigin } from "./http.js";
import { isKissSession, productForKind } from "./products.js";
import { sessionSettled, verifyStripeSignature } from "./stripe.js";

const SETTLED_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
// GA4 drops backdated events older than 72 hours; retries past that go in undated.
const MAX_TIMESTAMP_AGE_SECONDS = 72 * 60 * 60;

export function buildKissPurchase(session, product, nowMs) {
  const metadata = session.metadata || {};
  const value = session.amount_total / 100;
  const params = {
    transaction_id: session.id,
    value,
    currency: String(session.currency).toUpperCase(),
    engagement_time_msec: 1,
    product: product.key,
    kind: product.kind,
    items: [{ item_id: product.item_id, item_name: product.name, price: value, quantity: 1 }],
  };
  if (metadata.ga_sid) {
    params.session_id = metadata.ga_sid;
  }
  if (metadata.src) {
    params.article = metadata.src;
  }
  if (metadata.placement) {
    params.placement = metadata.placement;
  }
  if (metadata.entry) {
    params.entry = metadata.entry;
  }

  const purchase = {
    client_id: metadata.ga_cid || clientIdFor(session.id),
    events: [{ name: "purchase", params }],
  };
  const age = nowMs / 1000 - session.created;
  if (Number.isInteger(session.created) && age >= 0 && age <= MAX_TIMESTAMP_AGE_SECONDS) {
    purchase.timestamp_micros = session.created * 1_000_000;
  }
  return purchase;
}

export function createStripeWebhookHandler({ env, fetchImpl = fetch, now = () => Date.now() }) {
  return async function handleStripeWebhook(request) {
    if (request.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    }
    if (!env.STRIPE_WEBHOOK_SECRET || !validGaEnvironment(env)) {
      return jsonResponse(500, { ok: false, error: "server_config" });
    }
    if (request.bodyText === null) {
      return jsonResponse(413, { ok: false, error: "too_large" });
    }

    const nowMs = now();
    const signature = request.headers?.["stripe-signature"];
    if (!verifyStripeSignature(signature, request.bodyText, env.STRIPE_WEBHOOK_SECRET, Math.floor(nowMs / 1000))) {
      return jsonResponse(400, { ok: false, error: "bad_signature" });
    }

    let event;
    try {
      event = JSON.parse(request.bodyText);
    } catch {
      return jsonResponse(400, { ok: false, error: "bad_request" });
    }

    // Blynk Studio's tour and subscription events land here too; 200 keeps Stripe quiet.
    const session = event?.data?.object;
    const product = SETTLED_EVENTS.has(event?.type) && isKissSession(session) && sessionSettled(session)
      ? productForKind(session.metadata.kind)
      : null;
    if (!product) {
      return jsonResponse(200, { ok: true, ignored: true });
    }

    const email = product.key === "book" ? session.customer_details?.email : undefined;
    if (typeof email === "string" && !env.BREVO_API_KEY) {
      return jsonResponse(500, { ok: false, error: "server_config" });
    }

    if (!(await postGaEvents(env, fetchImpl, buildKissPurchase(session, product, nowMs)))) {
      return jsonResponse(502, { ok: false, error: "ga_unavailable" });
    }
    if (typeof email === "string") {
      const thanksUrl = `${siteOrigin(env)}/book/thanks/?session_id=${session.id}`;
      if (!(await sendBookEmail(env, fetchImpl, { to: email, thanksUrl }))) {
        return jsonResponse(502, { ok: false, error: "email_unavailable" });
      }
    }
    return jsonResponse(200, { ok: true });
  };
}
