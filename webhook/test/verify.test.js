import assert from "node:assert/strict";
import test from "node:test";

import { STRIPE_API_VERSION } from "../src/stripe.js";
import { signToken, verifyToken } from "../src/unlock-token.js";
import { createVerifyHandler } from "../src/verify.js";

const SECRET = "unlock-secret-for-tests";
const ENV = { STRIPE_SECRET_KEY: "sk_test_verify_secret_for_tests", KISS_UNLOCK_SECRET: SECRET };
const NOW = 1_758_200_000;
const DAY = 86_400;
const SESSION_ID = "cs_test_a1B2c3D4e5F6g7H8i9J0";
const ENGINE = { VERSION: 1, isValidAnswers: (answers) => /^[a-d]{10}$/.test(answers) };
const REPORTER = { buildReport: (answers) => ({ answers, sections: [{ title: `Report for ${answers}` }] }) };

function bookSession(overrides = {}) {
  return {
    id: SESSION_ID,
    object: "checkout.session",
    status: "complete",
    payment_status: "paid",
    amount_total: 999,
    currency: "usd",
    created: NOW - 60,
    customer_details: { email: "buyer@example.com", name: "Buyer Example" },
    metadata: { kind: "kiss_ebook", site: "howtokissbetter", product: "book", src: "direct" },
    ...overrides,
  };
}

function reportSession(metadataOverrides = {}) {
  return bookSession({
    amount_total: 499,
    metadata: { kind: "kiss_report", site: "howtokissbetter", product: "report", src: "direct", answers: "abcdabcdab", v: "1", ...metadataOverrides },
  });
}

const json = (payload, status = 200) => () => new Response(JSON.stringify(payload), { status });
const presign = async ({ pathname, validUntil }) => `https://blob.example/${pathname}?until=${validUntil}`;

function handlerWith({
  env = ENV,
  respond = json(bookSession()),
  loadScore = async () => ENGINE,
  loadReport = async () => REPORTER,
  presignImpl = presign,
  now = () => NOW,
} = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return respond(url, options);
  };
  return { handler: createVerifyHandler({ env, fetchImpl, presignImpl, loadScore, loadReport, now }), calls };
}

function post(body, headers = { origin: "https://howtokissbetter.com" }, method = "POST") {
  return { method, headers, bodyText: typeof body === "string" || body === null ? body : JSON.stringify(body) };
}

async function expectError(response, status, error) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { ok: false, error });
}

test("rejects malformed requests before touching Stripe", async () => {
  const { handler, calls } = handlerWith();
  const bad = ["{", "42", "[]", "null", {}, { session_id: "pi_123" }, { session_id: "cs_live_short" }, { session_id: "cs_test_has-dash-inside" }, { token: 7 }];

  for (const body of bad) {
    await expectError(await handler(post(body)), 400, "bad_request");
  }
  await expectError(await handler(post({ session_id: SESSION_ID }, { origin: "https://howtokissbetter.com" }, "GET")), 405, "method_not_allowed");
  await expectError(await handler(post(null)), 413, "too_large");
  assert.equal(calls.length, 0);
});

test("only allowlisted origins get CORS headers; other origins are refused", async () => {
  const { handler } = handlerWith();

  const allowed = await handler(post({ session_id: SESSION_ID }, { origin: "https://www.howtokissbetter.com" }));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://www.howtokissbetter.com");
  assert.equal(allowed.headers.get("vary"), "Origin");

  const preflight = await handler(post(null, { origin: "https://howtokissbetter.com" }, "OPTIONS"));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://howtokissbetter.com");
  assert.equal(preflight.headers.get("access-control-allow-methods"), "POST, OPTIONS");

  const deniedPreflight = await handler(post(null, { origin: "https://evil.example" }, "OPTIONS"));
  assert.equal(deniedPreflight.status, 204);
  assert.equal(deniedPreflight.headers.get("access-control-allow-origin"), null);

  const denied = await handler(post({ session_id: SESSION_ID }, { origin: "https://evil.example" }));
  await expectError(denied, 403, "bad_origin");
  assert.equal(denied.headers.get("access-control-allow-origin"), null);

  const noOrigin = await handler(post({ session_id: SESSION_ID }, {}));
  assert.equal(noOrigin.status, 200);
  assert.equal(noOrigin.headers.get("access-control-allow-origin"), null);
});

