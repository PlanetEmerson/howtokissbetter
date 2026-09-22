import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { clientIdFor } from "../src/ga4.js";
import { PRODUCTS } from "../src/products.js";
import { buildKissPurchase, createStripeWebhookHandler } from "../src/stripe-webhook.js";

const WEBHOOK_SECRET = "whsec_test_webhook_secret_for_tests";
const ENV = {
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  GA_MEASUREMENT_ID: "G-TEST123456",
  GA_API_SECRET: "ga-secret-for-tests",
  BREVO_API_KEY: "brevo-key-for-tests",
};
const NOW_S = 1_758_200_000;
const NOW_MS = NOW_S * 1_000;
const SESSION_ID = "cs_test_a1B2c3D4e5F6g7H8i9J0";
const GA_URL = "https://www.google-analytics.com/mp/collect?measurement_id=G-TEST123456&api_secret=ga-secret-for-tests";
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const THANKS_URL = `https://howtokissbetter.com/book/thanks/?session_id=${SESSION_ID}`;

function bookSession(overrides = {}) {
  return {
    id: SESSION_ID,
    object: "checkout.session",
    status: "complete",
    payment_status: "paid",
    amount_total: 999,
    currency: "usd",
    created: NOW_S - 60,
    client_reference_id: "hkb_book_how-to-kiss-someones-neck_0a1b2c3d",
    customer_details: { email: "buyer@example.com", name: "Buyer Example" },
    metadata: {
      kind: "kiss_ebook",
      site: "howtokissbetter",
      product: "book",
      src: "how-to-kiss-someones-neck",
      placement: "buy-mobile-bar",
      entry: "bar",
      ga_cid: "123456789.987654321",
      ga_sid: "1758150000",
    },
    ...overrides,
  };
}

function reportSession() {
  return bookSession({
    amount_total: 499,
    metadata: { kind: "kiss_report", site: "howtokissbetter", product: "report", src: "direct", answers: "abcdabcdab", v: "1" },
  });
}

function event(session, type = "checkout.session.completed") {
  return { id: "evt_test_1", object: "event", type, data: { object: session } };
}

function signed(body, { secret = WEBHOOK_SECRET, t = NOW_S, headers = {} } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const v1 = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return { method: "POST", headers: { "stripe-signature": `t=${t},v1=${v1}`, ...headers }, bodyText: raw };
}

function handlerWith({ env = ENV, respond = () => new Response(null, { status: 204 }) } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return respond(url, options, calls.length);
  };
  return { handler: createStripeWebhookHandler({ env, fetchImpl, now: () => NOW_MS }), calls };
}

const EXPECTED_BOOK_PURCHASE = {
  client_id: "123456789.987654321",
  timestamp_micros: (NOW_S - 60) * 1_000_000,
  events: [
    {
      name: "purchase",
      params: {
        transaction_id: SESSION_ID,
        value: 9.99,
        currency: "USD",
        engagement_time_msec: 1,
        session_id: "1758150000",
        product: "book",
        kind: "kiss_ebook",
        article: "how-to-kiss-someones-neck",
        placement: "buy-mobile-bar",
        entry: "bar",
        items: [{ item_id: "kiss-book", item_name: "Kiss Perfect Now (PDF + EPUB)", price: 9.99, quantity: 1 }],
      },
    },
  ],
};

