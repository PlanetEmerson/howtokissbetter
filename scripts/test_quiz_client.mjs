import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const quizSource = readFileSync(new URL("../assets/quiz.js", import.meta.url), "utf8");

// A fake DOM just big enough for quiz.js, which builds every node with
// createElement, createTextNode, textContent, setAttribute and appendChild.
function matches(node, selector) {
  const parts = selector.match(/^([a-z0-9]+)?(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i);
  if (!parts) {
    throw new Error(`fake DOM cannot match "${selector}"`);
  }
  const [, tag, id, classes, attrs] = parts;
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  if (id && node.id !== id.slice(1)) return false;
  for (const name of classes.split(".").filter(Boolean)) {
    if (!node.classList.contains(name)) return false;
  }
  for (const attr of attrs.match(/\[[^\]]+\]/g) || []) {
    const [, name, , value] = attr.match(/^\[([\w-]+)(="([^"]*)")?\]$/);
    if (node.getAttribute(name) === null) return false;
    if (value !== undefined && node.getAttribute(name) !== value) return false;
  }
  return true;
}

function walk(node, visit) {
  for (const child of node.children) {
    visit(child);
    walk(child, visit);
  }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.parent = null;
    this.ownText = "";
    this.style = { props: {}, setProperty(name, value) { this.props[name] = value; } };
    const values = new Set();
    this.classList = {
      add: (v) => values.add(v),
      contains: (v) => values.has(v),
      toggle: (v, force) => (force ?? !values.has(v)) ? values.add(v) : values.delete(v),
      remove: (v) => values.delete(v),
      values,
    };
  }
  get className() { return [...this.classList.values].join(" "); }
  set className(value) { this.classList.values.clear(); String(value).split(/\s+/).filter(Boolean).forEach((v) => this.classList.values.add(v)); }
  get id() { return this.attributes.id || ""; }
  set id(value) { this.attributes.id = value; }
  get textContent() { return this.ownText + this.children.map((c) => c.textContent).join(""); }
  set textContent(value) { this.children = []; this.ownText = String(value); }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() { const i = this.parent ? this.parent.children.indexOf(this) : -1; return i < 0 ? null : this.parent.children[i + 1] || null; }
  get parentNode() { return this.parent; }
  get innerHTML() { throw new Error("innerHTML is off limits"); }
  set innerHTML(value) { throw new Error("innerHTML is off limits"); }
  appendChild(child) { if (child.parent) child.parent.removeChild(child); child.parent = this; this.children.push(child); return child; }
  insertBefore(child, ref) { child.parent = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, child); return child; }
  removeChild(child) { this.children = this.children.filter((c) => c !== child); }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  dispatch(name, event = {}) { (this.listeners[name] || []).forEach((fn) => fn(event)); return event; }
  focus() { this.focused = true; FakeElement.active = this; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    // Descendant combinators only: "A B" is every B under any A.
    let current = [this];
    for (const compound of selector.trim().split(/\s+/)) {
      const next = [];
      current.forEach((scope) => walk(scope, (n) => { if (matches(n, compound) && !next.includes(n)) next.push(n); }));
      current = next;
    }
    return current;
  }
  submit() { this.submitCalls = (this.submitCalls || 0) + 1; }
  // Media element surface quiz.js touches: a resolved play(), pause(), and canPlayType.
  play() { this.playCalls = (this.playCalls || 0) + 1; return Promise.resolve(); }
  pause() { this.pauseCalls = (this.pauseCalls || 0) + 1; }
  canPlayType() { return "probably"; }
}

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// Deterministic stand-in for /assets/kiss-score.js with the contract's shape.
const DIMENSIONS = [
  ["R", "Reading them"], ["P", "Pace"], ["T", "Pressure"], ["G", "Tongue"],
  ["H", "Hands"], ["B", "Breath and prep"], ["V", "Variety"], ["X", "Beyond the lips"],
];
const ARCHETYPES = [
  { id: "natural", name: "The Natural", tagline: "You don't think about it. That's the whole trick.", read: "Natural read." },
  { id: "overthinker", name: "The Overthinker", tagline: "Your instincts are fine. Your narrator won't shut up.", read: "Overthinker read." },
];
const THEM = { he: "they", him: "them", his: "their", He: "They", His: "Their" };
const PRONOUNS = [
  { id: "him", label: "Him", set: { he: "he", him: "him", his: "his", He: "He", His: "His" } },
  { id: "her", label: "Her", set: { he: "she", him: "her", his: "her", He: "She", His: "Her" } },
  { id: "them", label: "Them", set: THEM },
  { id: "nobody", label: "Nobody yet. I'm preparing.", aspirational: true, set: THEM },
];

