/*
 * Kiss Test scoring engine. Source of truth lives at webhook/src/kiss-score.cjs;
 * assets/kiss-score.js is a byte copy (node webhook/scripts/sync-engine.mjs).
 *
 * ES5 on purpose: the same bytes run as a classic <script defer> in the browser
 * (window.KissScore) and as a CommonJS module in the functions. Pure: no Date,
 * no randomness, so the browser and the server always agree on a score.
 *
 * DATA between the QUIZ_DATA markers is strict JSON so build tooling can lift
 * it with a regex and json.loads without executing JavaScript.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.KissScore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DATA = /* QUIZ_DATA_START */ {
    "version": 1,
    "dimensions": [
      { "key": "R", "name": "Reading them", "weight": 0.2, "max": 6 },
      { "key": "P", "name": "Pace", "weight": 0.15, "max": 6 },
      { "key": "T", "name": "Pressure", "weight": 0.12, "max": 3 },
      { "key": "G", "name": "Tongue", "weight": 0.12, "max": 3 },
      { "key": "H", "name": "Hands", "weight": 0.12, "max": 3 },
      { "key": "B", "name": "Breath and prep", "weight": 0.1, "max": 3 },
      { "key": "V", "name": "Variety", "weight": 0.1, "max": 3 },
      { "key": "X", "name": "Beyond the lips", "weight": 0.09, "max": 6 }
    ],
    "pronoun": {
      "prompt": "Quick one, so I write this properly. Who's on the other end of these kisses?",
      "note": "Never kissed anyone? Answer on instinct. The test grades habits, not experience.",
      "options": [
        { "id": "him", "label": "Him", "set": { "he": "he", "him": "him", "his": "his", "He": "He", "His": "His" } },
        { "id": "her", "label": "Her", "set": { "he": "she", "him": "her", "his": "her", "He": "She", "His": "Her" } },
        { "id": "them", "label": "Them", "set": { "he": "they", "him": "them", "his": "their", "He": "They", "His": "Their" } },
        { "id": "nobody", "label": "Nobody yet. I'm preparing.", "aspirational": true, "set": { "he": "they", "him": "them", "his": "their", "He": "They", "His": "Their" } }
      ]
    },
    "questions": [
      {
        "id": "q1",
        "dimension": ["P"],
        "prompt": "Right before a kiss. What do you do with that moment?",
        "options": [
          { "id": "a", "text": "Close the gap fast, before I lose my nerve.", "points": { "P": 0 }, "lean": "sprinter" },
          { "id": "b", "text": "Let it stretch until it's almost unbearable.", "points": { "P": 3 }, "lean": "slow-burn" },
          { "id": "c", "text": "Read their face, go when it says go.", "points": { "P": 3 }, "lean": "natural" },
          { "id": "d", "text": "Run every outcome in my head, then go.", "points": { "P": 1 }, "lean": "overthinker" }
        ]
      },
      {
        "id": "q2",
        "dimension": ["T"],
        "prompt": "Your lips, mid-kiss. Be honest.",
        "options": [
          { "id": "a", "text": "Pressed in hard. Commitment.", "points": { "T": 0 }, "lean": "sprinter" },
          { "id": "b", "text": "Soft, jaw loose, a little bit lazy.", "points": { "T": 3 }, "lean": "natural" },
          { "id": "c", "text": "Barely there. I don't want to overdo it.", "points": { "T": 1 }, "lean": "overthinker" },
          { "id": "d", "text": "Tight. I'm concentrating.", "points": { "T": 0 }, "lean": "statue" }
        ]
      },
      {
        "id": "q3",
        "dimension": ["G"],
        "prompt": "Tongue. What's your policy?",
        "options": [
          { "id": "a", "text": "Straight in. It's a French kiss, not a handshake.", "points": { "G": 0 }, "lean": "sprinter" },
          { "id": "b", "text": "It shows up when theirs does, then it plays.", "points": { "G": 3 }, "lean": "natural" },
          { "id": "c", "text": "Keep it moving. Circles, mostly. Never boring.", "points": { "G": 0 }, "lean": "explorer" },
          { "id": "d", "text": "Late, light, and only once they've asked.", "points": { "G": 3 }, "lean": "slow-burn" }
        ]
      },
      {
        "id": "q4",
        "dimension": ["H"],
        "prompt": "Where are your hands, honestly?",
        "options": [
          { "id": "a", "text": "On their shoulders. Where I put them. Still there.", "points": { "H": 0 }, "lean": "statue" },
          { "id": "b", "text": "Everywhere. Hair, waist, back, hair again.", "points": { "H": 1 }, "lean": "explorer" },
          { "id": "c", "text": "Face, jaw, that spot behind the ear. Then they stay.", "points": { "H": 3 }, "lean": "natural" },
          { "id": "d", "text": "Their waist, gently, the whole time.", "points": { "H": 2 }, "lean": "sweetheart" }
        ]
      },
      {
        "id": "q5",
        "dimension": ["B"],
        "prompt": "Housekeeping round: breathing, breath, moisture. Which is truest?",
        "options": [
          { "id": "a", "text": "I hold my breath, then surface like a diver.", "points": { "B": 0 }, "lean": "overthinker" },
          { "id": "b", "text": "Nose, slow, and somewhere in there we're breathing together.", "points": { "B": 3 }, "lean": "natural" },
          { "id": "c", "text": "Things get wet. I've seen a chin get wiped.", "points": { "B": 0 }, "lean": "sprinter" },
          { "id": "d", "text": "Mint in pocket, checked twice. I'm fine, right?", "points": { "B": 2 }, "lean": "sweetheart" }
        ]
      },
      {
        "id": "q6",
        "dimension": ["R", "P"],
        "prompt": "You feel {him} pull back an inch. What do you do?",
        "options": [
          { "id": "a", "text": "Follow. Close it again, and add something.", "points": { "R": 0, "P": 0 }, "lean": "explorer" },
          { "id": "b", "text": "Stay exactly where I am. Let {him} come back.", "points": { "R": 3, "P": 3 }, "lean": "natural" },
          { "id": "c", "text": "Assume I did something wrong. Apologize.", "points": { "R": 1, "P": 1 }, "lean": "overthinker" },
          { "id": "d", "text": "Check {he}'s okay. Softly.", "points": { "R": 2, "P": 2 }, "lean": "sweetheart" }
        ]
      },
      {
        "id": "q7",
        "dimension": ["V"],
        "prompt": "Two minutes in. What's changed?",
        "options": [
          { "id": "a", "text": "Nothing. Found what works, stayed there.", "points": { "V": 0 }, "lean": "statue" },
          { "id": "b", "text": "Angle, speed, a detour to the jaw, and back.", "points": { "V": 3 }, "lean": "natural" },
          { "id": "c", "text": "Everything, constantly. Neck, ear, hair, wall.", "points": { "V": 2 }, "lean": "explorer" },
          { "id": "d", "text": "It got slower. That's the whole plan.", "points": { "V": 1 }, "lean": "slow-burn" }
        ]
      },
      {
        "id": "q8",
        "dimension": ["X"],
        "prompt": "From the neck down, what's your body doing?",
        "options": [
          { "id": "a", "text": "Nothing. It's a kiss. The lips are busy.", "points": { "X": 0 }, "lean": "statue" },
          { "id": "b", "text": "Leaning in, hips close, moving with {him}.", "points": { "X": 3 }, "lean": "natural" },
          { "id": "c", "text": "Wall, dip, counter, whatever's available.", "points": { "X": 2 }, "lean": "explorer" },
          { "id": "d", "text": "Holding on. Gently. Not going anywhere.", "points": { "X": 1 }, "lean": "sweetheart" }
        ]
      },
      {
        "id": "q9",
        "dimension": ["R"],
        "prompt": "Mid-kiss, which of these have you actually caught {him} doing?",
        "promptNobody": "Mid-kiss, which of these would you most want to catch them doing?",
        "options": [
          { "id": "a", "text": "{His} hand tightens on me, or I feel {him} go still when I slow down.", "points": { "R": 3 }, "lean": "natural" },
          { "id": "b", "text": "I feel {him} come back for the second kiss before I do.", "points": { "R": 3 }, "lean": "slow-burn" },
          { "id": "c", "text": "No idea. I'm busy.", "points": { "R": 0 }, "lean": "overthinker" },
          { "id": "d", "text": "I feel {his} shoulders drop.", "points": { "R": 2 }, "lean": "sweetheart" }
        ]
      },
      {
        "id": "q10",
        "dimension": ["X"],
        "prompt": "{His} neck. What's your move?",
        "promptNobody": "Their neck. What would your move be?",
        "options": [
          { "id": "a", "text": "Straight for it. Vampire energy.", "points": { "X": 1 }, "lean": "sprinter" },
          { "id": "b", "text": "Slow, just under the ear, and I make {him} wait for it.", "points": { "X": 3 }, "lean": "slow-burn" },
          { "id": "c", "text": "Soft first, then I watch what it does to {him}.", "points": { "X": 3 }, "lean": "natural" },
          { "id": "d", "text": "I don't, really. Never thought to.", "points": { "X": 0 }, "lean": "statue" }
        ]
      }
    ],
    "archetypes": [
      {
        "id": "natural",
        "name": "The Natural",
        "tagline": "You don't think about it. That's the whole trick.",
        "read": "You don't run a checklist. You run on the other person. Your answers say you read, wait, soften, and move, which is the whole book in four verbs. The report is about the two places even naturals get lazy, and one move you almost certainly haven't found."
      },
      {
        "id": "slow-burn",
        "name": "The Slow Burn",
        "tagline": "You make them wait. They keep coming back.",
        "read": "You understand the thing almost nobody does: the space before the kiss is part of the kiss. You make the wait feel like a decision. Your risk is staying in one gear so long it stops being a choice and starts being a habit. The report is about contrast."
      },
      {
        "id": "sweetheart",
        "name": "The Sweetheart",
        "tagline": "Everyone feels safe kissing you. Now go make somebody dizzy.",
        "read": "People relax when they kiss you. Shoulders drop. That is rarer than you think and you should not let anyone talk you out of it. It is also the reason nobody's dizzy afterward. The report is about leading, once in a while, on purpose."
      },
      {
        "id": "overthinker",
        "name": "The Overthinker",
        "tagline": "Your instincts are fine. Your narrator won't shut up.",
        "read": "You are not a bad kisser. You are a kisser who is also live-commentating the kiss, grading it, and apologizing for it. Three jobs. The other person only asked for one. The report is about firing the narrator."
      },
      {
        "id": "explorer",
        "name": "The Explorer",
        "tagline": "You have every move. Now find out which one they wanted.",
        "read": "Neck, ear, hair, wall, dip. You know the map. What your answers don't show is you checking whether they wanted the tour. The report is about doing a third as much and reading three times as closely."
      },
      {
        "id": "statue",
        "name": "The Statue",
        "tagline": "Gorgeous from the neck up. The rest of you is waiting for a cue.",
        "read": "From the lips out, you're doing fine. Below that, nothing is happening, and you know it, because you told me. Hands parked, body still, same move for two minutes. The report gives the rest of you a job."
      },
      {
        "id": "sprinter",
        "name": "The Sprinter",
        "tagline": "You arrive at full speed. It wasn't a race.",
        "read": "You arrive with everything: speed, pressure, tongue, commitment. Nobody doubts you want it. But intensity that starts at ten has nowhere to go, and your answers say you start at ten. The report is about brakes, which is where the actual power lives."
      }
    ],
    "bands": [
      { "id": "raw", "min": 20, "max": 44, "label": "Raw Material" },
      { "id": "better", "min": 45, "max": 64, "label": "Better Than You Think" },
      { "id": "dangerous", "min": 65, "max": 84, "label": "Dangerous, in a Good Way" },
      { "id": "podium", "min": 85, "max": 100, "label": "Podium" }
    ],
    "levels": [
      { "id": "strong", "min": 0.83, "label": "Strong", "line": "Keep doing exactly this." },
      { "id": "solid", "min": 0.5, "label": "Solid", "line": "Works. Could sing." },
      { "id": "leaking", "min": 0.33, "label": "Leaking", "line": "Costing you a little every time." },
      { "id": "costing", "min": 0, "label": "Costing you", "line": "This is where the points went." }
    ]
  } /* QUIZ_DATA_END */;

  var QUESTIONS = DATA.questions;
  var DIMENSIONS = DATA.dimensions;
  // Every option carries at most 3 points on its (first) dimension, so an
  // answer's fraction is points/3 whether its dimension has one question or two.
  var OPTION_MAX = 3;

  function canonical(str) {
    return String(str).trim().toLowerCase();
  }

  function optionFor(qIndex, letter) {
    var question = QUESTIONS[qIndex];
    if (!question) {
      return null;
    }
    for (var i = 0; i < question.options.length; i++) {
      if (question.options[i].id === letter) {
        return question.options[i];
      }
    }
    return null;
  }

  function isValidAnswers(str) {
    if (typeof str !== "string" || str.length !== QUESTIONS.length) {
      return false;
    }
    for (var i = 0; i < str.length; i++) {
      if (!optionFor(i, str.charAt(i))) {
        return false;
      }
    }
    return true;
  }

  function encode(letters) {
    return letters.join("");
  }

  function decode(str) {
    return str.split("");
  }

  function pronounSet(choiceId) {
    var options = DATA.pronoun.options;
    var fallback = null;
    for (var i = 0; i < options.length; i++) {
      if (options[i].id === choiceId) {
        return options[i].set;
      }
      if (options[i].id === "them") {
        fallback = options[i].set;
      }
    }
    return fallback;
  }

  // "{he}'s" needs "they're" for the plural set (Q6d), and a verb whose subject
  // is {he} is written "{v:pulls}" so that set reads "they pull", not
  // "they pulls". Every other token is a plain swap.
  var PLURAL_VERBS = { is: "are", was: "were", has: "have", does: "do" };

  function pluralVerb(word) {
    if (Object.prototype.hasOwnProperty.call(PLURAL_VERBS, word)) {
      return PLURAL_VERBS[word];
    }
    if (/ies$/.test(word)) {
      return word.slice(0, -3) + "y";
    }
    if (/(sh|ch|ss|x|z|o)es$/.test(word)) {
      return word.slice(0, -2);
    }
    return word.replace(/s$/, "");
  }

  function applyPronouns(text, set) {
    set = set || pronounSet("them");
    var plural = set.he === "they";
    return String(text).replace(/\{(he|him|his|He|His)\}('s)?|\{v:([a-z]+)\}/g, function (match, token, contraction, verb) {
      if (verb) {
        return plural ? pluralVerb(verb) : verb;
      }
      var word = set[token];
      if (typeof word !== "string") {
        return match;
      }
      if (!contraction) {
        return word;
      }
      return word + (plural ? "'re" : "'s");
    });
  }

  function dimensionIndex(key) {
    for (var i = 0; i < DIMENSIONS.length; i++) {
      if (DIMENSIONS[i].key === key) {
        return i;
      }
    }
    return DIMENSIONS.length;
  }

  function levelFor(fraction) {
    var levels = DATA.levels;
    for (var i = 0; i < levels.length; i++) {
      if (fraction >= levels[i].min) {
        return levels[i];
      }
    }
    return levels[levels.length - 1];
  }

  function bandFor(score) {
    var bands = DATA.bands;
    for (var i = 0; i < bands.length; i++) {
      if (score >= bands[i].min && score <= bands[i].max) {
        return { id: bands[i].id, label: bands[i].label };
      }
    }
    return { id: bands[0].id, label: bands[0].label };
  }

  // The Natural guard: the label is only earned with a clear majority of
  // natural taps and a score that backs it up; otherwise the runner-up wins.
  var NATURAL_MIN_LEANS = 6;
  var NATURAL_MIN_SCORE = 75;

  function pickArchetype(leans, total) {
    var list = DATA.archetypes;
    var best = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === "natural") {
        if (leans.natural >= NATURAL_MIN_LEANS && total >= NATURAL_MIN_SCORE) {
          return list[i];
        }
        continue;
      }
      if (!best || leans[list[i].id] > leans[best.id]) {
        best = list[i];
      }
    }
    return best;
  }

  function byFractionDesc(a, b) {
    return (b.fraction - a.fraction) || (a.dimIndex - b.dimIndex) || (a.qIndex - b.qIndex);
  }

  function byFractionAsc(a, b) {
    return (a.fraction - b.fraction) || (a.dimIndex - b.dimIndex) || (a.qIndex - b.qIndex);
  }

  function publicAnswer(a) {
    return { q: a.q, o: a.o, key: a.key, points: a.points, max: a.max, dimension: a.dimension };
  }

  function pickStrongest(answers) {
    var picked = [];
    for (var i = 0; i < answers.length; i++) {
      if (answers[i].points >= 2) {
        picked.push(answers[i]);
      }
    }
    picked.sort(byFractionDesc);
    return picked.slice(0, 2).map(publicAnswer);
  }

  // Lowest fraction first; a dimension repeats only when fewer than three
  // distinct dimensions qualify.
  function pickCostliest(answers) {
    var candidates = [];
    var i;
    for (i = 0; i < answers.length; i++) {
      if (answers[i].points <= 2) {
        candidates.push(answers[i]);
      }
    }
    candidates.sort(byFractionAsc);
    var chosen = [];
    var usedDimensions = {};
    for (i = 0; i < candidates.length && chosen.length < 3; i++) {
      if (!usedDimensions[candidates[i].dimension]) {
        usedDimensions[candidates[i].dimension] = true;
        chosen.push(candidates[i]);
      }
    }
    for (i = 0; i < candidates.length && chosen.length < 3; i++) {
      if (chosen.indexOf(candidates[i]) === -1) {
        chosen.push(candidates[i]);
      }
    }
    chosen.sort(byFractionAsc);
    return chosen.map(publicAnswer);
  }

  function score(str) {
    var answers = canonical(str);
    if (!isValidAnswers(answers)) {
      throw new TypeError("KissScore.score: expected " + QUESTIONS.length + " answers a-d, got " + JSON.stringify(str));
    }
    var i, j;
    var totals = {};
    var leans = {};
    for (i = 0; i < DATA.archetypes.length; i++) {
      leans[DATA.archetypes[i].id] = 0;
    }
    var perAnswer = [];
    for (i = 0; i < QUESTIONS.length; i++) {
      var question = QUESTIONS[i];
      var option = optionFor(i, answers.charAt(i));
      for (j = 0; j < question.dimension.length; j++) {
        var key = question.dimension[j];
        totals[key] = (totals[key] || 0) + option.points[key];
      }
      leans[option.lean] += 1;
      var primary = question.dimension[0];
      var points = option.points[primary];
      perAnswer.push({
        q: question.id,
        o: option.id,
        key: question.id + option.id,
        points: points,
        max: OPTION_MAX,
        dimension: primary,
        fraction: points / OPTION_MAX,
        qIndex: i,
        dimIndex: dimensionIndex(primary)
      });
    }

    var raw = 0;
    var dimensions = [];
    var strongestDimension = null;
    for (i = 0; i < DIMENSIONS.length; i++) {
      var dim = DIMENSIONS[i];
      var dimPoints = totals[dim.key] || 0;
      var fraction = dimPoints / dim.max;
      var level = levelFor(fraction);
      raw += dim.weight * fraction;
      dimensions.push({
        key: dim.key,
        name: dim.name,
        points: dimPoints,
        max: dim.max,
        fraction: fraction,
        level: level.id,
        levelLabel: level.label,
        levelLine: level.line
      });
      if (!strongestDimension || fraction > strongestDimension.fraction) {
        strongestDimension = { key: dim.key, name: dim.name, fraction: fraction };
      }
    }
    var total = Math.round(20 + 80 * raw);
    var archetype = pickArchetype(leans, total);
    var strongest = pickStrongest(perAnswer);
    var costingCount = 0;
    for (i = 0; i < perAnswer.length; i++) {
      if (perAnswer[i].points <= 1) {
        costingCount += 1;
      }
    }

    return {
      version: DATA.version,
      answers: answers,
      score: total,
      band: bandFor(total),
      archetype: { id: archetype.id, name: archetype.name, tagline: archetype.tagline, read: archetype.read },
      dimensions: dimensions,
      leans: leans,
      strongest: strongest,
      costliest: pickCostliest(perAnswer),
      onlyOneStrength: strongest.length < 2,
      teasers: {
        costingCount: costingCount,
        strongestDimension: { key: strongestDimension.key, name: strongestDimension.name }
      }
    };
  }

  return {
    VERSION: DATA.version,
    DATA: DATA,
    isValidAnswers: isValidAnswers,
    canonical: canonical,
    encode: encode,
    decode: decode,
    optionFor: optionFor,
    pronounSet: pronounSet,
    applyPronouns: applyPronouns,
    score: score
  };
});
