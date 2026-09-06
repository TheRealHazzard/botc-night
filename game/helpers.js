'use strict';
// Shared primitives used by both engine.js (the night/day driver) and the
// per-character modules under game/abilities/ — pulled out to its own file
// specifically so those two can both require it without requiring each
// other. engine.js re-exports everything here under its existing names, so
// nothing outside game/ sees any difference.

const fs = require('fs');
const path = require('path');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'characters.json'), 'utf8'));
const CHARACTERS = DATA.characters;
const SETUP_TABLE = DATA.meta.setupTable;

const char = id => CHARACTERS.find(c => c.id === id);
const scriptPool = script => CHARACTERS.filter(c => c.edition === script && c.team !== 'special');

function shuffle(input) {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const take = (arr, n) => shuffle(arr).slice(0, n);

const byId = (g, id) => g.players.find(p => p.id === id);
const byToken = (g, token) => g.players.find(p => p.token === token);
const alive = g => g.players.filter(p => p.alive);
const seatIndex = (g, p) => g.players.indexOf(p);

/** The character a player *believes* they are (the Drunk differs). */
const actingChar = p => char(p.believedId);
/** The character they truly are. */
const trueChar = p => char(p.characterId);

/** Poisoned, drunk-until-dusk (Sailor/Innkeeper/Courtier), or the Drunk
    themselves: their ability does not work and they don't know. */
function impaired(p) {
  return !!p.statuses.poisoned || !!p.statuses.drunk || p.characterId === 'drunk';
}

/** Whether the table sees this player as alive — false for a Zombuul who
    has faked their death, even though they're secretly still playing. This
    is what every public/social action (nominating, executing, the Slayer's
    own target list) should check; genuine night-time targeting still uses
    the real alive() list, since nothing in this cast would ever secretly
    target a demon anyway. */
function publiclyAlive(p) {
  return p.alive && !p.statuses.appearsDead;
}

/** True while both of a living Tea Lady's living neighbours are actually
    good — real protection, so it's checked against true alignment, not
    registration (a Recluse fooling an info-role shouldn't also fool this). */
function tealadyProtects(g, target) {
  const tl = alive(g).find(x => trueChar(x) && trueChar(x).id === 'tealady' && !impaired(x));
  if (!tl || tl.id === target.id) return false;
  const living = alive(g);
  const i = living.indexOf(tl);
  if (i === -1) return false;
  const neighbors = new Set([living[(i - 1 + living.length) % living.length], living[(i + 1) % living.length]]);
  neighbors.delete(tl);
  if (!neighbors.has(target)) return false;
  return [...neighbors].every(n => !isEvil(g, n));
}

/**
 * Read-only: would an attack on `target` be blocked, and by what? Safe to
 * call speculatively (e.g. scanning for a valid redirect target) since it
 * never consumes a one-shot ability — only checkKill() below does that,
 * because merely *checking* whether the Fool or Zombuul would survive an
 * attack must never itself spend their once-ever protection.
 */
function wouldBlockKill(g, target, { demonAttack = false, executionAttack = false } = {}) {
  if (!target || !target.alive) return 'already-dead';
  const tc = trueChar(target);
  if (demonAttack && target.statuses.protected) return 'protected';
  if (demonAttack && tc.id === 'soldier' && !impaired(target)) return 'soldier';
  if (executionAttack && target.statuses.executionImmune) return 'devils-advocate';
  if (executionAttack && target.statuses.pacifistSaved) return 'pacifist';
  // Absolute — "You can't die" has no carve-out for execution; a sober
  // Sailor who's executed is still marked executed but remains alive.
  if (tc.id === 'sailor' && !impaired(target)) return 'sailor';
  if (tealadyProtects(g, target)) return 'tea-lady';
  if (tc.id === 'fool' && !target.statuses.foolUsed && !impaired(target)) return 'fool';
  if (tc.id === 'zombuul' && !target.statuses.zombuulFaked && !impaired(target)) return 'zombuul-fake';
  return null;
}

/**
 * Resolves who actually ends up attacked out of `pool` — the one place the
 * Mayor's "if you die at night, another player might die instead" lives, so
 * every kill mechanism gets it for free instead of reimplementing the roll.
 * Two shapes of caller share this:
 *   - A deliberately-targeted kill (Imp, Godfather, Pukka, Shabaloth, Po,
 *     Zombuul) passes a single-element pool: `[theTarget]`. No random pick
 *     happens, but the Mayor check still runs against that one target.
 *   - A kill with no deliberate target at all (Gossip's, now that the
 *     player doesn't choose) passes the whole live candidate pool, and a
 *     genuinely random choice happens first.
 * Either way, if the result is an unimpaired Mayor, a fresh roll may
 * redirect to a different random survivor — checked the same way, so the
 * function calling itself a second time is exactly the redirect.
 *
 * excludeId is whoever is doing the attacking (irrelevant for Gossip, which
 * has no attacker to exclude and already leaves itself out of `pool`) — a
 * redirect must never land back on the attacker itself. The redirect's own
 * alternate pool is built fresh from `alive(g)`, so this has to be threaded
 * through explicitly; it can't be baked into the original `pool` alone.
 */
function randomKiller(g, pool, excludeId) {
  const candidates = (pool || []).filter(x => x && x.id !== excludeId);
  if (!candidates.length) return null;
  const picked = candidates.length === 1 ? candidates[0] : pick(candidates);
  if (picked.characterId === 'mayor' && !impaired(picked) && Math.random() < g.config.mayorRedirectChance) {
    const alt = alive(g).filter(x => x.id !== picked.id && x.id !== excludeId && !wouldBlockKill(g, x, { demonAttack: true }));
    if (alt.length) return randomKiller(g, alt, excludeId);
  }
  return picked;
}

/**
 * The one place every death in the game is actually decided — the Imp's
 * night kill, execution, the Slayer's shot, and every BMR demon/minion kill
 * all funnel through this instead of duplicating protection checks at each
 * call site (which is exactly how Scarlet Woman's succession bug happened
 * earlier: the same logic living in two places, correct in neither).
 * Commits one-shot consumption (Fool, Zombuul) when that's what blocks the
 * kill. Returns the block reason, or null if the kill goes through — the
 * caller applies the actual death itself (deferred for night kills so a
 * whole night's worth land together, immediate for day-time ones).
 */
function checkKill(g, target, opts = {}) {
  if (opts.bypassAll) return null;
  const reason = wouldBlockKill(g, target, opts);
  if (reason === 'fool') {
    target.statuses.foolUsed = true;
    logEvent(g, `${target.name} should have died, but doesn't.`, true);
  } else if (reason === 'zombuul-fake') {
    target.statuses.zombuulFaked = true;
    target.statuses.appearsDead = true;
    logEvent(g, `${target.name} appears to die, but secretly does not.`, true);
  }
  return reason;
}

function isEvil(g, p, { forRegistration = false } = {}) {
  const c = trueChar(p);
  if (!c) return false;
  if (forRegistration && c.id === 'recluse') {
    return Math.random() < g.config.recluseRegistersEvil;
  }
  if (forRegistration && c.id === 'spy') {
    return !(Math.random() < g.config.recluseRegistersEvil);
  }
  // The Goon: flipped to evil for the rest of the game once an evil player
  // is the first to target them on some night.
  if (c.id === 'goon' && p.statuses.goonEvil) return true;
  return c.team === 'minion' || c.team === 'demon';
}

/** First death ever, for a Moonchild, opens their one public choice — flagged
    here so every death site (night kill, execution, Slayer's shot, a later
    Moonchild kill itself) triggers it the same way instead of duplicating
    the check at each call site. */
function triggerMoonchildIfNeeded(g, deadPlayer) {
  const tc = trueChar(deadPlayer);
  if (tc && tc.id === 'moonchild' && !deadPlayer.statuses.moonchildUsed) {
    deadPlayer.statuses.moonchildUsed = true;
    deadPlayer.statuses.moonchildPending = true;
    logEvent(g, `${deadPlayer.name} (the Moonchild) may now choose someone to die alongside them.`, true);
  }
}

function logEvent(g, text, secret = false) {
  g.log.push({ night: g.nightNumber, text, secret, at: Date.now() });
}

/** Did an Outsider die by execution the day just past — Godfather's trigger. */
function outsiderDiedToday(g) {
  return g.deaths.some(d => {
    if (d.night !== g.nightNumber - 1 || d.cause !== 'execution') return false;
    const dp = g.players.find(x => x.name === d.name);
    return dp && trueChar(dp) && trueChar(dp).team === 'outsider';
  });
}

/** Did a Minion die by execution the day just past — Minstrel's trigger. */
function minionDiedToday(g, night) {
  return g.deaths.some(d => {
    if (d.night !== night || d.cause !== 'execution') return false;
    const dp = g.players.find(x => x.name === d.name);
    return dp && trueChar(dp) && trueChar(dp).team === 'minion';
  });
}

/** Did anyone at all die yesterday (night or execution) — Zombuul only
    stirs on a night that follows a day with no death of any kind. */
function somebodyDiedYesterday(g) {
  return g.deaths.some(d => d.night === g.nightNumber - 1);
}

const numberSignal = n => String(n);

function falseNumber(trueValue, max) {
  const options = [];
  for (let i = 0; i <= max; i++) if (i !== trueValue) options.push(i);
  return pick(options);
}

function evilNeighbourCount(g, p) {
  const living = alive(g);
  const i = living.indexOf(p);
  if (i === -1) return 0;
  const left = living[(i - 1 + living.length) % living.length];
  const right = living[(i + 1) % living.length];
  let count = 0;
  for (const nb of new Set([left, right])) {
    if (nb !== p && isEvil(g, nb, { forRegistration: true })) count++;
  }
  return count;
}

function evilPairCount(g) {
  const seats = g.players;
  let pairs = 0;
  for (let i = 0; i < seats.length; i++) {
    const a = seats[i];
    const b = seats[(i + 1) % seats.length];
    if (isEvil(g, a, { forRegistration: true }) && isEvil(g, b, { forRegistration: true })) pairs++;
  }
  return pairs;
}

/** "1 of these 2 players is the X" — true version, or a deliberately wrong one. */
function pairInfo(g, p, team, wrong) {
  const trueMembers = g.players.filter(x => x.id !== p.id && trueChar(x) && trueChar(x).team === team);
  // The Spy (registers as Townsfolk/Outsider/Minion, never Demon) and the
  // Recluse (registers as Outsider/Minion/Demon, never Townsfolk) can also
  // be shown as the "subject" of these reveals — a Storyteller-discretion
  // "might" in the real rules, modeled as a roll like their other effects.
  const registrants = g.players.filter(x => {
    if (x.id === p.id || trueMembers.includes(x)) return false;
    const c = trueChar(x);
    if (!c) return false;
    if (c.id === 'spy' && team !== 'demon') return Math.random() < g.config.recluseRegistersEvil;
    if (c.id === 'recluse' && team !== 'townsfolk') return Math.random() < g.config.recluseRegistersEvil;
    return false;
  });
  const pool = [...trueMembers, ...registrants];
  if (!pool.length) {
    return { text: `You learn that no ${team} is in play.`, characterId: null, players: [] };
  }
  const subject = pick(pool);
  // A registrant isn't really that role, so a real member of the category
  // gets named instead — the Spy is never announced as "the Spy" here.
  const shownChar = registrants.includes(subject)
    ? pick(scriptPool(g.script).filter(c => c.team === team))
    : trueChar(subject);
  const decoyPool = g.players.filter(x => x.id !== p.id && x.id !== subject.id);
  if (!wrong) {
    const decoy = pick(decoyPool);
    const shown = shuffle([subject, decoy]);
    return {
      text: `One of these two players is the ${shownChar.name}.`,
      characterId: shownChar.id,
      players: shown.map(x => x.name),
    };
  }
  // Wrong: name a character, point at two players, neither of whom is it.
  const notThem = g.players.filter(x => x.id !== p.id && x.id !== subject.id);
  const shown = take(notThem.length >= 2 ? notThem : decoyPool, 2);
  return {
    text: `One of these two players is the ${shownChar.name}.`,
    characterId: shownChar.id,
    players: shown.map(x => x.name),
  };
}

module.exports = {
  DATA, CHARACTERS, SETUP_TABLE, char, scriptPool,
  shuffle, pick, take,
  byId, byToken, alive, seatIndex, actingChar, trueChar, impaired, publiclyAlive,
  tealadyProtects, wouldBlockKill, randomKiller, checkKill, isEvil, triggerMoonchildIfNeeded,
  logEvent, outsiderDiedToday, minionDiedToday, somebodyDiedYesterday,
  numberSignal, falseNumber, evilNeighbourCount, evilPairCount, pairInfo,
};