function stubEngine() {
  const questions = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i + 1}`,
    dimension: [DIMENSIONS[i % 8][0]],
    prompt: i === 5 ? "You feel {him} pull back an inch. What do you do?" : `Question ${i + 1} stem?`,
    promptNobody: i === 8 ? "Mid-kiss, which would you most want to catch them doing?" : undefined,
    options: ["a", "b", "c", "d"].map((id, j) => ({
      id,
      text: i === 5 && id === "d" ? "Check {he}'s okay. Softly." : `Option ${id} for q${i + 1}`,
      points: { [DIMENSIONS[i % 8][0]]: 3 - j },
      lean: j === 0 ? "natural" : "overthinker",
    })),
  }));
  const engine = {
    VERSION: 1,
    DATA: {
      version: 1,
      dimensions: DIMENSIONS.map(([key, name]) => ({ key, name, weight: 0.125, max: 3 })),
      pronoun: { prompt: "Who's on the other end of these kisses?", note: "Never kissed anyone? Answer on instinct.", options: PRONOUNS },
      questions,
      archetypes: ARCHETYPES,
      bands: [{ id: "dangerous", min: 65, max: 84, label: "Dangerous, in a Good Way" }],
      levels: [{ id: "strong", min: 0.83, label: "Strong", line: "Keep doing exactly this." }],
    },
    canonical: (s) => String(s).trim().toLowerCase(),
    isValidAnswers: (s) => /^[a-d]{10}$/.test(s),
    encode: (arr) => arr.join(""),
    decode: (s) => s.split(""),
    pronounSet: (id) => (PRONOUNS.find((p) => p.id === id) || PRONOUNS[2]).set,
    applyPronouns: (text, set) => String(text).replace(/\{(he|him|his|He|His)\}('s)?/g, (m, t, c) => (set || THEM)[t] + (c ? ((set || THEM).he === "they" ? "'re" : "'s") : "")),
    calls: [],
    score(answers) {
      engine.calls.push(answers);
      const archetype = answers[0] === "a" ? ARCHETYPES[0] : ARCHETYPES[1];
      return {
        version: 1,
        answers,
        score: 73,
        band: { id: "dangerous", label: "Dangerous, in a Good Way" },
        archetype,
        dimensions: DIMENSIONS.map(([key, name], i) => ({ key, name, points: 3 - (i % 3), max: 3, fraction: (3 - (i % 3)) / 3, level: "strong", levelLabel: "Strong", levelLine: "Keep doing exactly this." })),
        leans: {},
        strongest: [],
        costliest: [],
        onlyOneStrength: false,
        teasers: { costingCount: 4, strongestDimension: { key: "R", name: "Reading them" } },
      };
    },
  };
  return engine;
}

// matchMedia answers reduced motion and hover separately; reduced motion stays on by
// default (the stub matched every query before), so the scoring beat keeps its zero delay.
// `landing` adds the archetype row and the tier demo figure; `observers` collects every
// IntersectionObserver quiz.js creates so a test can drive visibility by hand.
function runPage({ pageKind, search = "", session = {}, local = {}, fetchImpl, gtagMissing = false, gaValues = {}, engine = stubEngine(), share, canShare, clipboard, fileImpl, reducedMotion = true, hover = false, phone = true, connection, landing = false, hero = false, observers }) {
  FakeElement.active = null;
  const body = new FakeElement("body");
  body.dataset.pageKind = pageKind;
  body.dataset.kissApi = "https://api.example";
  const main = body.appendChild(new FakeElement("main"));
  const app = main.appendChild(new FakeElement("div"));
  app.id = pageKind === "quiz" ? "kiss-test-app" : "kiss-test-result";
  app.appendChild(new FakeElement("p")).textContent = "static fallback";
  // The feedback form and its sent line start hidden after the root, as on the result page.
  const feedbackForm = main.appendChild(new FakeElement("form"));
  feedbackForm.className = "kiss-feedback";
  feedbackForm.setAttribute("hidden", "");
  const feedbackSent = main.appendChild(new FakeElement("p"));
  feedbackSent.setAttribute("hidden", "");
  feedbackSent.setAttribute("data-feedback-sent", "");
  feedbackSent.textContent = "Got it. Thank you.";
  const lede = main.appendChild(new FakeElement("p"));
  lede.setAttribute("data-email-lede", "");
  lede.textContent = "free lede";
  const startButtons = [new FakeElement("a"), new FakeElement("button")];
  startButtons.forEach((b) => { b.setAttribute("data-quiz-start", ""); main.appendChild(b); });
  let landingCards = [];
  let demoFigure = null;
  let heroMedia = null;
  if (hero) {
    heroMedia = main.appendChild(new FakeElement("div"));
    heroMedia.className = "quiz-hero__media";
    heroMedia.appendChild(new FakeElement("picture")).appendChild(new FakeElement("img"));
  }
  if (landing) {
    const row = main.appendChild(new FakeElement("ul"));
    row.className = "quiz-archetypes";
    landingCards = ["explorer", "natural"].map((id) => {
      const card = row.appendChild(new FakeElement("li"));
      card.className = "quiz-archetype-card";
      card.appendChild(new FakeElement("img")).setAttribute("src", `/assets/images/kiss-test/archetypes/${id}-mw-thumb.webp`);
      card.appendChild(new FakeElement("h3")).textContent = id;
      card.appendChild(new FakeElement("p")).textContent = "tagline";
      return card;
    });
    demoFigure = main.appendChild(new FakeElement("figure"));
    demoFigure.setAttribute("data-score-demo", "");
    demoFigure.appendChild(new FakeElement("img")).setAttribute("src", "/assets/images/kiss-test/score-demo-poster.webp");
    demoFigure.appendChild(new FakeElement("figcaption")).textContent = "Sample.";
  }

  const events = [];
  const timeouts = [];
  const navigations = [];
  let ready;
  let loaded;
  const document = {
    body,
    title: "Test",
    addEventListener(name, fn) { if (name === "DOMContentLoaded") ready = fn; },
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (ns, tag) => new FakeElement(tag),
    createTextNode: (text) => { const node = new FakeElement("#text"); node.ownText = String(text); return node; },
    get activeElement() { return FakeElement.active; },
    getElementById: (id) => body.querySelector(`#${id}`),
    querySelector: (sel) => body.querySelector(sel),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
  };
  const window = {
    KissScore: engine,
    fetch: fetchImpl || (() => Promise.reject(new Error("no fetch"))),
    localStorage: makeStorage(local),
    sessionStorage: makeStorage(session),
    location: {
      search, pathname: pageKind === "quiz" ? "/kiss-test/" : "/kiss-test/result/", hash: "",
      assign: (url) => navigations.push(["assign", url]),
      replace: (url) => navigations.push(["replace", url]),
      reload: () => navigations.push(["reload"]),
    },
    history: { replaceState: (...args) => navigations.push(["replaceState", ...args]) },
    matchMedia: (query) => ({ matches: /reduce/.test(query) ? reducedMotion : /hover/.test(query) ? hover : /max-width/.test(query) ? phone : true }),
    addEventListener(name, fn) { if (name === "load") loaded = fn; },
    navigator: { share, canShare, clipboard, connection },
    File: fileImpl,
    setTimeout(fn, delay) { timeouts.push({ fn, delay }); return timeouts.length; },
    clearTimeout(id) { const pending = timeouts[id - 1]; if (pending) { pending.cleared = true; } },
  };
  if (!gtagMissing) {
    window.gtag = (...args) => {
      if (args[0] === "get") { args[3](gaValues[args[2]]); return; }
      events.push({ name: args[1], params: args[2] });
    };
  }
  if (observers) {
    window.IntersectionObserver = class {
      constructor(callback, options) { this.callback = callback; this.options = options; this.targets = []; observers.push(this); }
      observe(target) { this.targets.push(target); }
    };
  }
  window.window = window;
  vm.runInNewContext(quizSource, { Array, Boolean, Error, JSON, Math, Number, Object, Promise, String, URLSearchParams, document, window });
  ready();
  return { app, body, demoFigure, document, engine, events, feedbackForm, feedbackSent, heroMedia, landingCards, lede, load: () => loaded && loaded(), navigations, startButtons, timeouts, window, KissQuiz: window.KissQuiz };
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };
const jsonResponse = (status, data) => ({ status, json: async () => data });
const named = (events, name) => events.filter((e) => e.name === name);
// Objects built inside the vm context carry that realm's prototypes; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

const ANSWERS = "bbcdabcdab";
const freeFetch = (blurbs = [{ key: "R", title: "You stay put", text: "When {he} pulls back, you wait." }]) => (url, options) => {
  if (url.endsWith("/api/kiss-free")) {
    assert.equal(options.headers["Content-Type"], "text/plain");
    assert.deepEqual(JSON.parse(options.body), { answers: ANSWERS });
    return Promise.resolve(jsonResponse(200, { ok: true, free: { strongestBlurbs: blurbs } }));
  }
  return Promise.reject(new Error(`unexpected ${url}`));
};

test("parseHandoff keeps valid card values, drops junk, and maps ref=share", () => {
  const { KissQuiz } = runPage({ pageKind: "quiz" });
  const valid = KissQuiz.parseHandoff("?from=how-to-french-kiss&hook=technique&placement=quiz-article-quarter&q=q6&a=d");
  assert.deepEqual(plain(valid), { from: "how-to-french-kiss", hook: "technique", placement: "quiz-article-quarter", q: "q6", a: "d", index: 5, entry: "inline" });

  const junk = KissQuiz.parseHandoff("?from=Bad%20Slug&hook=%3Cx%3E&placement=" + "p".repeat(41) + "&q=q99&a=z");
  assert.deepEqual(plain(junk), { from: "", hook: "", placement: "", q: "", a: "", index: -1, entry: "direct" });

  assert.equal(KissQuiz.parseHandoff("?q=q1&a=zz").entry, "direct");
  assert.equal(KissQuiz.parseHandoff("?ref=share").entry, "share");
  assert.equal(KissQuiz.parseHandoff("?from=slow-kiss").entry, "article");
  assert.equal(KissQuiz.parseHandoff("").entry, "direct");
});

test("nextIndex walks forward and skips the question answered on the card", () => {
  const { KissQuiz } = runPage({ pageKind: "quiz" });
  const blank = Array(10).fill("");
  assert.equal(KissQuiz.nextIndex(blank, -1), 0);
  const first = [...blank]; first[0] = "b";
  assert.equal(KissQuiz.nextIndex(first, -1), 1);
  const sixth = [...blank]; sixth[5] = "d";
  assert.equal(KissQuiz.nextIndex(sixth, 4), 6);
  assert.equal(KissQuiz.nextIndex(sixth, 8), 9);
  assert.equal(KissQuiz.nextIndex(Array(10).fill("a"), -1), -1);
});

test("buildCheckoutFields carries the report contract and only GA ids that exist", () => {
  const { KissQuiz } = runPage({ pageKind: "quiz" });
  const bare = KissQuiz.buildCheckoutFields({ answers: ANSWERS, version: 1, from: "", entry: "", gaIds: { client_id: "", session_id: "" } });
  assert.deepEqual(plain(bare), { product: "report", answers: ANSWERS, v: "1", src: "direct", placement: "quiz-paywall", entry: "direct", cancel: "/kiss-test/result/" });
  assert.equal(Object.hasOwn(bare, "ga_cid"), false);

  const full = KissQuiz.buildCheckoutFields({ answers: ANSWERS, version: 1, from: "slow-kiss", entry: "inline", gaIds: { client_id: "123.456", session_id: "789" } });
  assert.equal(full.src, "slow-kiss");
  assert.equal(full.entry, "inline");
  assert.equal(full.ga_cid, "123.456");
  assert.equal(full.ga_sid, "789");
});

