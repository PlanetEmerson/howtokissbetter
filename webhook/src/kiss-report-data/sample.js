// The worked Overthinker sample from Appendix A 5.3, plus the section-1 intro
// generalised from it so any result gets the same sentence shape.
export const SAMPLE = { answers: "dcbdacbdcc", pronoun: "him" };

// Appendix A only wrote the Overthinker's shape line; the other archetypes
// get the level counts alone until the owner adds theirs here.
const SHAPE_LINES = {
  overthinker: "your mouth is doing almost everything right and your head is doing almost everything else.",
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