test("unpaid, expired, and foreign sessions do not unlock anything", async () => {
  const cases = [
    [json(bookSession({ payment_status: "unpaid", status: "open" })), 402, "not_paid"],
    [json(bookSession({ payment_status: "unpaid", status: "expired" })), 402, "not_paid"],
    [json(bookSession({ payment_status: "no_payment_required", amount_total: 0 })), 402, "not_paid"],
    [json(bookSession({ metadata: { kind: "kiss_ebook", site: "other-site" } })), 404, "not_found"],
    [json(bookSession({ metadata: { kind: "tour", businessId: "biz_1" } })), 404, "not_found"],
    [json(bookSession({ metadata: { kind: "kiss_bundle", site: "howtokissbetter" } })), 404, "not_found"],
    [json({ object: "payment_intent", status: "succeeded", metadata: { kind: "kiss_ebook", site: "howtokissbetter" } }), 404, "not_found"],
    [json({ error: { code: "resource_missing" } }, 404), 404, "not_found"],
    [json({ error: { type: "api_error" } }, 500), 502, "stripe_unavailable"],
    [() => { throw new Error("socket hang up"); }, 502, "stripe_unavailable"],
  ];

  for (const [respond, status, error] of cases) {
    const { handler } = handlerWith({ respond });
    await expectError(await handler(post({ session_id: SESSION_ID })), status, error);
  }
});

test("a paid book session returns signed downloads and an unlock token", async () => {
  const { handler, calls } = handlerWith({ env: { ...ENV, KISS_BOOK_PDF_PATH: "books/kpn.pdf", KISS_BOOK_EPUB_PATH: "books/kpn.epub" } });

  const response = await handler(post({ session_id: SESSION_ID }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.product, "book");
  assert.deepEqual(verifyToken(SECRET, body.token, NOW), { s: SESSION_ID, p: "book", t: NOW });
  assert.equal(body.payload.thanks_url, `https://howtokissbetter.com/book/thanks/?session_id=${SESSION_ID}`);
  assert.equal(body.payload.downloads_error, undefined);
  assert.equal(body.payload.downloads.length, 2);
  const [pdf, epub] = body.payload.downloads;
  assert.equal(pdf.label, "PDF");
  assert.match(pdf.url, /^https:\/\/blob\.example\/books\/kpn\.pdf\?until=\d+$/);
  assert.equal(epub.label, "EPUB");
  assert.match(epub.url, /^https:\/\/blob\.example\/books\/kpn\.epub\?until=\d+$/);
  const validity = Date.parse(pdf.expires) - Date.now();
  assert.ok(validity > 59 * 60_000 && validity <= 60 * 60_000, `expires in ${validity}ms`);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.stripe.com/v1/checkout/sessions/${SESSION_ID}`);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${ENV.STRIPE_SECRET_KEY}`);
  assert.equal(calls[0].options.headers["Stripe-Version"], STRIPE_API_VERSION);
  assert.equal(JSON.stringify(body).includes(ENV.STRIPE_SECRET_KEY), false);
  assert.equal(JSON.stringify(body).includes("buyer@example.com"), false);
});

test("our own $0 test session unlocks like a paid one", async () => {
  const { handler } = handlerWith({
    respond: json(bookSession({ payment_status: "no_payment_required", amount_total: 0, metadata: { kind: "kiss_ebook", site: "howtokissbetter", test: "1" } })),
  });

  const response = await handler(post({ session_id: SESSION_ID }));

  assert.equal(response.status, 200);
});