test("free render shows archetype, teasers and the paywall form, never the score digit", async () => {
  const page = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS, kt_pronoun_v1: "him" }, fetchImpl: freeFetch(), gaValues: { client_id: "111.222", session_id: "333" } });
  await settle();

  const text = page.app.textContent;
  assert.match(text, /You're The Overthinker\./);
  assert.match(text, /Your narrator won't shut up\./);
  assert.match(text, /4 of your 10 answers are costing you points\. Your strongest dimension is Reading them\./);
  assert.match(text, /What he's actually noticing \(from your answers\)/);
  assert.match(text, /The one move for The Overthinker/);
  assert.match(text, /Unlock my full report · \$4\.99/);
  assert.match(text, /Your two strongest habits/);
  assert.match(text, /When he pulls back, you wait\./);
  assert.doesNotMatch(text, /73/);
  assert.doesNotMatch(text, /Dangerous/);

  const blur = page.app.querySelector(".quiz-score-card__blur");
  assert.equal(blur.getAttribute("aria-hidden"), "true");
  assert.equal(blur.textContent, "");
  assert.equal(page.app.querySelectorAll(".quiz-locked[aria-hidden=\"true\"]").length, 5);
  assert.equal(page.app.querySelectorAll(".quiz-unlock-link[href=\"#kiss-test-paywall\"]").length, 5);

  const form = page.app.querySelector("form[data-report-checkout]");
  assert.equal(form.getAttribute("action"), "https://api.example/api/checkout");
  assert.equal(form.querySelector("button").className, "conversion-button conversion-sheen quiz-paywall__button");
  assert.equal(form.querySelectorAll(".kiss-guarantee[data-guarantee]").length, 1);
  assert.equal(form.querySelector(".kiss-guarantee").textContent, "3030-day guarantee. Not worth it? One email, full refund. Keep it anyway. I can't take it back.");
  const hidden = Object.fromEntries(form.querySelectorAll("input").map((i) => [i.name, i.value]));
  assert.deepEqual(hidden, { product: "report", answers: ANSWERS, v: "1", src: "direct", placement: "quiz-paywall", entry: "direct", cancel: "/kiss-test/result/", ga_cid: "111.222", ga_sid: "333" });

  const submit = form.dispatch("submit", { preventDefault() { this.prevented = true; } });
  assert.equal(submit.prevented, true);
  const checkout = named(page.events, "begin_checkout")[0].params;
  assert.equal(checkout.value, 4.99);
  assert.equal(checkout.product, "report");
  assert.equal(checkout.archetype, "overthinker");
  assert.equal(checkout.score_band, "dangerous");
  assert.deepEqual(plain(checkout.items), [{ item_id: "kiss-report", item_name: "Kiss Test full report", price: 4.99, quantity: 1 }]);
  checkout.event_callback();
  page.timeouts.forEach((t) => t.fn());
  assert.equal(form.submitCalls, 1);

  assert.deepEqual(plain(named(page.events, "result_view")[0].params), { tier: "free", archetype: "overthinker" });
  assert.deepEqual(plain(named(page.events, "paywall_view")[0].params), { archetype: "overthinker", score_band: "dangerous", return: "none" });
  assert.equal(page.events.some((e) => JSON.stringify(e.params).includes(ANSWERS)), false);
  assert.equal(page.events.some((e) => JSON.stringify(e.params).includes("him")), false);
});

test("paywall_view fires once even when the free state re-renders after a retry", async () => {
  let verifyCalls = 0;
  const fetchImpl = (url) => {
    if (url.endsWith("/api/verify")) { verifyCalls += 1; return Promise.resolve(jsonResponse(502, { ok: false, error: "stripe_unavailable" })); }
    return Promise.resolve(jsonResponse(500, {}));
  };
  const page = runPage({ pageKind: "quiz-result", search: "?checkout=canceled", session: { kt_answers_v1: ANSWERS }, local: { kt_token_v1: "tok" }, fetchImpl });
  await settle();
  assert.equal(verifyCalls, 1);
  assert.match(page.app.textContent, /Checkout was canceled/);
  assert.match(page.app.textContent, /report service is unavailable/);
  assert.equal(page.window.localStorage.getItem("kt_token_v1"), "tok");

  page.app.querySelector(".quiz-retry").dispatch("click");
  await settle();
  assert.equal(verifyCalls, 2);
  assert.equal(named(page.events, "result_view").length, 2);
  assert.equal(named(page.events, "paywall_view").length, 1);
  assert.equal(named(page.events, "paywall_view")[0].params.return, "canceled");
});

test("an expired token is forgotten and the free result still renders", async () => {
  const fetchImpl = (url) => Promise.resolve(url.endsWith("/api/verify") ? jsonResponse(401, { ok: false, error: "bad_token" }) : jsonResponse(500, {}));
  const page = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS }, local: { kt_token_v1: "stale" }, fetchImpl });
  await settle();
  assert.equal(page.window.localStorage.getItem("kt_token_v1"), null);
  assert.match(page.app.textContent, /30-day window on the report has ended/);
  assert.match(page.app.textContent, /You're The Overthinker\./);
  assert.equal(page.app.querySelector(".quiz-retry"), null);
});

test("no answers and no unlock sends the visitor back to the test", async () => {
  const page = runPage({ pageKind: "quiz-result" });
  await settle();
  assert.deepEqual(page.navigations, [["replace", "/kiss-test/"]]);
});

test("free render carries the endowment and floor lines, the sixth list item, and the Stripe-page fine print", async () => {
  const page = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS }, fetchImpl: freeFetch([]) });
  await settle();
  const card = page.app.querySelector(".quiz-score-card");
  assert.equal(card.querySelector(".quiz-score-card__claim .quiz-score-card__endowment").textContent, "It's already scored. It's sitting under the blur.");
  assert.equal(card.querySelector(".quiz-score-card__floor").textContent, "Nobody scores under 20. The report is the fix, not the verdict.");
  const kinds = card.children.map((c) => c.className);
  assert.equal(kinds.indexOf("quiz-score-card__floor"), kinds.indexOf("quiz-score-card__teaser") + 1);
  const items = card.querySelectorAll(".quiz-paywall__list li").map((li) => li.textContent);
  assert.equal(items.length, 6);
  assert.equal(items[5], "Retakes for 30 days on this device. Fix one habit, retake, watch the number move.");
  assert.equal(card.querySelector(".quiz-paywall__once").textContent, "One-time payment. No subscription, no account. Tap, pay on Stripe's page with Apple Pay, Google Pay, Link, or card, and you land back here with the report on this screen.");
  const form = card.querySelector("form[data-report-checkout]");
  assert.match(form.textContent, /30-day guarantee/);
  assert.equal(form.querySelector("button").className.split(" ").includes("conversion-sheen"), true);
});

const DARE_REPORT = {
  paid: {
    sections: [
      { id: "score", title: "Where your points went", paragraphs: ["Kiss Score 73, Dangerous, in a Good Way."], items: [{ label: "Reading them", level: "strong", line: "Keep it." }, { label: "Pace", level: "costing", line: "Slow down." }] },
      { id: "tonight", title: "Tonight, if you get the chance", paragraphs: ["Then stop counting."], items: ["1. Breathe."] },
    ],
  },
};
const paidFetch = (url) => Promise.resolve(url.endsWith("/api/verify") ? jsonResponse(200, { ok: true, product: "report", payload: { report: DARE_REPORT } }) : jsonResponse(500, {}));

test("paid render adds the sighted count-up beside the real score, then the sign-off with a fresh-start retake link", async () => {
  const page = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS }, local: { kt_token_v1: "tok" }, fetchImpl: paidFetch });
  await settle();
  const score = page.app.querySelector(".quiz-glance__score");
  const real = score.querySelector("strong");
  assert.equal(real.textContent, "73");
  const count = score.querySelector(".quiz-glance__count");
  assert.equal(count.getAttribute("aria-hidden"), "true");
  assert.equal(count.style.props["--kiss-score"], "73");
  assert.equal(count.textContent, "");
  assert.equal(score.children.indexOf(count), score.children.indexOf(real) + 1);

  const signoff = page.app.querySelector(".quiz-paid-signoff");
  assert.equal(signoff.querySelector(".quiz-signoff").textContent, "That's the honest version. Day 7, retake it. Your report stays open 30 days and I want that number to move. C.J.");
  const link = signoff.querySelector("a[data-quiz-retake]");
  assert.equal(link.textContent, "Retake the test");
  assert.equal(link.getAttribute("href"), "/kiss-test/#kiss-test-app");
  const at = (name) => page.app.children.findIndex((c) => c.classList.contains(name));
  assert.equal(at("quiz-paid-signoff"), at("quiz-paid-section--tonight") + 1);
  assert.equal(at("kiss-feedback"), at("quiz-paid-signoff") + 1);
  assert.equal(at("quiz-paid-share"), at("kiss-feedback") + 1);

  assert.equal(page.window.sessionStorage.getItem("kt_answers_v1"), ANSWERS);
  link.dispatch("click");
  assert.equal(page.window.sessionStorage.getItem("kt_answers_v1"), null);
});

