import assert from "node:assert/strict";
import test from "node:test";

import { OPTIONS as routeOptions, POST as routePost } from "../api/kiss-email.js";
import { createKissEmailHandler } from "../src/kiss-email.js";
import KissScore from "../src/kiss-score.cjs";
import * as realReporter from "../src/kiss-report.js";
import { BLURBS } from "../src/kiss-report-data/blurbs.js";

const ENV = {
  BREVO_API_KEY: "test-brevo-key",
  BREVO_KISS_TEST_LIST_ID: "12",
  BREVO_KISS_TEST_DOI_TEMPLATE_ID: "34",
};
const EMAIL = "reader@example.com";
const ANSWERS = "bbcbbcbbcb";

function brevo(status = 201, body = null) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(body === null ? null : JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

function handlerWith({ env = ENV, fetchImpl = brevo().fetchImpl } = {}) {
  return createKissEmailHandler({ env, fetchImpl, loadScore: async () => KissScore, loadReport: async () => realReporter });
}

function post(body, headers = { origin: "https://howtokissbetter.com" }, method = "POST") {
  return { method, headers, bodyText: typeof body === "string" || body === null ? body : JSON.stringify(body) };
}

const valid = (extra = {}) => ({ email: EMAIL, answers: ANSWERS, adult: true, website: "", ...extra });

async function expectError(response, status, error) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { ok: false, error });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

test("a valid request starts Brevo's double opt-in with the result computed server side", async () => {
  const { calls, fetchImpl } = brevo(201, { id: 1 });
  const before = today();
  // Client-sent result fields are ignored; only the answers count.
  const response = await handlerWith({ fetchImpl })(post(valid({
    email: `  ${EMAIL} `,
    answers: " BBCBBCBBCB ",
    score: 99,
    archetype: "The Natural",
    band: "Podium",
  })));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), "https://howtokissbetter.com");
  assert.deepEqual(await response.json(), { ok: true });

  assert.equal(calls.length, 1);
  const [{ url, options }] = calls;
  assert.equal(url, "https://api.brevo.com/v3/contacts/doubleOptinConfirmation");
  assert.equal(options.method, "POST");
  assert.equal(options.headers["api-key"], "test-brevo-key");
  assert.equal(options.headers["content-type"], "application/json");

  const result = KissScore.score(ANSWERS);
  const top = BLURBS[result.costliest[0].key];
  const sent = JSON.parse(options.body);
  assert.ok([before, today()].includes(sent.attributes.KT_SIGNUP));
  assert.deepEqual(sent, {
    email: EMAIL,
    includeListIds: [12],
    templateId: 34,
    redirectionUrl: `https://howtokissbetter.com/kiss-test/result/?email=confirmed#a=${ANSWERS}`,
    attributes: {
      KT_ARCHETYPE: result.archetype.name,
      KT_SCORE: String(result.score),
      KT_BAND: result.band.label,
      KT_COSTLIEST: KissScore.applyPronouns(top.costTitle ?? top.title),
      KT_ANSWERS: ANSWERS,
      KT_SIGNUP: sent.attributes.KT_SIGNUP,
      KT_SOURCE: "result-email",
    },
  });
  // Brevo's KT_* attributes are text-typed, so every value goes as a string.
  for (const [name, value] of Object.entries(sent.attributes)) {
    assert.equal(typeof value, "string", name);
  }
  assert.match(sent.attributes.KT_SCORE, /^\d{1,3}$/);
  assert.match(sent.attributes.KT_SIGNUP, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(sent.attributes.KT_ARCHETYPE, "The Natural");
  assert.notEqual(sent.attributes.KT_SCORE, "99");
});

