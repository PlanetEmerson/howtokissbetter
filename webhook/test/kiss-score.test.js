import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const KissScore = require("../src/kiss-score.cjs");

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(HERE, "../src/kiss-score.cjs");
const ASSET_PATH = resolve(HERE, "../../assets/kiss-score.js");

const DIMENSION_ORDER = ["R", "P", "T", "G", "H", "B", "V", "X"];
const ARCHETYPE_ORDER = ["natural", "slow-burn", "sweetheart", "overthinker", "explorer", "statue", "sprinter"];
const LETTERS = "abcd";

// Appendix A 3.3 worked checks, as answer strings (question order, one letter each).
const WORKED = [
  { answers: "cbbcbbbbac", score: 100, archetype: "natural", note: "all Natural options" },
  { answers: "aaabcaccaa", score: 40, archetype: "sprinter" },
  { answers: "dcbdacbdcc", score: 59, archetype: "overthinker" },
  { answers: "cdbabbaadd", score: 63, archetype: "statue" },
  { answers: "bbdddddddb", score: 79, archetype: "sweetheart" },
  { answers: "bbcbbaccac", score: 66, archetype: "explorer" },
  { answers: "bbdcbbdbbb", score: 95, archetype: "slow-burn", note: "Natural guard fails on leans" },
  { answers: "cbbcbbadca", score: 79, archetype: "natural" },
];

// Small seeded PRNG so the random sample is the same on every run.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomAnswers(next) {
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += LETTERS[Math.floor(next() * LETTERS.length)];
  }
  return out;
}

function loadAsBrowserScript(path) {
  const sandbox = {};
  sandbox.self = sandbox;
  vm.runInNewContext(readFileSync(path, "utf8"), sandbox);
  return sandbox.KissScore;
}

test("the eight worked examples reproduce the spec's score and archetype", () => {
  for (const example of WORKED) {
    const result = KissScore.score(example.answers);
    assert.equal(result.score, example.score, `${example.answers} score`);
    assert.equal(result.archetype.id, example.archetype, `${example.answers} archetype`);
  }
});

test("all-worst answers score the floor of 20 and all-best score 100", () => {
  assert.equal(KissScore.score("aaaaaaaacd").score, 20);
  assert.equal(KissScore.score("aaaaaaaacd").band.id, "raw");
  assert.equal(KissScore.score("cbbcbbbbac").score, 100);
  assert.equal(KissScore.score("cbbcbbbbac").band.id, "podium");
});

test("the Overthinker example selects the expected habits and teasers", () => {
  const result = KissScore.score("dcbdacbdcc");
  assert.deepEqual(result.teasers, { costingCount: 6, strongestDimension: { key: "G", name: "Tongue" } });
  assert.deepEqual(result.strongest.map((a) => a.key), ["q3b", "q7b"]);
  assert.deepEqual(result.costliest.map((a) => a.key), ["q9c", "q5a", "q1d"]);
  assert.equal(result.onlyOneStrength, false);
  assert.deepEqual(result.strongest[0], { q: "q3", o: "b", key: "q3b", points: 3, max: 3, dimension: "G" });
  assert.deepEqual(result.costliest[0], { q: "q9", o: "c", key: "q9c", points: 0, max: 3, dimension: "R" });
  assert.deepEqual(result.leans, { natural: 3, "slow-burn": 0, sweetheart: 2, overthinker: 5, explorer: 0, statue: 0, sprinter: 0 });
  assert.equal(result.band.label, "Better Than You Think");
});

test("score() returns exactly the agreed shape", () => {
  const result = KissScore.score("dcbdacbdcc");
  assert.deepEqual(Object.keys(result).sort(), [
    "answers", "archetype", "band", "costliest", "dimensions", "leans", "onlyOneStrength", "score", "strongest", "teasers", "version",
  ]);
  assert.equal(result.version, 1);
  assert.equal(result.answers, "dcbdacbdcc");
  assert.deepEqual(Object.keys(result.band), ["id", "label"]);
  assert.deepEqual(Object.keys(result.archetype), ["id", "name", "tagline", "read"]);
  assert.equal(result.archetype.name, "The Overthinker");
  assert.equal(result.archetype.tagline, "Your instincts are fine. Your narrator won't shut up.");
  assert.match(result.archetype.read, /^You are not a bad kisser\./);
  assert.deepEqual(result.dimensions.map((d) => d.key), DIMENSION_ORDER);
  assert.deepEqual(Object.keys(result.leans), ARCHETYPE_ORDER);
  assert.deepEqual(result.dimensions[3], {
    key: "G", name: "Tongue", points: 3, max: 3, fraction: 1, level: "strong", levelLabel: "Strong", levelLine: "Keep doing exactly this.",
  });
  assert.deepEqual(result.dimensions[0], {
    key: "R", name: "Reading them", points: 1, max: 6, fraction: 1 / 6, level: "costing", levelLabel: "Costing you", levelLine: "This is where the points went.",
  });
  for (const answer of [...result.strongest, ...result.costliest]) {
    assert.deepEqual(Object.keys(answer), ["q", "o", "key", "points", "max", "dimension"]);
  }
});

