// Assembles the paid Kiss Test report from the engine's score() result and
// the per-answer copy in ./kiss-report-data. Strings only; pronoun and verb
// tokens ({he}, {him}, {his}, {He}, {His}, {v:word}) are substituted by the
// client. This file never ships to the site, which is the actual paywall.
import KissScore from "./kiss-score.cjs";
import { BLURBS } from "./kiss-report-data/blurbs.js";
import { FIXES, FIX_INTROS } from "./kiss-report-data/fixes.js";
import { MOVES } from "./kiss-report-data/moves.js";
import { NOTICING } from "./kiss-report-data/noticing.js";
import { scoreIntro } from "./kiss-report-data/sample.js";
import { TONIGHT } from "./kiss-report-data/tonight.js";
import { VERDICTS } from "./kiss-report-data/verdicts.js";

// Appendix A 5.3 lists the breakdown in quiz order, not the engine's weight order.
const DISPLAY_ORDER = ["P", "T", "G", "H", "B", "R", "V", "X"];

export const ONLY_ONE_STRENGTH_LINE = "Only one clear strength so far, which makes the next part unusually easy.";
// The engine flags onlyOneStrength for zero strengths too; the floor score has none.
export const NO_STRENGTHS_LINE = "No clear strength yet. Everything below is upside.";
export const NO_COSTS_LINE = "None of your answers are actively costing you points, which is rare and slightly annoying. So there's no fix here, only a warning: the habits that score full marks are the ones you stop noticing you do, and a habit nobody's watching drifts. Take the test again in a month and see whether it did.";
// The verdict names the reader's top strength and top cost; these stand in when the engine found none.
const STRENGTH_FALLBACK = "the instinct that made you take this test";
const COST_FALLBACK = "nothing I could find";

function strengthItems(strongest = []) {
  return strongest.flatMap(({ key }) => {
    const blurb = BLURBS[key];
    return blurb?.strength ? [{ key, title: blurb.title, text: blurb.strength }] : [];
  });
}

function costItems(costliest = []) {
  return costliest.flatMap(({ key }) => {
    const blurb = BLURBS[key];
    return blurb?.cost ? [{ key, title: blurb.costTitle ?? blurb.title, text: blurb.cost }] : [];
  });
}

function fewCostsLine(n) {
  if (n === 0) return NO_COSTS_LINE;
  const habits = n === 1 ? "one habit is" : "two habits are";
  const treatment = n === 1 ? "It gets" : "They get";
  return `Only ${habits} costing you anything. Annoying, I know. ${treatment} the full treatment anyway, because at your level that's the whole gap between this score and the top of the band.`;
}

// "Reading them" carries the reader's pronoun choice ("Reading him" in 5.3).
function dimensionLabel(dimension) {
  return dimension.key === "R" ? "Reading {him}" : dimension.name;
}

export function renderReport(result) {
  const { archetype, band, dimensions = [] } = result;
  const strengths = strengthItems(result.strongest);
  const costs = costItems(result.costliest);
  const byKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  const breakdown = DISPLAY_ORDER.map((key) => byKey.get(key)).filter(Boolean);
  const move = MOVES[archetype.id];
  const tonight = TONIGHT[archetype.id];
  const verdict = VERDICTS[`${archetype.id}.${band.id}`]
    .replaceAll("{strength}", strengths[0]?.title ?? STRENGTH_FALLBACK)
    .replaceAll("{cost}", costs[0]?.title ?? COST_FALLBACK);

  const sections = [
    { id: "verdict", title: "The verdict", paragraphs: [verdict], items: [] },
    {
      id: "score",
      title: "Your Kiss Score",
      headline: `${result.score}. ${band.label}.`,
      paragraphs: [scoreIntro(result)],
      items: breakdown.map((dimension) => ({ label: dimensionLabel(dimension), level: dimension.levelLabel, line: dimension.levelLine })),
    },
    {
      id: "strengths",
      title: "Your two strongest habits",
      paragraphs: strengths.length >= 2 ? [] : [strengths.length === 1 ? ONLY_ONE_STRENGTH_LINE : NO_STRENGTHS_LINE],
      items: strengths,
    },
    {
      id: "costs",
      title: "The three habits costing you the most (and the fix for each)",
      paragraphs: costs.length < 3 ? [fewCostsLine(costs.length)] : [],
      items: costs.map((item, i) => ({ ...item, title: `${i + 1}. ${item.title}` })),
    },
    { id: "noticing", title: "What {he}'s actually noticing (from your answers)", paragraphs: [], items: NOTICING[archetype.id] ?? [] },
    { id: "move", title: `The one move for ${archetype.name}: ${move.title}`, paragraphs: move.paragraphs, items: [] },
    { id: "fix", title: "Your 7-day fix", paragraphs: [FIX_INTROS[archetype.id]], items: FIXES[archetype.id] ?? [] },
    {
      id: "tonight",
      title: "Tonight, if you get the chance",
      paragraphs: [tonight.signoff],
      items: tonight.steps.map((step, i) => `${i + 1}. ${step}`),
    },
  ];

  return { free: { ...result, strongestBlurbs: strengths }, paid: { sections } };
}

export function buildReport(answers) {
  return renderReport(KissScore.score(answers));
}
