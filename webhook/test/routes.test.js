import assert from "node:assert/strict";
import test from "node:test";

import healthHandler from "../api/health.js";
import payhipHandler from "../api/payhip-paid.js";

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

test("health route exposes only fixed service availability", async () => {
  const response = responseRecorder();

  await healthHandler({ method: "GET" }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.payload, { ok: true, service: "payhip-ga4-bridge" });
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