test("scoring is deterministic, in range, banded, and reaches every archetype over 20,000 random strings", () => {
  const next = mulberry32(20260918);
  const seen = new Set();
  const bandFor = (score) => KissScore.DATA.bands.filter((b) => score >= b.min && score <= b.max);
  for (let i = 0; i < 20000; i++) {
    const answers = randomAnswers(next);
    const first = KissScore.score(answers);
    const second = KissScore.score(answers);
    assert.deepEqual(first, second, answers);
    assert.ok(Number.isInteger(first.score) && first.score >= 20 && first.score <= 100, `${answers} -> ${first.score}`);
    const bands = bandFor(first.score);
    assert.equal(bands.length, 1, `${answers} band`);
    assert.equal(first.band.id, bands[0].id, `${answers} band id`);
    assert.ok(first.strongest.length <= 2 && first.costliest.length <= 3, answers);
    assert.equal(first.onlyOneStrength, first.strongest.length < 2, answers);
    if (first.archetype.id === "natural") {
      assert.ok(first.leans.natural >= 6 && first.score >= 75, `${answers} natural guard`);
    }
    seen.add(first.archetype.id);
  }
  assert.deepEqual([...seen].sort(), [...ARCHETYPE_ORDER].sort());
});

test("bands are contiguous from 20 to 100 and levels descend from strong to costing", () => {
  const bands = KissScore.DATA.bands;
  assert.equal(bands[0].min, 20);
  assert.equal(bands[bands.length - 1].max, 100);
  for (let i = 1; i < bands.length; i++) {
    assert.equal(bands[i].min, bands[i - 1].max + 1, bands[i].id);
  }
  assert.deepEqual(KissScore.DATA.levels.map((l) => l.id), ["strong", "solid", "leaking", "costing"]);
  assert.deepEqual(KissScore.DATA.levels.map((l) => l.min), [0.83, 0.5, 0.33, 0]);
  const levelOf = (answers, key) => KissScore.score(answers).dimensions.find((d) => d.key === key).level;
  assert.equal(levelOf("bbdddddddb", "P"), "strong"); // 5 of 6
  assert.equal(levelOf("bbdddddddb", "R"), "solid"); // 4 of 6
  assert.equal(levelOf("dcbdacbdcc", "P"), "leaking"); // 2 of 6
  assert.equal(levelOf("dcbdacbdcc", "R"), "costing"); // 1 of 6
});

test("the same bytes work as a browser script and agree with the CommonJS build", () => {
  const Browser = loadAsBrowserScript(SOURCE_PATH);
  assert.equal(typeof Browser.score, "function");
  assert.equal(Browser.VERSION, KissScore.VERSION);
  const next = mulberry32(7);
  const sample = [...WORKED.map((w) => w.answers), ...Array.from({ length: 200 }, () => randomAnswers(next))];
  // Objects from another vm realm have foreign prototypes; compare structure only.
  const plain = (value) => JSON.parse(JSON.stringify(value));
  for (const answers of sample) {
    assert.deepEqual(plain(Browser.score(answers)), plain(KissScore.score(answers)), answers);
  }
});

test("isValidAnswers accepts exactly ten lowercase a-d letters", () => {
  assert.equal(KissScore.isValidAnswers("abcdabcdab"), true);
  assert.equal(KissScore.isValidAnswers("dddddddddd"), true);
  for (const bad of ["abcdabcda", "abcdabcdabc", "abcdabcdae", "ABCDABCDAB", "abcd abcda", "", "1234567890"]) {
    assert.equal(KissScore.isValidAnswers(bad), false, JSON.stringify(bad));
  }
  for (const notAString of [null, undefined, 12345678901, ["a", "b"], {}]) {
    assert.equal(KissScore.isValidAnswers(notAString), false, String(notAString));
  }
});

