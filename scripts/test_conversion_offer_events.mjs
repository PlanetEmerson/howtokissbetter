import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const conversionSource = readFileSync(
  new URL("../assets/conversion.js", import.meta.url),
  "utf8",
);

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) {
      values.add(value);
    },
    contains(value) {
      return values.has(value);
    },
    toggle(value, force) {
      if (force === undefined ? !values.has(value) : force) {
        values.add(value);
      } else {
        values.delete(value);
      }
    },
  };
}

function makeElement({ tag = "div", text = "", dataset = {}, classes = [], attributes = {}, children = [] } = {}) {
  const element = {
    tagName: tag.toUpperCase(),
    attributes: { ...attributes },
    classList: makeClassList(classes),
    dataset: { ...dataset },
    children: [],
    parent: null,
    textContent: text,
    listeners: {},
    addEventListener(name, callback) {
      (this.listeners[name] ||= []).push(callback);
    },
    dispatch(name, event = {}) {
      (this.listeners[name] || []).forEach((callback) => callback(event));
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
    },
    appendChild(child) {
      child.parent = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((node) => node !== child);
    },
    get firstChild() {
      return this.children[0] || null;
    },
    querySelector(selector) {
      const match = selector.match(/^input\[name="([^"]+)"\]$/);
      if (match) {
        return this.children.find((child) => child.tagName === "INPUT" && child.name === match[1]) || null;
      }
      return null;
    },
    closest(selector) {
      let node = this;
      while (node) {
        if (selector === "[data-offer-link]" && Object.hasOwn(node.dataset, "offerLink")) {
          return node;
        }
        node = node.parent;
      }
      return null;
    },
  };
  children.forEach((child) => element.appendChild(child));
  return element;
}

function runPage({ body, querySelector = {}, querySelectorAll = {}, gaValues = {}, gtagMissing = false, fetchImpl, search = "", initialStorage = {} }) {
  const stored = new Map(Object.entries(initialStorage));
  const events = [];
  const timeouts = [];
  const clickHandlers = [];
  let ready;
  const document = {
    body,
    title: "Example",
    addEventListener(name, callback) {
      if (name === "DOMContentLoaded") {
        ready = callback;
      } else if (name === "click") {
        clickHandlers.push(callback);
      }
    },
    createElement(tag) {
      return makeElement({ tag });
    },
    getElementById() {
      return null;
    },
    querySelector(selector) {
      return Object.hasOwn(querySelector, selector) ? querySelector[selector] : null;
    },
    querySelectorAll(selector) {
      return querySelectorAll[selector] || [];
    },
  };
  const storage = {
    getItem(key) {
      return stored.has(key) ? stored.get(key) : null;
    },
    setItem(key, value) {
      stored.set(key, String(value));
    },
    removeItem(key) {
      stored.delete(key);
    },
  };
  const window = {
    fetch: fetchImpl,
    innerHeight: 844,
    localStorage: storage,
    location: { hash: "", pathname: "/blog/example-article/", search },
    matchMedia() {
      return { matches: true };
    },
    sessionStorage: storage,
    setTimeout(callback, delay) {
      timeouts.push({ callback, delay });
      return timeouts.length;
    },
  };
  if (!gtagMissing) {
    window.gtag = (...args) => {
      if (args[0] === "get") {
        args[3](gaValues[args[2]]);
        return;
      }
      events.push(args);
    };
  }
  window.window = window;

  vm.runInNewContext(conversionSource, {
    Array,
    Boolean,
    JSON,
    Math,
    Number,
    Object,
    String,
    URLSearchParams,
    document,
    window,
  });
  ready();

  return {
    click(element) {
      clickHandlers.forEach((handler) => handler({ target: element }));
    },
    events,
    stored,
    timeouts,
  };
}

function buyForm(placement, children) {
  const form = makeElement({
    tag: "form",
    dataset: {
      offerLink: "true",
      offerPlacement: placement,
      offerKey: "touch",
      offerVariant: "not-applicable",
      articleSlug: "example-article",
      chapterId: "chapter-06",
      checkoutForm: "",
      price: "9.99",
    },
    children,
  });
  form.submitCalls = 0;
  form.submit = () => {
    form.submitCalls += 1;
  };
  return form;
}

