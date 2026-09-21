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
// tb/bmr/sv each own their characters outright (edition is a plain string),
// but a real custom script draws from a shared pool — the same Cannibal or
// Pixie can belong to several unrelated scripts at once — so `edition` may
// also be an array of every script id that includes it.
const inEdition = (c, script) => Array.isArray(c.edition) ? c.edition.includes(script) : c.edition === script;
const scriptPool = script => CHARACTERS.filter(c => inEdition(c, script) && c.team !== 'special');

// "Bucket 4": characters whose ability reduces "ask/tell the Storyteller
// something open-ended" to a fixed menu or template for lack of a real
// Storyteller — see game/ABILITY_PATTERNS.md and game/llmStoryteller.js. The
// one host-facing toggle that can turn these three off lives here as a flat
// list (not a general per-character disable system) specifically so it can
// never starve a team's setup pool: all three are Townsfolk in scripts with
// 13 Townsfolk each.
const BUCKET4_IDS = ['gossip', 'savant', 'artist'];

/** scriptPool(), narrowed to what this specific table actually has in play —
    everything that decides what's *selectable* right now (dealing roles,
    demon bluffs, decoy reveals, "guess a character" menus) should read from
    this instead of scriptPool() directly, so a disabled character silently
    stops being offered everywhere at once. scriptPool() itself is untouched
    and keeps describing the script's full, fixed content (e.g. the lobby's
    "25 characters" card) regardless of what a table has turned off. */
function activeScriptPool(g) {
  // A custom-built roster (see the script builder / POST /api/table/script's
  // customRoster option) bypasses scriptPool()'s named-edition lookup
  // entirely — g.script is just 'custom' at that point, not a real
  // meta.editions id, so scriptPool(g.script) would return nothing.
  const base = (g.customRoster && g.customRoster.length)
    ? CHARACTERS.filter(c => g.customRoster.includes(c.id))
    : scriptPool(g.script);
  const disabled = g.config.disabledCharacterIds || [];
  if (!disabled.length) return base;
  return base.filter(c => !disabled.includes(c.id));
}

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
/** take(), but the excluded ids can never come back out — for "N random
    players, but never X" where forgetting the exclusion is exactly the bug
    (Sage's fallback used to hand-roll `pool.filter(x => !exclude...)` and
    forgot to exclude the real Demon from the decoy pool). Making the
    exclusion a required parameter means the next caller can't skip it the
    way that one did. */
function excludingPick(pool, excludeIds, n) {
  const exclude = new Set(excludeIds);
  return take(pool.filter(x => !exclude.has(x.id)), n);
}

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

/** The doctrine every impaired yes/no info role follows: wrong, never
    silent — going quiet on a valid choice is itself a tell that something's
    off, so a broken read still answers, just with a coin flip instead of
    the truth (Fortune Teller's and Seamstress's identical inline
    expression, pulled out once both had it right). */