test("canonical trims and lowercases, and score() accepts what canonical produces", () => {
  assert.equal(KissScore.canonical("  DCBDacBDCC\n"), "dcbdacbdcc");
  assert.equal(KissScore.score(" DCBDACBDCC ").score, 59);
  assert.throws(() => KissScore.score("abc"), TypeError);
  assert.throws(() => KissScore.score("abcdabcdae"), TypeError);
  assert.throws(() => KissScore.score(undefined), TypeError);
});

test("encode and decode round trip", () => {
  const letters = ["d", "c", "b", "d", "a", "c", "b", "d", "c", "c"];
  assert.equal(KissScore.encode(letters), "dcbdacbdcc");
  assert.deepEqual(KissScore.decode("dcbdacbdcc"), letters);
  assert.deepEqual(KissScore.decode(KissScore.encode(letters)), letters);
});

test("optionFor looks options up by question index and letter", () => {
  assert.equal(KissScore.optionFor(0, "a").text, "Close the gap fast, before I lose my nerve.");
  assert.deepEqual(KissScore.optionFor(5, "d").points, { R: 2, P: 2 });
  assert.equal(KissScore.optionFor(9, "d").lean, "statue");
  assert.equal(KissScore.optionFor(0, "e"), null);
  assert.equal(KissScore.optionFor(10, "a"), null);
});

test("pronoun sets swap every token, contract for they, and default to them", () => {
  const stem = "You feel {him} pull back. Check {he}'s okay. {His} neck, {his} hand. {He} waits.";
  assert.equal(
    KissScore.applyPronouns(stem, KissScore.pronounSet("him")),
    "You feel him pull back. Check he's okay. His neck, his hand. He waits.",
  );
  assert.equal(
    KissScore.applyPronouns(stem, KissScore.pronounSet("her")),
    "You feel her pull back. Check she's okay. Her neck, her hand. She waits.",
  );
  assert.equal(
    KissScore.applyPronouns(stem, KissScore.pronounSet("them")),
    "You feel them pull back. Check they're okay. Their neck, their hand. They waits.",
  );
  assert.deepEqual(KissScore.pronounSet("nobody"), KissScore.pronounSet("them"));
  assert.deepEqual(KissScore.pronounSet("unknown"), KissScore.pronounSet("them"));
  assert.equal(KissScore.applyPronouns("{him} and {unknown}"), "them and {unknown}");
  const nobody = KissScore.DATA.pronoun.options.find((o) => o.id === "nobody");
  assert.equal(nobody.aspirational, true);
  assert.equal(KissScore.DATA.pronoun.options.filter((o) => o.aspirational).length, 1);
  assert.deepEqual(KissScore.DATA.questions.filter((q) => q.promptNobody).map((q) => q.id), ["q9", "q10"]);
});

test("strength and cost selection handle thin answer sets", () => {
  const worst = KissScore.score("aaaaaaaacd");
  assert.deepEqual(worst.strongest, []);
  assert.equal(worst.onlyOneStrength, true);
  assert.equal(worst.teasers.costingCount, 10);
  assert.deepEqual(worst.costliest.map((a) => a.dimension), ["R", "P", "T"]);

  const one = KissScore.score("aaaaaaacca"); // only q8c (X 2) scores 2 or more
  assert.deepEqual(one.strongest.map((a) => a.key), ["q8c"]);
  assert.equal(one.onlyOneStrength, true);

  const best = KissScore.score("cbbcbbbbac");
  assert.deepEqual(best.costliest, []);
  assert.equal(best.teasers.costingCount, 0);
  assert.deepEqual(best.strongest.map((a) => a.key), ["q6b", "q9a"]); // R outranks P on ties

  // Only R answers qualify, so the same-dimension rule yields where it must.
  const sameDimension = KissScore.score("cbbcbdbbdc");
  assert.deepEqual(sameDimension.costliest.map((a) => a.key), ["q6d", "q9d"]);
});

test("the site asset is a byte copy of the engine source", () => {
  assert.ok(readFileSync(SOURCE_PATH).equals(readFileSync(ASSET_PATH)), "run node webhook/scripts/sync-engine.mjs");
});

test("the engine contains no em dashes", () => {
  assert.equal(readFileSync(SOURCE_PATH, "utf8").includes(String.fromCharCode(0x2014)), false);
});

