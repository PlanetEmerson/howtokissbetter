import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { BLURBS } from "../src/kiss-report-data/blurbs.js";
import { FIXES } from "../src/kiss-report-data/fixes.js";
import { MOVES } from "../src/kiss-report-data/moves.js";
import { NOTICING } from "../src/kiss-report-data/noticing.js";
import { SAMPLE, scoreIntro } from "../src/kiss-report-data/sample.js";
import { TONIGHT } from "../src/kiss-report-data/tonight.js";
import { VERDICTS } from "../src/kiss-report-data/verdicts.js";

const ARCHETYPES = ["natural", "slow-burn", "sweetheart", "overthinker", "explorer", "statue", "sprinter"];
const BANDS = ["raw", "better", "dangerous", "podium"];
const SECTION_IDS = ["verdict", "score", "strengths", "costs", "noticing", "move", "fix", "tonight"];
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const PRONOUN_TOKENS = new Set(["{he}", "{him}", "{his}", "{He}", "{His}"]);
const DIMENSION_KEYS = ["R", "P", "T", "G", "H", "B", "V", "X"];

// The engine is written in a parallel workstream. Without it the report
// module cannot load, so those cases skip and the data files are still checked.
async function optionalImport(specifier) {
  try {
    return await import(specifier);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") return null;
    throw error;
  }
}

const engine = (await optionalImport("../src/kiss-score.cjs"))?.default ?? null;
const report = engine ? await import("../src/kiss-report.js") : null;
const needsEngine = { skip: engine ? false : "kiss-score.cjs is not present" };

function* strings(value) {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const item of value) yield* strings(item);
  else if (value && typeof value === "object") for (const item of Object.values(value)) yield* strings(item);
}

// `extra` admits template tokens a data file carries before the report fills them.
function assertCleanCopy(value, label, extra = []) {
  for (const text of strings(value)) {
    assert.ok(!text.includes("\u2014"), `${label}: em dash in "${text.slice(0, 60)}"`);
    for (const token of text.match(/\{[^}]*\}/g) ?? []) {
      assert.ok(PRONOUN_TOKENS.has(token) || extra.includes(token) || /^\{v:[a-z]+\}$/.test(token), `${label}: unexpected token ${token} in "${text.slice(0, 60)}"`);
    }
  }
}

function wordCount(paragraphs) {
  return paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
}

function fakeDimensions(levels) {
  const labels = { strong: "Strong", solid: "Solid", leaking: "Leaking", costing: "Costing you" };
  return DIMENSION_KEYS.map((key, i) => ({ key, name: key, points: 0, max: 3, fraction: 0, level: levels[i], levelLabel: labels[levels[i]], levelLine: "" }));
}

function fakeResult(overrides = {}) {
  return {
    version: 1,
    answers: "aaaaaaaaaa",
    score: 20,
    band: { id: "raw", label: "Raw Material" },
    archetype: { id: "sprinter", name: "The Sprinter", tagline: "", read: "" },
    dimensions: fakeDimensions(Array(8).fill("costing")),
    leans: {},
    strongest: [],
    costliest: [],
    onlyOneStrength: false,
    teasers: { costingCount: 10, strongestDimension: { key: "R", name: "Reading them" } },
    ...overrides,
  };
}

