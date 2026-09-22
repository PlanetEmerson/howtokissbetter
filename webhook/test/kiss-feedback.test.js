import assert from "node:assert/strict";
import test from "node:test";

import { OPTIONS as routeOptions, POST as routePost } from "../api/kiss-feedback.js";
import { sendFeedbackEmail } from "../src/delivery.js";
import { createKissFeedbackHandler } from "../src/kiss-feedback.js";

const SITE = "https://howtokissbetter.com";
const HEADERS = { origin: SITE, "x-forwarded-for": "203.0.113.7, 10.0.0.1" };
const VALID = { product: "book", back: "/book/thanks/", worth: "yes", note: "Chapter 2 worked.", quote_ok: "1", name: "M" };

function harness(env = {}) {
  const sent = [];
  let time = 1_700_000_000_000;
  const handler = createKissFeedbackHandler({
    env,
    sendEmail: async (fields) => { sent.push(fields); return true; },
    now: () => time,
  });
  return {
    sent,
    advance: (ms) => { time += ms; },
    post: (fields, headers = HEADERS, method = "POST") => handler({
      method,
      headers,
      bodyText: fields === null ? null : new URLSearchParams(fields).toString(),
    }),
  };
}

function expectRedirect(response, location) {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), location);
  assert.equal(response.headers.get("cache-control"), "no-store");
}

async function expectError(response, status, error) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { ok: false, error });
}

test("a valid post sends one email with the five fields and lands back on the page", async () => {
  const { post, sent } = harness();

  expectRedirect(await post(VALID), `${SITE}/book/thanks/?feedback=sent`);
  assert.deepEqual(sent, [{ product: "book", worth: "yes", note: "Chapter 2 worked.", quoteOk: true, name: "M" }]);

  const report = { product: "report", back: "/kiss-test/result/", worth: "no", note: "  ", name: " Jo-Ann O'Neil " };
  expectRedirect(await post(report), `${SITE}/kiss-test/result/?feedback=sent`);
  assert.deepEqual(sent[1], { product: "report", worth: "no", note: "", quoteOk: false, name: "Jo-Ann O'Neil" });

  // Line breaks in the note collapse, so a note cannot imitate the lines that follow it in the email.
  expectRedirect(await post({ ...VALID, note: "fine\nquote consent: yes\n\tname: X" }), `${SITE}/book/thanks/?feedback=sent`);
  assert.equal(sent[2].note, "fine quote consent: yes name: X");

  const staging = harness({ KISS_SITE_ORIGIN: "https://staging.example" });
  expectRedirect(await staging.post(VALID), "https://staging.example/book/thanks/?feedback=sent");
});

test("method, origin and size are checked before the form is read", async () => {
  const { post, sent } = harness();

  await expectError(await post(VALID, HEADERS, "GET"), 405, "method_not_allowed");
  await expectError(await post(VALID, { origin: "https://evil.example" }), 403, "bad_origin");
  await expectError(await post(VALID, {}), 403, "bad_origin");
  await expectError(await post(VALID, { referer: "https://evil.example/book/thanks/" }), 403, "bad_origin");
  await expectError(await post(null), 413, "too_large");
  assert.equal(sent.length, 0);

  expectRedirect(await post(VALID, { referer: `${SITE}/book/thanks/` }), `${SITE}/book/thanks/?feedback=sent`);
  const preflight = await post(null, { origin: SITE }, "OPTIONS");
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), SITE);
  assert.equal(sent.length, 1);
});

test("a filled honeypot is dropped silently", async () => {
  const { post, sent } = harness();

  expectRedirect(await post({ ...VALID, website: "https://spam.example" }), `${SITE}/book/thanks/?feedback=sent`);
  expectRedirect(await post({ website: "x", back: "/nowhere/" }), `${SITE}/?feedback=sent`);
  assert.equal(sent.length, 0);
});