function impairedFlip(broken, trueBoolean) {
  return broken ? Math.random() < 0.5 : trueBoolean;
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

/** The (up to) two living players seated either side of `p`, in the fixed
    seating order — a circle of 1 has none, a circle of 2 has the same
    player on both sides (deduped via the Set). Shared by anything that
    cares about "neighbours" among the living: Tea Lady's protection,
    No Dashii's poison, and anything Sects & Violets adds later. */
// `pendingDeaths` (resolveNight's own local `deaths` array, still unapplied
// — see engine.js's "Apply deaths" pass) lets a LATER-acting character's
// neighbor topology correctly skip someone an EARLIER character already
// killed this same night, without waiting for p.alive to actually flip.
// Defaults to none, so every existing call site (which wants the raw,
// still-including-p current snapshot — e.g. Vigormortis computing a
// just-killed Minion's own adjacency at the moment they die) is unchanged.
function livingNeighbors(g, p, pendingDeaths = []) {
  const deadIds = new Set(pendingDeaths.map(d => d.player.id));
  const living = alive(g).filter(x => !deadIds.has(x.id));
  const i = living.indexOf(p);
  if (i === -1) return [];
  const neighbors = new Set([living[(i - 1 + living.length) % living.length], living[(i + 1) % living.length]]);
  neighbors.delete(p);
  return [...neighbors];
}

/** True while both of a living Tea Lady's living neighbours are actually
    good — real protection, so it's checked against true alignment, not
    registration (a Recluse fooling an info-role shouldn't also fool this). */
function tealadyProtects(g, target) {
  const tl = alive(g).find(x => trueChar(x) && trueChar(x).id === 'tealady' && !impaired(x));
  if (!tl || tl.id === target.id) return false;
  const neighbors = livingNeighbors(g, tl);
  if (!neighbors.includes(target)) return false;
  return neighbors.every(n => !isEvil(g, n));
}

/**
 * Reassigns a player to a different character outright — Snake Charmer's
 * swap, Pit-Hag's "become this", and Barber's Demon-driven swap all funnel
 * through this rather than each hand-rolling the same characterId/
 * believedId mutation. `abilityOnly` is the Philosopher's case: they gain
 * another character's ability (so what they act as, and thus dispatch on,
 * has to change) but their own true identity and team never do — so only
 * believedId moves, not characterId.
 */
function reassignCharacter(g, player, newCharacterId, { abilityOnly = false } = {}) {
  if (!abilityOnly) player.characterId = newCharacterId;
  player.believedId = newCharacterId;
}

/** Marks a player's night as having gone abnormally due to someone else's
    ability — poisoned, reassigned, cursed, swapped. Reset at the top of
    every night alongside the other per-night markers; the Mathematician
    is the only thing that ever reads it. Deliberately opt-in per call site
    rather than inferred, so it only ever reflects effects that actually
    happened, not everything that merely *could* have. */
function flagAbnormal(g, player) {
  if (!g.abnormalTonight) g.abnormalTonight = new Set();
  g.abnormalTonight.add(player.id);
}

/**
 * Read-only: would an attack on `target` be blocked, and by what? Safe to
 * call speculatively (e.g. scanning for a valid redirect target) since it
 * never consumes a one-shot ability — only checkKill() below does that,
 * because merely *checking* whether the Fool or Zombuul would survive an
 * attack must never itself spend their once-ever protection.
 */
function wouldBlockKill(g, target, { demonAttack = false, executionAttack = false, nightKill = demonAttack } = {}) {
  if (!target || !target.alive) return 'already-dead';
  const tc = trueChar(target);
  // Innkeeper's "can't die tonight" is attacker-agnostic — it has to block
  // any overnight kill (Demon, Godfather, Gossip, a self-inflicted Gambler
  // guess, Tinker, Lycanthrope, ...), not just a demonAttack specifically.
  // Soldier's is the opposite: explicitly "safe from the Demon", nothing
  // else. These used to share the one demonAttack flag, which meant any
  // non-Demon night-kill that needed Innkeeper protection recognized also
  // picked up Soldier immunity it was never entitled to. `nightKill`
  // defaults to `demonAttack` so every existing demon-kill call site keeps
  // exactly its current behavior (both checks) with no call-site changes
  // required there — only the non-Demon night-kill sites need to pass
  // `nightKill: true` explicitly (see game/abilities/bmr.js's Gossip,
  // Godfather, and Gambler).
  if (nightKill && target.statuses.protected) return 'protected';
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
 *
 * `opts` is what the redirect's own alt-pool filter passes to
 * wouldBlockKill — defaults to `{ demonAttack: true }` since 12 of this
 * function's 14 call sites are genuine demon kills (Imp, Pukka, Shabaloth,
 * Po, Zombuul, Fang Gu, Vigormortis, Vortox, Ojo, NoDashii), where that's
 * exactly right and no call site needs to change. Gossip and Godfather are
 * the two non-Demon kills that also redirect through here — they pass
 * `{ nightKill: true }` explicitly so a redirect landing on a Soldier
 * doesn't wrongly grant Soldier's Demon-only immunity (same distinction
 * `wouldBlockKill`'s own `nightKill` parameter exists to make elsewhere).
 */
/** dramaBias's one real hook (0 = coldly random, 1 = maximum tension, same
    scale the config's own doc-comment describes) — every other setting on
    the roadmap already had a real effect; this one had a slider, a
    clamp, and nothing reading it. Scoped to a single, well-defined case
    rather than reworking target selection everywhere: the genuinely
    random night-kill picks that already flow through randomKiller() with
    more than one live candidate (Ojo naming a character nobody holds,
    Gossip's claim-come-true, and a Mayor redirect's own alternate pool) —
    never a player's own deliberate target choice, which this function
    never sees in the first place.

    "Dramatic" here means one concrete, checkable thing: weighting toward
    whoever the table's own conversation has already centered on today —
    killing the player everyone's been nominating denies the town the
    momentum it just built, which is a real Storyteller instinct, not
    killing whoever's safest to remove. At bias 0 every candidate weighs
    the same (pick()'s plain uniform draw); weight scales linearly with
    today's own nomination count as bias rises to 1. */
function dramaticPick(g, candidates) {
  if (!g.config.dramaBias) return pick(candidates);
  const weights = candidates.map(x => {
    const nominatedCount = g.nominations.filter(n => n.nomineeId === x.id).length;
    return 1 + g.config.dramaBias * nominatedCount;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// Module-level, not per-game: this process only ever runs one table at a
// time, so keeping the judge here (rather than on `g` itself) keeps every
// game object free of a stray function reference — nothing has to remember
// to re-attach it on every `newGame()`/`/api/table/reset`. server.js is the
// only thing that ever calls setWhimJudge(), once, wiring in a real
// LLM-backed decision gated by the same llmStorytellerEnabled toggle Bucket
// 4 (Gossip/Savant/Artist) already uses. Nothing in game/ ever sets this —
// tools/simulate.js's ~2000 assertions never touch it, so every "Bucket 1"
// roll below falls through to WHIM_LEGACY_CHANCE exactly as before, keeping
// every existing test's behavior byte-for-byte identical.
let whimJudge = null;
function setWhimJudge(fn) { whimJudge = fn; }

// The exact per-kind flat rate each of these three "Storyteller might..."
// moments has always used (see ABILITY_PATTERNS.md's Bucket 1) — kept as the
// fallback both when no judge is wired in at all, and when a wired-in judge
// itself fails (network error, timeout, disabled) so a real table's night
// never stalls or crashes waiting on it.
const WHIM_LEGACY_CHANCE = {
  'mayor-redirect': g => g.config.mayorRedirectChance,
  'registration-ambiguity': g => g.config.recluseRegistersEvil,
  'pacifist-save': g => g.config.pacifistSaveChance,
};

// Whether firing a given whim kind serves good or evil, once it actually
// manifests — mayor-redirect/pacifist-save both keep a good player alive,
// but registration-ambiguity's "fires" outcome is the opposite: a Recluse
// reading as evil wastes the town's suspicion on an innocent, and a Spy
// reading as good lets a real evil player blend in — both serve evil.
// Shared by heuristicWhim() (which side to lean toward) and
// logWhimConfirm() (which side a given outcome favored) below.
const WHIM_FIRING_HELPS_GOOD = {
  'mayor-redirect': true,
  'pacifist-save': true,
  'registration-ambiguity': false,
};

/** The Confirm — a host-facing, advisory-only record of a whim decision
    close enough to plausibly matter (see resolveWhim's stakes check),
    gated to living.length <= 5 so routine early-game rolls never become
    noise. Never gates or reverses anything: the decision already stands by
    the time this is visible, so this is transparency, not a veto. `kind`
    and `reason` can each name a character or ability, so — same "the
    Storyteller stays blind until reveal" principle publicState()'s own
    character/team fields already follow — publicState() strips both of
    them pre-reveal, unlike resultsLog/actionLog's all-or-nothing gate:
    this needs to stay usable *during* play (a host-facing card in the
    moment is the whole point), so only the two identity-bearing fields are
    withheld, not the whole entry — `helpsGood`/livingCount/goodAlive/
    evilAlive are all already-public aggregate facts, safe to show live. */
function logWhimConfirm(g, { kind, fired, reason }) {
  const living = alive(g);
  const goodAlive = living.filter(p => !isEvil(g, p)).length;
  g.whimConfirmations.push({
    night: g.nightNumber, kind, fired, reason: reason || null,
    helpsGood: WHIM_FIRING_HELPS_GOOD[kind] !== false,
    livingCount: living.length, goodAlive, evilAlive: living.length - goodAlive,
    at: Date.now(),
  });
}

/**
 * The one place every Bucket-1 "Storyteller might" roll in the game now
 * goes through — Mayor's redirect, Recluse/Spy misregistration (in all its
 * call sites: Empath/Chef's counts, Washerwoman/Librarian/Investigator's
 * pairInfo, the Fortune Teller's demon check, and the Bucket-3/4 ground
 * truth in evaluateClaim/buildStorytellerContext), and Pacifist's save.
 * `ctx.kind` identifies which for both the legacy fallback rate and
 * whatever a real judge wants to reason about; `ctx.target` is the player
 * the decision concerns, when there is one. A judge is expected to resolve
 * `{fire, reason}` — `undefined` (not this table's call to make: LLM off,
 * no key, request failed) or a throw both fall back to the plain roll
 * (with no reason to show), the same "any failure falls back to the
 * deterministic path" doctrine Bucket 4 already follows — this never
 * stalls or crashes resolution over a network hiccup. Also the one place
 * that logs the decision — both the deliberately-vague logWhim() beat
 * every table gets, and, when the game is close enough to matter, the
 * richer logWhimConfirm() record — so every call site just asks "did it
 * fire," it never has to remember to log anything itself.
 */
async function resolveWhim(g, ctx) {
  let fired, reason = null;
  if (whimJudge) {
    try {
      const verdict = await whimJudge(g, ctx);
      if (verdict !== undefined) {
        fired = !!verdict.fire;
        reason = verdict.reason || null;
      }
    } catch (e) {
      // fall through to the legacy roll below
    }
  }
  if (fired === undefined) {
    fired = Math.random() < WHIM_LEGACY_CHANCE[ctx.kind](g);
  }
  if (alive(g).length <= 5) logWhimConfirm(g, { kind: ctx.kind, fired, reason });
  if (fired) logWhim(g);
  return fired;
}

/** Registration-aware team read for one player — the async sibling of
    isEvil() below, split out because only THIS case (a Recluse or Spy's
    alternate registration) can ever need a real judgment call; everyone
    else's alignment is a deterministic fact with nothing to decide. Kept as
    its own function (rather than an option on isEvil) specifically so every
    other call site — victory checks, vote tallies, the dozen info-role reads
    that want TRUE alignment — stays perfectly synchronous and untouched by
    this whole feature. */
async function isEvilRegistration(g, p) {
  const c = trueChar(p);
  if (!c) return false;
  // resolveWhim() itself logs (both the vague beat and, when the game is
  // close, the richer confirm record) — a good Recluse reading as evil, or
  // an evil Spy reading as good, both just need the roll here.
  if (c.id === 'recluse') {
    return await resolveWhim(g, { kind: 'registration-ambiguity', target: p });
  }
  if (c.id === 'spy') {
    return !(await resolveWhim(g, { kind: 'registration-ambiguity', target: p }));
  }
  return isEvil(g, p);
}

/**
 * Option 1 from "The Whim" roadmap discussion: a synchronous, no-network
 * judgment call, reasoning over real aggregate game state instead of a flat
 * rate — for a table with no LLM Storyteller judge available or willing to
 * answer. This is the fallback *inside* server.js's llmWhimJudge, not
 * resolveWhim's own bottom-of-the-stack default: tools/simulate.js never
 * attaches any judge at all, so its per-kind chance sliders keep driving
 * the plain WHIM_LEGACY_CHANCE roll in every existing test, untouched.
 * Once a real judge — LLM or this — IS attached, the mayorRedirectChance/
 * recluseRegistersEvil/pacifistSaveChance sliders stop doing anything: a
 * deliberate trade (confirmed with the user), not an oversight. Returns
 * {fire, reason} — same shape a real LLM verdict resolves — so
 * logWhimConfirm has something to show on a high-stakes call even with no
 * LLM in the loop at all.
 */
function heuristicWhim(g, ctx) {
  const living = alive(g);
  const goodAlive = living.filter(p => !isEvil(g, p)).length;
  const evilAlive = living.length - goodAlive;
  const margin = goodAlive - evilAlive; // positive: good is ahead
  const helpsGood = WHIM_FIRING_HELPS_GOOD[ctx.kind] !== false;
  // Fire more often for whichever side firing actually helps, exactly when
  // that side is the one currently behind.
  const sideNeedsHelp = helpsGood ? margin <= 0 : margin >= 0;
  let chance = 0.5; // same baseline this bucket has always defaulted to
  if (sideNeedsHelp) chance *= 1.4;
  if (living.length <= 5) chance *= 1.2; // a whim matters more in the endgame than on night one
  const fire = Math.random() < Math.min(chance, 0.9);
  const trailingSide = sideNeedsHelp ? (helpsGood ? 'good' : 'evil') : null;
  const reason = trailingSide
    ? `${living.length} living (${goodAlive} good, ${evilAlive} evil) — ${trailingSide} is behind, leaning toward helping them.`
    : `${living.length} living (${goodAlive} good, ${evilAlive} evil) — roughly even, close to a coin flip.`;
  return { fire, reason };
}

async function randomKiller(g, pool, excludeId, opts = { demonAttack: true }) {
  const candidates = (pool || []).filter(x => x && x.id !== excludeId);
  if (!candidates.length) return null;
  const picked = candidates.length === 1 ? candidates[0] : dramaticPick(g, candidates);
  // resolveWhim() itself logs the fired decision (both the vague beat and,
  // when the game is close, the richer confirm record) — nothing extra
  // needed here beyond acting on the verdict.
  if (picked.characterId === 'mayor' && !impaired(picked) && await resolveWhim(g, { kind: 'mayor-redirect', target: picked })) {
    const alt = alive(g).filter(x => x.id !== picked.id && x.id !== excludeId && !wouldBlockKill(g, x, opts));
    if (alt.length) return randomKiller(g, alt, excludeId, opts);
  }
  return picked;
}

// "A whim fired" — one shared, deliberately vague line for every hidden
// Math.random() roll a Storyteller-whim setting controls (Mayor redirect,
// Recluse/Spy registration), so the host feels the dice moved without
// learning which knob or which character it was. Kept non-secret (unlike
// the attributed line elsewhere in this file) specifically so it's visible
// live, not just after g.revealed — that's the whole point of surfacing it.
function logWhim(g) {
  logEvent(g, 'A quiet decision was made, unseen.', false);
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

/** True team, no registration ambiguity — every call site that wants a fact
    rather than a judgment (victory checks, vote tallies, the Tea Lady's real
    protection, General's heuristic) uses this and stays synchronous. A
    Recluse/Spy's *registration* is a separate, async question — see
    isEvilRegistration() above — since that's the one case with a real
    Storyteller whim behind it. */
function isEvil(g, p) {
  const c = trueChar(p);
  if (!c) return false;
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

/** Pixie: "if you were mad that you were this character, you gain their
    ability when they die." The dying player here is whoever a Pixie was
    shown at night 1 (`pixieRevealedId`, set in carousel.js's own entry),
    not the Pixie's own death — a cross-cutting check against every death,
    same shape as triggerMoonchildIfNeeded above, not something any one
    character's onDeath could express (onDeath only ever fires for the
    dying player's OWN registry entry). Cerenovus/Mutant's madReasons only
    ever carry a display label (see sv.js's cerenovus entry), not a
    characterId, so the match is by name. */
function triggerPixieIfNeeded(g, deadPlayer) {
  const dead = trueChar(deadPlayer);
  if (!dead) return;
  for (const pixie of g.players) {
    if (!pixie.alive || pixie.characterId !== 'pixie' || pixie.statuses.pixieGainedAbility) continue;
    if (pixie.statuses.pixieRevealedId !== dead.id) continue;
    const revealedName = char(pixie.statuses.pixieRevealedId).name;
    const wasMadAboutIt = (pixie.statuses.madReasons || []).some(r => r.label === revealedName);
    if (!wasMadAboutIt) continue;
    pixie.statuses.pixieGainedAbility = true;
    reassignCharacter(g, pixie, deadPlayer.characterId, { abilityOnly: true });
    logEvent(g, `${pixie.name} (the Pixie) gains the ${revealedName}'s ability.`, true);
  }
}

/** Cannibal: "you have the ability of the recently killed executee" — an
    ability transplant like the Philosopher's, but triggered by ANY
    execution rather than the Cannibal's own choice, so it lives here and is
    called from every execution site in server.js (the main one and the
    Mastermind's bonus day) instead of anywhere in the registry. The
    "poisoned until a good player dies by execution" half deliberately
    never expires at dusk the way ordinary poison does — cured only by
    scanning for it here on every later execution, regardless of who the
    Cannibal happens to be by then. */
function applyCannibalTransform(g, executedPlayer) {
  const executedTrue = trueChar(executedPlayer);
  if (!executedTrue) return;
  if (!isEvil(g, executedPlayer)) {
    for (const c of g.players) {
      if (c.statuses.cannibalPoisoned) {
        delete c.statuses.poisoned;
        delete c.statuses.cannibalPoisoned;
      }
    }
  }
  const cannibal = g.players.find(p => p.alive && p.characterId === 'cannibal');
  if (!cannibal || cannibal.id === executedPlayer.id) return;
  reassignCharacter(g, cannibal, executedTrue.id, { abilityOnly: true });
  if (isEvil(g, executedPlayer)) {
    cannibal.statuses.poisoned = true;
    cannibal.statuses.cannibalPoisoned = true;
  } else {
    delete cannibal.statuses.poisoned;
    delete cannibal.statuses.cannibalPoisoned;
  }
  logEvent(g, `${cannibal.name} (the Cannibal) gains the ${executedTrue.name}'s ability.`, true);
}

function logEvent(g, text, secret = false) {
  // g.phase at call time is the real phase this line happened in — nothing
  // here ever logs a line describing a phase transition before actually
  // making it (startNight() sets phase:'night' before its own "Night N
  // begins" log call; resolveMadness's logEvent calls run from inside
  // startNight() before that flip, so they correctly still read 'day').
  // Lets the client tell a night death apart from a same-round day/lobby
  // event instead of labeling every log line "Night N" regardless.
  g.log.push({ night: g.nightNumber, phase: g.phase, text, secret, at: Date.now() });
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

/** Is a Vortox alive right now — Sects & Violets' "Townsfolk abilities
    yield false info" is gated on this everywhere it's read, matching the
    general rule that a dead character's passive text stops applying unless
    it explicitly says otherwise (see checkVictory's comment on the Mayor
    for the same convention applied to a different character). */
function vortoxActive(g) {
  return alive(g).some(p => p.characterId === 'vortox');
}

/** Did a Minion nominate on the given day — the Town Crier's trigger. */
function minionNominatedToday(g, day) {
  return g.nominations.some(n => {
    if (n.day !== day) return false;
    const nominator = byId(g, n.nominatorId);
    return nominator && trueChar(nominator) && trueChar(nominator).team === 'minion';
  });
}

/** Did a Demon vote on the given day — the Flowergirl's trigger. */
function demonVotedToday(g, day) {
  return g.nominations.some(n => {
    if (n.day !== day) return false;
    return (n.votes || []).some(v => {
      const voter = byId(g, v.playerId);
      return voter && trueChar(voter) && trueChar(voter).team === 'demon';
    });
  });
}

const numberSignal = n => String(n);

// Shared result-shape builders — the client (ResultCard.jsx) uses `kind`
// to give each shape its own visual language (a number badge, a yes/no
// chip, highlighted player names) instead of every info role rendering as
// the same plain sentence-in-a-box. `body` is still the full sentence
// underneath, unchanged — `kind` is purely additive metadata, so any
// ability that doesn't call one of these still works exactly as it always
// has (ResultCard falls back to its original plain-text treatment when
// `kind` is absent). Deliberately not migrating all ~40 info roles at
// once — this covers Trouble Brewing's core three shapes first.
function resultCount(title, count, body) {
  return { title, kind: 'count', count, body };
}
function resultYesNo(title, yes, body) {
  return { title, kind: 'yesno', yes, body };
}
function resultPointer(title, names, body) {
  return { title, kind: 'pointer', names, body };
}

function falseNumber(trueValue, max) {
  const options = [];
  for (let i = 0; i <= max; i++) if (i !== trueValue) options.push(i);
  return pick(options);
}

// Same `pendingDeaths` treatment as livingNeighbors above, for the same
// reason: the Empath acts after the Demon on other nights (order 53 vs.
// 24), so without this her count used a stale pre-kill neighbor snapshot
// whenever the Demon killed one of her actual neighbors earlier that
// night — she'd still be told about a neighbor already dead, instead of
// the real one who'd become adjacent to her by the time she woke.
async function evilNeighbourCount(g, p, pendingDeaths = []) {
  const deadIds = new Set(pendingDeaths.map(d => d.player.id));
  const living = alive(g).filter(x => !deadIds.has(x.id));
  const i = living.indexOf(p);
  if (i === -1) return 0;
  const left = living[(i - 1 + living.length) % living.length];
  const right = living[(i + 1) % living.length];
  let count = 0;
  for (const nb of new Set([left, right])) {
    if (nb !== p && await isEvilRegistration(g, nb)) count++;
  }
  return count;
}

async function evilPairCount(g) {
  const seats = g.players;
  let pairs = 0;
  for (let i = 0; i < seats.length; i++) {
    const a = seats[i];
    const b = seats[(i + 1) % seats.length];
    if (await isEvilRegistration(g, a) && await isEvilRegistration(g, b)) pairs++;
  }
  return pairs;
}

/** Shared by pairInfo's two "no real subject to show" branches below (an
    empty true/registrant pool, or a deliberately wrong answer): name a real
    character of the right team and point at two players, guaranteed to
    exclude everyone in excludeIds — built on excludingPick so neither call
    site can forget to exclude the one player who'd make "wrong" true by
    accident. */
function fabricateWrongPair(g, team, excludeIds) {
  const shownChar = pick(activeScriptPool(g).filter(c => c.team === team));
  const shown = excludingPick(g.players, excludeIds, 2);
  return {
    text: `One of these two players is the ${shownChar.name}.`,
    characterId: shownChar.id,
    players: shown.map(x => x.name),
  };
}

/** "1 of these 2 players is the X" — true version, or a deliberately wrong one. */
async function pairInfo(g, p, team, wrong) {
  const trueMembers = g.players.filter(x => x.id !== p.id && trueChar(x) && trueChar(x).team === team);
  // The Spy (registers as Townsfolk/Outsider/Minion, never Demon) and the
  // Recluse (registers as Outsider/Minion/Demon, never Townsfolk) can also
  // be shown as the "subject" of these reveals — a Storyteller-discretion
  // "might" in the real rules, modeled as a roll like their other effects.
  // A plain .filter() can't await, so this is a for-loop rather than the
  // single expression it reads like everywhere else in this file.
  const registrants = [];
  for (const x of g.players) {
    if (x.id === p.id || trueMembers.includes(x)) continue;
    const c = trueChar(x);
    if (!c) continue;
    // resolveWhim() itself logs each fired decision — no need to also log
    // here, unlike the old inline Math.random() roll this replaced.
    if (c.id === 'spy' && team !== 'demon' && await resolveWhim(g, { kind: 'registration-ambiguity', target: x })) {
      registrants.push(x);
    } else if (c.id === 'recluse' && team !== 'townsfolk' && await resolveWhim(g, { kind: 'registration-ambiguity', target: x })) {
      registrants.push(x);
    }
  }
  const pool = [...trueMembers, ...registrants];
  if (!pool.length) {
    if (!wrong) {
      return { text: `You learn that no ${team} is in play.`, characterId: null, players: [] };
    }
    // Poisoned/drunk: "none in play" is still real information, so it
    // can't be told truthfully either — fabricate a false positive instead.
    return fabricateWrongPair(g, team, [p.id]);
  }
  const subject = pick(pool);
  // A registrant isn't really that role, so a real member of the category
  // gets named instead — the Spy is never announced as "the Spy" here.
  const shownChar = registrants.includes(subject)
    ? pick(activeScriptPool(g).filter(c => c.team === team))
    : trueChar(subject);
  if (!wrong) {
    const decoy = excludingPick(g.players, [p.id, subject.id], 1)[0];
    const shown = shuffle([subject, decoy]);
    return {
      text: `One of these two players is the ${shownChar.name}.`,
      characterId: shownChar.id,
      players: shown.map(x => x.name),
    };
  }
  // Wrong: name a character, point at two players, neither of whom is it.
  return fabricateWrongPair(g, team, [p.id, subject.id]);
}

module.exports = {
  DATA, CHARACTERS, SETUP_TABLE, char, scriptPool, BUCKET4_IDS, activeScriptPool,
  shuffle, pick, take, excludingPick,
  byId, byToken, alive, seatIndex, actingChar, trueChar, impaired, impairedFlip, publiclyAlive,
  livingNeighbors, tealadyProtects, wouldBlockKill, randomKiller, checkKill, isEvil, isEvilRegistration,
  resolveWhim, setWhimJudge, heuristicWhim, triggerMoonchildIfNeeded,
  triggerPixieIfNeeded, applyCannibalTransform,
  reassignCharacter, flagAbnormal,
  logEvent, logWhim, outsiderDiedToday, minionDiedToday, somebodyDiedYesterday,
  minionNominatedToday, demonVotedToday, vortoxActive,
  numberSignal, falseNumber, evilNeighbourCount, evilPairCount, pairInfo,
  resultCount, resultYesNo, resultPointer,
};
