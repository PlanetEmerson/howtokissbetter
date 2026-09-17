import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  STRIPE_API_VERSION,
  StripeError,
  encodeForm,
  sessionSettled,
  stripeRequest,
  verifyStripeSignature,
} from "../src/stripe.js";

const SECRET = "whsec_test_secret_for_signature_checks";
const NOW = 1_758_200_000;
const BODY = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

function header(rawBody, { secret = SECRET, t = NOW } = {}) {
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

test("encodeForm flattens nested objects and arrays into bracket notation", () => {
  const encoded = encodeForm({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { unit_amount: 999, product_data: { images: ["https://x/a.png"] } } }],
    metadata: { kind: "kiss_ebook", skipped: undefined, gone: null },
    success_url: "https://x/thanks/?session_id={CHECKOUT_SESSION_ID}",
    flag: false,
  });

  assert.deepEqual(Object.fromEntries(new URLSearchParams(encoded)), {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][unit_amount]": "999",
    "line_items[0][price_data][product_data][images][0]": "https://x/a.png",
    "metadata[kind]": "kiss_ebook",
    success_url: "https://x/thanks/?session_id={CHECKOUT_SESSION_ID}",
    flag: "false",
  });
});

test("verifyStripeSignature accepts a fresh signature from the right secret", () => {
  assert.equal(verifyStripeSignature(header(BODY), BODY, SECRET, NOW), true);
  assert.equal(verifyStripeSignature(header(BODY, { t: NOW - 300 }), BODY, SECRET, NOW), true);
  assert.equal(verifyStripeSignature(`t=${NOW},v1=${"0".repeat(64)},v0=abc,${header(BODY).split(",")[1]}`, BODY, SECRET, NOW), true);
});

test("verifyStripeSignature rejects stale, forged, and malformed headers", () => {
  const cases = [
    [header(BODY, { t: NOW - 301 }), BODY, SECRET],
    [header(BODY, { t: NOW + 301 }), BODY, SECRET],
    [header(BODY, { secret: "whsec_other" }), BODY, SECRET],
    [header(BODY), `${BODY} `, SECRET],
    [header(BODY), BODY, ""],
    [header(BODY), BODY, undefined],
    ["", BODY, SECRET],
    [undefined, BODY, SECRET],
    [`t=${NOW}`, BODY, SECRET],
    [`v1=${"a".repeat(64)}`, BODY, SECRET],
    [`t=${NOW},v1=deadbeef`, BODY, SECRET],
    [`t=abc,v1=${"a".repeat(64)}`, BODY, SECRET],
    [`t=${NOW},v0=${header(BODY).split("v1=")[1]}`, BODY, SECRET],
  ];
  for (const [signature, body, secret] of cases) {
    assert.equal(verifyStripeSignature(signature, body, secret, NOW), false, String(signature));
  }
});

test("stripeRequest sends a form-encoded, versioned, bearer-authenticated request", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: "cs_test_1", object: "checkout.session" }), { status: 200 });
  };

  const session = await stripeRequest(
    { env: { STRIPE_SECRET_KEY: "sk_test_abc" }, fetchImpl },
    "POST",
    "/checkout/sessions",
    { mode: "payment", metadata: { kind: "kiss_ebook" } },
  );

  assert.deepEqual(session, { id: "cs_test_1", object: "checkout.session" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(calls[0].options.headers, {
    Authorization: "Bearer sk_test_abc",
    "Content-Type": "application/x-www-form-urlencoded",
    "Stripe-Version": STRIPE_API_VERSION,
  });
  assert.equal(calls[0].options.body, "mode=payment&metadata%5Bkind%5D=kiss_ebook");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test("stripeRequest puts GET params on the query string and sends no body", async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    return new Response(JSON.stringify({ object: "list" }), { status: 200 });
  };

  await stripeRequest({ env: { STRIPE_SECRET_KEY: "sk_test_abc" }, fetchImpl }, "GET", "/checkout/sessions", { limit: 3 });

  assert.equal(seen.url, "https://api.stripe.com/v1/checkout/sessions?limit=3");
  assert.equal(seen.options.body, undefined);
});

test("stripeRequest surfaces status and code without echoing the response body", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { code: "resource_missing", message: "No such checkout.session: secret-detail" } }), {
      status: 404,
    });

  await assert.rejects(
    stripeRequest({ env: { STRIPE_SECRET_KEY: "sk_test_abc" }, fetchImpl }, "GET", "/checkout/sessions/cs_x"),
    (error) => {
      assert.ok(error instanceof StripeError);
      assert.equal(error.status, 404);
      assert.equal(error.code, "resource_missing");
      assert.equal(error.message.includes("secret-detail"), false);
      return true;
    },
  );

  await assert.rejects(
    stripeRequest({ env: { STRIPE_SECRET_KEY: "sk_test_abc" }, fetchImpl: async () => { throw new Error("socket hang up"); } }, "POST", "/x", {}),
    (error) => error instanceof StripeError && error.status === 0 && error.code === "network_error",
  );

  await assert.rejects(
    stripeRequest({ env: { STRIPE_SECRET_KEY: "sk_test_abc" }, fetchImpl: async () => new Response("<html>", { status: 200 }) }, "POST", "/x", {}),
    (error) => error instanceof StripeError && error.code === "bad_response",
  );
});

test("sessionSettled accepts paid sessions and only our own $0 test sessions", () => {
  assert.equal(sessionSettled({ payment_status: "paid" }), true);
  assert.equal(sessionSettled({ payment_status: "unpaid" }), false);
  assert.equal(sessionSettled({ payment_status: "no_payment_required", amount_total: 0, metadata: { test: "1" } }), true);
  assert.equal(sessionSettled({ payment_status: "no_payment_required", amount_total: 0, metadata: {} }), false);
  assert.equal(sessionSettled({ payment_status: "no_payment_required", amount_total: 499, metadata: { test: "1" } }), false);
  assert.equal(sessionSettled(undefined), false);
});