test("QUIZ_DATA between the markers is strict JSON and matches DATA", () => {
  const source = readFileSync(SOURCE_PATH, "utf8");
  const match = source.match(/\/\* QUIZ_DATA_START \*\/([\s\S]*?)\/\* QUIZ_DATA_END \*\//);
  assert.ok(match, "markers present");
  const data = JSON.parse(match[1]);
  assert.deepEqual(data, KissScore.DATA);
  assert.equal(data.version, KissScore.VERSION);
});

test("DATA carries the spec's tables", () => {
  const { dimensions, questions, archetypes } = KissScore.DATA;
  assert.deepEqual(dimensions.map((d) => d.key), DIMENSION_ORDER);
  assert.deepEqual(dimensions.map((d) => d.weight), [0.2, 0.15, 0.12, 0.12, 0.12, 0.1, 0.1, 0.09]);
  assert.deepEqual(dimensions.map((d) => d.max), [6, 6, 3, 3, 3, 3, 3, 6]);
  assert.ok(Math.abs(dimensions.reduce((sum, d) => sum + d.weight, 0) - 1) < 1e-9);
  assert.deepEqual(questions.map((q) => q.id), Array.from({ length: 10 }, (_, i) => `q${i + 1}`));
  assert.deepEqual(archetypes.map((a) => a.id), ARCHETYPE_ORDER);

  const options = questions.flatMap((q) => q.options);
  assert.equal(options.length, 40);
  const leans = {};
  for (const option of options) {
    leans[option.lean] = (leans[option.lean] || 0) + 1;
  }
  assert.deepEqual(leans, { natural: 10, "slow-burn": 5, sweetheart: 5, overthinker: 5, explorer: 5, statue: 5, sprinter: 5 });
  for (const question of questions) {
    assert.deepEqual(question.options.map((o) => o.id), ["a", "b", "c", "d"], question.id);
    for (const option of question.options) {
      assert.deepEqual(Object.keys(option.points), question.dimension, `${question.id}${option.id}`);
    }
  }
  const q6 = questions[5];
  assert.deepEqual(q6.dimension, ["R", "P"]);
  for (const option of q6.options) {
    assert.equal(option.points.R, option.points.P, `q6${option.id}`);
  }
  for (const key of DIMENSION_ORDER) {
    const total = questions.filter((q) => q.dimension.includes(key)).length * 3;
    assert.equal(total, dimensions.find((d) => d.key === key).max, key);
  }
});

test("verb tokens render the word for him and her and the plural form for them and nobody", () => {
  const cases = [
    ["is", "are"],
    ["was", "were"],
    ["has", "have"],
    ["does", "do"],
    ["tries", "try"],
    ["pushes", "push"],
    ["watches", "watch"],
    ["kisses", "kiss"],
    ["fixes", "fix"],
    ["goes", "go"],
    ["pulls", "pull"],
    ["chooses", "choose"],
    ["closes", "close"],
    ["feels", "feel"],
  ];
  for (const [singular, plural] of cases) {
    assert.equal(KissScore.applyPronouns(`{he} {v:${singular}}`, KissScore.pronounSet("him")), `he ${singular}`);
    assert.equal(KissScore.applyPronouns(`{he} {v:${singular}}`, KissScore.pronounSet("her")), `she ${singular}`);
    assert.equal(KissScore.applyPronouns(`{he} {v:${singular}}`, KissScore.pronounSet("them")), `they ${plural}`);
    assert.equal(KissScore.applyPronouns(`{he} {v:${singular}}`, KissScore.pronounSet("nobody")), `they ${plural}`);
  }
  assert.equal(
    KissScore.applyPronouns("{He} {v:is} not noticing; {he} never {v:has} to steer. Check {he}'s okay.", KissScore.pronounSet("them")),
    "They are not noticing; they never have to steer. Check they're okay.",
  );
  assert.equal(
    KissScore.applyPronouns("{He} {v:is} not noticing; {he} never {v:has} to steer. Check {he}'s okay.", KissScore.pronounSet("her")),
    "She is not noticing; she never has to steer. Check she's okay.",
  );
  // Verb tokens are lowercase only; anything else is left for the caller to notice.
  assert.equal(KissScore.applyPronouns("{v:Is} {v:} {v:pull back}"), "{v:Is} {v:} {v:pull back}");
});
