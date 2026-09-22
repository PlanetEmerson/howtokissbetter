// The worked Overthinker sample from Appendix A 5.3, plus the section-1 intro
// generalised from it so any result gets the same sentence shape.
export const SAMPLE = { answers: "dcbdacbdcc", pronoun: "him" };

// One line on the typical shape of each archetype; the Overthinker line is
// Appendix A 5.3 verbatim, the rest were written to match it.
const SHAPE_LINES = {
  natural: "almost everything is working, and the one or two places it isn't are habits you've never had to think about.",
  "slow-burn": "the wait and the reading are doing the heavy lifting, and the middle of the kiss is doing the least.",
  sweetheart: "everything is safe, nothing is leaking badly, and nothing is making anyone dizzy either.",
  overthinker: "your mouth is doing almost everything right and your head is doing almost everything else.",
  explorer: "the moves are all there, and the reading that is supposed to choose between them is the dimension paying for it.",
  sprinter: "commitment is carrying you, and the moment before the kiss, the one that makes commitment land, barely exists.",
  statue: "the mouth is doing well, and everything that isn't the mouth is where the points went.",
};

const NUMBER_WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight"];

const LEVELS = [
  ["strong", "Strong"],
  ["solid", "Solid"],
  ["leaking", "Leaking"],
  ["costing", "quietly paying for all of it"],
];

function countSentence(dimensions) {
  const counts = LEVELS
    .map(([level, phrase]) => ({ phrase, n: dimensions.filter((d) => d.level === level).length }))
    .filter(({ n }) => n > 0);
  const clauses = counts.map(({ phrase, n }, i) => {
    const verb = n === 1 ? "is" : "are";
    if (i > 0) return `${NUMBER_WORDS[n]} ${verb} ${phrase}`;
    if (n === dimensions.length) return `all ${NUMBER_WORDS[n]} of your dimensions are ${phrase}`;
    return `${NUMBER_WORDS[n]} of your dimensions ${verb} ${phrase}`;
  });
  if (clauses.length <= 2) return clauses.join(" and ");
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses.at(-1)}`;
}

export function scoreIntro(result) {
  const shape = SHAPE_LINES[result.archetype?.id];
  let counts = countSentence(result.dimensions ?? []);
  if (shape) counts = counts[0].toUpperCase() + counts.slice(1);
  return `Computed from your ten answers, nothing else. Here's the honest shape of it: ${shape ? `${shape} ` : ""}${counts}.`;
}