test("all 40 blurbs exist with a title and at least one of strength or cost", () => {
  const strengthOnly = ["q1b", "q1c", "q2b", "q3b", "q3d", "q4c", "q5b", "q6b", "q7b", "q8b", "q9a", "q9b", "q10b", "q10c"];
  const both = ["q4d", "q5d", "q6d", "q7c", "q8c", "q9d"];

  assert.equal(Object.keys(BLURBS).length, 40);
  for (let q = 1; q <= 10; q++) {
    for (const o of "abcd") {
      const key = `q${q}${o}`;
      const blurb = BLURBS[key];
      assert.ok(blurb, `missing ${key}`);
      assert.ok(typeof blurb.title === "string" && blurb.title.length > 0, `${key} needs a title`);
      assert.ok(blurb.strength || blurb.cost, `${key} needs a strength or a cost`);
      const expectStrength = strengthOnly.includes(key) || both.includes(key);
      const expectCost = !strengthOnly.includes(key);
      assert.equal(Boolean(blurb.strength), expectStrength, `${key} strength presence`);
      assert.equal(Boolean(blurb.cost), expectCost, `${key} cost presence`);
      assert.equal(Boolean(blurb.costTitle), both.includes(key), `${key} costTitle presence`);
    }
  }
  assert.equal(BLURBS.q4d.title, "The Anchor");
  assert.equal(BLURBS.q4d.costTitle, "The Anchor That Never Lifts");
  assert.equal(BLURBS.q9c.title, "The Scoreboard Is Two Inches Away");
  assert.match(BLURBS.q9c.cost, /^You told me you have no idea what \{he\} \{v:does\} mid-kiss/);
  assert.match(BLURBS.q3b.strength, /^Your tongue arrives when \{his\} tongue does/);
});