test("paid render moves the static feedback form into place between the sign-off and the share block", async () => {
  const page = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS }, local: { kt_token_v1: "tok" }, fetchImpl: paidFetch });
  await settle();
  const form = page.app.querySelector("form.kiss-feedback");
  assert.equal(form, page.feedbackForm);
  assert.equal(form.getAttribute("hidden"), null);
  assert.equal(form.parent, page.app);
  const at = (name) => page.app.children.findIndex((c) => c.classList.contains(name));
  assert.equal(at("kiss-feedback"), at("quiz-paid-signoff") + 1);
  assert.equal(at("quiz-paid-share"), at("kiss-feedback") + 1);
  assert.equal(page.app.querySelector("[data-feedback-sent]"), null);
  assert.equal(page.feedbackSent.getAttribute("hidden"), "");
  assert.equal(page.feedbackSent.parent.tagName, "MAIN");
});

test("a paid render with feedback=sent in the URL shows the thank-you line and leaves the form hidden", async () => {
  const page = runPage({ pageKind: "quiz-result", search: "?feedback=sent", session: { kt_answers_v1: ANSWERS }, local: { kt_token_v1: "tok" }, fetchImpl: paidFetch });
  await settle();
  assert.equal(page.app.querySelector("form.kiss-feedback"), null);
  assert.equal(page.feedbackForm.getAttribute("hidden"), "");
  assert.equal(page.feedbackForm.parent.tagName, "MAIN");
  const sent = page.app.querySelector("[data-feedback-sent]");
  assert.equal(sent, page.feedbackSent);
  assert.equal(sent.getAttribute("hidden"), null);
  assert.equal(sent.textContent, "Got it. Thank you.");
  const at = (name) => page.app.children.findIndex((c) => c.classList.contains(name));
  assert.equal(page.app.children.indexOf(sent), at("quiz-paid-signoff") + 1);
  assert.equal(at("quiz-paid-share"), page.app.children.indexOf(sent) + 1);
  assert.match(page.app.textContent, /Kiss Score 73/);
});

test("a free render leaves the feedback form and its sent line hidden outside the result", async () => {
  const page = runPage({ pageKind: "quiz-result", search: "?feedback=sent", session: { kt_answers_v1: ANSWERS }, fetchImpl: freeFetch() });
  await settle();
  assert.equal(page.app.querySelector("form.kiss-feedback"), null);
  assert.equal(page.app.querySelector("[data-feedback-sent]"), null);
  assert.equal(page.feedbackForm.getAttribute("hidden"), "");
  assert.equal(page.feedbackSent.getAttribute("hidden"), "");
});

test("share text ends with the dare: the free line hides the score, the paid line carries it", async () => {
  const free = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS }, fetchImpl: freeFetch([]) });
  await settle();
  free.app.querySelector(".quiz-share-cta__button").dispatch("click");
  const freeQuote = free.body.querySelector("blockquote.quiz-share__text").textContent;
  assert.equal(freeQuote.endsWith(`I'm not telling you my score. Take it. Lower score buys dinner: ${SHARE_URL}`), true, freeQuote);

  const paid = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS }, local: { kt_token_v1: "tok" }, fetchImpl: paidFetch });
  await settle();
  paid.app.querySelector(".quiz-paid-share .quiz-share-cta__button").dispatch("click");
  const paidQuote = paid.body.querySelector("blockquote.quiz-share__text").textContent;
  assert.equal(paidQuote.startsWith("I took the Kiss Test and got The Overthinker. \"Your instincts are fine. Your narrator won't shut up.\" "), true, paidQuote);
  assert.equal(paidQuote.endsWith(`Kiss Score 73, Dangerous, in a Good Way. Your turn. Lower score buys dinner: ${SHARE_URL}`), true, paidQuote);
});

test("the scoring beat names all eight dials and is the only timer in a ten-answer run", () => {
  const page = runPage({ pageKind: "quiz" });
  page.startButtons[0].dispatch("click", { preventDefault() {} });
  const first = () => page.app.querySelectorAll(".quiz-option")[0].dispatch("click");
  first();
  first();
  assert.match(page.app.textContent, /Question 1 of 10/);
  for (let q = 1; q <= 9; q++) {
    first();
    assert.equal(page.timeouts.length, 0, `no timer after question ${q}`);
    assert.match(page.app.textContent, new RegExp(`Question ${q + 1} of 10`));
  }
  first();
  assert.match(page.app.textContent, /Scoring your answers\. Eight dials, ten taps\./);
  assert.equal(page.timeouts.length, 1);
  assert.equal(page.app.querySelector(".quiz-dials").getAttribute("aria-hidden"), "true");
  assert.equal(page.app.querySelectorAll(".quiz-dial .quiz-dial__bar").length, 8);
  const names = page.app.querySelectorAll(".quiz-dial__name");
  assert.equal(names.length, 8);
  assert.deepEqual(names.map((n) => n.textContent), page.engine.DATA.dimensions.map((d) => d.name));
  assert.equal(names.every((n) => n.getAttribute("aria-hidden") === "true"), true);
});

