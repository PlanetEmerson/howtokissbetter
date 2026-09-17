import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { REPORT_TOKEN_TTL_SECONDS, signToken, verifyToken } from "../src/unlock-token.js";

const SECRET = "unlock-secret-for-tests";
const NOW = 1_758_200_000;
const SESSION = "cs_test_a1B2c3D4e5F6g7H8i9J0";
const DAY = 86_400;

function rawToken(secret, encodedPayload) {
  const sig = createHmac("sha256", secret).update(`kt1.${encodedPayload}`).digest("base64url");
  return `kt1.${encodedPayload}.${sig}`;
}

test("book tokens round trip and never expire", () => {
  const payload = { s: SESSION, p: "book", t: NOW - 400 * DAY };
  const token = signToken(SECRET, payload);

  assert.match(token, /^kt1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(verifyToken(SECRET, token, NOW), payload);
});

test("report tokens round trip with answers and version and shed unknown fields", () => {
  const token = signToken(SECRET, { s: SESSION, p: "report", a: "abcdabcdab", v: 1, t: NOW, extra: "ignored" });

  assert.deepEqual(verifyToken(SECRET, token, NOW), { s: SESSION, p: "report", t: NOW, a: "abcdabcdab", v: 1 });
  assert.deepEqual(verifyToken(SECRET, signToken(SECRET, { s: SESSION, p: "report", a: "abcd", v: "1", t: NOW }), NOW).v, "1");
});

test("report tokens stop verifying 30 days after issue", () => {
  const token = signToken(SECRET, { s: SESSION, p: "report", a: "abcdabcdab", v: 1, t: NOW });

  assert.ok(verifyToken(SECRET, token, NOW + REPORT_TOKEN_TTL_SECONDS));
  assert.equal(verifyToken(SECRET, token, NOW + REPORT_TOKEN_TTL_SECONDS + 1), null);
});

test("tampered, forged, and malformed tokens are rejected", () => {
  const token = signToken(SECRET, { s: SESSION, p: "book", t: NOW });
  const [prefix, payload, sig] = token.split(".");
  const upgraded = Buffer.from(JSON.stringify({ s: SESSION, p: "report", a: "abcdabcdab", v: 1, t: NOW })).toString("base64url");
  const flippedSig = `${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;

  const cases = [
    `${prefix}.${upgraded}.${sig}`,
    `${prefix}.${payload}.${flippedSig}`,
    `${prefix}.${payload}.${sig.slice(0, 20)}`,
    `kt0.${payload}.${sig}`,
    `${prefix}.${payload}`,
    `${token}.extra`,
    signToken("other-secret", { s: SESSION, p: "book", t: NOW }),
    rawToken(SECRET, Buffer.from("not json").toString("base64url")),
    rawToken(SECRET, Buffer.from(JSON.stringify({ s: "cs_test_short", p: "book", t: NOW })).toString("base64url")),
    rawToken(SECRET, Buffer.from(JSON.stringify({ s: SESSION, p: "tour", t: NOW })).toString("base64url")),
    rawToken(SECRET, Buffer.from(JSON.stringify({ s: SESSION, p: "book", t: "1" })).toString("base64url")),
    rawToken(SECRET, Buffer.from(JSON.stringify({ s: SESSION, p: "report", t: NOW })).toString("base64url")),
    rawToken(SECRET, Buffer.from(JSON.stringify({ s: SESSION, p: "report", a: "ABC", v: 1, t: NOW })).toString("base64url")),
    rawToken(SECRET, Buffer.from(JSON.stringify({ s: SESSION, p: "report", a: "abc", v: "x", t: NOW })).toString("base64url")),
    rawToken(SECRET, Buffer.from(JSON.stringify([SESSION])).toString("base64url")),
    "",
    "kt1..",
  ];
  for (const bad of cases) {
    assert.equal(verifyToken(SECRET, bad, NOW), null, bad);
  }
  assert.equal(verifyToken("", token, NOW), null);
  assert.equal(verifyToken(SECRET, 42, NOW), null);
  assert.equal(verifyToken(SECRET, `${token}${"a".repeat(3000)}`, NOW), null);
});
