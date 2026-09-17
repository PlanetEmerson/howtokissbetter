import assert from "node:assert/strict";
import test from "node:test";

import { OPTIONS as checkoutOptions, POST as checkoutPost } from "../api/checkout.js";
import healthHandler from "../api/health.js";
import payhipHandler from "../api/payhip-paid.js";
import { POST as webhookPost } from "../api/stripe-webhook.js";
import { POST as verifyPost } from "../api/verify.js";
import { readBody } from "../src/http.js";

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function withEnv(context, values) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  context.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, values);
}

test("health route exposes only fixed service availability", async () => {
  const response = responseRecorder();

  await healthHandler({ method: "GET" }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.payload, { ok: true, service: "howtokissbetter-functions" });
});

test("webhook route rejects non-POST requests before reading a body", async () => {
  const response = responseRecorder();

  await payhipHandler({ method: "GET", headers: {} }, response);

  assert.equal(response.statusCode, 405);
  assert.deepEqual(response.payload, { ok: false });
});

test("webhook route delegates a parsed body without forwarding buyer data", async (context) => {
  const previous = {
    fetch: global.fetch,
    GA_API_SECRET: process.env.GA_API_SECRET,
    GA_MEASUREMENT_ID: process.env.GA_MEASUREMENT_ID,
    PAYHIP_SIGNATURE_SHA256: process.env.PAYHIP_SIGNATURE_SHA256,
  };
  context.after(() => {
    global.fetch = previous.fetch;
    for (const [key, value] of Object.entries(previous).slice(1)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.GA_API_SECRET = "test-secret";
  process.env.GA_MEASUREMENT_ID = "G-TEST123456";
  process.env.PAYHIP_SIGNATURE_SHA256 = "a".repeat(64);
  let outgoingBody;
  global.fetch = async (_url, options) => {
    outgoingBody = options.body;
    return new Response(null, { status: 204 });
  };

  const request = {
    method: "POST",
    headers: { "content-length": "500" },
    body: {
      id: "route_tx",
      email: "buyer@example.com",
      ip_address: "192.0.2.25",
      currency: "USD",
      price: 495,
      date: 1786636800,
      type: "paid",
      signature: "a".repeat(64),
      items: [{ product_id: "8722683", product_name: "Kiss Perfect Now", quantity: "1" }],
    },
  };
  const response = responseRecorder();

  await payhipHandler(request, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { ok: true });
  assert.equal(outgoingBody.includes("buyer@example.com"), false);
  assert.equal(outgoingBody.includes("192.0.2.25"), false);
});

test("readBody rejects on the declared length and on the measured length", async () => {
  const declared = { headers: new Headers({ "content-length": "5000" }), text: async () => "small" };
  assert.equal(await readBody(declared, 4_096), null);

  const measured = new Request("https://fn.test/api/checkout", { method: "POST", body: "x".repeat(4_097) });
  assert.equal(await readBody(measured, 4_096), null);

  const fits = new Request("https://fn.test/api/checkout", { method: "POST", body: "product=book" });
  assert.equal(await readBody(fits, 4_096), "product=book");
});

test("checkout route answers preflight and caps the form at 4 KiB", async () => {
  const preflight = await checkoutOptions(
    new Request("https://fn.test/api/checkout", { method: "OPTIONS", headers: { origin: "https://howtokissbetter.com" } }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://howtokissbetter.com");

  const oversized = await checkoutPost(
    new Request("https://fn.test/api/checkout", {
      method: "POST",
      headers: { origin: "https://howtokissbetter.com", "content-type": "application/x-www-form-urlencoded" },
      body: `product=book&src=${"a".repeat(5_000)}`,
    }),
  );
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { ok: false, error: "too_large" });
});

test("verify route parses text/plain JSON from the browser", async (context) => {
  withEnv(context, { KISS_UNLOCK_SECRET: "route-test-secret" });

  const response = await verifyPost(
    new Request("https://fn.test/api/verify", {
      method: "POST",
      headers: { origin: "https://howtokissbetter.com", "content-type": "text/plain" },
      body: "{",
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://howtokissbetter.com");
  assert.deepEqual(await response.json(), { ok: false, error: "bad_request" });
});

test("stripe webhook route refuses an unsigned body", async (context) => {
  withEnv(context, { STRIPE_WEBHOOK_SECRET: "whsec_route_test", GA_MEASUREMENT_ID: "G-TEST123456", GA_API_SECRET: "route-ga-secret" });

  const response = await webhookPost(
    new Request("https://fn.test/api/stripe-webhook", { method: "POST", body: JSON.stringify({ type: "checkout.session.completed" }) }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "bad_signature" });
});

test("guarded turns a thrown handler error into the fallback response", async () => {
  const { guarded } = await import("../src/http.js");
  const fallback = new Response(null, { status: 500 });
  const result = await guarded(async () => { throw new Error("boom"); }, () => fallback);
  assert.equal(result, fallback);
  const ok = new Response(null, { status: 204 });
  assert.equal(await guarded(async () => ok, () => fallback), ok);
});
