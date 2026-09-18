// Assembles the paid Kiss Test report from the engine's score() result and
// the per-answer copy in ./kiss-report-data. Strings only; pronoun tokens
// ({he}, {him}, {his}, {He}, {His}) are substituted by the client. This file
// never ships to the site, which is the actual paywall.
import KissScore from "./kiss-score.cjs";
import { BLURBS } from "./kiss-report-data/blurbs.js";
import { FIXES } from "./kiss-report-data/fixes.js";
import { MOVES } from "./kiss-report-data/moves.js";
import { NOTICING } from "./kiss-report-data/noticing.js";
import { scoreIntro } from "./kiss-report-data/sample.js";

// Appendix A 5.3 lists the breakdown in quiz order, not the engine's weight order.
const DISPLAY_ORDER = ["P", "T", "G", "H", "B", "R", "V", "X"];
const NUMBER_WORDS = ["none", "one", "two", "three"];

export const ONLY_ONE_STRENGTH_LINE = "Only one clear strength so far, which makes the next part unusually easy.";
export const NO_COSTS_LINE = "None of your answers are actively costing you points, which is rare and slightly annoying.";
// The engine flags onlyOneStrength for zero strengths too; the floor score has none.
export const NO_STRENGTHS_LINE = "No clear strength yet. Everything below is upside.";

function strengthItems(strongest = []) {
  return strongest.flatMap(({ key }) => {
    const blurb = BLURBS[key];
    return blurb?.strength ? [{ key, title: blurb.title, text: blurb.strength }] : [];
  });
}

function costItems(costliest = []) {
  return costliest
    .flatMap(({ key }) => {
      const blurb = BLURBS[key];
      return blurb?.cost ? [{ key, title: blurb.costTitle ?? blurb.title, text: blurb.cost }] : [];
    })
    .map((item, i) => ({ ...item, title: `${i + 1}. ${item.title}` }));
}

function fewCostsLine(n) {
  if (n === 0) return NO_COSTS_LINE;
  if (n === 1) return "Only one habit is costing you anything. Annoying, I know.";
  return `Only ${NUMBER_WORDS[n]} habits are costing you anything. Annoying, I know.`;
}

// "Reading them" carries the reader's pronoun choice ("Reading him" in 5.3).
function dimensionLabel(dimension) {
  return dimension.key === "R" ? "Reading {him}" : dimension.name;
}

export function renderReport(result) {
  const { archetype, dimensions = [] } = result;
  const strengths = strengthItems(result.strongest);
  const costs = costItems(result.costliest);
  const byKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  const breakdown = DISPLAY_ORDER.map((key) => byKey.get(key)).filter(Boolean);
  const move = MOVES[archetype.id];

  const sections = [
    {
      id: "score",
      title: "Your Kiss Score",
      headline: `${result.score}. ${result.band.label}.`,
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
      items: costs,
    },
    { id: "noticing", title: "What {he}'s actually noticing (from your answers)", paragraphs: [], items: NOTICING[archetype.id] ?? [] },
    { id: "move", title: `The one move for ${archetype.name}: ${move.title}`, paragraphs: move.paragraphs, items: [] },
    { id: "fix", title: "Your 7-day fix", paragraphs: [], items: FIXES[archetype.id] ?? [] },
  ];

  return { free: { ...result, strongestBlurbs: strengths }, paid: { sections } };
}

export function buildReport(answers) {
  return renderReport(KissScore.score(answers));
}