function articleFixture(options = {}) {
  const button = makeElement({ tag: "button", text: "Get the book · $9.99" });
  const form = buyForm("buy-article-quarter", [button]);
  const barTitle = makeElement({ tag: "strong", text: "The neck map is chapter 7" });
  const barCopy = makeElement({ tag: "span", text: "Kiss Perfect Now · one tap" });
  const barButton = makeElement({ tag: "button", text: "Get it · $9.99" });
  const barForm = buyForm("buy-mobile-bar", [barButton]);
  const bar = makeElement({
    tag: "aside",
    classes: ["mobile-buy-bar", "mobile-buy-bar--buy", "js-offer"],
    attributes: { "aria-hidden": "true", "aria-label": "Buy Kiss Perfect Now" },
    dataset: { offerPlacement: "buy-mobile-bar", offerKey: "touch", offerVariant: "not-applicable" },
    children: [makeElement({ tag: "p", children: [barTitle, barCopy] }), barForm],
  });
  const body = {
    classList: makeClassList(),
    dataset: {
      articleSlug: "example-article",
      chapterId: "chapter-06",
      offerKey: "touch",
      pageKind: "article",
    },
  };
  const page = runPage({
    body,
    querySelector: {
      ".mobile-buy-bar": bar,
      "article h1": makeElement({ text: "Example article" }),
      "article header": null,
      "[data-brevo-form]": null,
    },
    querySelectorAll: {
      ".js-offer": [],
      "form[data-checkout-form]": [form, barForm],
    },
    ...options,
  });
  return { ...page, bar, barButton, barCopy, barTitle, button, form };
}

function submitEvent() {
  const event = { prevented: false };
  event.preventDefault = () => {
    event.prevented = true;
  };
  return event;
}

function hiddenValue(form, name) {
  const input = form.querySelector(`input[name="${name}"]`);
  return input ? input.value : null;
}

test("offer_click on a buy form carries the placement, cluster, and retired variant", () => {
  const state = articleFixture();

  state.click(state.button);

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0][1], "offer_click");
  assert.equal(state.events[0][2].placement, "buy-article-quarter");
  assert.equal(state.events[0][2].offer_key, "touch");
  assert.equal(state.events[0][2].variant, "not-applicable");
  assert.equal(state.events[0][2].article, "example-article");
});

test("submitting a buy form fires begin_checkout with the GA ids attached, then submits once", () => {
  const state = articleFixture({ gaValues: { client_id: "1234567890.1234567890", session_id: "1700000000" } });
  const event = submitEvent();

  state.form.dispatch("submit", event);

  assert.equal(event.prevented, true);
  assert.equal(hiddenValue(state.form, "ga_cid"), "1234567890.1234567890");
  assert.equal(hiddenValue(state.form, "ga_sid"), "1700000000");
  assert.equal(state.events.length, 1);
  const [, name, params] = state.events[0];
  assert.equal(name, "begin_checkout");
  assert.equal(params.value, 9.99);
  assert.equal(params.currency, "USD");
  assert.equal(params.product, "book");
  assert.equal(params.placement, "buy-article-quarter");
  assert.equal(params.offer_key, "touch");
  assert.equal(params.items.length, 1);
  assert.equal(params.items[0].item_id, "kiss-book");
  assert.equal(params.items[0].item_name, "Kiss Perfect Now");
  assert.equal(params.items[0].price, 9.99);
  assert.equal(params.items[0].quantity, 1);
  assert.equal(state.form.submitCalls, 0);

  params.event_callback();
  params.event_callback();
  state.timeouts.forEach((timeout) => timeout.callback());
  assert.equal(state.form.submitCalls, 1);

  const second = submitEvent();
  state.form.dispatch("submit", second);
  assert.equal(second.prevented, true);
  assert.equal(state.events.length, 1);
  assert.equal(state.form.submitCalls, 1);
});

test("the fallback timer submits when gtag never calls back", () => {
  const state = articleFixture();

  state.form.dispatch("submit", submitEvent());

  assert.equal(state.timeouts.length, 1);
  assert.equal(state.timeouts[0].delay, 500);
  state.timeouts[0].callback();
  assert.equal(state.form.submitCalls, 1);
});

test("GA ids outside GA's own shape are not forwarded to the checkout", () => {
  const state = articleFixture({ gaValues: { client_id: "GA1.2.3", session_id: "abc" } });

  state.form.dispatch("submit", submitEvent());

  assert.equal(state.form.querySelector('input[name="ga_cid"]'), null);
  assert.equal(state.form.querySelector('input[name="ga_sid"]'), null);
});

test("without gtag the form submits natively", () => {
  const state = articleFixture({ gtagMissing: true });
  const event = submitEvent();

  state.form.dispatch("submit", event);

  assert.equal(event.prevented, false);
  assert.equal(state.form.submitCalls, 0);
  assert.equal(state.events.length, 0);
});

test("the mobile bar copy is untouched after DOMContentLoaded", () => {
  const state = articleFixture();

  assert.equal(state.barTitle.textContent, "The neck map is chapter 7");
  assert.equal(state.barCopy.textContent, "Kiss Perfect Now · one tap");
  assert.equal(state.barButton.textContent, "Get it · $9.99");
  assert.equal(state.bar.attributes["aria-label"], "Buy Kiss Perfect Now");
  assert.equal(state.bar.dataset.offerVariant, "not-applicable");
});

test("the retired mobile offer experiment key is never written", () => {
  const state = articleFixture();

  state.click(state.button);
  state.form.dispatch("submit", submitEvent());

  assert.equal(state.stored.has("kpn_mobile_offer_variant_v1"), false);
  assert.equal(state.stored.has("kpn_offer_variant_v1"), false);
});

