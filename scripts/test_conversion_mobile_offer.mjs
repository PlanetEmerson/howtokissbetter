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

function makeElement({ text = "", dataset = {}, classes = [], mobile = false, attributes = {}, offerLink = false } = {}) {
  return {
    attributes: { ...attributes },
    classList: makeClassList(classes),
    dataset: { ...dataset },
    mobile,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    textContent: text,
    closest(selector) {
      if (selector === ".mobile-buy-bar" && this.mobile) {
        return this;
      }
      return selector === "[data-offer-link]" && offerLink ? this : null;
    },
  };
}

function runArticleExperiment(variant) {
  const stored = new Map([["kpn_mobile_offer_variant_v1", variant]]);
  const title = makeElement({ text: "Practice the useful part" });
  const copy = makeElement({ text: "Contextual chapter copy" });
  const label = makeElement({ text: "Preview the practice path" });
  const quarterSurface = makeElement({ dataset: { offerVariant: "A" } });
  const quarterLink = makeElement({ dataset: { offerVariant: "A" } });
  const mobileTitle = makeElement({ text: "Chapter 3", mobile: true });
  const mobileCopy = makeElement({ text: "See a real page", mobile: true });
  const mobileLink = makeElement({
    text: "Preview",
    dataset: { offerVariant: "A" },
    mobile: true,
    offerLink: true,
  });
  const mobileBar = makeElement({
    attributes: { "aria-label": "Book preview" },
    dataset: { offerVariant: "A" },
    classes: ["mobile-buy-bar"],
    mobile: true,
  });
  mobileBar.querySelector = (selector) => (selector === "a" ? mobileLink : null);
  const postNavLink = makeElement({
    dataset: {
      articleSlug: "example-article",
      chapterId: "chapter-03",
      offerKey: "technique",
      offerPlacement: "post-nav",
      offerVariant: "moment-proof",
    },
    offerLink: true,
  });

  const body = {
    classList: makeClassList(),
    dataset: {
      articleSlug: "example-article",
      chapterId: "chapter-03",
      offerKey: "technique",
      pageKind: "article",
    },
  };
  let ready;
  const clickHandlers = [];
  const events = [];
  const document = {
    body,
    title: "Example article",
    addEventListener(name, callback) {
      if (name === "DOMContentLoaded") {
        ready = callback;
      } else if (name === "click") {
        clickHandlers.push(callback);
      }
    },
    getElementById() {
      return null;
    },
    querySelector(selector) {
      const matches = {
        ".mobile-buy-bar": mobileBar,
        ".mobile-buy-bar a": mobileLink,
        "[data-mobile-offer-title]": mobileTitle,
        "[data-mobile-offer-copy]": mobileCopy,
        "article h1": makeElement({ text: "Example article" }),
        "article header": null,
        "[data-brevo-form]": null,
      };
      return Object.hasOwn(matches, selector) ? matches[selector] : null;
    },
    querySelectorAll(selector) {
      const matches = {
        ".js-offer": [],
        "[data-offer-label]": [label],
        "[data-offer-title]": [title],
        "[data-offer-copy]": [copy],
        "[data-offer-variant]": [quarterSurface, quarterLink, mobileBar, mobileLink],
        "[data-pathway-panel]": [],
        "[data-pathway]": [],
        "[data-payhip-checkout]": [],
        "[data-preview-open]": [],
      };
      return matches[selector] || [];
    },
  };
  const storage = {
    getItem(key) {
      return stored.get(key) || null;
    },
    setItem(key, value) {
      stored.set(key, value);
    },
  };
  const window = {
    crypto: {
      getRandomValues(values) {
        values[0] = 0;
      },
    },
    gtag(...args) {
      events.push(args);
    },
    innerHeight: 844,
    localStorage: storage,
    location: {
      hash: "",
      pathname: "/blog/example-article/",
      search: "",
    },
    matchMedia() {
      return { matches: true };
    },
    sessionStorage: storage,
    setTimeout() {},
  };
  window.window = window;

  vm.runInNewContext(conversionSource, {
    Array,
    Boolean,
    Math,
    Object,
    URLSearchParams,
    Uint32Array,
    document,
    window,
  });
  ready();

  return {
    copy,
    clickOffer(element) {
      clickHandlers.forEach((handler) => handler({ target: element }));
    },
    events,
    label,
    mobileBar,
    mobileCopy,
    mobileLink,
    mobileTitle,
    postNavLink,
    quarterLink,
    quarterSurface,
    stored,
    title,
  };
}

test("mobile treatment changes only the mobile sales handoff", () => {
  const state = runArticleExperiment("treatment");

  assert.equal(state.title.textContent, "Practice the useful part");
  assert.equal(state.copy.textContent, "Contextual chapter copy");
  assert.equal(state.label.textContent, "Preview the practice path");
  assert.equal(state.quarterSurface.dataset.offerVariant, "not-applicable");
  assert.equal(state.quarterLink.dataset.offerVariant, "not-applicable");
  assert.equal(state.mobileBar.dataset.offerVariant, "treatment");
  assert.equal(state.mobileBar.attributes["aria-label"], "Book offer");
  assert.equal(state.mobileLink.dataset.offerVariant, "treatment");
  assert.equal(state.mobileTitle.textContent, "183-page kissing guide");
  assert.equal(state.mobileCopy.textContent, "PDF + EPUB · $4.95");
  assert.equal(state.mobileLink.textContent, "See the guide");
});

test("non-mobile links do not inherit the mobile experiment assignment", () => {
  const state = runArticleExperiment("treatment");

  state.clickOffer(state.postNavLink);

  assert.equal(state.events.length, 1);
  assert.equal(state.events[0][0], "event");
  assert.equal(state.events[0][1], "offer_click");
  assert.equal(state.events[0][2].placement, "post-nav");
  assert.equal(state.events[0][2].variant, "not-applicable");
});

test("mobile control preserves the current preview bar", () => {
  const state = runArticleExperiment("control");

  assert.equal(state.quarterSurface.dataset.offerVariant, "not-applicable");
  assert.equal(state.quarterLink.dataset.offerVariant, "not-applicable");
  assert.equal(state.mobileBar.dataset.offerVariant, "control");
  assert.equal(state.mobileBar.attributes["aria-label"], "Book preview");
  assert.equal(state.mobileLink.dataset.offerVariant, "control");
  assert.equal(state.mobileTitle.textContent, "Chapter 3");
  assert.equal(state.mobileCopy.textContent, "See a real page");
  assert.equal(state.mobileLink.textContent, "Preview");
  assert.equal(state.stored.get("kpn_offer_variant_v1"), undefined);
});
