import assert from "node:assert/strict";
import test from "node:test";

import { createCheckoutHandler } from "../src/checkout.js";
import { STRIPE_API_VERSION } from "../src/stripe.js";

const ENV = { STRIPE_SECRET_KEY: "sk_test_checkout_secret_for_tests" };
const SESSION_URL = "https://checkout.stripe.com/c/pay/cs_test_a1B2c3D4e5F6g7H8i9J0";
const ENGINE = { VERSION: 1, isValidAnswers: (answers) => /^[a-d]{10}$/.test(answers) };
const BOOK_FIELDS = {
  product: "book",
  src: "how-to-kiss-someones-neck",
  placement: "buy-mobile-bar",
  entry: "bar",
  cancel: "/blog/how-to-kiss-someones-neck/",
  ga_cid: "123456789.987654321",
  ga_sid: "1758150000",
};
const SUBMIT_MESSAGE =
  "One-time payment. You confirm you are 18 or older. 30-day guarantee: not worth it? Email contact@howtokissbetter.com for a full refund. You keep it either way.";
const EXCLUDED_FORM = {
  "excluded_payment_method_types[0]": "klarna",
  "excluded_payment_method_types[1]": "amazon_pay",
  "excluded_payment_method_types[2]": "crypto",
};
const BRANDING_FORM = {
  "branding_settings[display_name]": "How to Kiss Better",
  "branding_settings[background_color]": "#2D2D2D",
  "branding_settings[button_color]": "#D4AF37",
  "branding_settings[border_style]": "rounded",
  "branding_settings[font_family]": "inter",
  "branding_settings[icon][type]": "url",
  "branding_settings[icon][url]": "https://howtokissbetter.com/assets/images/kiss-icon-512.png",
};

function request(fields, { method = "POST", headers = { origin: "https://howtokissbetter.com" }, bodyText } = {}) {
  return {
    method,
    headers,
    bodyText: bodyText === undefined ? new URLSearchParams(fields).toString() : bodyText,
  };
}

function created() {
  return new Response(JSON.stringify({ id: "cs_test_a1B2c3D4e5F6g7H8i9J0", url: SESSION_URL }), { status: 200 });
}

function handlerWith({ env = ENV, respond = created, loadScore = async () => ENGINE } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return respond(url, options);
  };
  return { handler: createCheckoutHandler({ env, fetchImpl, loadScore }), calls };
}

function decodedForm(call) {
  return Object.fromEntries(new URLSearchParams(call.options.body));
}

test("rejects methods other than POST and OPTIONS", async () => {
  const { handler, calls } = handlerWith();

  const response = await handler(request(BOOK_FIELDS, { method: "GET" }));

  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { ok: false, error: "method_not_allowed" });
  assert.equal(calls.length, 0);
});