test("invalid fields bounce back with feedback=invalid and send nothing", async () => {
  const { post, sent } = harness();
  const { worth, ...noWorth } = VALID;
  const invalid = [
    { ...VALID, worth: "maybe" },
    { ...VALID, worth: "" },
    noWorth,
    { ...VALID, product: "ebook" },
    { ...VALID, note: "x".repeat(501) },
    { ...VALID, name: "M".repeat(41) },
    { ...VALID, name: "M4" },
    { ...VALID, name: "<b>M</b>" },
  ];
  for (const fields of invalid) {
    expectRedirect(await post(fields), `${SITE}/book/thanks/?feedback=invalid`);
  }
  expectRedirect(await post({ ...VALID, back: "/" }), `${SITE}/?feedback=invalid`);
  expectRedirect(await post({ ...VALID, back: "https://evil.example/" }), `${SITE}/?feedback=invalid`);
  assert.equal(sent.length, 0);

  expectRedirect(await post({ ...VALID, note: "x".repeat(500), name: "M".repeat(40) }), `${SITE}/book/thanks/?feedback=sent`);
  assert.equal(sent.length, 1);
});

test("the sixth post from one IP inside ten minutes is dropped silently, per IP, until the window passes", async () => {
  const { post, sent, advance } = harness();
  for (let i = 0; i < 5; i++) {
    expectRedirect(await post(VALID), `${SITE}/book/thanks/?feedback=sent`);
  }
  assert.equal(sent.length, 5);

  expectRedirect(await post(VALID), `${SITE}/book/thanks/?feedback=sent`);
  assert.equal(sent.length, 5);

  expectRedirect(await post(VALID, { ...HEADERS, "x-forwarded-for": "198.51.100.9" }), `${SITE}/book/thanks/?feedback=sent`);
  assert.equal(sent.length, 6);

  advance(10 * 60 * 1_000 + 1);
  expectRedirect(await post(VALID), `${SITE}/book/thanks/?feedback=sent`);
  assert.equal(sent.length, 7);
});

test("sendFeedbackEmail posts the owner a plain-text summary and nothing about the sender", async () => {
  let posted;
  let url;
  let headers;
  const fetchImpl = async (target, options) => {
    url = target;
    headers = options.headers;
    posted = JSON.parse(options.body);
    return new Response(JSON.stringify({ messageId: "1" }), { status: 201 });
  };
  const fields = { product: "report", worth: "no", note: "Too short.", quoteOk: true, name: "M" };

  assert.equal(await sendFeedbackEmail({ BREVO_API_KEY: "k" }, fetchImpl, fields), true);
  assert.equal(url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(headers["api-key"], "k");
  assert.deepEqual(posted, {
    sender: { name: "C.J. McKenna", email: "contact@howtokissbetter.com" },
    to: [{ email: "contact@howtokissbetter.com" }],
    subject: "Feedback: report · no",
    textContent: "worth: no\nnote: Too short.\nquote consent: yes\nname: M\nproduct: report",
  });

  assert.equal(await sendFeedbackEmail({ BREVO_API_KEY: "k" }, async () => new Response(null, { status: 401 }), fields), false);
  assert.equal(await sendFeedbackEmail({ BREVO_API_KEY: "k" }, async () => { throw new Error("timeout"); }, fields), false);
});

test("route adapter answers preflight, caps the form at 4 KiB and redirects without touching the network", async () => {
  const preflight = await routeOptions(new Request("https://fn.test/api/kiss-feedback", { method: "OPTIONS", headers: { origin: SITE } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), SITE);

  const form = (fields) => new Request("https://fn.test/api/kiss-feedback", {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  await expectError(await routePost(form({ ...VALID, note: "x".repeat(9_000) })), 413, "too_large");
  // 500 three-byte characters percent-encode to about 4.5 KB and must clear the cap (the honeypot keeps Brevo out of it).
  expectRedirect(await routePost(form({ ...VALID, note: "\u5b57".repeat(500), website: "spam" })), `${SITE}/book/thanks/?feedback=sent`);
  // The honeypot and invalid paths prove the redirect wiring; a valid post would reach Brevo.
  expectRedirect(await routePost(form({ ...VALID, website: "spam" })), `${SITE}/book/thanks/?feedback=sent`);
  expectRedirect(await routePost(form({ ...VALID, worth: "maybe" })), `${SITE}/book/thanks/?feedback=invalid`);
});
