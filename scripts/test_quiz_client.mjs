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
  get innerHTML() { throw new Error("innerHTML is off limits"); }
  set innerHTML(value) { throw new Error("innerHTML is off limits"); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  insertBefore(child, ref) { child.parent = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, child); return child; }
  removeChild(child) { this.children = this.children.filter((c) => c !== child); }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  dispatch(name, event = {}) { (this.listeners[name] || []).forEach((fn) => fn(event)); return event; }
  focus() { this.focused = true; }
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

function runPage({ pageKind, search = "", session = {}, local = {}, fetchImpl, gtagMissing = false, gaValues = {}, engine = stubEngine(), share, clipboard }) {
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
    navigator: { share, clipboard },
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
        { id: "score", title: "Where your points went", headline: "<img src=x onerror=alert(1)> {He}'s watching", paragraphs: ["Kiss Score 73, Dangerous, in a Good Way."], items: [{ label: "Reading them", level: "strong", line: "Keep doing exactly this." }, { label: "Pace", level: "costing", line: "This is where the points went." }] },
        { id: "strengths", title: "Your two strongest habits", items: [{ title: "You wait", text: "You let {him} come back." }] },
        { id: "noticing", title: "What {he}'s actually noticing (from your answers)", items: ["{He}'s noticing that {his} shoulders drop."] },
        { id: "move", title: "The one move for The Overthinker", paragraphs: ["Hold for ten seconds."] },
        { id: "fix", title: "Your 7-day fix", items: [{ day: 1, title: "<b>Day one</b>", text: "Do {him} a favor." }] },
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
  const page = runPage({ pageKind: "quiz-result", search: "?session_id=cs_test_abc123", session: { kt_answers_v1: ANSWERS, kt_pronoun_v1: "her" }, fetchImpl });
  await settle();

  const text = page.app.textContent;
  assert.match(text, /Unlocked\. Here's the honest version\./);
  assert.match(text, /<img src=x onerror=alert\(1\)> She's watching/);
  assert.match(text, /She's noticing that her shoulders drop\./);
  assert.match(text, /You let her come back\./);
  assert.match(text, /Day 1: <b>Day one<\/b>Do her a favor\./);
  assert.match(text, /Kiss Score 73/);
  const tags = new Set();
  walk(page.app, (n) => tags.add(n.tagName));
  assert.equal(tags.has("IMG"), false);
  assert.equal(tags.has("B"), false);

  const bars = page.app.querySelectorAll(".quiz-dim__bar span");
  assert.equal(bars[0].style.props["--dim"], "100%");
  assert.equal(page.app.querySelector(".quiz-dim[data-level=\"costing\"]").textContent.startsWith("Pace"), true);

  assert.equal(page.window.localStorage.getItem("kt_token_v1"), "tok-1");
  assert.equal(page.window.localStorage.getItem("kt_paid_answers_v1"), ANSWERS);
  assert.deepEqual(page.navigations, [["replaceState", null, "", "/kiss-test/result/"]]);
  assert.match(page.lede.textContent, /full report link, so it reopens on any device/);
  assert.match(text, /Share with my score/);
  assert.deepEqual(plain(named(page.events, "result_view")[0].params), { tier: "paid", archetype: "overthinker" });
  assert.deepEqual(plain(named(page.events, "unlock_view")[0].params), { product: "report" });
  assert.equal(named(page.events, "paywall_view").length, 0);
});

test("share falls back to the clipboard with the archetype text and reports the method", async () => {
  const written = [];
  const page = runPage({ pageKind: "quiz-result", session: { kt_answers_v1: ANSWERS }, fetchImpl: freeFetch([]), clipboard: { writeText: (t) => { written.push(t); return Promise.resolve(); } } });
  await settle();
  const [share, copy] = page.app.querySelectorAll(".quiz-card__actions button");
  share.dispatch("click");
  copy.dispatch("click");
  await settle();
  assert.equal(written[0], "I took the Kiss Test and got The Overthinker. \"Your instincts are fine. Your narrator won't shut up.\" I'm not telling you my score. Take it and tell me yours: https://howtokissbetter.com/kiss-test/?ref=share");
  assert.equal(written[1], "https://howtokissbetter.com/kiss-test/?ref=share");
  assert.deepEqual(plain(named(page.events, "share_click").map((e) => e.params)), [{ method: "copy", archetype: "overthinker" }, { method: "copy_link", archetype: "overthinker" }]);
  assert.equal(page.app.querySelector(".quiz-strengths").children.length, 0);
});

function clickOption(page, text) {
  const button = page.app.querySelectorAll(".quiz-option").find((b) => b.textContent === text);
  assert.ok(button, `option "${text}" is on screen`);
  button.dispatch("click");
}

test("inline handoff pre-answers the card question, asks the pronoun, then runs the rest in order", () => {
  const page = runPage({ pageKind: "quiz", search: "?from=slow-kiss&hook=technique&placement=quiz-article-quarter&q=q1&a=b" });
  assert.deepEqual(plain(named(page.events, "quiz_start")[0].params), { entry: "inline", article: "slow-kiss", offer_key: "technique", placement: "quiz-article-quarter" });
  assert.deepEqual(plain(named(page.events, "quiz_answer")[0].params), { question_index: 1, entry: "inline" });
  assert.equal(page.window.sessionStorage.getItem("kt_answers_v1"), "b_________");
  assert.deepEqual(page.navigations, [["replaceState", null, "", "/kiss-test/"]]);
  assert.match(page.app.textContent, /Who's on the other end of these kisses\?/);
  assert.doesNotMatch(page.app.textContent, /static fallback/);

  clickOption(page, "Her");
  assert.equal(page.window.sessionStorage.getItem("kt_pronoun_v1"), "her");
  assert.match(page.app.textContent, /Question 2 of 10/);
  assert.equal(page.app.querySelector(".quiz-progress-bar").style.props["--quiz-progress"], "10%");
  assert.equal(page.app.querySelector(".quiz-question").focused, true);

  for (let q = 2; q <= 5; q++) clickOption(page, `Option c for q${q}`);
  assert.match(page.app.textContent, /You feel her pull back an inch\./);
  assert.match(page.app.textContent, /Check she's okay\. Softly\./);
  clickOption(page, "Check she's okay. Softly.");
  for (let q = 7; q <= 10; q++) clickOption(page, `Option a for q${q}`);

  assert.match(page.app.textContent, /Scoring your answers\. Eight dials, ten taps\./);
  assert.equal(page.window.sessionStorage.getItem("kt_answers_v1"), "bccccdaaaa");
  assert.equal(page.timeouts.length, 1);
  assert.equal(page.timeouts[0].delay, 0);
  page.timeouts[0].fn();
  assert.deepEqual(page.engine.calls, ["bccccdaaaa"]);
  const complete = named(page.events, "quiz_complete")[0].params;
  assert.deepEqual(plain(complete), { archetype: "overthinker", score_band: "dangerous", score: 73, entry: "inline", article: "slow-kiss" });
  assert.equal(named(page.events, "quiz_answer").length, 10);
  assert.deepEqual(page.navigations.at(-1), ["assign", "/kiss-test/result/"]);
  assert.equal(JSON.parse(page.window.sessionStorage.getItem("kt_from_v1")).from, "slow-kiss");
});

test("a direct start resets state, and a mid-quiz reload resumes at the next question", () => {
  const page = runPage({ pageKind: "quiz", session: { kt_answers_v1: "abcdabcdab", kt_pronoun_v1: "him" } });
  assert.match(page.app.textContent, /static fallback/);
  page.startButtons[0].dispatch("click", { preventDefault() {} });
  assert.deepEqual(plain(named(page.events, "quiz_start")[0].params), { entry: "direct", article: "direct", offer_key: "none", placement: "landing" });
  assert.equal(page.window.sessionStorage.getItem("kt_answers_v1"), "__________");
  assert.equal(page.window.sessionStorage.getItem("kt_pronoun_v1"), null);
  page.startButtons[1].dispatch("click", { preventDefault() {} });
  assert.equal(named(page.events, "quiz_start").length, 1);

  const resumed = runPage({ pageKind: "quiz", session: { kt_answers_v1: "abc_______", kt_pronoun_v1: "nobody" } });
  assert.match(resumed.app.textContent, /Question 4 of 10/);
  assert.equal(named(resumed.events, "quiz_start").length, 0);
  for (let q = 4; q <= 5; q++) clickOption(resumed, `Option d for q${q}`);
  assert.match(resumed.app.textContent, /You feel them pull back an inch\./);
  clickOption(resumed, "Check they're okay. Softly.");
  for (let q = 7; q <= 8; q++) clickOption(resumed, `Option d for q${q}`);
  assert.match(resumed.app.textContent, /Mid-kiss, which would you most want to catch them doing\?/);
  resumed.app.querySelector(".quiz-back").dispatch("click");
  assert.match(resumed.app.textContent, /Question 8 of 10/);
  assert.equal(resumed.app.querySelector(".quiz-option[aria-pressed=\"true\"]").textContent, "Option d for q8");
});
