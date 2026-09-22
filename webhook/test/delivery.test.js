import assert from "node:assert/strict";
import test from "node:test";

import { bookDownloads, sendBookEmail } from "../src/delivery.js";

test("bookDownloads presigns both files for one hour using the configured paths", async () => {
  const seen = [];
  const presignImpl = async ({ pathname, validUntil }) => {
    seen.push({ pathname, validUntil });
    return `https://blob.example/${pathname}`;
  };
  const before = Date.now();

  const result = await bookDownloads({ KISS_BOOK_PDF_PATH: "private/kpn.pdf" }, presignImpl);

  assert.deepEqual(result.downloads.map(({ label, url }) => ({ label, url })), [
    { label: "PDF", url: "https://blob.example/private/kpn.pdf" },
    { label: "EPUB", url: "https://blob.example/kiss-perfect-now/kiss-perfect-now.epub" },
  ]);
  assert.equal(result.error, undefined);
  for (const { validUntil } of seen) {
    assert.ok(validUntil >= before + 3_600_000 && validUntil <= Date.now() + 3_600_000);
  }
  assert.equal(result.downloads[0].expires, new Date(seen[0].validUntil).toISOString());
});

test("bookDownloads never throws to the caller", async () => {
  const result = await bookDownloads({}, async () => { throw new Error("no blob credentials"); });

  assert.deepEqual(result, { downloads: [], error: true });
});

test("sendBookEmail carries the refund line in both bodies", async () => {
  let posted;
  const fetchImpl = async (url, options) => {
    posted = JSON.parse(options.body);
    return new Response(JSON.stringify({ messageId: "1" }), { status: 201 });
  };
  assert.equal(await sendBookEmail({ BREVO_API_KEY: "k" }, fetchImpl, { to: "a@example.com", thanksUrl: "https://x/" }), true);
  const refund = "Not worth it? Email me within 30 days for a full refund. You keep the files either way.";
  assert.ok(posted.textContent.includes(`\n${refund}\n`));
  assert.ok(posted.htmlContent.includes(`<p>${refund}</p>`));
});

test("sendBookEmail reports Brevo failures as false", async () => {
  assert.equal(await sendBookEmail({ BREVO_API_KEY: "k" }, async () => new Response(null, { status: 401 }), { to: "a@example.com", thanksUrl: "https://x/" }), false);
  assert.equal(await sendBookEmail({ BREVO_API_KEY: "k" }, async () => { throw new Error("timeout"); }, { to: "a@example.com", thanksUrl: "https://x/" }), false);
  assert.equal(await sendBookEmail({ BREVO_API_KEY: "k" }, async () => new Response(JSON.stringify({ messageId: "1" }), { status: 201 }), { to: "a@example.com", thanksUrl: "https://x/" }), true);
});