test("paid render writes server strings as text, applies the stored pronoun, and stores the unlock", async () => {
  const report = {
    paid: {
      sections: [
        { id: "verdict", title: "The verdict", paragraphs: ["You wait well and rush badly, {him} included."], items: [] },
        { id: "score", title: "Where your points went", headline: "<img src=x onerror=alert(1)> {He}'s watching", paragraphs: ["Kiss Score 73, Dangerous, in a Good Way."], items: [{ label: "Reading them", level: "strong", line: "Keep doing exactly this." }, { label: "Pace", level: "costing", line: "This is where the points went." }] },
        { id: "strengths", title: "Your two strongest habits", items: [{ title: "You wait", text: "You let {him} come back." }] },
        { id: "costs", title: "The three habits costing you the most (and the fix for each)", items: [{ title: "1. You rush {him}", text: "Slow down." }] },
        { id: "noticing", title: "What {he}'s actually noticing (from your answers)", items: ["{He}'s noticing that {his} shoulders drop."] },
        { id: "move", title: "The one move for The Overthinker", paragraphs: ["Hold for ten seconds."] },
        { id: "fix", title: "Your 7-day fix", items: [{ day: 1, title: "<b>Day one</b>", text: "Do {him} a favor." }] },
        { id: "tonight", title: "Tonight, if you get the chance", paragraphs: ["Then stop counting. {He}'s not."], items: ["1. Breathe.", "2. Wait for {him}.", "3. Go."] },
      ],
    },
  };
  const fetchImpl = (url, options) => {
    if (url.endsWith("/api/verify")) {
      assert.deepEqual(JSON.parse(options.body), { session_id: "cs_test_abc123" });
      return Promise.resolve(jsonResponse(200, { ok: true, product: "report", token: "tok-1", payload: { report } }));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  const page = runPage({ pageKind: "quiz-result", search: "?session_id=cs_test_abc123", session: { kt_answers_v1: ANSWERS, kt_pronoun_v1: "her", kt_self_v1: "woman" }, fetchImpl });
  await settle();

  const text = page.app.textContent;
  assert.match(text, /Unlocked\. Here's the honest version\./);
  assert.match(text, /<img src=x onerror=alert\(1\)> She's watching/);
  assert.match(text, /She's noticing that her shoulders drop\./);
  assert.match(text, /You let her come back\./);
  assert.match(text, /Day 1: <b>Day one<\/b>Do her a favor\./);
  assert.match(text, /Kiss Score 73/);
  assert.match(text, /You wait well and rush badly, her included\./);
  assert.match(text, /Then stop counting\. She's not\./);
  const tags = new Set();
  walk(page.app, (n) => tags.add(n.tagName));
  assert.deepEqual(page.app.querySelectorAll("img").map((i) => i.getAttribute("src")), ["/assets/images/kiss-test/archetypes/overthinker-ww.jpg"]);
  assert.equal(tags.has("B"), false);

  // Sections render generically, in the order the server sent them.
  assert.deepEqual(page.app.querySelectorAll(".quiz-paid-section .quiz-section-title").map((h) => h.textContent), [
    "The verdict", "Where your points went", "Your two strongest habits", "The three habits costing you the most (and the fix for each)",
    "What she's actually noticing (from your answers)", "The one move for The Overthinker", "Your 7-day fix", "Tonight, if you get the chance",
  ]);
  // Tonight: numbered steps with the server's ordinals stripped, sign-off after the list.
  const tonight = page.app.querySelector(".quiz-paid-section--tonight");
  assert.deepEqual(tonight.children.map((c) => `${c.tagName}.${c.className}`), ["H2.quiz-section-title", "OL.quiz-steps", "P.quiz-paid-paragraph quiz-signoff"]);
  assert.deepEqual(tonight.querySelector("ol").children.map((li) => li.textContent), ["Breathe.", "Wait for her.", "Go."]);
  assert.equal(page.app.querySelector(".quiz-paid-section--verdict p").className, "quiz-paid-paragraph quiz-verdict");
  // Every other section keeps headline, paragraphs, then items.
  assert.deepEqual(page.app.querySelector(".quiz-paid-section--score").children.map((c) => c.tagName), ["H2", "P", "P", "UL"]);
  assert.deepEqual(page.app.querySelector(".quiz-paid-section--fix").children.map((c) => c.tagName), ["H2", "OL"]);

  // The full-size archetype card follows the header, then the compact glance, then the first section.
  const hero = page.app.children[1];
  assert.equal(hero.classList.contains("quiz-card"), true);
  assert.equal(hero.querySelector("img").getAttribute("src"), "/assets/images/kiss-test/archetypes/overthinker-ww.jpg");
  assert.equal(hero.querySelector(".quiz-card__title").textContent, "You're The Overthinker.");
  const glance = page.app.querySelector(".quiz-glance");
  assert.equal(page.app.children.indexOf(glance), 2);
  assert.equal(glance.classList.contains("quiz-glance--compact"), true);
  assert.equal(glance.querySelector("img"), null);
  assert.equal(page.app.children[3].classList.contains("quiz-paid-section--verdict"), true);
  assert.match(hero.textContent, /The Overthinker/);
  assert.match(hero.textContent, /Your instincts are fine\. Your narrator won't shut up\./);
  assert.equal(glance.querySelector(".quiz-glance__score strong").textContent, "73");
  assert.match(glance.querySelector(".quiz-glance__score").textContent, /Kiss Score73Dangerous, in a Good Way/);
  assert.deepEqual(glance.querySelectorAll(".quiz-glance__chip").map((c) => c.textContent), ["Strongest: You wait", "Costliest: You rush her"]);

  const bars = page.app.querySelectorAll(".quiz-dim__bar span");
  assert.equal(bars[0].style.props["--dim"], "100%");
  assert.equal(page.app.querySelector(".quiz-dim[data-level=\"costing\"]").textContent.startsWith("Pace"), true);

  assert.equal(page.window.localStorage.getItem("kt_token_v1"), "tok-1");
  assert.equal(page.window.localStorage.getItem("kt_paid_answers_v1"), ANSWERS);
  assert.deepEqual(page.navigations, [["replaceState", null, "", "/kiss-test/result/"]]);
  assert.match(page.lede.textContent, /full report link, so it reopens on any device/);
  assert.equal(page.app.querySelector(".quiz-paid-share .quiz-share-cta__button").textContent, "Share my score");
  assert.deepEqual(plain(named(page.events, "result_view")[0].params), { tier: "paid", archetype: "overthinker" });
  assert.deepEqual(plain(named(page.events, "unlock_view")[0].params), { product: "report" });
  assert.equal(named(page.events, "paywall_view").length, 0);
  assert.equal(page.events.some((e) => JSON.stringify(e.params).includes("\"woman\"")), false);
});

test("a paid render without a costs section drops that chip and still shows the rest", async () => {
  const report = { paid: { sections: [{ id: "strengths", title: "Your two strongest habits", items: [{ title: "2. You wait", text: "Good." }] }] } };
  const fetchImpl = (url) => Promise.resolve(url.endsWith("/api/verify") ? jsonResponse(200, { ok: true, product: "report", payload: { report } }) : jsonResponse(500, {}));
  const page = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS }, local: { kt_token_v1: "tok" }, fetchImpl });
  await settle();
  assert.deepEqual(page.app.querySelectorAll(".quiz-glance__chip").map((c) => c.textContent), ["Strongest: You wait"]);
  assert.equal(page.app.querySelector(".quiz-card img").getAttribute("src"), "/assets/images/kiss-test/archetypes/overthinker-mw.jpg");
});

test("pairingFor picks the illustration: mm, ww, or the mixed default", () => {
  const { KissQuiz } = runPage({ pageKind: "quiz" });
  const table = [
    ["him", "man", "mm"], ["her", "woman", "ww"],
    ["him", "woman", "mw"], ["her", "man", "mw"], ["him", "skip", "mw"], ["her", "skip", "mw"],
    ["them", "man", "mw"], ["them", "woman", "mw"], ["nobody", "man", "mw"], ["nobody", "woman", "mw"],
    ["him", "", "mw"], ["", "man", "mw"], ["", "", "mw"], [undefined, undefined, "mw"],
  ];
  for (const [partner, self, expected] of table) {
    assert.equal(KissQuiz.pairingFor(partner, self), expected, `${partner}+${self}`);
  }
});

test("shareLinks encodes the text and url for every network", () => {
  const { KissQuiz } = runPage({ pageKind: "quiz" });
  const text = "I got \"The Natural\" & more. Tell me yours:";
  const url = "https://howtokissbetter.com/kiss-test/?ref=share";
  const both = encodeURIComponent(`${text} ${url}`);
  assert.deepEqual(plain(KissQuiz.shareLinks(text, url)), {
    whatsapp: `https://wa.me/?text=${both}`,
    sms: `sms:?&body=${both}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    email: `mailto:?subject=My%20Kiss%20Test%20result&body=${both}`,
  });
  assert.equal(both.includes("\"") || both.includes("&") || both.includes("?ref"), false);
});

const SHARE_TEXT = "I took the Kiss Test and got The Overthinker. \"Your instincts are fine. Your narrator won't shut up.\" I'm not telling you my score. Take it. Lower score buys dinner:";
const SHARE_URL = "https://howtokissbetter.com/kiss-test/?ref=share";

test("without Web Share, the button opens an in-page sheet: copy flips to Copied, links are encoded, focus returns", async () => {
  const written = [];
  const page = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS, kt_pronoun_v1: "him", kt_self_v1: "man" }, fetchImpl: freeFetch([]), clipboard: { writeText: (t) => { written.push(t); return Promise.resolve(); } } });
  await settle();
  const cta = page.app.querySelector(".quiz-share-cta__button");
  assert.equal(cta.textContent, "Share my result");
  assert.equal(cta.classList.contains("conversion-button"), true);
  assert.ok(cta.querySelector("svg[aria-hidden=\"true\"]"));
  assert.match(page.app.querySelector(".quiz-share-cta__sub").textContent, /Post your archetype\. Your score stays private unless you choose\./);
  assert.equal(page.app.querySelectorAll(".quiz-card__actions button").length, 1);
  assert.equal(page.app.querySelector(".quiz-card__media img").getAttribute("src"), "/assets/images/kiss-test/archetypes/overthinker-mm.jpg");
  assert.equal(page.app.querySelector(".quiz-card__media source").getAttribute("srcset"), "/assets/images/kiss-test/archetypes/overthinker-mm.webp");

  cta.focus();
  cta.dispatch("click");
  const dialog = page.body.querySelector("dialog.quiz-share");
  assert.ok(dialog, "sheet is appended to body");
  assert.equal(dialog.getAttribute("open"), "");
  assert.equal(dialog.getAttribute("aria-labelledby"), "quiz-share-title");
  assert.equal(page.body.classList.contains("quiz-share-open"), true);
  const close = dialog.querySelector(".quiz-share__close");
  assert.equal(close.focused, true);
  assert.equal(dialog.querySelector(".quiz-share__media img").getAttribute("src"), "/assets/images/kiss-test/archetypes/overthinker-mm.jpg");
  assert.equal(dialog.querySelector("blockquote.quiz-share__text").textContent, `${SHARE_TEXT} ${SHARE_URL}`);

  const actions = dialog.querySelectorAll(".quiz-share__action");
  assert.deepEqual(actions.map((a) => a.textContent), ["Copy link", "Copy text", "WhatsApp", "Messages", "X", "Facebook", "Email", "Save image"]);
  const links = plain(page.KissQuiz.shareLinks(SHARE_TEXT, SHARE_URL));
  const hrefs = Object.fromEntries(actions.filter((a) => a.tagName === "A").map((a) => [a.textContent, a.getAttribute("href")]));
  assert.deepEqual(hrefs, { WhatsApp: links.whatsapp, Messages: links.sms, X: links.x, Facebook: links.facebook, Email: links.email, "Save image": "/assets/images/kiss-test/archetypes/overthinker-mm.jpg" });
  for (const name of ["WhatsApp", "X", "Facebook"]) {
    const link = actions.find((a) => a.textContent === name);
    assert.equal(link.getAttribute("target"), "_blank", name);
    assert.equal(link.getAttribute("rel"), "noopener", name);
  }
  assert.equal(actions.find((a) => a.textContent === "Save image").getAttribute("download"), "kiss-test-overthinker.jpg");

  const [copyLink, copyText] = actions;
  copyLink.dispatch("click");
  await settle();
  assert.equal(written[0], SHARE_URL);
  assert.equal(copyLink.textContent, "Copied");
  assert.equal(dialog.querySelector(".quiz-share__toast").textContent, "Copied");
  const flip = page.timeouts.at(-1);
  assert.equal(flip.delay, 2000);
  flip.fn();
  assert.equal(copyLink.textContent, "Copy link");
  assert.equal(dialog.querySelector(".quiz-share__toast").textContent, "");
  copyText.dispatch("click");
  await settle();
  assert.equal(written[1], `${SHARE_TEXT} ${SHARE_URL}`);
  actions.find((a) => a.textContent === "WhatsApp").dispatch("click");
  assert.deepEqual(plain(named(page.events, "share_click").map((e) => e.params.method)), ["copy_link", "copy_text", "whatsapp"]);
  assert.equal(named(page.events, "share_click").every((e) => e.params.archetype === "overthinker"), true);
  assert.equal(page.events.some((e) => JSON.stringify(e.params).includes("\"man\"")), false);

  dialog.dispatch("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(page.body.querySelector("dialog.quiz-share"), null);
  assert.equal(page.body.classList.contains("quiz-share-open"), false);
  assert.equal(FakeElement.active, cta);

  // A blocked clipboard explains itself in the toast; nothing to highlight by hand.
  page.window.navigator.clipboard = undefined;
  cta.dispatch("click");
  const reopened = page.body.querySelector("dialog.quiz-share");
  assert.notEqual(reopened, dialog);
  reopened.querySelector(".quiz-share__action").dispatch("click");
  await settle();
  assert.match(reopened.querySelector(".quiz-share__toast").textContent, /Copy isn't available here/);
  assert.equal(reopened.querySelector(".quiz-share__action").textContent, "Copy link");
  reopened.querySelector(".quiz-share__close").dispatch("click");
  assert.equal(page.body.querySelector("dialog.quiz-share"), null);
});

test("Web Share sends the archetype jpg as a file, falls back to text and url, and opens the sheet only on failure", async () => {
  const shares = [];
  let canShareFiles = true;
  let outcome = () => Promise.resolve();
  const fetchImpl = (url, options) => (url === "/assets/images/kiss-test/archetypes/overthinker-mw.jpg"
    ? Promise.resolve({ ok: true, blob: async () => "jpg-bytes" })
    : freeFetch([])(url, options));
  const page = runPage({
    pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS }, fetchImpl,
    share: (data) => { shares.push(data); return outcome(); },
    canShare: (data) => !data.files || canShareFiles,
    fileImpl: function FakeFile(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; },
  });
  await settle();
  const cta = page.app.querySelector(".quiz-share-cta__button");
  cta.dispatch("click");
  await settle();
  assert.equal(shares.length, 1);
  assert.deepEqual(Object.keys(shares[0]).sort(), ["files", "text", "title", "url"]);
  assert.equal(shares[0].title, "The Kiss Test");
  assert.equal(shares[0].text, SHARE_TEXT);
  assert.equal(shares[0].url, SHARE_URL);
  assert.equal(shares[0].files[0].name, "kiss-test-overthinker.jpg");
  assert.equal(shares[0].files[0].type, "image/jpeg");
  assert.deepEqual(plain(shares[0].files[0].parts), ["jpg-bytes"]);

  canShareFiles = false;
  cta.dispatch("click");
  await settle();
  assert.deepEqual(Object.keys(shares[1]).sort(), ["text", "title", "url"]);
  assert.deepEqual(plain(named(page.events, "share_click").map((e) => e.params)), [{ method: "web_share", archetype: "overthinker" }, { method: "web_share", archetype: "overthinker" }]);
  assert.equal(page.body.querySelector("dialog.quiz-share"), null);

  outcome = () => Promise.reject(Object.assign(new Error("dismissed"), { name: "AbortError" }));
  cta.dispatch("click");
  await settle();
  assert.equal(shares.length, 3);
  assert.equal(page.body.querySelector("dialog.quiz-share"), null);
  assert.equal(named(page.events, "share_click").length, 2);

  outcome = () => Promise.reject(Object.assign(new Error("no activation"), { name: "NotAllowedError" }));
  cta.dispatch("click");
  await settle();
  assert.ok(page.body.querySelector("dialog.quiz-share"), "sheet opens when the native share fails");
});

function clickOption(page, text) {
  const button = page.app.querySelectorAll(".quiz-option").find((b) => b.textContent === text);
  assert.ok(button, `option "${text}" is on screen`);
  button.dispatch("click");
}

const pressed = (page) => page.app.querySelector(".quiz-option[aria-pressed=\"true\"]").textContent;
const back = (page) => page.app.querySelector(".quiz-back").dispatch("click");

test("inline handoff pre-answers the card question, asks the partner and self taps, then runs the rest in order", () => {
  const page = runPage({ pageKind: "quiz", search: "?from=slow-kiss&hook=technique&placement=quiz-article-quarter&q=q1&a=b" });
  assert.deepEqual(plain(named(page.events, "quiz_start")[0].params), { entry: "inline", article: "slow-kiss", offer_key: "technique", placement: "quiz-article-quarter" });
  assert.deepEqual(plain(named(page.events, "quiz_answer")[0].params), { question_index: 1, entry: "inline" });
  assert.equal(page.window.sessionStorage.getItem("kt_answers_v1"), "b_________");
  assert.deepEqual(page.navigations, [["replaceState", null, "", "/kiss-test/"]]);
  assert.match(page.app.textContent, /Who's on the other end of these kisses\?/);
  assert.doesNotMatch(page.app.textContent, /static fallback/);
  assert.equal(page.app.querySelector(".quiz-back"), null);

  clickOption(page, "Her");
  assert.equal(page.window.sessionStorage.getItem("kt_pronoun_v1"), "her");
  const self = page.app.textContent;
  assert.match(self, /One more, only so the picture matches/);
  assert.match(self, /And you\?/);
  assert.match(self, /This never leaves your phone\. It only picks the illustration\./);
  assert.deepEqual(page.app.querySelectorAll(".quiz-option").map((b) => b.textContent), ["A woman", "A man", "Rather not say"]);
  assert.equal(page.app.querySelector(".quiz-question").focused, true);

  back(page);
  assert.match(page.app.textContent, /Who's on the other end/);
  assert.equal(pressed(page), "Her");
  clickOption(page, "Her");
  clickOption(page, "A woman");
  assert.equal(page.window.sessionStorage.getItem("kt_self_v1"), "woman");
  assert.match(page.app.textContent, /Question 2 of 10/);
  assert.equal(page.app.querySelector(".quiz-progress-bar").style.props["--quiz-progress"], "10%");
  assert.equal(page.app.querySelector(".quiz-question").focused, true);

  // Back walks through the card question and both taps, keeping each choice pressed.
  back(page);
  assert.match(page.app.textContent, /Question 1 of 10/);
  assert.equal(pressed(page), "Option b for q1");
  back(page);
  assert.match(page.app.textContent, /And you\?/);
  assert.equal(pressed(page), "A woman");
  clickOption(page, "A man");
  assert.equal(page.window.sessionStorage.getItem("kt_self_v1"), "man");
  assert.match(page.app.textContent, /Question 2 of 10/);

  for (let q = 2; q <= 5; q++) clickOption(page, `Option c for q${q}`);
  assert.match(page.app.textContent, /You feel her pull back an inch\./);
  clickOption(page, "Check she's okay. Softly.");
  for (let q = 7; q <= 10; q++) clickOption(page, `Option a for q${q}`);

  assert.match(page.app.textContent, /Scoring your answers\. Eight dials, ten taps\./);
  assert.equal(page.window.sessionStorage.getItem("kt_answers_v1"), "bccccdaaaa");
  assert.equal(page.timeouts.length, 1);
  assert.equal(page.timeouts[0].delay, 0);
  page.timeouts[0].fn();
  assert.deepEqual(page.engine.calls, ["bccccdaaaa"]);
  assert.deepEqual(plain(named(page.events, "quiz_complete")[0].params), { archetype: "overthinker", score_band: "dangerous", score: 73, entry: "inline", article: "slow-kiss" });
  assert.equal(named(page.events, "quiz_answer").length, 10);
  assert.deepEqual(page.navigations.at(-1), ["assign", "/kiss-test/result/"]);
  assert.equal(JSON.parse(page.window.sessionStorage.getItem("kt_from_v1")).from, "slow-kiss");
  // The self tap never leaves the device: not in events, not in the URL.
  assert.equal(page.events.some((e) => /"(woman|man|skip)"/.test(JSON.stringify(e.params))), false);
  assert.equal(page.navigations.some((n) => JSON.stringify(n).includes("man")), false);
});

test("a direct start resets both taps, and a reload resumes at the next unanswered step", () => {
  const page = runPage({ pageKind: "quiz", session: { kt_answers_v1: "abcdabcdab", kt_pronoun_v1: "him", kt_self_v1: "man" } });
  assert.match(page.app.textContent, /static fallback/);
  page.startButtons[0].dispatch("click", { preventDefault() {} });
  assert.deepEqual(plain(named(page.events, "quiz_start")[0].params), { entry: "direct", article: "direct", offer_key: "none", placement: "landing" });
  assert.equal(page.window.sessionStorage.getItem("kt_answers_v1"), "__________");
  assert.equal(page.window.sessionStorage.getItem("kt_pronoun_v1"), null);
  assert.equal(page.window.sessionStorage.getItem("kt_self_v1"), null);
  assert.match(page.app.textContent, /Who's on the other end/);
  page.startButtons[1].dispatch("click", { preventDefault() {} });
  assert.equal(named(page.events, "quiz_start").length, 1);
  clickOption(page, "Him");
  clickOption(page, "Rather not say");
  assert.match(page.app.textContent, /Question 1 of 10/);
  back(page);
  assert.match(page.app.textContent, /And you\?/);
  assert.equal(pressed(page), "Rather not say");

  const resumed = runPage({ pageKind: "quiz", session: { kt_answers_v1: "abc_______", kt_pronoun_v1: "nobody", kt_self_v1: "skip" } });
  assert.match(resumed.app.textContent, /Question 4 of 10/);
  assert.equal(named(resumed.events, "quiz_start").length, 0);
  for (let q = 4; q <= 5; q++) clickOption(resumed, `Option d for q${q}`);
  assert.match(resumed.app.textContent, /You feel them pull back an inch\./);
  clickOption(resumed, "Check they're okay. Softly.");
  for (let q = 7; q <= 8; q++) clickOption(resumed, `Option d for q${q}`);
  assert.match(resumed.app.textContent, /Mid-kiss, which would you most want to catch them doing\?/);
  back(resumed);
  assert.match(resumed.app.textContent, /Question 8 of 10/);
  assert.equal(pressed(resumed), "Option d for q8");

  const partnerOnly = runPage({ pageKind: "quiz", session: { kt_answers_v1: "abc_______", kt_pronoun_v1: "him" } });
  assert.match(partnerOnly.app.textContent, /And you\?/);
  clickOption(partnerOnly, "A man");
  assert.match(partnerOnly.app.textContent, /Question 4 of 10/);

  const noTaps = runPage({ pageKind: "quiz", session: { kt_answers_v1: "abc_______" } });
  assert.match(noTaps.app.textContent, /Who's on the other end/);
});

test("homepage Q1 handoff starts the test inline from the hero card", () => {
  const { KissQuiz } = runPage({ pageKind: "quiz" });
  const handoff = KissQuiz.parseHandoff("?from=homepage&hook=complete-guide&placement=home-hero&q=q1&a=b");
  assert.deepEqual(plain(handoff), { from: "homepage", hook: "complete-guide", placement: "home-hero", q: "q1", a: "b", index: 0, entry: "inline" });
  for (const placement of ["home-final", "home-mobile-sticky"]) {
    const link = KissQuiz.parseHandoff(`?from=homepage&hook=complete-guide&placement=${placement}`);
    assert.deepEqual([link.from, link.hook, link.placement, link.entry], ["homepage", "complete-guide", placement, "article"]);
  }

  const page = runPage({ pageKind: "quiz", search: "?from=homepage&hook=complete-guide&placement=home-hero&q=q1&a=b" });
  assert.deepEqual(plain(named(page.events, "quiz_start")[0].params), { entry: "inline", article: "homepage", offer_key: "complete-guide", placement: "home-hero" });
  assert.deepEqual(plain(named(page.events, "quiz_answer")[0].params), { question_index: 1, entry: "inline" });
  assert.equal(page.window.sessionStorage.getItem("kt_answers_v1"), "b_________");
});

const CLIP_ATTRIBUTES = [["muted", ""], ["playsinline", ""], ["webkit-playsinline", ""], ["aria-hidden", "true"]];

test("free render layers the reveal clip over the mw still when motion is allowed; the share sheet keeps the jpg", async () => {
  const page = runPage({ pageKind: "quiz-result", reducedMotion: false, session: { kt_answers_v1: ANSWERS, kt_pronoun_v1: "him", kt_self_v1: "woman" }, fetchImpl: freeFetch([]) });
  await settle();
  const videos = page.app.querySelectorAll(".quiz-card__media video.quiz-card__video");
  assert.equal(videos.length, 1);
  const [video] = videos;
  assert.equal(video.querySelector("source").getAttribute("src"), "/assets/video/archetypes/overthinker-mw.mp4");
  assert.equal(video.querySelector("source").getAttribute("type"), "video/mp4");
  for (const [name, value] of [...CLIP_ATTRIBUTES, ["autoplay", ""], ["preload", "auto"]]) {
    assert.equal(video.getAttribute(name), value, name);
  }
  assert.equal(video.getAttribute("poster"), null, "the picture underneath is the poster");
  assert.equal(video.getAttribute("loop"), null);
  assert.equal(video.muted, true);
  assert.equal(video.playCalls, 1);
  const media = video.parent;
  assert.equal(media.className, "quiz-card__media");
  assert.deepEqual(media.children.map((c) => c.tagName), ["PICTURE", "VIDEO"]);
  video.dispatch("playing");
  assert.equal(video.classList.contains("is-playing"), true);
  assert.equal(Array.from(page.app.querySelectorAll("video")).every((v) => v.classList.contains("quiz-card__video")), true, "only the archetype cards move");
  video.dispatch("ended");
  const rest = page.timeouts[page.timeouts.length - 1];
  assert.equal(rest.delay, 3200, "a finished card rests, then plays again");
  rest.fn();
  assert.equal(video.currentTime, 0);
  assert.equal(video.playCalls, 2);

  page.app.querySelector(".quiz-share-cta__button").dispatch("click");
  const sheetMedia = page.body.querySelector("dialog.quiz-share .quiz-share__media");
  assert.equal(sheetMedia.querySelector("video"), null);
  assert.equal(sheetMedia.querySelector("img").getAttribute("src"), "/assets/images/kiss-test/archetypes/overthinker-mw.jpg");

  // A source that fails to load takes the clip out and leaves the picture.
  video.querySelector("source").dispatch("error");
  assert.equal(page.app.querySelector(".quiz-card__media video"), null);
  assert.equal(page.app.querySelector(".quiz-card__media picture img").getAttribute("src"), "/assets/images/kiss-test/archetypes/overthinker-mw.jpg");
});

test("reduced motion, data saver and 2g links get today's still with no video element", async () => {
  for (const options of [{ reducedMotion: true }, { reducedMotion: false, connection: { saveData: true } }, { reducedMotion: false, connection: { effectiveType: "slow-2g" } }]) {
    const page = runPage({ pageKind: "quiz-result", ...options, session: { kt_answers_v1: ANSWERS }, fetchImpl: freeFetch([]) });
    await settle();
    assert.equal(page.app.querySelectorAll("video").length, 0, JSON.stringify(options));
    assert.equal(page.app.querySelector(".quiz-card__media picture img").getAttribute("src"), "/assets/images/kiss-test/archetypes/overthinker-mw.jpg");
  }
});

test("mm and ww pairings keep their stills: only mw has clips", async () => {
  for (const [pronoun, self, pairing] of [["her", "woman", "ww"], ["him", "man", "mm"]]) {
    const page = runPage({ pageKind: "quiz-result", reducedMotion: false, session: { kt_answers_v1: ANSWERS, kt_pronoun_v1: pronoun, kt_self_v1: self }, fetchImpl: freeFetch([]) });
    await settle();
    assert.equal(page.app.querySelectorAll("video").length, 0, pairing);
    assert.equal(page.app.querySelector(".quiz-card__media img").getAttribute("src"), `/assets/images/kiss-test/archetypes/overthinker-${pairing}.jpg`);
  }
});

test("paid render breathes the gold plate behind the glance once and removes it; reduced motion never adds it", async () => {
  const page = runPage({ pageKind: "quiz-result", reducedMotion: false, session: { kt_answers_v1: ANSWERS }, local: { kt_token_v1: "tok" }, fetchImpl: paidFetch });
  await settle();
  const glance = page.app.querySelector(".quiz-glance");
  const plate = glance.children[0];
  assert.equal(plate.tagName, "VIDEO");
  assert.equal(plate.className, "quiz-glance__plate");
  assert.equal(plate.querySelector("source").getAttribute("src"), "/assets/video/score-plate.mp4");
  for (const [name, value] of [...CLIP_ATTRIBUTES, ["autoplay", ""], ["preload", "auto"]]) {
    assert.equal(plate.getAttribute(name), value, name);
  }
  assert.equal(plate.getAttribute("loop"), null);
  assert.equal(plate.getAttribute("poster"), null);
  assert.equal(plate.muted, true);
  assert.equal(plate.playCalls, 1);
  assert.equal(glance.querySelectorAll("video").length, 1);
  assert.equal(page.app.querySelectorAll(".quiz-card .quiz-card__video").length, 1, "the report's archetype card carries the reveal clip too");
  plate.dispatch("playing");
  assert.equal(plate.classList.contains("is-playing"), true);
  plate.dispatch("ended");
  assert.equal(plate.classList.contains("is-done"), true);
  const removal = page.timeouts.at(-1);
  assert.equal(removal.delay, 800);
  removal.fn();
  assert.equal(glance.querySelector("video"), null);
  assert.equal(glance.querySelector(".quiz-glance__score strong").textContent, "73");

  const still = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS }, local: { kt_token_v1: "tok" }, fetchImpl: paidFetch });
  await settle();
  assert.equal(still.app.querySelectorAll("video").length, 0);
});

test("landing row with a fine pointer: a hover builds the card's clip once, plays it, and replays from the start after it ends", () => {
  const page = runPage({ pageKind: "quiz", landing: true, reducedMotion: false, hover: true });
  assert.equal(page.body.querySelectorAll("video").length, 0, "no bytes until a hover");
  const [explorer, natural] = page.landingCards;
  explorer.dispatch("mouseenter");
  const video = explorer.querySelector("video");
  assert.ok(video);
  assert.deepEqual(explorer.children.map((c) => c.tagName), ["IMG", "VIDEO", "H3", "P"]);
  assert.equal(video.querySelector("source").getAttribute("src"), "/assets/video/archetypes/explorer-mw.mp4");
  for (const [name, value] of [...CLIP_ATTRIBUTES, ["preload", "none"], ["poster", "/assets/images/kiss-test/archetypes/explorer-mw-thumb.webp"], ["width", "540"], ["height", "675"]]) {
    assert.equal(video.getAttribute(name), value, name);
  }
  assert.equal(video.getAttribute("autoplay"), null);
  assert.equal(video.getAttribute("loop"), null);
  assert.equal(video.muted, true);
  assert.equal(video.playCalls, 1);
  explorer.dispatch("mouseenter");
  assert.equal(explorer.querySelectorAll("video").length, 1);
  assert.equal(video.playCalls, 2);
  assert.equal(video.currentTime, undefined);
  video.ended = true;
  explorer.dispatch("mouseenter");
  assert.equal(video.currentTime, 0);
  assert.equal(video.playCalls, 3);
  assert.equal(natural.querySelector("video"), null);
  assert.equal(page.demoFigure.querySelector("video"), null, "the demo needs an IntersectionObserver");
});

test("hero: on phones the kitchen clip comes in after load, rests on the still, and replays only while on screen", () => {
  const observers = [];
  const page = runPage({ pageKind: "quiz", hero: true, reducedMotion: false, observers });
  assert.equal(page.body.querySelectorAll("video").length, 0, "no bytes before the load event");
  page.load();
  const clip = page.heroMedia.querySelector("video");
  assert.equal(clip.className, "quiz-hero__video");
  assert.equal(clip.querySelector("source").getAttribute("src"), "/assets/video/kiss-test/hero-kitchen-mobile.mp4");
  assert.equal(clip.getAttribute("preload"), "auto");
  assert.equal(clip.getAttribute("poster"), null, "the hero still is the poster");
  assert.equal(clip.playCalls, 1);
  assert.deepEqual(observers.map((o) => o.options.threshold), [0.3]);
  assert.deepEqual(observers[0].targets, [page.heroMedia]);
  clip.dispatch("playing");
  assert.equal(clip.classList.contains("is-playing"), true);
  clip.ended = true;
  clip.dispatch("ended");
  assert.equal(clip.classList.contains("is-playing"), false, "the still shows between plays");
  const rest = page.timeouts[page.timeouts.length - 1];
  assert.equal(rest.delay, 3200);
  rest.fn();
  assert.equal(clip.currentTime, 0);
  assert.equal(clip.playCalls, 2, "it plays again after the rest");
  observers[0].callback([{ target: page.heroMedia, isIntersecting: false }]);
  assert.equal(clip.pauseCalls, 1, "off screen it stops");

  const wide = runPage({ pageKind: "quiz", hero: true, reducedMotion: false, phone: false, observers: [] });
  wide.load();
  assert.equal(wide.body.querySelectorAll("video").length, 0, "wider screens keep the still");
  const still = runPage({ pageKind: "quiz", hero: true, reducedMotion: true, observers: [] });
  still.load();
  assert.equal(still.body.querySelectorAll("video").length, 0, "reduced motion keeps the still");
});

test("landing row: the deck ripples while on screen on any pointer, the tier demo loops only while on screen", () => {
  const observers = [];
  const page = runPage({ pageKind: "quiz", landing: true, reducedMotion: false, hover: false, observers });
  assert.deepEqual(observers.map((o) => o.options.threshold), [0.25, 0.4]);
  const [rowWatch, demoWatch] = observers;
  const [explorer, natural] = page.landingCards;
  const row = explorer.parentNode;
  assert.deepEqual(rowWatch.targets, [row]);
  assert.deepEqual(demoWatch.targets, [page.demoFigure]);
  assert.equal(page.body.querySelectorAll("video").length, 0, "no bytes until the row is in view");

  rowWatch.callback([{ target: row, isIntersecting: true }]);
  const clip = explorer.querySelector("video");
  assert.equal(clip.querySelector("source").getAttribute("src"), "/assets/video/archetypes/explorer-mw.mp4");
  assert.equal(clip.getAttribute("preload"), "none");
  assert.equal(clip.playCalls, 1);
  assert.equal(natural.querySelector("video"), null, "one card starts at a time");
  const gap = page.timeouts[page.timeouts.length - 1];
  assert.equal(gap.delay, 1800);
  gap.fn();
  const next = natural.querySelector("video");
  assert.equal(next.playCalls, 1, "the next card follows after the gap");
  assert.equal(page.timeouts[page.timeouts.length - 1].delay, 4200, "a rest after the last card");

  rowWatch.callback([{ target: row, isIntersecting: false }]);
  assert.equal(page.timeouts[page.timeouts.length - 1].cleared, true, "off screen, the ripple stops");
  assert.equal(clip.pauseCalls, 1);
  assert.equal(next.pauseCalls, 1);
  clip.ended = true;
  explorer.dispatch("mouseenter");
  assert.equal(clip.currentTime, 0);
  assert.equal(clip.playCalls, 2, "a finished card replays from the start on hover");
  rowWatch.callback([{ target: row, isIntersecting: true }]);
  assert.equal(page.timeouts[page.timeouts.length - 1].cleared, undefined, "back on screen, the ripple resumes");

  demoWatch.callback([{ target: page.demoFigure, isIntersecting: true }]);
  const loop = page.demoFigure.querySelector("video");
  assert.ok(loop);
  assert.deepEqual(page.demoFigure.children.map((c) => c.tagName), ["IMG", "VIDEO", "FIGCAPTION"]);
  assert.equal(loop.querySelector("source").getAttribute("src"), "/assets/video/score-demo.mp4");
  for (const [name, value] of [...CLIP_ATTRIBUTES, ["loop", ""], ["preload", "none"], ["poster", "/assets/images/kiss-test/score-demo-poster.webp"]]) {
    assert.equal(loop.getAttribute(name), value, name);
  }
  assert.equal(loop.muted, true);
  assert.equal(loop.playCalls, 1);
  demoWatch.callback([{ target: page.demoFigure, isIntersecting: false }]);
  assert.equal(loop.pauseCalls, 1);
  demoWatch.callback([{ target: page.demoFigure, isIntersecting: true }]);
  assert.equal(page.demoFigure.querySelectorAll("video").length, 1);
  assert.equal(loop.playCalls, 2);

  const still = runPage({ pageKind: "quiz", landing: true, reducedMotion: true, hover: false, observers: [] });
  assert.equal(still.body.querySelectorAll("video").length, 0);
});