test("a failed presign degrades to an empty list with an error flag", async () => {
  const { handler } = handlerWith({ presignImpl: async () => { throw new Error("blob down"); } });

  const response = await handler(post({ session_id: SESSION_ID }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.payload.downloads, []);
  assert.equal(body.payload.downloads_error, true);
  assert.equal(body.payload.thanks_url, `https://howtokissbetter.com/book/thanks/?session_id=${SESSION_ID}`);
});

test("a book token re-verifies with zero Stripe calls and no Stripe key", async () => {
  const token = signToken(SECRET, { s: SESSION_ID, p: "book", t: NOW - 200 * DAY });
  const { handler, calls } = handlerWith({ env: { KISS_UNLOCK_SECRET: SECRET } });

  const response = await handler(post({ token }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.product, "book");
  assert.equal(body.token, token);
  assert.equal(body.payload.downloads.length, 2);
  assert.equal(calls.length, 0);
});

test("tampered, foreign, and expired tokens are refused", async () => {
  const { handler, calls } = handlerWith();
  const good = signToken(SECRET, { s: SESSION_ID, p: "book", t: NOW });
  const tokens = [
    `${good.slice(0, -1)}${good.endsWith("A") ? "B" : "A"}`,
    signToken("other-secret", { s: SESSION_ID, p: "book", t: NOW }),
    signToken(SECRET, { s: SESSION_ID, p: "report", a: "abcdabcdab", v: 1, t: NOW - 31 * DAY }),
    "kt1.x.y",
  ];

  for (const token of tokens) {
    await expectError(await handler(post({ token })), 401, "bad_token");
  }
  assert.equal(calls.length, 0);
});

test("a paid report session returns the report and a retake token", async () => {
  const { handler } = handlerWith({ respond: json(reportSession()) });

  const response = await handler(post({ session_id: SESSION_ID }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.product, "report");
  assert.deepEqual(body.payload, { report: { answers: "abcdabcdab", sections: [{ title: "Report for abcdabcdab" }] } });
  assert.deepEqual(verifyToken(SECRET, body.token, NOW), { s: SESSION_ID, p: "report", t: NOW, a: "abcdabcdab", v: "1" });
});

test("report paths answer 501 until the engine and the report module ship", async () => {
  for (const overrides of [{ loadReport: async () => null }, { loadScore: async () => null }]) {
    const { handler } = handlerWith({ respond: json(reportSession()), ...overrides });
    await expectError(await handler(post({ session_id: SESSION_ID })), 501, "report_unavailable");
  }
  const token = signToken(SECRET, { s: SESSION_ID, p: "report", a: "abcdabcdab", v: 1, t: NOW });
  const { handler } = handlerWith({ loadReport: async () => null });
  await expectError(await handler(post({ token })), 501, "report_unavailable");
});

test("engine version drift answers 409 for sessions and tokens", async () => {
  const { handler: sessionHandler } = handlerWith({ respond: json(reportSession({ v: "2" })) });
  await expectError(await sessionHandler(post({ session_id: SESSION_ID })), 409, "engine_mismatch");

  const { handler: answersHandler } = handlerWith({ respond: json(reportSession({ answers: "zzzzzzzzzz" })) });
  await expectError(await answersHandler(post({ session_id: SESSION_ID })), 409, "engine_mismatch");

  const { handler: tokenHandler } = handlerWith();
  const token = signToken(SECRET, { s: SESSION_ID, p: "report", a: "abcdabcdab", v: 2, t: NOW });
  await expectError(await tokenHandler(post({ token })), 409, "engine_mismatch");
});

test("a report token recomputes for new answers within 30 days and keeps its issue time", async () => {
  const issued = NOW - 20 * DAY;
  const token = signToken(SECRET, { s: SESSION_ID, p: "report", a: "abcdabcdab", v: 1, t: issued });
  const { handler, calls } = handlerWith({ env: { KISS_UNLOCK_SECRET: SECRET } });

  const same = await handler(post({ token }));
  assert.equal(same.status, 200);
  const sameBody = await same.json();
  assert.equal(sameBody.token, token);
  assert.equal(sameBody.payload.report.answers, "abcdabcdab");

  const retake = await handler(post({ token, answers: "DCBADCBADC" }));
  assert.equal(retake.status, 200);
  const retakeBody = await retake.json();
  assert.equal(retakeBody.payload.report.answers, "dcbadcbadc");
  assert.notEqual(retakeBody.token, token);
  assert.deepEqual(verifyToken(SECRET, retakeBody.token, NOW), { s: SESSION_ID, p: "report", t: issued, a: "dcbadcbadc", v: 1 });

  await expectError(await handler(post({ token, answers: "not-valid" })), 400, "bad_request");
  await expectError(await handler(post({ token, answers: 12 })), 400, "bad_request");
  assert.equal(calls.length, 0);
});

test("missing secrets answer 500 without calling Stripe", async () => {
  const { handler: noUnlock, calls: unlockCalls } = handlerWith({ env: { STRIPE_SECRET_KEY: "sk_test_x" } });
  await expectError(await noUnlock(post({ session_id: SESSION_ID })), 500, "server_config");
  assert.equal(unlockCalls.length, 0);

  const { handler: noStripe, calls: stripeCalls } = handlerWith({ env: { KISS_UNLOCK_SECRET: SECRET } });
  await expectError(await noStripe(post({ session_id: SESSION_ID })), 500, "server_config");
  assert.equal(stripeCalls.length, 0);
});
