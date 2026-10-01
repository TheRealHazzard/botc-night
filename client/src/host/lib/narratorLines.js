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
// (night number, death count) pair.
function pick(pool, seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

const NIGHT_ONE = 'Close your eyes. The town sleeps.';

const NIGHT_OPEN = [
  'Close your eyes. Night falls again.',
  'Eyes closed. The town sleeps once more.',
  'Close your eyes, all of you.',
  'Night again. Close your eyes.',
  'Close your eyes. Let the dark do its work.',
];

const NIGHT_OPEN_GRIM = [
  'Close your eyes. Fewer of you than before.',
  'Eyes closed. You know what came for the others.',
  "Close your eyes. The town sleeps, what's left of it.",
  'Night falls on a smaller town.',
  'Close your eyes. You felt that loss. Sleep anyway.',
];

/** Night 1 always reads the same canonical opener — it's every table's
    first experience with this moment, and it should land exactly as
    designed. From night 2 on, it rotates, split into two registers: a
    deaths-so-far count of zero keeps a lighter voice, any deaths at all
    tip it into the grimmer pool. */
export function nightOpenLine(nightNumber, deathsSoFar = 0) {
  if (nightNumber <= 1) return NIGHT_ONE;
  const pool = deathsSoFar > 0 ? NIGHT_OPEN_GRIM : NIGHT_OPEN;
  return pick(pool, `night:${nightNumber}:${deathsSoFar}`);
}

const NO_DEATH_DAY_ONE = 'Everyone wakes. That should worry you.';

const NO_DEATH_DAY = [
  'Everyone wakes. Make of that what you will.',
  "Nobody died last night. Don't get comfortable.",
  'Everyone wakes, all present. For now.',
  'Everyone wakes. Someone is being patient.',
  'Everyone wakes again. Interesting.',
];

/** Same split as nightOpenLine: day 1's silent-night line is the
    canonical phrase, later silent nights rotate through the pool. */
export function noDeathDayLine(nightNumber) {
  if (nightNumber <= 1) return NO_DEATH_DAY_ONE;
  return pick(NO_DEATH_DAY, `noDeathDay:${nightNumber}`);
}

const REVEAL_LINES = [
  'Look at your hands. Learn what you are.',
  'Look down. Learn what you are, just this once.',
  'Open your hands. See who you really are tonight.',
  'Look at your hands now. You will not get another look.',
  'Look down. Whatever you are, you are now.',
];

/** Only said once per game, so there's no in-game repetition to fix —
    but a group playing several games in one sitting (SessionStatsCard
    exists for exactly that) would otherwise hear this exact line every
    single time. `seed` is the caller's job to pick, since this module
    has no notion of "which game" — anything that's stable for one
    game's reveal phase and differs from the last one works (RevealView
    uses a value captured once per mount). */
export function revealLine(seed) {
  return pick(REVEAL_LINES, `reveal:${seed}`);
}
