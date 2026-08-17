import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGaPurchase,
  createPayhipHandler,
  validatePayhipSale,
} from "../src/payhip-ga4.js";

const SIGNATURE = "a".repeat(64);
const ENV = {
  GA_API_SECRET: "ga-secret-for-tests",
  GA_MEASUREMENT_ID: "G-TEST123456",
  PAYHIP_SIGNATURE_SHA256: SIGNATURE,
};

function validSale(overrides = {}) {
  return {
    id: "tx_123",
    email: "buyer@example.com",
    currency: "USD",
    price: 495,
    ip_address: "192.0.2.10",
    payment_type: "card",
    date: 1786636800,
    type: "paid",
    signature: SIGNATURE,
    items: [
      {
        product_id: "8722683",
        product_key: "dbMu6",
        product_name: "Kiss Perfect Now: A Master Class in Kissology",
        quantity: "1",
        product_permalink: "https://payhip.com/b/dbMu6",
      },
    ],
    ...overrides,
  };
}

function requestFor(payload, overrides = {}) {
  const bodyText = typeof payload === "string" ? payload : JSON.stringify(payload);
  return {
    method: "POST",
    bodyText,
    contentLength: Buffer.byteLength(bodyText),
    ...overrides,
  };
}

test("rejects a webhook with the wrong signature before forwarding it", async () => {
  let forwarded = false;
  const handler = createPayhipHandler({
    env: ENV,
    fetchImpl: async () => {
      forwarded = true;
      return new Response(null, { status: 204 });
    },
  });

  const result = await handler(requestFor(validSale({ signature: "b".repeat(64) })));

  assert.deepEqual(result, { status: 401, body: { ok: false } });
  assert.equal(forwarded, false);
});

test("rejects malformed or non-paid payloads", async () => {
  const handler = createPayhipHandler({
    env: ENV,
    fetchImpl: async () => new Response(null, { status: 204 }),
  });

  const cases = [
    requestFor("{not-json"),
    requestFor(validSale({ type: "refunded" })),
    requestFor(validSale({ price: 0 })),
    requestFor(validSale({ currency: "US" })),
    requestFor(validSale({ items: [] })),
  ];

  for (const input of cases) {
    const result = await handler(input);
    assert.deepEqual(result, { status: 400, body: { ok: false } });
  }
});

test("rejects oversized bodies before JSON parsing", async () => {
  const handler = createPayhipHandler({
    env: ENV,
    fetchImpl: async () => new Response(null, { status: 204 }),
  });

  const result = await handler({
    method: "POST",
    bodyText: "x".repeat(65_537),
    contentLength: 65_537,
  });

  assert.deepEqual(result, { status: 413, body: { ok: false } });
});

test("maps a charged sale to a deterministic privacy-minimized GA4 purchase", () => {
  const sale = validatePayhipSale(validSale(), SIGNATURE);
  const purchase = buildGaPurchase(sale);

  assert.deepEqual(purchase, {
    client_id: "2666261219.3116369963",
    timestamp_micros: 1786636800000000,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: "tx_123",
          value: 4.95,
          currency: "USD",
          engagement_time_msec: 1,
          items: [
            {
              item_id: "8722683",
              item_name: "Kiss Perfect Now: A Master Class in Kissology",
              quantity: 1,
            },
          ],
        },
      },
    ],
  });

  const serialized = JSON.stringify(purchase);
  assert.equal(serialized.includes("buyer@example.com"), false);
  assert.equal(serialized.includes("192.0.2.10"), false);
  assert.equal(serialized.includes("payment_type"), false);
  assert.equal(serialized.includes("product_permalink"), false);
  assert.equal(serialized.includes("signature"), false);
});

test("forwards the allowlisted purchase and acknowledges only GA4 success", async () => {
  const calls = [];
  const handler = createPayhipHandler({
    env: ENV,
    fetchImpl: async (...args) => {
      calls.push(args);
      return new Response(null, { status: 204 });
    },
  });

  const result = await handler(requestFor(validSale()));

  assert.deepEqual(result, { status: 200, body: { ok: true } });
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(
    url,
    "https://www.google-analytics.com/mp/collect?measurement_id=G-TEST123456&api_secret=ga-secret-for-tests",
  );
  assert.equal(options.method, "POST");
  assert.equal(options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(options.body), buildGaPurchase(validatePayhipSale(validSale(), SIGNATURE)));
});

test("returns a retryable failure when GA4 does not accept the purchase", async () => {
  const handler = createPayhipHandler({
    env: ENV,
    fetchImpl: async () => new Response(null, { status: 500 }),
  });

  const result = await handler(requestFor(validSale()));

  assert.deepEqual(result, { status: 502, body: { ok: false } });
});
