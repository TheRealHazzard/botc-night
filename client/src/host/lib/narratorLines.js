// Deterministic flavor-line pickers for narration that would otherwise read
// identical every single time it's said. A live Storyteller never actually
// repeats the same words night after night — but "Close your eyes. The
// town sleeps." and "Everyone wakes. That should worry you." used to be
// hardcoded literals, spoken verbatim every time their phase came up with
// nothing new to say, which over a 5+ night game is the single most
// repeated line in the room.
//
// Deterministic (not Math.random()) on purpose: the phase view this feeds
// re-renders many times while players are still answering — each
// submission pushes a fresh state — and useSpeak's own effect re-fires
// whenever the line text itself changes. A picker that could return a
// different line on every render would have the narrator re-read a new
// line mid-night; this always returns the same line for the same
// (night number, death count, persona) tuple.
function pick(pool, seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

// A human Storyteller's voice is fixed for a given table — an AI one can be
// chosen, and chosen differently next time, which is the one real edge a
// no-human Storyteller has over a live one here. Scoped to flavor text only:
// nothing about this changes what's mechanically legal, same boundary the
// bot personalities (helpers.js's BOT_PERSONALITIES) already draw for play
// style vs. mechanics.
export const NARRATOR_PERSONAS = [
  { id: 'dramatic', label: 'Dramatic', blurb: 'Moody, grave, leans into the dread.' },
  { id: 'strict', label: 'Strict', blurb: 'Terse and procedural — no flourish, just the facts.' },
  { id: 'droll', label: 'Droll', blurb: 'Wry and deadpan, a little too amused by all this.' },
];
const PERSONA_IDS = NARRATOR_PERSONAS.map(p => p.id);
function normalizePersona(persona) {
  return PERSONA_IDS.includes(persona) ? persona : 'dramatic';
}

// Night 1/Day 1's lines stay canonical regardless of persona — every
// table's first experience with this moment should land exactly as
// designed, before any persona's voice has had a chance to establish
// itself. Persona variation only kicks in once a pool is actually rotating.
const NIGHT_ONE = 'Close your eyes. The town sleeps.';

const NIGHT_OPEN = {
  dramatic: [
    'Close your eyes. Night falls again.',
    'Eyes closed. The town sleeps once more.',
    'Close your eyes, all of you.',
    'Night again. Close your eyes.',
    'Close your eyes. Let the dark do its work.',
  ],
  strict: [
    'Close your eyes.',
    'Eyes closed, please.',
    'Close your eyes now.',
    'Night falls. Eyes closed.',
    'Eyes closed. Begin.',
  ],
  droll: [
    'Close your eyes. Try not to snore.',
    "Eyes closed. I'll handle the rest, as usual.",
    'Close your eyes. This never ends well for someone.',
    'Night again. You know the drill by now.',
    'Close your eyes. I promise this is the fun part.',
  ],
};

const NIGHT_OPEN_GRIM = {
  dramatic: [
    'Close your eyes. Fewer of you than before.',
    'Eyes closed. You know what came for the others.',
    "Close your eyes. The town sleeps, what's left of it.",
    'Night falls on a smaller town.',
    'Close your eyes. You felt that loss. Sleep anyway.',
  ],
  strict: [
    'Close your eyes. Note who is no longer with us.',
    'Eyes closed. The count is lower tonight.',
    'Close your eyes. Proceeding as normal.',
    'Night falls on a smaller table. Eyes closed.',
    'Eyes closed. We continue.',
  ],
  droll: [
    'Close your eyes. The seating chart keeps improving.',
    'Eyes closed. Fewer witnesses tonight, lucky you.',
    'Close your eyes. At least the bickering gets quieter.',
    'Night falls. More elbow room at the table now.',
    'Close your eyes. This town is thinning out nicely.',
  ],
};

/** Night 1 always reads the same canonical opener — it's every table's
    first experience with this moment, and it should land exactly as
    designed. From night 2 on, it rotates, split into two registers: a
    deaths-so-far count of zero keeps a lighter voice, any deaths at all
    tip it into the grimmer pool — both now further split by persona. */
export function nightOpenLine(nightNumber, deathsSoFar = 0, persona = 'dramatic') {
  if (nightNumber <= 1) return NIGHT_ONE;
  const p = normalizePersona(persona);
  const pool = deathsSoFar > 0 ? NIGHT_OPEN_GRIM[p] : NIGHT_OPEN[p];
  return pick(pool, `night:${nightNumber}:${deathsSoFar}:${p}`);
}

const NO_DEATH_DAY_ONE = 'Everyone wakes. That should worry you.';

const NO_DEATH_DAY = {
  dramatic: [
    'Everyone wakes. Make of that what you will.',
    "Nobody died last night. Don't get comfortable.",
    'Everyone wakes, all present. For now.',
    'Everyone wakes. Someone is being patient.',
    'Everyone wakes again. Interesting.',
  ],
  strict: [
    'Everyone wakes. No deaths to report.',
    'All present. Nothing happened last night.',
    'Everyone wakes. The night was uneventful.',
    'No deaths last night. Everyone wakes.',
    'Everyone wakes, accounted for.',
  ],
  droll: [
    'Everyone wakes. Shockingly, still all of you.',
    'Nobody died. I know, disappointing.',
    'Everyone wakes. A quiet night, allegedly.',
    'Everyone wakes. Somebody is slacking.',
    'Everyone wakes. Try not to sound too relieved.',
  ],
};

/** Same split as nightOpenLine: day 1's silent-night line is the
    canonical phrase, later silent nights rotate through the persona's
    own pool. */
export function noDeathDayLine(nightNumber, persona = 'dramatic') {
  if (nightNumber <= 1) return NO_DEATH_DAY_ONE;
  return pick(NO_DEATH_DAY[normalizePersona(persona)], `noDeathDay:${nightNumber}:${normalizePersona(persona)}`);
}

const REVEAL_LINES = {
  dramatic: [
    'Look at your hands. Learn what you are.',
    'Look down. Learn what you are, just this once.',
    'Open your hands. See who you really are tonight.',
    'Look at your hands now. You will not get another look.',
    'Look down. Whatever you are, you are now.',
  ],
  strict: [
    'Look at your hands. Note your role.',
    'Check your hands now.',
    'Look down. That is your assignment.',
    'Hands down, eyes open. Learn your role.',
    'Look at your hands. Remember it.',
  ],
  droll: [
    'Look at your hands. Try to act surprised either way.',
    "Open your hands. Don't overact, it's not that kind of role.",
    'Look down. Yes, really, that one.',
    'Look at your hands. No refunds.',
    "Open your hands now. Don't tell your neighbor.",
  ],
};

/** Only said once per game, so there's no in-game repetition to fix —
    but a group playing several games in one sitting (SessionStatsCard
    exists for exactly that) would otherwise hear this exact line every
    single time. `seed` is the caller's job to pick, since this module
    has no notion of "which game" — anything that's stable for one
    game's reveal phase and differs from the last one works (RevealView
    uses a value captured once per mount). */
export function revealLine(seed, persona = 'dramatic') {
  const p = normalizePersona(persona);
  return pick(REVEAL_LINES[p], `reveal:${seed}:${p}`);
}