test("a paid book session posts one GA4 purchase and one delivery email", async () => {
  const { handler, calls } = handlerWith();

  const response = await handler(signed(event(bookSession())));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.length, 2);

  const [ga, brevo] = calls;
  assert.equal(ga.url, GA_URL);
  assert.equal(ga.options.method, "POST");
  assert.equal(ga.options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(ga.options.body), EXPECTED_BOOK_PURCHASE);
  assert.equal(ga.options.body.includes("buyer@example.com"), false);
  assert.equal(ga.options.body.includes("Buyer Example"), false);

  assert.equal(brevo.url, BREVO_URL);
  assert.equal(brevo.options.method, "POST");
  assert.equal(brevo.options.headers["api-key"], "brevo-key-for-tests");
  assert.equal(brevo.options.headers["content-type"], "application/json");
  const message = JSON.parse(brevo.options.body);
  assert.deepEqual(message.sender, { name: "C.J. McKenna", email: "contact@howtokissbetter.com" });
  assert.deepEqual(message.to, [{ email: "buyer@example.com" }]);
  assert.equal(message.subject, "Your copy of Kiss Perfect Now");
  assert.ok(message.textContent.includes(THANKS_URL));
  assert.ok(message.textContent.includes("Not worth it? Email me within 30 days for a full refund. You keep the files either way."));
  assert.ok(message.htmlContent.includes(`<a href="${THANKS_URL}">`));
  assert.ok(message.htmlContent.includes("<p>Not worth it? Email me within 30 days for a full refund. You keep the files either way.</p>"));
  assert.equal(`${message.textContent}${message.htmlContent}`.includes(String.fromCharCode(0x2014)), false);
  assert.equal(brevo.options.body.includes("ga-secret-for-tests"), false);
});

test("the configured sender address is used for the delivery email", async () => {
  const { handler, calls } = handlerWith({ env: { ...ENV, BREVO_SENDER_EMAIL: "hello@howtokissbetter.com" } });

  await handler(signed(event(bookSession())));

  assert.deepEqual(JSON.parse(calls[1].options.body).sender, { name: "C.J. McKenna", email: "hello@howtokissbetter.com" });
});

test("buildKissPurchase falls back to a synthetic client id and drops missing attribution", () => {
  const session = bookSession({ created: NOW_S - 73 * 3_600, metadata: { kind: "kiss_ebook", site: "howtokissbetter", product: "book" } });

  const purchase = buildKissPurchase(session, PRODUCTS.book, NOW_MS);

  assert.equal(purchase.client_id, clientIdFor(SESSION_ID));
  assert.match(purchase.client_id, /^\d+\.\d+$/);
  assert.equal("timestamp_micros" in purchase, false);
  const { params } = purchase.events[0];
  for (const key of ["session_id", "article", "placement", "entry"]) {
    assert.equal(key in params, false, key);
  }
  assert.equal(params.transaction_id, SESSION_ID);
});

test("a paid report session posts only the GA4 purchase", async () => {
  const { handler, calls } = handlerWith();

  const response = await handler(signed(event(reportSession(), "checkout.session.async_payment_succeeded")));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const { params } = JSON.parse(calls[0].options.body).events[0];
  assert.equal(params.value, 4.99);
  assert.equal(params.product, "report");
  assert.equal(params.kind, "kiss_report");
  assert.deepEqual(params.items, [{ item_id: "kiss-report", item_name: "Kiss Test: your full report", price: 4.99, quantity: 1 }]);
  assert.equal(calls[0].options.body.includes("abcdabcdab"), false);
});

test("our own $0 test session is measured; a book without an email skips Brevo", async () => {
  const { handler, calls } = handlerWith();
  const session = bookSession({
    payment_status: "no_payment_required",
    amount_total: 0,
    customer_details: null,
    metadata: { kind: "kiss_ebook", site: "howtokissbetter", product: "book", test: "1" },
  });

  const response = await handler(signed(event(session)));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).events[0].params.value, 0);
});

test("stale, forged, and missing signatures are rejected before parsing", async () => {
  const { handler, calls } = handlerWith();
  const body = event(bookSession());
  const requests = [
    signed(body, { t: NOW_S - 301 }),
    signed(body, { t: NOW_S + 301 }),
    signed(body, { secret: "whsec_other" }),
    { ...signed(body), bodyText: `${JSON.stringify(body)} ` },
    { method: "POST", headers: {}, bodyText: JSON.stringify(body) },
    { method: "POST", headers: { "stripe-signature": "t=1,v1=nothex" }, bodyText: JSON.stringify(body) },
  ];

  for (const request of requests) {
    const response = await handler(request);
    assert.equal(response.status, 400, request.headers["stripe-signature"]);
    assert.deepEqual(await response.json(), { ok: false, error: "bad_signature" });
  }
  assert.equal(calls.length, 0);

  const notJson = await handler(signed("{not json"));
  assert.equal(notJson.status, 400);
  assert.deepEqual(await notJson.json(), { ok: false, error: "bad_request" });
});