function thanksFixture({ responses, search = "?session_id=cs_test_123", initialStorage = {} }) {
  const calls = [];
  const status = makeElement({ tag: "p", text: "static fallback", dataset: { thanksStatus: "", state: "static" } });
  const downloads = makeElement({ tag: "div", dataset: { thanksDownloads: "" } });
  const body = {
    classList: makeClassList(),
    dataset: { pageKind: "book-thanks", kissApi: "https://api.example" },
  };
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length, responses.length) - 1];
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return Promise.resolve({ status: next.status, json: () => Promise.resolve(next.body) });
  };
  const page = runPage({
    body,
    querySelector: {
      "[data-thanks-status]": status,
      "[data-thanks-downloads]": downloads,
      "[data-brevo-form]": null,
    },
    fetchImpl,
    search,
    initialStorage,
  });
  return { ...page, calls, downloads, status };
}

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("setupThanksPage verifies the session and renders the signed downloads", async () => {
  const state = thanksFixture({
    responses: [{
      status: 200,
      body: {
        ok: true,
        product: "book",
        token: "kt1.payload.signature",
        payload: {
          downloads: [
            { label: "PDF", url: "https://files.example/kiss.pdf" },
            { label: "EPUB", url: "https://files.example/kiss.epub" },
            { label: "<img onerror=alert(1)>", url: "javascript:alert(1)" },
          ],
        },
      },
    }],
  });

  await settle();

  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].url, "https://api.example/api/verify");
  assert.equal(state.calls[0].init.method, "POST");
  assert.equal(state.calls[0].init.headers["Content-Type"], "text/plain");
  assert.equal(state.calls[0].init.body, JSON.stringify({ session_id: "cs_test_123" }));
  assert.equal(state.downloads.children.length, 2);
  assert.equal(state.downloads.children[0].href, "https://files.example/kiss.pdf");
  assert.equal(state.downloads.children[0].textContent, "PDF");
  assert.equal(state.downloads.children[0].attributes.download, "");
  assert.equal(state.downloads.children[1].textContent, "EPUB");
  assert.equal(state.status.dataset.state, "ready");
  assert.match(state.status.textContent, /good for an hour/);
  assert.equal(state.stored.get("kt_book_token_v1"), "kt1.payload.signature");
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0][1], "unlock_view");
  assert.equal(state.events[0][2].product, "book");
});

test("a stored token is used when the URL has no session id", async () => {
  const state = thanksFixture({
    responses: [{ status: 200, body: { ok: true, token: "kt1.stored", payload: { downloads: [{ label: "PDF", url: "https://files.example/kiss.pdf" }] } } }],
    search: "",
    initialStorage: { kt_book_token_v1: "kt1.stored" },
  });

  await settle();

  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].init.body, JSON.stringify({ token: "kt1.stored" }));
  assert.equal(state.status.dataset.state, "ready");
  assert.equal(state.downloads.children[0].href, "https://files.example/kiss.pdf");
});

test("a rejected stored token is forgotten and the visitor is told to use the email link", async () => {
  const state = thanksFixture({
    responses: [{ status: 401, body: { ok: false, error: "bad_token" } }],
    search: "",
    initialStorage: { kt_book_token_v1: "kt1.stale" },
  });

  await settle();

  assert.equal(state.calls.length, 1);
  assert.equal(state.stored.has("kt_book_token_v1"), false);
  assert.equal(state.status.dataset.state, "unpaid");
  assert.equal(state.downloads.children.length, 0);
});

test("with nothing to verify the page keeps its fallback and never calls the API", async () => {
  const state = thanksFixture({ responses: [], search: "" });

  await settle();

  assert.equal(state.calls.length, 0);
  assert.equal(state.status.dataset.state, "missing");
  assert.match(state.status.textContent, /contact@howtokissbetter\.com/);
});

test("an unpaid or expired session shows the support message without downloads", async () => {
  const state = thanksFixture({ responses: [{ status: 402, body: { ok: false, error: "not_paid" } }] });

  await settle();

  assert.equal(state.downloads.children.length, 0);
  assert.equal(state.status.dataset.state, "unpaid");
  assert.match(state.status.textContent, /has not been paid yet or has expired/);
  assert.match(state.status.textContent, /contact@howtokissbetter\.com/);
  assert.equal(state.events.length, 0);
});

test("a network failure offers a retry that verifies again", async () => {
  const state = thanksFixture({
    responses: [
      new Error("offline"),
      { status: 200, body: { ok: true, token: "kt1.retry", payload: { downloads: [{ label: "PDF", url: "https://files.example/kiss.pdf" }] } } },
    ],
  });

  await settle();
  assert.equal(state.status.dataset.state, "error");
  assert.equal(state.downloads.children.length, 1);
  const retry = state.downloads.children[0];
  assert.equal(retry.tagName, "BUTTON");
  assert.equal(retry.textContent, "Retry");

  retry.dispatch("click");
  await settle();

  assert.equal(state.calls.length, 2);
  assert.equal(state.status.dataset.state, "ready");
  assert.equal(state.downloads.children[0].href, "https://files.example/kiss.pdf");
});
