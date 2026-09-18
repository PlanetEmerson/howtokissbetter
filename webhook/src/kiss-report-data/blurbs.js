// Strength and cost blurbs for every quiz option (Appendix A, section 5.4).
// Pronoun tokens ({he}, {him}, {his}, {He}, {His}) are substituted by the
// client, never here. Options scoring 2 carry both a strength and a cost;
// their cost uses `costTitle` as the bold name.
export const BLURBS = {
  q1a: {
    title: "The Lunge",
    cost: "You close the gap before your nerves can vote. I did exactly this at fifteen and she felt every bit of it. The fix is the Pause from Chapter 3: reach for {him}, pull {him} close, and stop for two full seconds before your lips land. It will feel like an hour. That hour is where the tension lives.",
  },
  q1b: {
    title: "The Pause",
    strength: "You let the moment before the kiss get almost unbearable. That's the Bond move, and almost nobody has the nerve for it. Keep it. The wait is doing more work than anything your mouth does later.",
  },
  q1c: {
    title: "The Read",
    strength: "You go when {his} face says go. That's the Mirror Technique starting before the kiss does. You're reading, not guessing, which is why your kisses land as mutual instead of delivered.",
  },
  q1d: {
    title: "The Committee Meeting",
    cost: "You pause before you go in, which is a genuinely good instinct. Then you spend the pause running every possible outcome. {He} can feel the difference between being waited for and being deliberated about. One is tension. The other is a meeting.\n\nThe fix: give the pause a single job. Hold {his} eyes a beat longer than is comfortable, take one slow breath through your nose, and go. The breath replaces the meeting. Two seconds, no agenda.",
  },
  q2a: {
    title: "The Press",
    cost: "Hard pressure reads as urgency at best and \"I'm not sure you're here\" at worst. The fix is the 30% rule from the slow-kiss guide: use about a third of the pressure you'd normally use and let {him} lean in for the rest. The leaning in is the point.",
  },
  q2b: {
    title: "Loose Jaw",
    strength: "Soft lips, loose jaw, nothing fighting the kiss. Commandment IV in one answer. Soft tissue meeting soft tissue is what a kiss is supposed to feel like, and you do it by default.",
  },
  q2c: {
    title: "The Ghost",
    cost: "Barely-there pressure feels tentative, and tentative reads as \"not sure I want this.\" The fix: firm enough to be undeniably present, gentle enough to invite more. Picture pressing a thumb into bread dough. Add about a fifth more than feels polite.",
  },
  q2d: {
    title: "Stone Face",
    cost: "Tight lips and a clenched jaw feel, from the other side, like kissing a mannequin (Commandment IV). Before the kiss, drop your jaw slightly, shake your head loose, let your mouth hang a fraction open. Concentration lives in your attention, not your face.",
  },
  q3a: {
    title: "The Host",
    cost: "Tongue first turns a kiss into an inspection. Your tongue is a guest, not the host. Start with none. When {his} tongue shows up, meet it with the tip, briefly, then retreat. A hint creates anticipation. A wall creates regret.",
  },
  q3b: {
    title: "The Guest",
    strength: "Your tongue arrives when {his} tongue does and then it plays. That is Step Four of the Mirror Technique done perfectly: a conversation, not a performance. Most people either lead with it or panic and hide it. You wait for the invitation and then you're good company.",
  },
  q3c: {
    title: "The Propeller",
    cost: "Circles, mostly, never boring. I've coached people out of this and none of them knew they were doing it. From the other side it's being stirred, not kissed (Commandment I). The fix is rhythm, not repetition: advance, retreat, pause. If your tongue has done the same thing for three seconds, do something else or do nothing.",
  },
  q3d: {
    title: "The Late Arrival",
    strength: "Late, light, and only when invited. That's restraint most people never learn. A hint of tongue after {he}'s asked for it lands ten times harder than a full one at the start.",
  },
  q4a: {
    title: "Parked",
    cost: "Hands on shoulders, still there two minutes later, tells {him} \"I'm nervous or not fully here\" (Chapter 6's translation guide). The fix is the Face Cradle: index fingers along the jawline, thumbs on the cheekbones, remaining fingers behind the ears. Move there with purpose, then stay.",
  },
  q4b: {
    title: "The Tour",
    cost: "Hair, waist, back, hair again. Constant movement reads as restless, like you're searching for something you haven't found. Purposeful movement, then intentional stillness: pick one place, let it develop, then move once, because the kiss changed, not because you got bored.",
  },
  q4c: {
    title: "The Cradle",
    strength: "Face, jaw, that spot behind the ear, and then your hands stay. That's Chapter 6's face cradle with the exact finger placement most people never find. It says \"you have my complete attention\" louder than any lip technique.",
  },
  q4d: {
    title: "The Anchor",
    strength: "A gentle hand at the waist the whole time says \"I want you closer\" and never stops saying it. In a slow kiss, one still hand can do more than two roaming ones.",
    costTitle: "The Anchor That Never Lifts",
    cost: "Lovely, but your hands never say anything new. Once per kiss, do the Hair Slide: travel from the waist up the spine, across the neck and into {his} hair in one continuous movement without breaking contact. One sentence from your hands, then back to the anchor.",
  },
  q5a: {
    title: "The Diver",
    cost: "You hold your breath and then surface like you've been underwater, which is exactly what I did at fifteen in a parked car, so I'm not judging. But a kiss that ends in a gulp reads, from {his} side, as \"she needed a break from me.\"\n\nThe fix: the Snorkel, from Chapter 9. Your mouth does the kissing; your nose does the breathing. Slow in, slow out, the whole time. Before your lips touch, take one hospital breath (in for four, hold for four, out for four). Your shoulders will drop, your jaw will unclench, and your body will remember the rest without you supervising it.",
  },
  q5b: {
    title: "The Snorkel",
    strength: "Nose breathing without thinking about it, and breathing together without deciding to. That's Chapter 9 in one answer, including the part almost nobody knows: synced breath is felt as closeness even when neither of you can name it.",
  },
  q5c: {
    title: "The Fountain",
    cost: "Extra moisture happens to everyone. Transferring it is the problem, and you've watched a chin get wiped, so you already know. Swallow at the breath breaks (yes, mid-kiss; it's not weird), open your mouth less wide, and let your lips absorb what your tongue leaves behind. Commandment III, said kindly.",
  },
  q5d: {
    title: "Fresh",
    strength: "Prepared, clean, neutral. The goal is a mouth that tastes like a clean human, not peppermint hiding something, and you're there.",
    costTitle: "Over-Checked",
    cost: "The mint is fine; the second check is the narrator. One hand-lick test before you leave the house, then stop auditing and spend the attention on {him}.",
  },
  q6a: {
    title: "The Chase",
    cost: "{He} {v:pulls} back an inch and you close it again and add something. Commandment VIII: if they pull back, don't chase. Stay exactly where you are. The quarter inch {he} {v:chooses} to close is the only honest review of your kiss you will ever get. Let {him} write it.",
  },
  q6b: {
    title: "The Quarter Inch",
    strength: "You stay put and let {him} come back. That one habit means you're always reading the verdict instead of overriding it. The second kiss {he} {v:starts} is worth more than the first one you did.",
  },
  q6c: {
    title: "The Apology",
    cost: "A pull-back and you assume you failed. Sometimes it's a breath. Sometimes it's the Reset, the one-inch gap that makes the return feel new. Hold still for one breath before you decide anything. If {he} {v:comes} back, that was a compliment. If not, then you check in, warmly, without apologizing for existing.",
  },
  q6d: {
    title: "The Check-In",
    strength: "You check, softly, that {he}'s okay. That's attention, and attention is the whole game.",
    costTitle: "Words Before Eyes",
    cost: "The check-in is kind; it also breaks the spell. Hold the gap with your eyes first (lips, eyes, lips, per Chapter 3). Most of the time {his} face answers before your mouth has to ask.",
  },
  q7a: {
    title: "The Treadmill",
    cost: "You found the thing that works and stayed on it. Commandment IX: even a great move goes numb after two minutes. Change one variable. Angle, then speed, then a detour to the jaw, then back. A kiss should feel like a journey, not a treadmill.",
  },
  q7b: {
    title: "The Journey",
    strength: "Two minutes in, you've changed the angle, the speed, taken a detour to the jaw and come back. That's Commandment IX kept without anyone telling you to keep it. Every shift re-engages {his} attention. You do this on instinct, which is why I'm confident the rest of this report is about removing things, not adding them.",
  },
  q7c: {
    title: "Range",
    strength: "Neck, ear, hair, wall. You have more territory than most people ever map.",
    costTitle: "The Slideshow",
    cost: "Constant change gives nothing time to land. Half as many changes, each held twice as long. Let one thing register fully before the next.",
  },
  q7d: {
    title: "One Gear",
    cost: "Slower is the plan, and it's a good plan, but a single gear becomes something {he} can predict. The Push, the Stare, the Dive from Chapter 3: pull back an inch, look at {his} lips then {his} eyes, then go back in with more urgency than before. Slow is your base. Contrast is your weapon.",
  },
  q8a: {
    title: "Neck-Up Only",
    cost: "Lips busy, body absent. Most people kiss like statues from the collarbone down (Chapter 4). One thing: step in until you're sharing the same square foot of floor, hips present, shoulders soft. Nothing fancy. Show up below the jaw.",
  },
  q8b: {
    title: "The Dance",
    strength: "Leaning in, hips close, moving with {him}. That's the whole of Chapter 4: the kiss is the music, your body is the dance. Most people never let themselves do this. You already do.",
  },
  q8c: {
    title: "The Set Designer",
    strength: "Wall, dip, counter. You use the room, which is decisive, and decisive is magnetic.",
    costTitle: "Props Before People",
    cost: "The wall works when {he} {v:was} already leaning toward it. Read first, then use the room. The wall is a sentence, not an opening line.",
  },
  q8d: {
    title: "The Hug",
    cost: "Holding on gently and staying put feels safe and, after a minute, like a hug with a kiss attached. Chapter 4's permission slip: hips forward an inch, shoulders roll, let your body sway with the kiss. Physical isn't aggressive. Still is just still.",
  },
  q9a: {
    title: "You Look Up",
    strength: "You catch the hand tightening and the stillness when you slow down. You're watching the scoreboard two inches from your face while most people listen to their own applause meter.",
  },
  q9b: {
    title: "The Second Kiss",
    strength: "You've felt {him} come back before you did. That's the verdict, and you knew to wait for it. The first kiss is yours; the second one is {his} to start; you read both.",
  },
  q9c: {
    title: "The Scoreboard Is Two Inches Away",
    cost: "You told me you have no idea what {he} {v:does} mid-kiss, because you're busy. Busy with what? With the narrator. Meanwhile {he} {v:is} broadcasting a complete review the whole time: a small exhale in the first thirty seconds, a hand that ends up somewhere it didn't start, eyes that open a beat after yours. None of it can be faked, and you're missing all of it.\n\nThe fix: next kiss, watch for exactly one thing. The sigh. Not a moan, not a gasp; a soft involuntary breath against your lip when {his} nervous system stops bracing. Just that. Once you've caught one, you will never be able to stop noticing, and the narrator loses its job to a better show.",
  },
  q9d: {
    title: "The Drop",
    strength: "You feel {his} shoulders drop. That's {his} nervous system deciding you're safe, and you noticed.",
    costTitle: "Comfort Only",
    cost: "Shoulders dropping is the first sign. Start collecting the others: the hand that ends the kiss somewhere new, the eyes that open late, the smile against your mouth.",
  },
  q10a: {
    title: "The Vampire Attack",
    cost: "Straight for the neck at full intensity is a horror-film audition. Touch first, breathe first, then a soft press just under the ear. Let it build. The neck rewards patience more than any other territory.",
  },
  q10b: {
    title: "Under the Ear",
    strength: "Slow, just below the ear, and you make {him} wait. That's the exact spot from Chapter 7 at the exact pace it wants. Vampires had it right and so do you.",
  },
  q10c: {
    title: "The Neck, Read Properly",
    strength: "Soft first, then you watch what it does to {him}. Sensitivity there varies wildly person to person, and you treat it like a conversation instead of a technique. That's rare.",
  },
  q10d: {
    title: "Unvisited",
    cost: "You've never really gone there. That's not a flaw; it's an unopened present. The map from Chapter 7 and the neck guide: just below the ear, the side strip, the nape. Move the hair, warm breath first, then a soft press held a beat longer than feels normal.",
  },
};