test("answers preflight with CORS headers only for allowlisted origins", async () => {
  const { handler } = handlerWith();

  const allowed = await handler(request(BOOK_FIELDS, { method: "OPTIONS", headers: { origin: "https://www.howtokissbetter.com" } }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://www.howtokissbetter.com");
  assert.equal(allowed.headers.get("cache-control"), "no-store");

  const denied = await handler(request(BOOK_FIELDS, { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  assert.equal(denied.status, 204);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("refuses posts that do not come from the site", async () => {
  const { handler, calls } = handlerWith();
  const headerSets = [
    { origin: "https://evil.example" },
    { origin: "https://howtokissbetter.com.evil.example" },
    { referer: "https://evil.example/post/" },
    { referer: "https://howtokissbetter.com.evil.example/post/" },
    {},
  ];

  for (const headers of headerSets) {
    const response = await handler(request(BOOK_FIELDS, { headers }));
    assert.equal(response.status, 403, JSON.stringify(headers));
    assert.deepEqual(await response.json(), { ok: false, error: "bad_origin" });
  }
  assert.equal(calls.length, 0);
});

test("accepts a referer from the site when the Origin header is missing", async () => {
  const { handler, calls } = handlerWith();

  const response = await handler(request(BOOK_FIELDS, { headers: { referer: "https://www.howtokissbetter.com/blog/x/" } }));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), SESSION_URL);
  assert.equal(calls.length, 1);
});

test("KISS_EXTRA_ORIGINS adds QA origins to the allowlist", async () => {
  const env = { ...ENV, KISS_EXTRA_ORIGINS: "http://localhost:8000, http://127.0.0.1:8000" };
  const { handler } = handlerWith({ env });

  const response = await handler(request(BOOK_FIELDS, { headers: { origin: "http://127.0.0.1:8000" } }));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), SESSION_URL);
});

test("rejects an oversized body before validation", async () => {
  const { handler, calls } = handlerWith();

  const response = await handler(request(BOOK_FIELDS, { bodyText: null }));

  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test("reports missing configuration as JSON instead of redirecting", async () => {
  const { handler, calls } = handlerWith({ env: {} });

  const response = await handler(request(BOOK_FIELDS));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: "server_config" });
  assert.equal(calls.length, 0);
});

test("redirects invalid fields back to the cancel path", async () => {
  const { handler, calls } = handlerWith();
  const invalid = [
    { product: "bundle" },
    { product: "" },
    { src: "Neck" },
    { src: "a".repeat(101) },
    { placement: "buy_bar" },
    { placement: "a".repeat(41) },
    { entry: "a".repeat(21) },
    { ga_cid: "GA1.1.123.456" },
    { ga_sid: "abc" },
  ];

  for (const overrides of invalid) {
    const response = await handler(request({ ...BOOK_FIELDS, ...overrides }));
    assert.equal(response.status, 303, JSON.stringify(overrides));
    assert.equal(response.headers.get("location"), "https://howtokissbetter.com/blog/how-to-kiss-someones-neck/?checkout=invalid");
  }

  for (const cancel of ["//evil.example/", "/a\\b", "/post/#top", "blog/", `/${"a".repeat(200)}`]) {
    const response = await handler(request({ ...BOOK_FIELDS, cancel }));
    assert.equal(response.status, 303, cancel);
    assert.equal(response.headers.get("location"), "https://howtokissbetter.com/?checkout=invalid");
  }

  const withQuery = await handler(request({ ...BOOK_FIELDS, product: "x", cancel: "/kiss-test/result/?from=neck" }));
  assert.equal(withQuery.headers.get("location"), "https://howtokissbetter.com/kiss-test/result/?from=neck&checkout=invalid");
  assert.equal(calls.length, 0);
});

test("creates a branded book session with the exact form contract and redirects to it", async () => {
  const { handler, calls } = handlerWith();

  const response = await handler(request(BOOK_FIELDS));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), SESSION_URL);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "");
  assert.equal(calls.length, 1);

  const [call] = calls;
  assert.equal(call.url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(call.options.method, "POST");
  assert.deepEqual(call.options.headers, {
    Authorization: `Bearer ${ENV.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Stripe-Version": STRIPE_API_VERSION,
  });
  assert.ok(call.options.body.includes("session_id%3D%7BCHECKOUT_SESSION_ID%7D"));

  const { client_reference_id, ...form } = decodedForm(call);
  assert.match(client_reference_id, /^hkb_book_how-to-kiss-someones-neck_[a-f0-9]{8}$/);
  assert.deepEqual(form, {
    mode: "payment",
    submit_type: "pay",
    locale: "auto",
    customer_creation: "if_required",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": "999",
    "line_items[0][price_data][product_data][name]": "Kiss Perfect Now (PDF + EPUB)",
    "line_items[0][price_data][product_data][description]": "The 183-page kissing playbook. Instant download after payment.",
    "line_items[0][price_data][product_data][images][0]": "https://howtokissbetter.com/assets/images/book/cover-stripe.jpg",
    success_url: "https://howtokissbetter.com/book/thanks/?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://howtokissbetter.com/blog/how-to-kiss-someones-neck/?checkout=canceled",
    "metadata[kind]": "kiss_ebook",
    "metadata[site]": "howtokissbetter",
    "metadata[product]": "book",
    "metadata[src]": "how-to-kiss-someones-neck",
    "metadata[placement]": "buy-mobile-bar",
    "metadata[entry]": "bar",
    "metadata[ga_cid]": "123456789.987654321",
    "metadata[ga_sid]": "1758150000",
    "payment_intent_data[description]": "Kiss Perfect Now ebook (howtokissbetter.com)",
    "payment_intent_data[statement_descriptor_suffix]": "KISSBOOK",
    "payment_intent_data[metadata][kind]": "kiss_ebook",
    "payment_intent_data[metadata][site]": "howtokissbetter",
    "custom_text[submit][message]": SUBMIT_MESSAGE,
    ...EXCLUDED_FORM,
    ...BRANDING_FORM,
  });

  assert.deepEqual(
    ["[0]", "[1]", "[2]"].map((index) => form[`excluded_payment_method_types${index}`]),
    ["klarna", "amazon_pay", "crypto"],
  );
  assert.equal(Object.keys(form).some((key) => key.startsWith("payment_method_types")), false);

  const responseText = `${JSON.stringify([...response.headers])}${await response.text()}`;
  assert.equal(responseText.includes(ENV.STRIPE_SECRET_KEY), false);
});

test("defaults src to direct and omits empty attribution fields", async () => {
  const { handler, calls } = handlerWith({ env: { ...ENV, KISS_SITE_ORIGIN: "https://preview.howtokissbetter.com" } });

  const response = await handler(request({ product: "book" }));

  assert.equal(response.status, 303);
  const { client_reference_id, ...form } = decodedForm(calls[0]);
  assert.match(client_reference_id, /^hkb_book_direct_[a-f0-9]{8}$/);
  assert.equal(form["metadata[src]"], "direct");
  assert.equal(form.success_url, "https://preview.howtokissbetter.com/book/thanks/?session_id={CHECKOUT_SESSION_ID}");
  assert.equal(form.cancel_url, "https://preview.howtokissbetter.com/?checkout=canceled");
  for (const key of ["metadata[placement]", "metadata[entry]", "metadata[ga_cid]", "metadata[ga_sid]", "metadata[answers]", "metadata[v]"]) {
    assert.equal(key in form, false, key);
  }
});

test("creates a report session carrying the canonical answers and engine version", async () => {
  const { handler, calls } = handlerWith();

  const response = await handler(request({
    product: "report",
    src: "signs-youre-a-bad-kisser",
    placement: "quiz-paywall",
    entry: "quiz",
    cancel: "/kiss-test/result/?from=signs-youre-a-bad-kisser",
    answers: " ABCDABCDAB ",
    v: "1",
  }));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), SESSION_URL);
  const { client_reference_id, ...form } = decodedForm(calls[0]);
  assert.match(client_reference_id, /^hkb_report_signs-youre-a-bad-kisser_[a-f0-9]{8}$/);
  assert.deepEqual(form, {
    mode: "payment",
    submit_type: "pay",
    locale: "auto",
    customer_creation: "if_required",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": "499",
    "line_items[0][price_data][product_data][name]": "Kiss Test: your full report",
    "line_items[0][price_data][product_data][description]": "Your score, the three habits costing you most, the fixes, and your 7-day plan.",
    success_url: "https://howtokissbetter.com/kiss-test/result/?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://howtokissbetter.com/kiss-test/result/?from=signs-youre-a-bad-kisser&checkout=canceled",
    "metadata[kind]": "kiss_report",
    "metadata[site]": "howtokissbetter",
    "metadata[product]": "report",
    "metadata[src]": "signs-youre-a-bad-kisser",
    "metadata[placement]": "quiz-paywall",
    "metadata[entry]": "quiz",
    "metadata[answers]": "abcdabcdab",
    "metadata[v]": "1",
    "payment_intent_data[description]": "Kiss Test full report (howtokissbetter.com)",
    "payment_intent_data[statement_descriptor_suffix]": "KISSTEST",
    "payment_intent_data[metadata][kind]": "kiss_report",
    "payment_intent_data[metadata][site]": "howtokissbetter",
    "custom_text[submit][message]": SUBMIT_MESSAGE,
    ...EXCLUDED_FORM,
    ...BRANDING_FORM,
  });
});

test("report checkout is unavailable until the scoring engine ships", async () => {
  const { handler, calls } = handlerWith({ loadScore: async () => null });

  const response = await handler(request({ product: "report", cancel: "/kiss-test/result/", answers: "abcdabcdab", v: "1" }));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://howtokissbetter.com/kiss-test/result/?checkout=unavailable");
  assert.equal(calls.length, 0);
});

test("report checkout rejects answers the engine does not accept or a stale version", async () => {
  const { handler, calls } = handlerWith();

  for (const overrides of [{ answers: "abcdabcdaz" }, { answers: "" }, { v: "2" }, { v: "" }]) {
    const response = await handler(request({ product: "report", cancel: "/kiss-test/result/", answers: "abcdabcdab", v: "1", ...overrides }));
    assert.equal(response.status, 303, JSON.stringify(overrides));
    assert.equal(response.headers.get("location"), "https://howtokissbetter.com/kiss-test/result/?checkout=invalid");
  }
  assert.equal(calls.length, 0);
});

test("sends the visitor back with checkout=failed when Stripe does not return a session", async () => {
  const failures = [
    () => new Response(JSON.stringify({ error: { type: "api_error" } }), { status: 500 }),
    () => new Response(JSON.stringify({ error: { code: "parameter_invalid_empty" } }), { status: 400 }),
    () => { throw new Error("socket hang up"); },
    () => new Response(JSON.stringify({ id: "cs_test_1" }), { status: 200 }),
    () => new Response(JSON.stringify({ id: "cs_test_1", url: "javascript:alert(1)" }), { status: 200 }),
  ];

  for (const respond of failures) {
    const { handler } = handlerWith({ respond });
    const response = await handler(request(BOOK_FIELDS));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://howtokissbetter.com/blog/how-to-kiss-someones-neck/?checkout=failed");
  }
});