test("noticing bullets: five per archetype about {he}, the Overthinker's verbatim, the rest 15 to 30 words", () => {
  assert.deepEqual(Object.keys(NOTICING).sort(), [...ARCHETYPES].sort());
  for (const id of ARCHETYPES) {
    assert.equal(NOTICING[id].length, 5, id);
    for (const bullet of NOTICING[id]) {
      assert.match(bullet, /^\{He\}('s| \{v:is\})( not)? noticing /, `${id}: ${bullet}`);
      if (id === "overthinker") continue;
      const words = wordCount([bullet]);
      assert.ok(words >= 15 && words <= 30, `${id} bullet is ${words} words: ${bullet}`);
    }
  }
});

test("verdicts: one per archetype and band, 60 to 90 words, naming the top strength and cost", () => {
  const keys = ARCHETYPES.flatMap((id) => BANDS.map((band) => `${id}.${band}`));
  assert.deepEqual(Object.keys(VERDICTS).sort(), keys.sort());
  for (const [key, verdict] of Object.entries(VERDICTS)) {
    const words = wordCount([verdict]);
    assert.ok(words >= 60 && words <= 90, `${key} verdict is ${words} words`);
    assert.ok(verdict.includes("{strength}") && verdict.includes("{cost}"), `${key} verdict names the strength and the cost`);
  }
});

test("tonight: three steps of 12 to 25 words and a sign-off per archetype", () => {
  assert.deepEqual(Object.keys(TONIGHT).sort(), [...ARCHETYPES].sort());
  for (const id of ARCHETYPES) {
    assert.equal(TONIGHT[id].steps.length, 3, id);
    for (const step of TONIGHT[id].steps) {
      const words = wordCount([step]);
      assert.ok(words >= 12 && words <= 25, `${id} step is ${words} words: ${step}`);
    }
    assert.ok(TONIGHT[id].signoff.length > 0, `${id} sign-off`);
  }
});

test("moves: the Overthinker's verbatim, the other six 80 to 120 words in the same shape", () => {
  assert.deepEqual(Object.keys(MOVES).sort(), [...ARCHETYPES].sort());
  assert.equal(MOVES.overthinker.title, "The Ten-Second Hold");
  assert.equal(MOVES.overthinker.paragraphs.length, 4);
  for (const id of ARCHETYPES) {
    assert.ok(MOVES[id].title, id);
    assert.ok(MOVES[id].paragraphs.length >= 2, id);
    if (id !== "overthinker") {
      const words = wordCount(MOVES[id].paragraphs);
      assert.ok(words >= 80 && words <= 120, `${id} move is ${words} words`);
    }
  }
  assert.doesNotMatch(MOVES.natural.paragraphs.join(" "), /acupuncture|hormone|pregnan|oxytocin/i);
});

test("fixes: seven days per archetype, numbered 1 to 7", () => {
  assert.deepEqual(Object.keys(FIXES).sort(), [...ARCHETYPES].sort());
  for (const id of ARCHETYPES) {
    assert.deepEqual(FIXES[id].map((d) => d.day), [1, 2, 3, 4, 5, 6, 7], id);
    for (const day of FIXES[id]) {
      assert.ok(day.title.endsWith("."), `${id} day ${day.day} title`);
      assert.ok(day.text.length > 0, `${id} day ${day.day} text`);
    }
  }
  assert.equal(FIXES.overthinker[0].title, "Install the breath.");
  assert.equal(FIXES.overthinker[6].title, "The Reset, once, then retake the test.");
});

test("data files carry no em dashes and only the five pronoun tokens", () => {
  assertCleanCopy(BLURBS, "blurbs");
  assertCleanCopy(NOTICING, "noticing");
  assertCleanCopy(MOVES, "moves");
  assertCleanCopy(FIXES, "fixes");
  assertCleanCopy(SAMPLE, "sample");
  assertCleanCopy(TONIGHT, "tonight");
  assertCleanCopy(VERDICTS, "verdicts", ["{strength}", "{cost}"]);
});

test("no report source file carries an em dash", () => {
  const files = [resolve(SRC, "kiss-report.js"), ...readdirSync(resolve(SRC, "kiss-report-data")).map((name) => resolve(SRC, "kiss-report-data", name))];
  assert.ok(files.length >= 8, `${files.length} files`);
  for (const file of files) assert.equal(readFileSync(file, "utf8").includes("\u2014"), false, file);
});

test("scoreIntro counts levels into the Appendix A sentence", () => {
  const overthinker = { archetype: { id: "overthinker" }, dimensions: fakeDimensions(["costing", "leaking", "leaking", "strong", "solid", "costing", "strong", "solid"]) };
  assert.equal(
    scoreIntro(overthinker),
    "Computed from your ten answers, nothing else. Here's the honest shape of it: your mouth is doing almost everything right and your head is doing almost everything else. Two of your dimensions are Strong, two are Solid, two are Leaking, and two are quietly paying for all of it.",
  );
  assert.equal(
    scoreIntro({ archetype: { id: "natural" }, dimensions: fakeDimensions(Array(8).fill("strong")) }),
    "Computed from your ten answers, nothing else. Here's the honest shape of it: almost everything is working, and the one or two places it isn't are habits you've never had to think about. All eight of your dimensions are Strong.",
  );
  assert.equal(
    scoreIntro({ archetype: { id: "statue" }, dimensions: fakeDimensions(["strong", "strong", "solid", "strong", "strong", "strong", "strong", "costing"]) }),
    "Computed from your ten answers, nothing else. Here's the honest shape of it: the mouth is doing well, and everything that isn't the mouth is where the points went. Six of your dimensions are Strong, one is Solid, and one is quietly paying for all of it.",
  );
  assert.equal(
    scoreIntro({ archetype: { id: "sprinter" }, dimensions: fakeDimensions(["solid", "solid", "solid", "solid", "leaking", "leaking", "leaking", "leaking"]) }),
    "Computed from your ten answers, nothing else. Here's the honest shape of it: commitment is carrying you, and the moment before the kiss, the one that makes commitment land, barely exists. Four of your dimensions are Solid and four are Leaking.",
  );
});

test("the Overthinker sample renders the six sections of Appendix A 5.3 between the verdict and tonight", needsEngine, () => {
  assert.deepEqual(SAMPLE, { answers: "dcbdacbdcc", pronoun: "him" });
  const { free, paid } = report.buildReport(SAMPLE.answers);
  const [verdict, score, strengths, costs, noticing, move, fix, tonight] = paid.sections;

  assert.deepEqual(paid.sections.map((s) => s.id), SECTION_IDS);
  assert.equal(verdict.title, "The verdict");
  assert.deepEqual(verdict.items, []);
  assert.deepEqual(verdict.paragraphs, [
    VERDICTS["overthinker.better"].replaceAll("{strength}", "The Guest").replaceAll("{cost}", "The Scoreboard Is Two Inches Away"),
  ]);
  assert.match(verdict.paragraphs[0], /^Better Than You Think, and you don't think so/);
  assert.equal(score.title, "Your Kiss Score");
  assert.equal(score.headline, "59. Better Than You Think.");
  assert.match(score.paragraphs[0], /^Computed from your ten answers, nothing else\. Here's the honest shape of it: your mouth/);
  assert.deepEqual(
    score.items.map((item) => item.label),
    ["Pace", "Pressure", "Tongue", "Hands", "Breath and prep", "Reading {him}", "Variety", "Beyond the lips"],
  );
  assert.deepEqual(score.items[0], { label: "Pace", level: "Leaking", line: "Costing you a little every time." });
  assert.deepEqual(score.items[5], { label: "Reading {him}", level: "Costing you", line: "This is where the points went." });

  assert.equal(strengths.title, "Your two strongest habits");
  assert.deepEqual(strengths.items.map((item) => [item.key, item.title]), [["q3b", "The Guest"], ["q7b", "The Journey"]]);
  assert.deepEqual(strengths.paragraphs, []);
  assert.deepEqual(free.strongestBlurbs, strengths.items);

  assert.equal(costs.title, "The three habits costing you the most (and the fix for each)");
  assert.deepEqual(costs.items.map((item) => item.key), ["q9c", "q5a", "q1d"]);
  assert.deepEqual(costs.items.map((item) => item.title), ["1. The Scoreboard Is Two Inches Away", "2. The Diver", "3. The Committee Meeting"]);
  assert.match(costs.items[1].text, /The fix: the Snorkel, from Chapter 9\./);
  assert.deepEqual(costs.paragraphs, []);

  assert.equal(noticing.title, "What {he}'s actually noticing (from your answers)");
  assert.equal(noticing.items.length, 5);
  assert.equal(move.title, "The one move for The Overthinker: The Ten-Second Hold");
  assert.equal(move.paragraphs.length, 4);
  assert.equal(fix.title, "Your 7-day fix");
  assert.deepEqual(fix.items.map((day) => day.day), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(tonight.title, "Tonight, if you get the chance");
  assert.deepEqual(tonight.items, TONIGHT.overthinker.steps.map((step, i) => `${i + 1}. ${step}`));
  assert.match(tonight.items[0], /^1\. One hospital breath before you go in/);
  assert.deepEqual(tonight.paragraphs, [TONIGHT.overthinker.signoff]);

  assert.equal(free.score, 59);
  assert.equal(free.archetype.id, "overthinker");
  assert.equal(free.answers, SAMPLE.answers);
  assert.equal(free.teasers.costingCount, 6);
});

// Appendix A 3.3 worked checks, one per archetype, plus the two extremes.
const WORKED = {
  natural: "cbbcbbadca",
  sprinter: "aaabcaccaa",
  overthinker: "dcbdacbdcc",
  statue: "cdbabbaadd",
  sweetheart: "bbdddddddb",
  explorer: "bbcbbaccac",
  "slow-burn": "bbdcbbdbbb",
};

test("every archetype gets eight non-empty sections, at least 850 words, with clean copy", needsEngine, () => {
  for (const [id, answers] of Object.entries(WORKED)) {
    const { free, paid } = report.buildReport(answers);
    assert.equal(free.archetype.id, id, answers);
    assert.deepEqual(paid.sections.map((s) => s.id), SECTION_IDS, id);
    for (const section of paid.sections) {
      assert.ok(section.title.length > 0, `${id}/${section.id} title`);
      assert.ok(section.paragraphs.length + section.items.length > 0, `${id}/${section.id} is empty`);
    }
    const [verdict, , strengths, costs, noticing, move, fix, tonight] = paid.sections;
    assert.deepEqual(verdict.paragraphs, [
      VERDICTS[`${id}.${free.band.id}`].replaceAll("{strength}", strengths.items[0].title).replaceAll("{cost}", costs.items[0].title.replace(/^1\. /, "")),
    ]);
    assert.doesNotMatch(verdict.paragraphs[0], /\{strength\}|\{cost\}/, `${id} verdict`);
    assert.deepEqual(noticing.items, NOTICING[id]);
    assert.equal(move.title, `The one move for ${free.archetype.name}: ${MOVES[id].title}`);
    assert.deepEqual(fix.items, FIXES[id]);
    assert.deepEqual(tonight.items, TONIGHT[id].steps.map((step, i) => `${i + 1}. ${step}`));
    assert.deepEqual(tonight.paragraphs, [TONIGHT[id].signoff]);
    const words = wordCount([...strings(paid)]);
    assert.ok(words >= 850, `${id} paid report is ${words} words`);
    assertCleanCopy(paid, id);
    assertCleanCopy(free.strongestBlurbs, id);
  }
});

test("a perfect score has no costs and says so; the floor still gets a full report", needsEngine, () => {
  const perfect = report.buildReport("cbbcbbbbac");
  assert.equal(perfect.free.score, 100);
  assert.deepEqual(perfect.paid.sections[3].items, []);
  assert.deepEqual(perfect.paid.sections[3].paragraphs, [report.NO_COSTS_LINE]);
  // No cost to name, so the verdict falls back instead of leaking its token.
  assert.match(perfect.paid.sections[0].paragraphs[0], /^Podium\. I'd be suspicious/);
  assert.match(perfect.paid.sections[0].paragraphs[0], /The closest thing you have to a weak spot is nothing I could find,/);
  assert.ok(wordCount([...strings(perfect.paid)]) >= 850, "perfect paid words");
  assertCleanCopy(perfect.paid, "perfect");

  const floor = report.buildReport("aaaaaaaacd");
  assert.equal(floor.free.score, 20);
  assert.equal(floor.paid.sections[3].items.length, 3);
  for (const section of floor.paid.sections) assert.ok(section.paragraphs.length + section.items.length > 0, section.id);
  assert.match(floor.paid.sections[0].paragraphs[0], /^A Statue at Raw Material/);
  assert.match(floor.paid.sections[0].paragraphs[0], /the instinct that made you take this test is the one part of you/);
  assertCleanCopy(floor.paid, "floor");
});

test("flipping any single answer changes the report wherever the engine result changes", needsEngine, () => {
  const visible = ({ paid, free }) => JSON.stringify([paid, free.strongestBlurbs]);
  const engineView = ({ answers, leans, strongestBlurbs, ...rest }) => JSON.stringify(rest);
  const base = report.buildReport(SAMPLE.answers);
  let changed = 0;

  for (let i = 0; i < SAMPLE.answers.length; i++) {
    for (const option of "abcd") {
      if (option === SAMPLE.answers[i]) continue;
      const flipped = `${SAMPLE.answers.slice(0, i)}${option}${SAMPLE.answers.slice(i + 1)}`;
      const next = report.buildReport(flipped);
      if (engineView(next.free) === engineView(base.free)) {
        // Same points, levels, archetype and picks (only q10 c to b does this): the report must be identical too.
        assert.equal(visible(next), visible(base), flipped);
        continue;
      }
      assert.notEqual(visible(next), visible(base), flipped);
      changed++;
    }
  }
  assert.ok(changed >= 29, `${changed} of 30 flips changed the report`);
});

test("short strongest and costliest lists render without crashing", needsEngine, () => {
  const anchor = { q: "q4", o: "d", key: "q4d", points: 2, max: 3, dimension: "H" };

  const one = report.renderReport(fakeResult({ strongest: [anchor], onlyOneStrength: true, costliest: [anchor] }));
  const [, , strengths, costs] = one.paid.sections;
  assert.deepEqual(strengths.paragraphs, [report.ONLY_ONE_STRENGTH_LINE]);
  assert.equal(report.ONLY_ONE_STRENGTH_LINE, "Only one clear strength so far, which makes the next part unusually easy.");
  assert.deepEqual(strengths.items.map((item) => item.title), ["The Anchor"]);
  assert.deepEqual(costs.items.map((item) => item.title), ["1. The Anchor That Never Lifts"]);
  assert.deepEqual(costs.paragraphs, ["Only one habit is costing you anything. Annoying, I know. It gets the full treatment anyway, because at your level that's the whole gap between this score and the top of the band."]);
  assert.deepEqual(one.free.strongestBlurbs, strengths.items);

  const none = report.renderReport(fakeResult());
  assert.deepEqual(none.paid.sections[2].items, []);
  assert.deepEqual(none.paid.sections[2].paragraphs, [report.NO_STRENGTHS_LINE]);
  assert.deepEqual(none.paid.sections[3].items, []);
  assert.deepEqual(none.paid.sections[3].paragraphs, [report.NO_COSTS_LINE]);
  assert.equal(none.paid.sections[1].headline, "20. Raw Material.");
  assert.deepEqual(none.paid.sections[0].paragraphs, [
    VERDICTS["sprinter.raw"].replaceAll("{strength}", "the instinct that made you take this test").replaceAll("{cost}", "nothing I could find"),
  ]);

  const two = report.renderReport(fakeResult({ costliest: [{ key: "q1a" }, { key: "q2a" }] }));
  assert.deepEqual(two.paid.sections[3].items.map((item) => item.title), ["1. The Lunge", "2. The Press"]);
  assert.deepEqual(two.paid.sections[3].paragraphs, ["Only two habits are costing you anything. Annoying, I know. They get the full treatment anyway, because at your level that's the whole gap between this score and the top of the band."]);

  // A key without the matching blurb kind is skipped, never thrown.
  const odd = report.renderReport(fakeResult({ strongest: [{ key: "q1a" }, { key: "q99z" }], costliest: [{ key: "q1b" }] }));
  assert.deepEqual(odd.paid.sections[2].items, []);
  assert.deepEqual(odd.paid.sections[3].items, []);
});

// Every verb whose subject is {he} is written {v:word} (the list is exactly the
// verbs the copy uses), so the they set must never read "they pulls".
const HE_VERBS = ["is", "was", "has", "does", "pulls", "starts", "feels", "wants", "escalates", "comes", "closes", "chooses", "stops"];

test("the they set renders every report without singular verbs or leftover tokens", needsEngine, () => {
  const they = engine.pronounSet("them");
  const him = engine.pronounSet("him");
  const singularAfterThey = new RegExp(`\\bthey (${HE_VERBS.join("|")})\\b`, "i");
  const pluralAfterHe = new RegExp(`\\bhe (${HE_VERBS.map((verb) => engine.applyPronouns(`{v:${verb}}`, they)).join("|")})\\b`, "i");
  let checked = 0;

  for (const answers of [...Object.values(WORKED), "cbbcbbbbac", "aaaaaaaacd"]) {
    const { free, paid } = report.buildReport(answers);
    for (const text of strings([paid, free.strongestBlurbs])) {
      const theirs = engine.applyPronouns(text, they);
      const his = engine.applyPronouns(text, him);
      assert.doesNotMatch(theirs, singularAfterThey, `${answers}: ${theirs.slice(0, 90)}`);
      assert.doesNotMatch(his, pluralAfterHe, `${answers}: ${his.slice(0, 90)}`);
      assert.ok(!theirs.includes("{") && !his.includes("{"), `${answers}: unsubstituted token in "${text.slice(0, 90)}"`);
      checked++;
    }
  }
  assert.ok(checked > 100, `${checked} strings checked`);
  assert.deepEqual(new Set(HE_VERBS), new Set([...strings([BLURBS, NOTICING, MOVES, FIXES, VERDICTS, TONIGHT])].flatMap((text) => (text.match(/\{v:([a-z]+)\}/g) ?? []).map((token) => token.slice(3, -1)))));
});