test("events that are not our settled sessions are acknowledged and ignored", async () => {
  const { handler, calls } = handlerWith();
  const ignored = [
    event({ object: "checkout.session", payment_status: "paid", amount_total: 4_900, metadata: { kind: "tour", businessId: "biz_123" } }),
    event({ object: "checkout.session", payment_status: "paid", amount_total: 999, metadata: { kind: "kiss_ebook", site: "blynk" } }),
    event({ object: "checkout.session", payment_status: "paid", amount_total: 999, metadata: {} }),
    event(bookSession({ payment_status: "unpaid" })),
    event(bookSession({ payment_status: "no_payment_required", amount_total: 0 })),
    event(bookSession({ metadata: { kind: "kiss_bundle", site: "howtokissbetter" } })),
    event(bookSession(), "checkout.session.expired"),
    event(bookSession(), "checkout.session.async_payment_failed"),
    { id: "evt_2", object: "event", type: "payment_intent.succeeded", data: { object: { object: "payment_intent", metadata: { kind: "kiss_ebook", site: "howtokissbetter" } } } },
    { id: "evt_3", object: "event", type: "customer.subscription.created", data: { object: { object: "subscription" } } },
    {},
  ];

  for (const body of ignored) {
    const response = await handler(signed(body));
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(await response.json(), { ok: true, ignored: true });
  }
  assert.equal(calls.length, 0);
});

test("GA4 or Brevo failures answer 502 so Stripe retries", async () => {
  const gaDown = handlerWith({ respond: () => new Response(null, { status: 500 }) });
  const gaResponse = await gaDown.handler(signed(event(bookSession())));
  assert.equal(gaResponse.status, 502);
  assert.deepEqual(await gaResponse.json(), { ok: false, error: "ga_unavailable" });
  assert.equal(gaDown.calls.length, 1);

  const gaThrows = handlerWith({ respond: () => { throw new Error("socket hang up"); } });
  assert.equal((await gaThrows.handler(signed(event(bookSession())))).status, 502);

  const brevoDown = handlerWith({ respond: (url) => new Response(null, { status: url === BREVO_URL ? 500 : 204 }) });
  const brevoResponse = await brevoDown.handler(signed(event(bookSession())));
  assert.equal(brevoResponse.status, 502);
  assert.deepEqual(await brevoResponse.json(), { ok: false, error: "email_unavailable" });
  assert.equal(brevoDown.calls.length, 2);
});

test("method, size, and configuration guards run before any outbound call", async () => {
  const { handler, calls } = handlerWith();
  assert.equal((await handler({ method: "GET", headers: {}, bodyText: "" })).status, 405);
  assert.equal((await handler({ ...signed(event(bookSession())), bodyText: null })).status, 413);

  for (const env of [{}, { ...ENV, STRIPE_WEBHOOK_SECRET: "" }, { ...ENV, GA_API_SECRET: "" }, { ...ENV, GA_MEASUREMENT_ID: "bad" }, { ...ENV, BREVO_API_KEY: undefined }]) {
    const { handler: misconfigured, calls: misconfiguredCalls } = handlerWith({ env });
    const response = await misconfigured(signed(event(bookSession())));
    assert.equal(response.status, 500, JSON.stringify(env));
    assert.deepEqual(await response.json(), { ok: false, error: "server_config" });
    assert.equal(misconfiguredCalls.length, 0);
  }
  assert.equal(calls.length, 0);
});
