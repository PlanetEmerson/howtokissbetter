import assert from "node:assert/strict";
import test from "node:test";

import { OPTIONS as routeOptions, POST as routePost } from "../api/kiss-free.js";
import { createKissFreeHandler } from "../src/kiss-free.js";

const ENV = {};
const ENGINE = { VERSION: 1, isValidAnswers: (answers) => /^[a-d]{10}$/.test(answers) };
const BLURBS = [
  { key: "R", title: "You stay when they pull back", text: "Most people chase. You wait." },
  { key: "P", title: "You let the moment stretch", text: "The pause is part of the kiss." },
];
const REPORTER = {
  buildReport: (answers) => ({
    free: { strongestBlurbs: BLURBS, answers },
    paid: { sections: [{ id: "score", title: `Secret for ${answers}` }] },
  }),
};

function handlerWith({ loadScore = async () => ENGINE, loadReport = async () => REPORTER } = {}) {
  return createKissFreeHandler({ env: ENV, loadScore, loadReport });
}

function post(body, headers = { origin: "https://howtokissbetter.com" }, method = "POST") {
  return { method, headers, bodyText: typeof body === "string" || body === null ? body : JSON.stringify(body) };
}

async function expectError(response, status, error) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { ok: false, error });
}

test("valid answers return only the strongest blurbs", async () => {
  const response = await handlerWith()(post({ answers: " ABCDabcdAB " }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, free: { strongestBlurbs: BLURBS } });
});

test("invalid or malformed answers are refused before the report is built", async () => {
  let built = 0;
  const handler = handlerWith({
    loadReport: async () => ({ buildReport: (answers) => { built += 1; return REPORTER.buildReport(answers); } }),
  });
  const bad = ["{", "42", "[]", "null", {}, { answers: 7 }, { answers: "abcdabcda" }, { answers: "abcdabcdae" }, { answers: "" }];

  for (const body of bad) {
    await expectError(await handler(post(body)), 400, "bad_request");
  }
  await expectError(await handler(post(null)), 413, "too_large");
  await expectError(await handler(post({ answers: "abcdabcdab" }, { origin: "https://howtokissbetter.com" }, "GET")), 405, "method_not_allowed");
  assert.equal(built, 0);
});

test("answers 501 while the report module or the engine is absent", async () => {
  await expectError(await handlerWith({ loadReport: async () => null })(post({ answers: "abcdabcdab" })), 501, "report_unavailable");
  await expectError(await handlerWith({ loadScore: async () => null })(post({ answers: "abcdabcdab" })), 501, "report_unavailable");
});

test("CORS: allowlisted origins get headers, others are refused, preflight is empty", async () => {
  const handler = handlerWith();

  const allowed = await handler(post({ answers: "abcdabcdab" }, { origin: "https://www.howtokissbetter.com" }));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://www.howtokissbetter.com");
  assert.equal(allowed.headers.get("vary"), "Origin");

  const preflight = await handler(post(null, { origin: "https://howtokissbetter.com" }, "OPTIONS"));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(preflight.headers.get("access-control-allow-headers"), "content-type");

  const foreign = await handler(post({ answers: "abcdabcdab" }, { origin: "https://evil.example" }));
  await expectError(foreign, 403, "bad_origin");
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);

  const noOrigin = await handler(post({ answers: "abcdabcdab" }, {}));
  assert.equal(noOrigin.status, 200);
  assert.equal(noOrigin.headers.get("access-control-allow-origin"), null);

  const extra = createKissFreeHandler({
    env: { KISS_EXTRA_ORIGINS: "http://localhost:8000" },
    loadScore: async () => ENGINE,
    loadReport: async () => REPORTER,
  });
  const local = await extra(post({ answers: "abcdabcdab" }, { origin: "http://localhost:8000" }));
  assert.equal(local.headers.get("access-control-allow-origin"), "http://localhost:8000");
});

test("route adapter reads text/plain bodies, caps them, and answers preflight", async () => {
  const preflight = await routeOptions(new Request("https://functions.example/api/kiss-free", {
    method: "OPTIONS",
    headers: { origin: "https://howtokissbetter.com" },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://howtokissbetter.com");

  const malformed = await routePost(new Request("https://functions.example/api/kiss-free", {
    method: "POST",
    headers: { "content-type": "text/plain", origin: "https://howtokissbetter.com" },
    body: JSON.stringify({ answers: 7 }),
  }));
  await expectError(malformed, 400, "bad_request");

  const oversized = await routePost(new Request("https://functions.example/api/kiss-free", {
    method: "POST",
    headers: { "content-type": "text/plain", origin: "https://howtokissbetter.com" },
    body: "x".repeat(2_049),
  }));
  await expectError(oversized, 413, "too_large");
});