test("Brevo's 204 counts as success too", async () => {
  const response = await handlerWith({ fetchImpl: brevo(204).fetchImpl })(post(valid()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("a perfect score has no costliest habit, so KT_COSTLIEST is left out", async () => {
  const { calls, fetchImpl } = brevo(201);
  await handlerWith({ fetchImpl })(post(valid({ answers: "bbbcbbbbab" })));

  assert.equal(KissScore.score("bbbcbbbbab").score, 100);
  const { attributes } = JSON.parse(calls[0].options.body);
  assert.equal(Object.hasOwn(attributes, "KT_COSTLIEST"), false);
  assert.equal(attributes.KT_SCORE, "100");
});

test("a filled honeypot is told it worked and nothing is sent", async () => {
  const { calls, fetchImpl } = brevo(201);
  const handler = handlerWith({ env: {}, fetchImpl });

  for (const website of ["https://spam.example", "x"]) {
    const response = await handler(post(valid({ website })));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  }
  assert.equal(calls.length, 0);
});

test("the 18+ box must be ticked", async () => {
  const { calls, fetchImpl } = brevo(201);
  const handler = handlerWith({ fetchImpl });

  for (const adult of [undefined, false, "true", 1]) {
    await expectError(await handler(post(valid({ adult }))), 400, "adult_required");
  }
  assert.equal(calls.length, 0);
});

test("a missing, malformed or oversized email is refused", async () => {
  const { calls, fetchImpl } = brevo(201);
  const handler = handlerWith({ fetchImpl });
  const long = `${"a".repeat(243)}@example.com`;

  assert.equal(long.length, 255);
  for (const email of [undefined, 7, "", "   ", "reader", "reader@example", "read er@example.com", "a@b@c.com", long]) {
    await expectError(await handler(post(valid({ email }))), 400, "bad_email");
  }
  assert.equal(calls.length, 0);
});

test("invalid or malformed answers and bodies are refused before Brevo is called", async () => {
  const { calls, fetchImpl } = brevo(201);
  const handler = handlerWith({ fetchImpl });

  for (const answers of [undefined, 7, "", "bbcbbcbbc", "bbcbbcbbce", "zzzzzzzzzz"]) {
    await expectError(await handler(post(valid({ answers }))), 400, "bad_request");
  }
  for (const body of ["{", "42", "null"]) {
    await expectError(await handler(post(body)), 400, "bad_request");
  }
  await expectError(await handler(post(null)), 413, "too_large");
  await expectError(await handler(post(valid(), { origin: "https://howtokissbetter.com" }, "GET")), 405, "method_not_allowed");
  assert.equal(calls.length, 0);
});

test("answers 503 while any of the three Brevo settings is missing", async () => {
  const { calls, fetchImpl } = brevo(201);

  for (const name of Object.keys(ENV)) {
    const env = { ...ENV, [name]: "" };
    await expectError(await handlerWith({ env, fetchImpl })(post(valid())), 503, "email_unavailable");
  }
  await expectError(await handlerWith({ env: {}, fetchImpl })(post(valid())), 503, "email_unavailable");
  assert.equal(calls.length, 0);
});

test("answers 501 while the report module or the engine is absent", async () => {
  for (const loaders of [{ loadScore: async () => null }, { loadReport: async () => null }]) {
    const handler = createKissEmailHandler({
      env: ENV,
      fetchImpl: brevo(201).fetchImpl,
      loadScore: async () => KissScore,
      loadReport: async () => realReporter,
      ...loaders,
    });
    await expectError(await handler(post(valid())), 501, "report_unavailable");
  }
});

test("a Brevo refusal or a network failure answers 502 and logs only status and code", async (context) => {
  const warn = context.mock.method(console, "warn", () => {});
  const refusal = brevo(400, { code: "invalid_parameter", message: `Contact ${EMAIL} is blocklisted (${ANSWERS})` });

  await expectError(await handlerWith({ fetchImpl: refusal.fetchImpl })(post(valid())), 502, "email_failed");
  await expectError(await handlerWith({ fetchImpl: brevo(500).fetchImpl })(post(valid())), 502, "email_failed");
  // 200 is not one of Brevo's success codes for this call.
  await expectError(await handlerWith({ fetchImpl: brevo(200, {}).fetchImpl })(post(valid())), 502, "email_failed");
  const offline = async () => { throw new TypeError(`fetch failed for ${EMAIL}`); };
  await expectError(await handlerWith({ fetchImpl: offline })(post(valid())), 502, "email_failed");

  assert.deepEqual(warn.mock.calls.map((call) => call.arguments), [
    ["brevo_doi_failed", 400, "invalid_parameter"],
    ["brevo_doi_failed", 500, ""],
    ["brevo_doi_failed", 200, ""],
    ["brevo_doi_failed", "network", "TypeError"],
  ]);
});

test("no email address or answers reach the logs on any path", async (context) => {
  const logged = [];
  for (const method of ["log", "info", "warn", "error"]) {
    context.mock.method(console, method, (...args) => logged.push(args));
  }
  const outcomes = [
    brevo(201).fetchImpl,
    brevo(204).fetchImpl,
    brevo(400, { code: "invalid_parameter", message: `bad ${EMAIL} ${ANSWERS}` }).fetchImpl,
    async () => { throw new Error(`${EMAIL} ${ANSWERS}`); },
  ];
  for (const fetchImpl of outcomes) {
    await handlerWith({ fetchImpl })(post(valid()));
  }
  await handlerWith({ env: {} })(post(valid()));
  await handlerWith()(post(valid({ website: "x" })));
  await handlerWith()(post(valid({ email: "nope" })));

  assert.ok(logged.length > 0);
  const text = JSON.stringify(logged);
  assert.equal(text.includes(EMAIL), false);
  assert.equal(text.includes(ANSWERS), false);
});

test("CORS: allowlisted origins get headers, others are refused, preflight is empty", async () => {
  const handler = handlerWith();

  const preflight = await handler(post(null, { origin: "https://www.howtokissbetter.com" }, "OPTIONS"));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://www.howtokissbetter.com");
  assert.equal(preflight.headers.get("access-control-allow-headers"), "content-type");

  const foreign = await handler(post(valid(), { origin: "https://evil.example" }));
  await expectError(foreign, 403, "bad_origin");
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);
});

test("a post with neither an allowed origin nor a site referer sends nothing", async () => {
  const { calls, fetchImpl } = brevo(201);
  const handler = handlerWith({ fetchImpl });

  await expectError(await handler(post(valid(), {})), 403, "bad_origin");
  await expectError(await handler(post(valid(), { referer: "https://evil.example/kiss-test/result/" })), 403, "bad_origin");
  assert.equal(calls.length, 0);

  const fromSite = await handler(post(valid(), { referer: "https://howtokissbetter.com/kiss-test/result/" }));
  assert.equal(fromSite.status, 200);
  assert.equal(calls.length, 1);
});

test("one IP gets five sends per ten minutes, then a 429 until the window passes", async () => {
  const { calls, fetchImpl } = brevo(201);
  let time = 1_000_000;
  const handler = createKissEmailHandler({
    env: ENV,
    fetchImpl,
    loadScore: async () => KissScore,
    loadReport: async () => realReporter,
    now: () => time,
  });
  const from = (ip) => post(valid(), { origin: "https://howtokissbetter.com", "x-forwarded-for": `${ip}, 10.0.0.1` });

  for (let i = 0; i < 5; i += 1) {
    assert.equal((await handler(from("203.0.113.7"))).status, 200);
  }
  await expectError(await handler(from("203.0.113.7")), 429, "rate_limited");
  assert.equal((await handler(from("198.51.100.4"))).status, 200, "another reader is unaffected");
  assert.equal(calls.length, 6);

  time += 10 * 60 * 1_000 + 1;
  assert.equal((await handler(from("203.0.113.7"))).status, 200);
  assert.equal(calls.length, 7);
});

test("route adapter caps the body, refuses malformed JSON, and answers preflight", async () => {
  const url = "https://functions.example/api/kiss-email";
  const preflight = await routeOptions(new Request(url, { method: "OPTIONS", headers: { origin: "https://howtokissbetter.com" } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://howtokissbetter.com");

  const malformed = await routePost(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://howtokissbetter.com" },
    body: "{",
  }));
  await expectError(malformed, 400, "bad_request");

  const oversized = await routePost(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://howtokissbetter.com" },
    body: "x".repeat(2_049),
  }));
  await expectError(oversized, 413, "too_large");
});
