import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const quizSource = readFileSync(new URL("../assets/quiz.js", import.meta.url), "utf8");

// A fake DOM just big enough for quiz.js, which builds every node with
// createElement, textContent, setAttribute and appendChild.
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
  get parentNode() { return this.parent; }
  get innerHTML() { throw new Error("innerHTML is off limits"); }
  set innerHTML(value) { throw new Error("innerHTML is off limits"); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
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

function runPage({ pageKind, search = "", session = {}, local = {}, fetchImpl, gtagMissing = false, gaValues = {}, engine = stubEngine(), share, canShare, clipboard, fileImpl }) {
  FakeElement.active = null;
  const body = new FakeElement("body");
  body.dataset.pageKind = pageKind;
  body.dataset.kissApi = "https://api.example";
  const main = body.appendChild(new FakeElement("main"));
  const app = main.appendChild(new FakeElement("div"));
  app.id = pageKind === "quiz" ? "kiss-test-app" : "kiss-test-result";
  app.appendChild(new FakeElement("p")).textContent = "static fallback";
  const lede = main.appendChild(new FakeElement("p"));
  lede.setAttribute("data-email-lede", "");
  lede.textContent = "free lede";
  const startButtons = [new FakeElement("a"), new FakeElement("button")];
  startButtons.forEach((b) => { b.setAttribute("data-quiz-start", ""); main.appendChild(b); });

  const events = [];
  const timeouts = [];
  const navigations = [];
  let ready;
  const document = {
    body,
    title: "Test",
    addEventListener(name, fn) { if (name === "DOMContentLoaded") ready = fn; },
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (ns, tag) => new FakeElement(tag),
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
    matchMedia: () => ({ matches: true }),
    navigator: { share, canShare, clipboard },
    File: fileImpl,
    setTimeout(fn, delay) { timeouts.push({ fn, delay }); return timeouts.length; },
  };
  if (!gtagMissing) {
    window.gtag = (...args) => {
      if (args[0] === "get") { args[3](gaValues[args[2]]); return; }
      events.push({ name: args[1], params: args[2] });
    };
  }
  window.window = window;
  vm.runInNewContext(quizSource, { Array, Boolean, Error, JSON, Math, Number, Object, Promise, String, URLSearchParams, document, window });
  ready();
  return { app, body, document, engine, events, lede, navigations, startButtons, timeouts, window, KissQuiz: window.KissQuiz };
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
  assert.match(page.app.textContent, /unlock has expired/);
  assert.match(page.app.textContent, /You're The Overthinker\./);
  assert.equal(page.app.querySelector(".quiz-retry"), null);
});

test("no answers and no unlock sends the visitor back to the test", async () => {
  const page = runPage({ pageKind: "quiz-result" });
  await settle();
  assert.deepEqual(page.navigations, [["replace", "/kiss-test/"]]);
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
  assert.deepEqual(page.app.querySelectorAll("img").map((i) => i.getAttribute("src")), ["/assets/images/kiss-test/archetypes/overthinker-ww-thumb.webp"]);
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

  // At a glance sits between the header and the first section, with the pairing-aware thumb.
  const glance = page.app.querySelector(".quiz-glance");
  assert.equal(page.app.children.indexOf(glance), 1);
  assert.equal(page.app.children[2].classList.contains("quiz-paid-section--verdict"), true);
  assert.equal(glance.querySelector("img").getAttribute("src"), "/assets/images/kiss-test/archetypes/overthinker-ww-thumb.webp");
  assert.match(glance.textContent, /The Overthinker/);
  assert.match(glance.textContent, /Your instincts are fine\. Your narrator won't shut up\./);
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
  assert.equal(page.app.querySelector(".quiz-glance img").getAttribute("src"), "/assets/images/kiss-test/archetypes/overthinker-mw-thumb.webp");
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

const SHARE_TEXT = "I took the Kiss Test and got The Overthinker. \"Your instincts are fine. Your narrator won't shut up.\" I'm not telling you my score. Take it and tell me yours:";
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
