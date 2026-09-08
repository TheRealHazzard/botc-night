'use strict';

const crypto = require('crypto');
const H = require('./helpers');
const { buildRegistry } = require('./abilities');

const {
  DATA, CHARACTERS, SETUP_TABLE, char, scriptPool, BUCKET4_IDS, activeScriptPool,
  shuffle, pick, take,
  byId, byToken, alive, actingChar, trueChar, impaired, publiclyAlive,
  wouldBlockKill, randomKiller, checkKill, isEvil, triggerMoonchildIfNeeded, flagAbnormal,
  triggerPixieIfNeeded, applyCannibalTransform,
  logEvent, outsiderDiedToday, minionDiedToday, somebodyDiedYesterday,
  numberSignal, falseNumber, evilNeighbourCount, evilPairCount, pairInfo,
} = H;

// One registry entry per active character (real night prompt and/or
// resolveNight behavior) — see game/abilities/tb.js and bmr.js. Built once;
// every call below just looks a character up by id instead of touching a
// switch statement plus several parallel by-id maps.
const REGISTRY = buildRegistry(H);
// Exposed back onto the shared helpers object for characters that need to
// know whether some OTHER character is actually "real" (has a registry
// entry, and isn't purely onDeath-reactive) rather than passive/setup-only —
// currently only the Philosopher, whose "gain a good character's ability"
// would be a silent dead end otherwise. Two distinct traps to rule out: a
// character with no registry entry at all (Grandmother, Tea Lady, Fool,
// ...), and one whose only real behavior is an onDeath hook (Sweetheart,
// Klutz). The second matters even though both have a nonzero night order in
// characters.json (the physical Storyteller sheet still wakes that slot to
// check "did they die today") — this engine implements their effect
// entirely via onDeath, which triggerDeathHooks dispatches off a player's
// *true* characterId, never their believedId. resolve(), by contrast, is
// reached through actingTonight()'s order array and so already respects
// whatever the Philosopher currently believes itself to be — gaining an
// onDeath-only ability wouldn't be wired to fire for the Philosopher's own
// death at all. Safe to attach after the fact: every ability module reads
// this as h.isActiveCharacter(...) at call time, well after this module has
// finished loading, never destructured up front.
H.isActiveCharacter = id => !!REGISTRY[id] && !REGISTRY[id].onDeath;

/* ------------------------------------------------------------------ state */

function newGame() {
  return {
    phase: 'lobby',
    script: 'tb',
    nightNumber: 0,
    wave: 0,
    windowEndsAt: null,
    config: {
      windowSeconds: 60,
      wave2Seconds: 20,
      hintNights: [1, 2],      // the dead stop talking after this
      dramaBias: 0.5,          // 0 = coldly random, 1 = maximum tension
      // These *Chance knobs are one of three ways this codebase models an
      // ability that reads like it needs a Storyteller — see
      // ABILITY_PATTERNS.md before adding a new one of any of the three.
      recluseRegistersEvil: 0.5,
      mayorRedirectChance: 0.5, // "might" — Storyteller discretion, standing in as a roll
      shabalothRegurgitateChance: 0.5, // "might" bring back last night's kill
      pacifistSaveChance: 0.5, // "might" save an executed good player
      tinkerDeathChance: 0.1, // "might die at any time" — rolled once per night
      madExecutionChance: 0.3, // Mutant/Cerenovus: "might be executed" for not acting mad enough
      voteWindowSeconds: 20, // how long a nomination stays open for votes
      disabledCharacterIds: [], // Bucket 4 toggle — see BUCKET4_IDS in helpers.js
      llmStorytellerEnabled: false, // see game/llmStoryteller.js
    },
    players: [],
    pending: {},
    results: {},
    deaths: [],
    executedToday: null,
    noExecutionToday: false,
    nominations: [],
    hint: null,
    log: [],
    // Who chose whom, night by night and day by day — kept only for the
    // post-game "power log" table, never surfaced before revealed (see
    // publicState). Info-only abilities (Empath, Chef, ...) don't appear
    // here at all; only real "choose a player" moments do.
    actionLog: [],
    revealed: false,
    pendingReclaims: [],
    historyRecorded: false, // guards against writing the same completed game twice
    exorcistBlockedId: null, // who the Exorcist targeted the Demon as, tonight only
    goonFlippedTonight: false, // has the Goon already been targeted once tonight?
    mastermindExtraDay: false, // the exposed Demon was executed — one more day is played
    evilTwinGoodExecuted: false, // the Evil Twin's good Twin was executed — evil wins
    fangGuTransformUsed: false, // the 1st Outsider a Fang Gu kills becomes the new Fang Gu instead — once per game
  };
}

/* ------------------------------------------------------------------ setup */

function dealRoles(g) {
  const n = g.players.length;
  const table = SETUP_TABLE[String(n)];
  if (!table) throw new Error(`No setup defined for ${n} players (need 5-15).`);

  const pool = activeScriptPool(g);
  const of = team => pool.filter(c => c.team === team);

  let counts = { ...table };

  const demons = take(of('demon'), counts.demon);
  const minions = take(of('minion'), counts.minion);

  // Baron: [+2 Outsiders]
  if (minions.some(c => c.id === 'baron')) {
    counts.outsider += 2;
    counts.townsfolk -= 2;
  }
  // Godfather: [-1 or +1 Outsider] — no Storyteller here to choose, so it's
  // a coin flip, clamped so the outsider count can't go negative.
  if (minions.some(c => c.id === 'godfather')) {
    const delta = Math.random() < 0.5 ? 1 : -1;
    const newOutsiders = Math.max(0, counts.outsider + delta);
    const actualDelta = newOutsiders - counts.outsider;
    counts.outsider = newOutsiders;
    counts.townsfolk -= actualDelta;
  }
  // Fang Gu: [+1 Outsider] — flat and deterministic, no coin flip needed.
  if (demons.some(c => c.id === 'fanggu')) {
    counts.outsider += 1;
    counts.townsfolk -= 1;
  }
  // Vigormortis: [-1 Outsider], clamped the same way Godfather's delta is.
  if (demons.some(c => c.id === 'vigormortis')) {
    const newOutsiders = Math.max(0, counts.outsider - 1);
    counts.townsfolk += (counts.outsider - newOutsiders);
    counts.outsider = newOutsiders;
  }

  const outsiders = take(of('outsider'), counts.outsider);
  const townsfolk = take(of('townsfolk'), counts.townsfolk);

  const bag = shuffle([...demons, ...minions, ...outsiders, ...townsfolk]);
  const seats = shuffle(g.players);

  seats.forEach((p, i) => {
    const c = bag[i];
    p.characterId = c.id;
    p.believedId = c.id;
    p.alive = true;
    p.statuses = {};
  });

  // The Drunk thinks they are a Townsfolk who is not really in play.
  const drunkPlayer = g.players.find(p => p.characterId === 'drunk');
  if (drunkPlayer) {
    const inPlay = new Set(g.players.map(p => p.characterId));
    const candidates = of('townsfolk').filter(c => !inPlay.has(c.id));
    if (candidates.length) drunkPlayer.believedId = pick(candidates).id;
  }

  // Fortune Teller's red herring: one good player always registers as the Demon.
  if (g.players.some(p => p.believedId === 'fortuneteller')) {
    const good = g.players.filter(p => !isEvil(g, p));
    if (good.length) pick(good).statuses.redHerring = true;
  }

  // Grandmother: linked to one other actually-good player at setup.
  const grandmother = g.players.find(p => p.characterId === 'grandmother');
  if (grandmother) {
    const candidates = g.players.filter(p => p.id !== grandmother.id && !isEvil(g, p));
    if (candidates.length) grandmother.statuses.grandchildId = pick(candidates).id;
  }

  // Lunatic: believes they're the real demon in this game (never actually
  // in the bag as one — they're dealt from the Outsider pool above).
  const lunatic = g.players.find(p => p.characterId === 'lunatic');
  const realDemon = g.players.find(p => trueChar(p) && trueChar(p).team === 'demon');
  if (lunatic && realDemon) lunatic.believedId = realDemon.characterId;

  // Marionette: same "believes something false" shape as the Lunatic just
  // above, except a random good Townsfolk/Outsider rather than specifically
  // the Demon. deliverOpeningInfo tells the real Demon who they are.
  const marionette = g.players.find(p => p.characterId === 'marionette');
  if (marionette) {
    const goodPool = of('townsfolk').concat(of('outsider'));
    if (goodPool.length) marionette.believedId = pick(goodPool).id;
  }

  // Evil Twin: linked to one good player at setup — which one is Storyteller
  // whim in the physical game (Bucket 1 in ABILITY_PATTERNS.md, no ground
  // truth to get right), so a random pick, same spirit as the Godfather's
  // setup coin flip above. Stored both directions: `twinId` is who the Evil
  // Twin themselves points to; `evilTwinId` on the good player is what
  // server.js's execution handling and checkVictory read.
  const evilTwin = g.players.find(p => p.characterId === 'eviltwin');
  if (evilTwin) {
    const candidates = g.players.filter(p => p.id !== evilTwin.id && !isEvil(g, p));
    if (candidates.length) {
      const twin = pick(candidates);
      evilTwin.statuses.twinId = twin.id;
      twin.statuses.evilTwinId = evilTwin.id;
    }
  }

  // Mutant: permanently "mad" about being an Outsider, for the rest of the
  // game — not granted by another character's ability (unlike Cerenovus's
  // targeted madness below), so it's set once here rather than flagged via
  // onDeath/resolve. See resolveMadness for what "mad" actually does.
  const mutant = g.players.find(p => p.characterId === 'mutant');
  if (mutant) {
    mutant.statuses.madReasons = [{ label: 'an Outsider', expiresAfterCheck: false }];
  }

  // Puzzlemaster: "1 player is drunk, even if you die" — a real, permanent
  // impairment (reusing the Drunk's own `drunk` status, with no expiry, so
  // impaired() picks it up everywhere for free), not merely a fact to guess.
  // `g.puzzlemasterDrunkId` is who it landed on — carousel.js's puzzlemaster
  // entry is the only thing that ever reads it, since the drunk player
  // themself is never told.
  const puzzlemaster = g.players.find(p => p.characterId === 'puzzlemaster');
  if (puzzlemaster) {
    const candidates = g.players.filter(p => p.id !== puzzlemaster.id);
    if (candidates.length) {
      const drunkOne = pick(candidates);
      drunkOne.statuses.drunk = true;
      g.puzzlemasterDrunkId = drunkOne.id;
    }
  }

  g.phase = 'reveal';
  logEvent(g, `Roles dealt to ${n} players.`);
}

/* ------------------------------------------------- night: who acts, when */

function actingTonight(g) {
  const first = g.nightNumber === 1;
  const entries = [];

  for (const p of g.players) {
    // Two dead players still act: the Ravenkeeper, once, the night they die;
    // a Minion Vigormortis killed, every night thereafter — "keeps their
    // ability" is permanent, not a one-time epilogue.
    const actsFromBeyond = (first === false && p.believedId === 'ravenkeeper') || p.statuses.vigormortisKept;
    if (!p.alive && !actsFromBeyond) continue;
    const c = actingChar(p);
    if (!c) continue;
    const order = first ? c.firstNightOrder : c.otherNightOrder;
    if (!order) continue;
    entries.push({ player: p, character: c, order });
  }

  return entries.sort((a, b) => a.order - b.order);
}

/** Which wave a character's own turn falls in — only the Ravenkeeper (acts
    from beyond, after wave 1 has already decided who died) is wave 2. */
function waveFor(characterId) {
  const entry = REGISTRY[characterId];
  return (entry && entry.wave) || 1;
}

const DECOY_LINES = [
  'The dark asks something of you. Choose a player.',
  'Something is listening. Point to someone.',
  'Name a player. Do not explain why.',
  'Choose a player. You will not be told what happens.',
];

/** A prompt every living player receives, so nobody's silence marks them out. */
function decoyPrompt(g, p) {
  const others = alive(g).filter(x => x.id !== p.id);
  if (!others.length) return null;
  const seed = `${p.id}:${g.nightNumber}:${g.wave}`;
  const idx = crypto.createHash('sha256').update(seed).digest()[0] % DECOY_LINES.length;
  return {
    decoy: true,
    characterId: null,
    count: 1,
    text: DECOY_LINES[idx],
    targets: others.map(t => ({ id: t.id, name: t.name, color: t.color || null, alive: t.alive })),
  };
}

/** What this player is asked to do. Non-actors get a decoy of the same shape.
    Everything character-specific comes from REGISTRY[c.id] — see
    game/abilities/README.md for the shape each entry provides. A character
    absent from the registry (every passive/reactive-only one — Tea Lady,
    Fool, Mayor, Grandmother's own turn beyond night 1, etc.) always falls
    through to a decoy, exactly like never appearing in the old CHOICE_CHARS
    map did. */
function promptFor(g, p) {
  // Sects & Violets' Barber: a wave-2-only prompt for whichever player is
  // currently the Demon, offered once the Barber has died today or tonight
  // (see game/abilities/sv.js's onDeath, which sets barberSwapPending on
  // the Demon the instant that happens). Checked before anything
  // character-based below, because the acting player here is never the
  // Barber's own (dead) player — the registry's per-character dispatch has
  // no way to express "this player's death changes what a DIFFERENT
  // player is asked," so this stays a named exception, same spirit as the
  // Lunatic/Exorcist-block/Goon-flip cases in resolveNight below.
  if (g.wave === 2 && p.alive && p.statuses.barberSwapPending && trueChar(p) && trueChar(p).team === 'demon') {
    const targets = alive(g).filter(x => x.id === p.id || !trueChar(x) || trueChar(x).team !== 'demon');
    return {
      decoy: false,
      characterId: 'barber-swap',
      count: 2,
      optional: true,
      text: 'The Barber died. Choose 2 players (not another Demon) to swap characters, or pass.',
      targets: targets.map(t => ({ id: t.id, name: t.name, color: t.color || null, alive: t.alive })),
    };
  }

  const c = actingChar(p);
  if (!c || !p.alive) {
    // The Ravenkeeper acts from beyond once, the night they die. A Minion
    // Vigormortis killed keeps acting every night after — see actingTonight.
    if (!((p.believedId === 'ravenkeeper' && p.statuses.diedTonight && g.wave === 2) || p.statuses.vigormortisKept)) return null;
  }
  const first = g.nightNumber === 1;
  const order = c ? (first ? c.firstNightOrder : c.otherNightOrder) : 0;
  const entry = c && REGISTRY[c.id];

  if (!entry) return p.alive ? decoyPrompt(g, p) : null;

  const need = entry.choiceCount(g, p, H);
  // Once-per-game abilities stop being offered once actually used — passing
  // never counts as using it (see each character's resolve(), which only
  // sets these flags on a real choice, never on a pass).
  const usedUp = entry.usesOnceFlag && p.statuses[`${c.id}Used`];
  const extra = entry.extraPrompt ? entry.extraPrompt(g, p, H) : null;
  // Usually "is there a real choice" just means a nonzero player-target
  // count. The Philosopher is the one exception: it picks a character with
  // no player target at all (choiceCount 0), so a guessCharacter-only
  // extraPrompt counts as something to do in its own right — otherwise
  // !!need alone would always force it to a decoy, the same trap Gossip
  // sidesteps by not using a night prompt at all.
  const hasSomethingToDo = !!need || !!(extra && extra.guessCharacter);

  const acts =
    hasSomethingToDo &&
    !!order &&
    waveFor(c.id) === g.wave &&
    !usedUp &&
    (entry.acts ? entry.acts(g, p, H) : true);

  if (!acts) return p.alive ? decoyPrompt(g, p) : null;

  const targets = entry.targets(g, p, H);
  const text = entry.text(g, p, H);

  return {
    decoy: false,
    characterId: c.id,
    count: need,
    optional: entry.optional ? entry.optional(g, p, H) : false,
    text,
    targets: targets.map(t => ({ id: t.id, name: t.name, color: t.color || null, alive: t.alive })),
    ...extra,
  };
}

/**
 * First night only: evil learns each other, the Demon gets bluffs, and a
 * handful of good-team info roles learn their one-time setup info. The
 * Grandmother/Godfather info isn't gated by the small-game exception below
 * — that exception is specifically "evil doesn't learn each other in a
 * 5-6 player game," not a general rule about first-night information.
 */
function deliverOpeningInfo(g, results) {
  if (g.nightNumber !== 1) return;

  const grandmother = g.players.find(p => p.characterId === 'grandmother' && p.alive);
  if (grandmother) {
    let subject = g.players.find(x => x.id === grandmother.statuses.grandchildId);
    let shown = subject && trueChar(subject);
    if (impaired(grandmother) || !subject) {
      subject = pick(g.players.filter(x => x.id !== grandmother.id));
      shown = pick(activeScriptPool(g));
    }
    results[grandmother.id] = { title: 'Grandmother', body: `${subject.name} is your grandchild — the ${shown.name}.` };
  }

  const godfather = g.players.find(p => p.characterId === 'godfather' && p.alive);
  if (godfather) {
    let outsiders = g.players.filter(x => trueChar(x) && trueChar(x).team === 'outsider').map(x => x.name);
    if (impaired(godfather)) outsiders = take(g.players, outsiders.length).map(x => x.name);
    results[godfather.id] = {
      title: 'Godfather',
      body: outsiders.length ? `In play: ${outsiders.join(', ')}.` : 'No Outsiders are in play.',
    };
  }

  const demon = g.players.find(p => trueChar(p) && trueChar(p).team === 'demon');
  const lunatic = g.players.find(p => p.characterId === 'lunatic');
  if (demon && lunatic) {
    results[demon.id] = results[demon.id] || { title: 'Your Minions', body: '' };
    results[demon.id].body +=
      `${results[demon.id].body ? ' ' : ''}${lunatic.name} is the Lunatic — they believe they are you, ` +
      `and will point at players tonight with no real effect.`;
  }

  if (g.players.length < 7) return; // with 6 or fewer, evil stays in the dark
  if (!demon) return;

  // Magician: "The Demon thinks you are a Minion. Minions think you are a
  // Demon." — a real Magician replaces the true Demon's name in what the
  // Minions are told (not shown alongside it — they only ever get the one,
  // wrong, name) and is added to what the Demon is told about their
  // Minions. A script with no Magician in play is untouched by either half.
  const magician = g.players.find(p => p.characterId === 'magician');
  // Damsel: "All Minions know you are in play" — every Minion's own opening
  // briefing below gets a line naming her outright, unconditional on
  // anything (this is what /api/damsel-guess later gives a Minion the
  // chance to act on).
  const damsel = g.players.find(p => p.characterId === 'damsel');
  // Marionette: "The Demon knows who you are" — the reciprocal half of her
  // dealRoles setup above, same shape as the Lunatic's own line to the
  // Demon a few lines up.
  const marionette = g.players.find(p => p.characterId === 'marionette');

  const minions = g.players.filter(p => trueChar(p) && trueChar(p).team === 'minion');
  for (const m of minions) {
    results[m.id] = {
      title: 'Your allies',
      body: `${magician ? magician.name : demon.name} is the Demon.` + (damsel ? ` ${damsel.name} is the Damsel.` : ''),
      names: minions.filter(x => x.id !== m.id).map(x => `${x.name} — fellow Minion`),
    };
  }

  const inPlay = new Set(g.players.map(p => p.characterId));
  const bluffPool = activeScriptPool(g).filter(
    c => !inPlay.has(c.id) && (c.team === 'townsfolk' || c.team === 'outsider')
  );
  const bluffs = take(bluffPool, 3).map(c => c.name);

  results[demon.id] = {
    title: 'Your Minions',
    body: (minions.length ? `${minions.map(m => m.name).join(', ')} serve you.` : 'You act alone.') +
      (magician ? ` ${magician.name} also appears to be a Minion.` : '') +
      (marionette ? ` ${marionette.name} is the Marionette.` : '') +
      (results[demon.id] ? ` ${results[demon.id].body}` : ''),
    names: bluffs.map(b => `${b} — not in play`),
  };
}

/**
 * Every death-reactive effect keyed off *this player's own* true character —
 * Moonchild (any script) plus Sects & Violets' Sage/Sweetheart/Klutz — in
 * one place, so a death from execution, the Slayer's shot, or a night kill
 * all trigger the same way. `results` is optional (server.js's day-time
 * death sites don't have a results object mid-turn to write into the way
 * resolveNight does; Sage is the only one of these that needs it, and Sage
 * can only ever trigger from a night kill anyway, since only the Demon
 * kills at night).
 */
function triggerDeathHooks(g, player, { killedByDemon = false, results } = {}) {
  triggerMoonchildIfNeeded(g, player);
  triggerPixieIfNeeded(g, player);
  const entry = REGISTRY[player.characterId];
  if (entry && entry.onDeath) {
    entry.onDeath(g, player, { killedByDemon, results: results || g.results });
  }
}

/**
 * Resolve one wave of the night. Wave 2 exists only for abilities that depend
 * on what wave 1 did (the Ravenkeeper dying), so it must not re-run the night:
 * re-resolving would wipe `diedTonight` and recompute every info role's answer.
 */
function resolveNight(g, wave = 1) {
  const order = actingTonight(g).filter(e => waveFor(e.character.id) === wave);
  const results = {};

  if (wave === 1) {
    deliverOpeningInfo(g, results);

    // Reset per-night markers
    for (const p of g.players) {
      delete p.statuses.protected;
      delete p.statuses.diedTonight;
      delete p.statuses.executionImmune; // Devil's Advocate's protection covered only yesterday's execution
      delete p.statuses.witchCursed; // the Witch's curse only ever covers the single day right after it's cast
    }
    g.exorcistBlockedId = null;
    g.goonFlippedTonight = false;
    g.abnormalTonight = new Set(); // the Mathematician's count, flagged via flagAbnormal()
    // Poison, and drunk-until-dusk (Sailor/Innkeeper/Courtier), wear off at
    // dusk of the following day.
    for (const p of g.players) {
      if (p.statuses.poisonedUntilNight && p.statuses.poisonedUntilNight < g.nightNumber) {
        delete p.statuses.poisoned;
        delete p.statuses.poisonedUntilNight;
      }
      if (p.statuses.drunkUntilNight && p.statuses.drunkUntilNight < g.nightNumber) {
        delete p.statuses.drunk;
        delete p.statuses.drunkUntilNight;
      }
    }
  }

  const deaths = [];

  for (const { player: p, character: c } of order) {
    const submitted = g.pending[p.id];
    // A decoy submission is never allowed to drive a real ability.
    const action = submitted && !submitted.decoy ? submitted : null;
    const broken = impaired(p);
    const target = ids => (ids || []).map(id => byId(g, id)).filter(Boolean);

    // The Lunatic's *believed* character is deliberately set to the real
    // demon's, so their prompt looks identical to a real demon's — but
    // dispatching on believed character would run their fake choice through
    // the actual kill logic below, genuinely murdering whoever they "target"
    // and doubling the kill rate. True character must win here, always. This
    // is the one deliberate exception to dispatching by believed character,
    // so it stays a named special case rather than a registry entry.
    if (p.characterId === 'lunatic') {
      const chosen = target(action && action.targets);
      if (chosen.length) {
        const names = chosen.map(x => x.name).join(' and ');
        const demon = g.players.find(x => trueChar(x) && trueChar(x).team === 'demon');
        if (demon) {
          results[demon.id] = results[demon.id] || { title: 'Your Minions', body: '' };
          results[demon.id].body += ` The Lunatic pointed at ${names} tonight.`;
        }
        logEvent(g, `Lunatic (believing themselves the demon) pointed at ${names} — no real effect.`, true);
      }
      continue;
    }

    // The Exorcist's previous action (processed earlier this same night,
    // since it wakes before the Demon) marked the true Demon as blocked.
    // Cross-cutting (applies to whichever demon character is in the
    // script), so it stays here rather than in any one character's resolve.
    if (g.exorcistBlockedId === p.id && trueChar(p) && trueChar(p).team === 'demon') {
      logEvent(g, `${p.name} is blocked by the Exorcist and does not act tonight.`, true);
      continue;
    }

    // The Goon: the first character (by night order, hence checked freshly
    // on every acting player) to actually target them tonight makes them
    // drunk until dusk, and — if that chooser is evil — flips them evil for
    // the rest of the game. Reactive to *any* other character's action, so
    // it stays here rather than needing its own turn (Goon never acts).
    if (action && !g.goonFlippedTonight) {
      const goon = alive(g).find(x => x.characterId === 'goon' && x.id !== p.id);
      if (goon && target(action.targets).some(x => x.id === goon.id)) {
        g.goonFlippedTonight = true;
        goon.statuses.drunk = true;
        goon.statuses.drunkUntilNight = g.nightNumber;
        if (isEvil(g, p)) {
          goon.statuses.goonEvil = true;
          logEvent(g, `${goon.name} (the Goon) is drunk until dusk, and turns evil.`, true);
        } else {
          logEvent(g, `${goon.name} (the Goon) is drunk until dusk.`, true);
        }
      }
    }

    // The power log records the raw choice, not whether it actually landed
    // — a blocked kill still shows who was aimed at. Only real "choose a
    // player" abilities appear here (choiceCount > 0); pure information
    // roles (Empath, Chef, ...) never had a target to record in the first
    // place.
    const entry = REGISTRY[c.id];
    if (entry && entry.choiceCount(g, p, H) && action && action.targets && action.targets.length) {
      const names = target(action.targets).map(t => t.name);
      if (names.length) {
        g.actionLog.push({
          night: g.nightNumber, phase: 'night',
          playerId: p.id, playerName: p.name, characterId: c.id, characterName: c.name,
          targets: names,
        });
      }
    }

    if (entry) {
      entry.resolve(g, p, action, { broken, target, deaths, results, order });
    }
  }

  // Grandmother: dies the moment the Demon kills her linked grandchild —
  // specifically the Demon, not execution or any other cause. Checked after
  // the main loop so it sees every demon kill decided tonight, from
  // whichever demon character is actually in the script. Keyed off
  // killedByDemon rather than the cause string — cause has separately been
  // reused for UI categorization and specific-mechanism identification
  // (see ABILITY_PATTERNS.md-adjacent history: a Minion's kill reusing
  // 'demon' here is exactly the bug killedByDemon exists to prevent).
  for (const d of [...deaths]) {
    if (!d.killedByDemon) continue;
    const gm = alive(g).find(x => x.statuses.grandchildId === d.player.id);
    if (gm && !deaths.some(x => x.player.id === gm.id)) {
      deaths.push({ player: gm, cause: 'grandmother-link', killedByDemon: false });
      logEvent(g, `${gm.name} (Grandmother) dies alongside their grandchild.`, true);
    }
  }

  // Tinker: pure Storyteller discretion, "might die at any time" — modeled,
  // like Mayor's redirect and Recluse's registration, as a per-night roll.
  if (wave === 1) {
    for (const tinker of alive(g).filter(x => x.characterId === 'tinker')) {
      if (!impaired(tinker) && Math.random() < g.config.tinkerDeathChance) {
        const blocked = checkKill(g, tinker, {});
        if (!blocked) deaths.push({ player: tinker, cause: 'tinker', killedByDemon: false });
      }
    }
  }

  // Lycanthrope: "they are the only player that can die tonight" — checked
  // last, after every other death this wave (a night kill, Grandmother's
  // link, Tinker's roll) has already been decided, and discards all of them
  // the moment a real Lycanthrope kill landed — order-independent by
  // construction, since carousel.js's own entry only ever decides whether
  // ITS OWN kill happens, never anyone else's.
  const lycanthropeKill = deaths.find(d => d.cause === 'lycanthrope');
  if (lycanthropeKill) deaths.splice(0, deaths.length, lycanthropeKill);

  // Apply deaths
  for (const d of deaths) {
    d.player.alive = false;
    d.player.statuses.diedTonight = true;
    delete d.player.statuses.appearsDead; // no longer just appearing dead — this one's real
    g.deaths.push({ night: g.nightNumber, name: d.player.name, cause: d.cause, killedByDemon: !!d.killedByDemon });
    logEvent(g, `${d.player.name} died in the night (${d.cause}).`, true);
    triggerDeathHooks(g, d.player, { killedByDemon: !!d.killedByDemon, results });
    if (!d.skipSuccession) succeedDemon(g, d.player);
  }

  // Sects & Violets' Barber: the wave-2 swap itself (see promptFor's
  // synthetic 'barber-swap' prompt above, and needsWaveTwo). Not part of
  // the per-character loop at the top of this function — the acting
  // player here is the Demon, not the Barber, so there's no registry
  // entry whose own turn this could be.
  if (wave === 2) {
    for (const demon of alive(g).filter(x => x.statuses.barberSwapPending)) {
      demon.statuses.barberSwapPending = false; // one-shot, whether or not they chose anyone
      const submitted = g.pending[demon.id];
      const action = submitted && !submitted.decoy ? submitted : null;
      const chosen = ((action && action.targets) || []).map(id => byId(g, id)).filter(Boolean);
      if (chosen.length === 2 && !impaired(demon)) {
        const [a, b] = chosen;
        const aId = a.characterId, bId = b.characterId;
        a.characterId = bId; a.believedId = bId;
        b.characterId = aId; b.believedId = aId;
        flagAbnormal(g, a);
        flagAbnormal(g, b);
        logEvent(g, `Barber's death lets the Demon swap ${a.name} and ${b.name}'s characters.`, true);
      }
    }
  }

  Object.assign(g.results, results);
  g.pending = {};
  return { deaths: deaths.map(d => d.player) };
}

/**
 * Scarlet Woman's succession, called after any confirmed demon death from
 * ANY cause — execution during the day, or a future night-kill mechanic
 * that isn't the Imp's own self-targeted star-pass (which already names its
 * own heir and must not also trigger this, or two players become the Imp
 * at once).
 */
function succeedDemon(g, deadPlayer) {
  const deadChar = trueChar(deadPlayer);
  if (!deadChar || deadChar.team !== 'demon') return;
  // The official ruling counts the Demon among the "5 or more players alive"
  // at the moment just before they die — this function always runs after
  // deadPlayer.alive is already false, so that's 4 or more *others* still
  // standing, not 5. Was requiring 5 others (6 including the demon), which
  // wrongly denied a legitimate succession in exactly a 5-player game.
  if (alive(g).length < 4) return;
  const sw = alive(g).find(x => x.characterId === 'scarletwoman');
  if (!sw) return;
  sw.characterId = 'imp';
  sw.believedId = 'imp';
  g.results[sw.id] = { title: 'You are the Imp', body: 'The Demon has fallen. You take its place.' };
  logEvent(g, 'Scarlet Woman became the Imp.', true);
}

/** The Mastermind's bonus day has just ended (an execution happened, or
    didn't) — this decides the game, replacing the normal "no living Demon"
    win condition for this one day only. */
function resolveMastermindDay(g, executedPlayer) {
  if (!executedPlayer) return { winner: 'evil', reason: "The Mastermind's bonus day passed with no execution." };
  const c = trueChar(executedPlayer);
  const good = c && (c.team === 'townsfolk' || c.team === 'outsider');
  return good
    ? { winner: 'evil', reason: "The Mastermind's bonus day: a good player was executed." }
    : { winner: 'good', reason: "The Mastermind's bonus day: an evil player was executed." };
}

/**
 * Sects & Violets' "madness" (Mutant's permanent one, Cerenovus's one-day
 * one): if a mad player didn't publicly claim it today, they might be
 * executed outright, bypassing the normal nomination process entirely.
 * There's no ground truth to "did they act mad enough" — it's pure
 * Storyteller whim, the same bucket as the Mayor's redirect or the
 * Pacifist's save (see ABILITY_PATTERNS.md) — so it's a config-driven roll,
 * checked once at dusk, right before the night that follows begins (see
 * server.js's startNight). Reasons flagged `expiresAfterCheck` (Cerenovus's)
 * are cleared after one check either way; Mutant's own isn't, since it's
 * permanent for the rest of the game.
 */
function resolveMadness(g) {
  for (const p of alive(g)) {
    if (!p.statuses.madReasons || !p.statuses.madReasons.length) continue;
    if (!p.statuses.madClaimedToday && Math.random() < g.config.madExecutionChance) {
      const blocked = checkKill(g, p, { executionAttack: true });
      if (blocked) {
        logEvent(g, `${p.name} didn't act mad enough and should have been executed, but survives (${blocked}).`);
      } else {
        p.alive = false;
        g.deaths.push({ night: g.nightNumber, name: p.name, cause: 'madness', killedByDemon: false });
        logEvent(g, `${p.name} didn't act mad enough and is executed for it.`);
        triggerDeathHooks(g, p, { killedByDemon: false });
        succeedDemon(g, p);
      }
    }
    p.statuses.madReasons = p.statuses.madReasons.filter(r => !r.expiresAfterCheck);
    p.statuses.madClaimedToday = false;
  }
}

/** Sects & Violets' Savant: "learn 2 things in private: 1 is true & 1 is
    false" — the closest this app gets to "the Storyteller tells you
    something," since there's no human to ask. Fully computable (Bucket 2 in
    ABILITY_PATTERNS.md), so it's built from the same "name a player's
    character" fact every reveal in this game already uses, not anything
    open-ended — two statements about two players, exactly one true, shown
    in random order so which is which isn't given away by position. */
function buildSavantStatements(g, p) {
  const others = g.players.filter(x => x.id !== p.id);
  const subject = pick(others);
  const trueText = `${subject.name} is the ${trueChar(subject).name}.`;
  const otherSubjects = others.filter(x => x.id !== subject.id);
  const falseSubject = otherSubjects.length ? pick(otherSubjects) : subject;
  const wrongPool = activeScriptPool(g).filter(c => c.id !== trueChar(falseSubject).id);
  const falseText = `${falseSubject.name} is the ${pick(wrongPool).name}.`;
  return shuffle([trueText, falseText]);
}

/**
 * Shared ground-truth checker for the "structured claim" pattern (Bucket 3
 * in ABILITY_PATTERNS.md) — a menu of claim shapes built from vocabulary the
 * engine already understands (a player, a team, a character), replacing an
 * open-ended real-world question with something deterministic. Used by both
 * the Gossip's daily claim and Sects & Violets' Artist's once-per-game
 * question — they apply impairment to the result differently (the Gossip's
 * claim is forced false; the Artist's answer is randomized, matching every
 * other yes/no reveal), so this only ever returns the raw ground truth,
 * never adjusted for either. Returns `{ error }` for a malformed claim,
 * else `{ isTrue }`.
 */
function evaluateClaim(g, body) {
  if (body.claimType === 'team') {
    const target = byId(g, body.targetId);
    if (!target) return { error: 'Invalid target.' };
    if (!['good', 'evil'].includes(body.claimValue)) return { error: 'Invalid claim.' };
    return { isTrue: isEvil(g, target, { forRegistration: true }) === (body.claimValue === 'evil') };
  }
  if (body.claimType === 'character') {
    const target = byId(g, body.targetId);
    if (!target) return { error: 'Invalid target.' };
    if (!activeScriptPool(g).some(c => c.id === body.claimValue)) return { error: 'Invalid claim.' };
    return { isTrue: target.characterId === body.claimValue };
  }
  if (body.claimType === 'atleast') {
    if (!['good', 'evil'].includes(body.claimValue)) return { error: 'Invalid claim.' };
    const ids = Array.isArray(body.targetIds) ? [...new Set(body.targetIds)] : [];
    const targets = ids.map(id => byId(g, id)).filter(Boolean);
    if (targets.length < 2 || targets.length !== ids.length) return { error: 'Choose at least two distinct players.' };
    const threshold = Number(body.threshold);
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > targets.length) {
      return { error: 'Invalid threshold.' };
    }
    const matchCount = targets.filter(t => isEvil(g, t, { forRegistration: true }) === (body.claimValue === 'evil')).length;
    return { isTrue: matchCount >= threshold };
  }
  return { error: 'Invalid claim type.' };
}

/**
 * The redacted ground-truth snapshot an LLM Storyteller is allowed to see,
 * for judging a free-text Gossip claim or Artist question (game/llmStoryteller.js)
 * — deliberately scoped to exactly what evaluateClaim() above is already
 * allowed to look at, nothing wider, so a free-text claim can never be "about"
 * more than the structured menu could ever expose: per-player name and true
 * character, registration-aware team (isEvil(..., {forRegistration:true}),
 * matching evaluateClaim's own semantics — not literal trueChar().team, so a
 * misregistering Recluse/Spy reads the same way to a free-text claim as it
 * does to a structured one), and public alive status (a faked-dead Zombuul
 * reads as dead, matching what the table could truthfully claim). Nothing
 * from p.statuses (poison/drunk/protection internals), no night-order or
 * ability-text detail. Pure and synchronous — isEvil()'s Recluse/Spy branch
 * rolls Math.random() internally, so this must be called exactly once per
 * request and its result reused, never recomputed mid-request.
 */
function buildStorytellerContext(g) {
  return g.players.map(p => ({
    name: p.name,
    character: trueChar(p) ? trueChar(p).name : null,
    team: isEvil(g, p, { forRegistration: true }) ? 'evil' : 'good',
    alive: publiclyAlive(p),
  }));
}

/**
 * Table-side tuning (`/api/table/config`, server.js) validated and clamped
 * here rather than left as a raw Object.assign — known scalar knobs are
 * coerced to number and clamped to a sane range; `hintNights` is checked as
 * an array of night numbers 1-3; `disabledCharacterIds` (Bucket 4, see
 * BUCKET4_IDS in helpers.js) and `llmStorytellerEnabled` are validated on
 * their own terms, not treated as arbitrary scalars. Any other key in the
 * patch is silently ignored — this endpoint has never validated anything
 * before, so tightening it now can't break an existing caller.
 */
function applyConfigPatch(g, patch) {
  if (!patch || typeof patch !== 'object') return;

  const clampedChance = key => {
    if (!(key in patch)) return;
    const n = Number(patch[key]);
    if (Number.isFinite(n)) g.config[key] = Math.max(0, Math.min(1, n));
  };
  const clampedSeconds = key => {
    if (!(key in patch)) return;
    const n = Number(patch[key]);
    if (Number.isFinite(n)) g.config[key] = Math.max(5, Math.min(600, Math.round(n)));
  };

  ['recluseRegistersEvil', 'mayorRedirectChance', 'shabalothRegurgitateChance',
    'pacifistSaveChance', 'tinkerDeathChance', 'madExecutionChance', 'dramaBias']
    .forEach(clampedChance);
  ['windowSeconds', 'wave2Seconds', 'voteWindowSeconds'].forEach(clampedSeconds);

  if ('hintNights' in patch) {
    const nights = Array.isArray(patch.hintNights)
      ? [...new Set(patch.hintNights.map(Number))].filter(n => Number.isInteger(n) && n >= 1 && n <= 3)
      : null;
    if (nights) g.config.hintNights = nights.sort((a, b) => a - b);
  }

  // Bucket 4 — lobby-only, same gate script selection itself already uses,
  // since changing the roster mid-game makes no sense once roles are dealt.
  if ('disabledCharacterIds' in patch && g.phase === 'lobby') {
    const ids = Array.isArray(patch.disabledCharacterIds)
      ? patch.disabledCharacterIds.filter(id => BUCKET4_IDS.includes(id))
      : [];
    g.config.disabledCharacterIds = ids;
  }

  if ('llmStorytellerEnabled' in patch) {
    g.config.llmStorytellerEnabled = !!patch.llmStorytellerEnabled;
  }
}

/**
 * Which nominee (if any) the town actually executes today, from every
 * *closed* nomination's already-final `yesCount` (the Butler exclusion is
 * baked in there at close time — this just applies the real majority rule:
 * strictly more than half of the living, and a tie at the qualifying top
 * means no execution, same as an in-person vote would).
 */
function resolveDayVote(g) {
  const today = g.nominations.filter(n => n.day === g.nightNumber && n.closed);
  if (!today.length) return null;
  const threshold = Math.floor(alive(g).length / 2) + 1;
  const qualifying = today.filter(n => (n.yesCount || 0) >= threshold);
  if (!qualifying.length) return null;
  const max = Math.max(...qualifying.map(n => n.yesCount));
  const top = qualifying.filter(n => n.yesCount === max);
  if (top.length !== 1) return null;
  return top[0].nomineeId;
}

/** Does anyone need a second window tonight? Either the Ravenkeeper died in
    wave 1, or the Barber did (today's execution, or tonight in wave 1) and
    flagged the Demon via barberSwapPending — see promptFor and the wave-2
    step in resolveNight. */
function needsWaveTwo(g) {
  return g.players.some(p => p.believedId === 'ravenkeeper' && p.statuses.diedTonight) ||
    g.players.some(p => p.statuses.barberSwapPending);
}

/** The whole game's own numbers — safe to show only once revealed, same as
    character/team, since it's built from who voted which way and who
    actually used their ghost vote. Mirrors history.js's votingLeaderboard()
    rule (a good voter is "correct" voting yes on evil or no on good,
    abstaining never counts against them) but against live player objects,
    so it looks players up by id rather than by name. */
function gameSummary(g) {
  const closedNoms = g.nominations.filter(n => n.closed);
  let correct = 0, totalVotes = 0;
  closedNoms.forEach(n => {
    const nominee = byId(g, n.nomineeId);
    const nomineeEvil = nominee && isEvil(g, nominee);
    (n.votes || []).forEach(v => {
      if (v.vote !== 'yes' && v.vote !== 'no') return;
      const voter = byId(g, v.playerId);
      if (!voter || isEvil(g, voter)) return;
      totalVotes++;
      if ((v.vote === 'yes') === !!nomineeEvil) correct++;
    });
  });

  const dead = g.players.filter(p => !p.alive);

  let longestSurvivingEvil = null;
  g.players.filter(p => isEvil(g, p)).forEach(p => {
    const death = g.deaths.find(d => d.name === p.name);
    const night = death ? death.night : g.nightNumber;
    if (!longestSurvivingEvil || night > longestSurvivingEvil.night ||
        (night === longestSurvivingEvil.night && !death && longestSurvivingEvil.survived === false)) {
      longestSurvivingEvil = { name: p.name, night, survived: !death };
    }
  });

  return {
    nominations: closedNoms.length,
    totalVotes,
    voteAccuracy: totalVotes ? correct / totalVotes : null,
    ghostVotesUsed: dead.filter(p => p.ghostVoteUsed).length,
    ghostVotesEligible: dead.length,
    longestSurvivingEvil,
  };
}

/** Sects & Violets' Evil Twin: "Good cannot win while you both live" — a
    blanket block on any good-favoring verdict, checked at each point
    checkVictory would otherwise hand good the win. Lifts the moment either
    twin dies, from whichever side — including via the OTHER Evil Twin rule
    just below, which fires from the good twin's own death. */
function evilTwinBlocksGood(g) {
  return g.players.some(p =>
    p.alive && p.characterId === 'eviltwin' && p.statuses.twinId &&
    (() => { const twin = byId(g, p.statuses.twinId); return twin && twin.alive; })()
  );
}

/* ------------------------------------------------------------ victory */

/** Returns null while the game is still alive, else {winner, reason}. */
function checkVictory(g) {
  const result = checkVictoryRaw(g);
  // Politician: the real rule is a PERSONAL win-while-your-team-still-loses
  // exception for "whoever was most responsible for the loss" — this
  // engine's victory model is team-wide only, so this is simplified to
  // flipping the whole team's fate instead, and "most responsible" is
  // dropped entirely (merely being in the game is enough — "even if dead"
  // is in the card text, so no alive/impaired check either, unlike almost
  // everything else here). A deliberate reduction, not a full translation,
  // same spirit as Sailor/Innkeeper's coin-flip standing in for a
  // Storyteller's judgment call.
  if (result && result.winner === 'evil' && g.players.some(p => p.characterId === 'politician')) {
    return { winner: 'good', reason: `${result.reason} But the Politician turns it around.` };
  }
  return result;
}

function checkVictoryRaw(g) {
  if (g.phase === 'lobby' || g.phase === 'reveal') return null;

  const living = alive(g);
  const demonAlive = living.some(p => trueChar(p) && trueChar(p).team === 'demon');

  if (!demonAlive) {
    // Mastermind: an executed, unreplaced Demon doesn't end the game on its
    // own — one more day is played first. server.js sets this flag the
    // instant it notices the condition, in the same call that would
    // otherwise have ended the game here, and resolves the bonus day itself
    // (a distinct win condition, not "no living Demon") via
    // resolveMastermindDay before ever calling checkVictory again.
    if (g.mastermindExtraDay) return null;
    if (evilTwinBlocksGood(g)) return null;
    return { winner: 'good', reason: 'The Demon is dead.' };
  }
  if (living.length <= 2) {
    return { winner: 'evil', reason: 'Only the Demon and one other remain.' };
  }
  if (g.saintExecuted) {
    return { winner: 'evil', reason: 'The Saint was executed.' };
  }
  if (g.evilTwinGoodExecuted) {
    return { winner: 'evil', reason: "The Evil Twin's twin was executed." };
  }
  // Vortox: "each day, if no-one is executed, evil wins" — like the Mayor's
  // rule below, only while Vortox is actually alive to claim it (no card
  // here says "even if dead"). Checked before the Mayor's own no-execution
  // rule: the rare case where both could apply at once (3 living, Vortox
  // AND a Mayor both alive, no execution) has no official tie-break I know
  // of, and favoring the Demon's own win condition over the Mayor's
  // corner-case rule felt like the safer default.
  if (g.noExecutionToday && living.some(x => x.characterId === 'vortox')) {
    return { winner: 'evil', reason: 'No one was executed, and the Vortox lives.' };
  }
  // "If only 3 players live & no execution occurs, your team wins" — reads
  // as conditional on the Mayor still being alive to claim it, matching the
  // general rule that a dead character's passive text stops applying unless
  // it explicitly says otherwise (Recluse, Spy, and Saint all say "even if
  // dead"; Mayor doesn't).
  const mayor = living.find(x => x.characterId === 'mayor');
  if (mayor && living.length === 3 && g.noExecutionToday && !evilTwinBlocksGood(g)) {
    return { winner: 'good', reason: 'Only 3 remain, no one was executed, and the Mayor still lives.' };
  }
  return null;
}

/* --------------------------------------------------------------- hints */

function generateHint(g) {
  if (!g.config.hintNights.includes(g.nightNumber)) return null;

  const living = alive(g);
  const evilAlive = living.filter(p => isEvil(g, p)).length;
  const deadCount = g.players.length - living.length;

  const candidates = [];

  const evilPairs = evilPairCount(g);
  if (evilPairs > 0) {
    candidates.push('Two who sit shoulder to shoulder share a secret. Neither will say so.');
  } else {
    candidates.push('The wicked sit apart tonight. They planned it that way.');
  }

  if (deadCount > 0) {
    candidates.push(`We are ${deadCount} now, and we hear everything. One of you lied before the sun rose.`);
  }

  if (evilAlive >= 2) {
    candidates.push('More than one hand moved in the dark last night.');
  }

  const poisoned = g.players.find(p => p.statuses.poisoned);
  if (poisoned) {
    candidates.push('One of you was told something untrue, and believed it completely.');
  }

  return pick(candidates);
}

/* -------------------------------------------------------------- views */

/** What the central screen may know. Deliberately contains no roles. */
function publicState(g) {
  return {
    phase: g.phase,
    nightNumber: g.nightNumber,
    wave: g.wave,
    windowEndsAt: g.windowEndsAt,
    script: g.script,
    hint: g.hint,
    config: g.config,
    revealed: g.revealed,
    simulation: !!g.simulation,
    paused: !!g.paused,
    victory: g.victory || null,
    mastermindExtraDay: !!g.mastermindExtraDay,
    // Names only — never the token a reclaim ultimately hands out.
    pendingReclaims: (g.pendingReclaims || [])
      .filter(r => r.status === 'pending')
      .map(r => ({ requestId: r.requestId, name: r.name })),
    players: g.players.map(p => ({
      id: p.id,
      name: p.name,
      // A Zombuul who has faked their death is genuinely still alive (they
      // keep acting as the demon), but every public-facing view — the ring,
      // ghost votes, everyone's eyes at the table — must show them as dead,
      // which is the entire point of the ability.
      alive: publiclyAlive(p),
      connected: !!p.connected,
      submitted: !!g.pending[p.id],
      // Who has spent their ghost vote — and their chosen color — are both
      // public knowledge already (shown on the login picker); neither is a
      // role or a secret.
      ghostVoteUsed: !!p.ghostVoteUsed,
      color: p.color || null,
      ...(g.revealed ? {
        character: trueChar(p) && trueChar(p).name,
        characterId: p.characterId,
        team: trueChar(p) && trueChar(p).team,
      } : {}),
    })),
    deaths: g.deaths,
    // Nominations, who voted, and their outcome are never secret at a real
    // table — everyone in the room already sees all of this happen.
    nominations: g.nominations,
    log: g.revealed ? g.log : g.log.filter(l => !l.secret),
    gameSummary: g.revealed ? gameSummary(g) : null,
    actionLog: g.revealed ? g.actionLog : [],
  };
}

/** What one player may know: themselves, and nothing else. */
function privateState(g, playerId) {
  const p = byId(g, playerId);
  if (!p) return null;
  const c = actingChar(p);
  return {
    you: {
      id: p.id,
      name: p.name,
      alive: p.alive,
      ghostVoteUsed: !!p.ghostVoteUsed,
      color: p.color || null,
      character: c ? { id: c.id, name: c.name, team: c.team, ability: c.ability } : null,
    },
    // A phone watching a bot's seat needs to know it's a read-only preview,
    // not a real game it's now part of.
    simulation: !!g.simulation,
    watching: !!p.bot,
    phase: g.phase,
    nightNumber: g.nightNumber,
    wave: g.wave,
    windowEndsAt: g.windowEndsAt,
    prompt: g.phase === 'night' ? promptFor(g, p) : null,
    submitted: !!g.pending[p.id],
    result: g.results[p.id] || null,
    // Shown based on *believed* character, same as everything else — a
    // Drunk who thinks they're the Slayer gets the button too, and simply
    // finds out (or rather, never finds out) that it does nothing.
    slayerShot: (g.phase === 'day' && c && c.id === 'slayer' && !p.statuses.slayerUsed)
      ? { targets: g.players.filter(x => x.id !== p.id && publiclyAlive(x)).map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: true })) }
      : null,
    // Sects & Violets' Juggler: "on your 1st day" — day one only, once ever,
    // via /api/juggler-guess. That night's reveal of how many were correct
    // is a normal registry entry, not part of this.
    jugglerGuess: (g.phase === 'day' && c && c.id === 'juggler' && g.nightNumber === 1 && !p.statuses.jugglerUsed)
      ? {
          targets: g.players.filter(x => x.id !== p.id && publiclyAlive(x)).map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: true })),
          characterOptions: activeScriptPool(g).map(x => ({ id: x.id, name: x.name })),
        }
      : null,
    // "Each day, you MAY" — once per day, never once per game, and never
    // told whether it was true (that's only ever revealed by tonight's
    // prompt existing at all, same indirect leak Godfather's conditional
    // prompt already has). Any player, living or dead, is a fair claim
    // target — a claim about someone already dead is still a real read.
    gossipClaim: (g.phase === 'day' && c && c.id === 'gossip' && p.statuses.gossipClaimDay !== g.nightNumber)
      ? {
          targets: g.players.map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: x.alive })),
          characterOptions: activeScriptPool(g).map(x => ({ id: x.id, name: x.name })),
        }
      : null,
    // Sects & Violets' Savant: "each day, you may" — a plain once-a-day
    // tap, no target of any kind; the two statements land in `result` like
    // any other reveal, via /api/savant-visit.
    savantVisit: (g.phase === 'day' && c && c.id === 'savant' && p.statuses.savantVisitDay !== g.nightNumber)
      ? true : null,
    // Sects & Violets' Artist: once per game, the same structured-claim menu
    // Gossip's claim uses (see evaluateClaim in engine.js) — but answered
    // immediately and privately via /api/artist-question, with no public
    // claim and no waiting to see if it comes true.
    artistQuestion: (g.phase === 'day' && c && c.id === 'artist' && !p.statuses.artistUsed)
      ? {
          targets: g.players.map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: x.alive })),
          characterOptions: activeScriptPool(g).map(x => ({ id: x.id, name: x.name })),
        }
      : null,
    // Sects & Violets' Mutant/Cerenovus "madness" — see resolveMadness.
    // `madReasons` can hold more than one simultaneously (a rare overlap of
    // both sources); one shared claim covers all of them for the day.
    madClaim: (g.phase === 'day' && p.statuses.madReasons && p.statuses.madReasons.length && !p.statuses.madClaimedToday)
      ? { label: p.statuses.madReasons.map(r => r.label).join(' or ') }
      : null,
    // Acts from beyond, same as the Ravenkeeper — offered once, the first
    // time this player ever dies, in whatever phase that happens to be.
    moonchildChoice: p.statuses.moonchildPending
      ? { targets: g.players.filter(x => x.id !== p.id && publiclyAlive(x)).map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: true })) }
      : null,
    // Sects & Violets' Klutz: same "acts from beyond, the moment they learn
    // they died" shape as the Moonchild above, but the choice ends the game
    // outright if it lands on someone evil, instead of killing anyone — see
    // /api/klutz-choice.
    klutzChoice: p.statuses.klutzPending
      ? { targets: g.players.filter(x => x.id !== p.id && publiclyAlive(x)).map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: true })) }
      : null,
    // Deliberately no live tally here — the running count is a shared
    // TV/host-only read of the room, same as everyone watching hands go up
    // together. A player's own phone only ever needs to know about the
    // nomination they can still act on, not how anyone else voted.
    voteRequest: currentVoteRequest(g, p),
  };
}

/** The single currently-open nomination this player can still act on, or
    null — dead once their one ghost vote is already spent (mechanically
    real: uses true `p.alive`, not public perception, so a secretly-alive
    Zombuul votes as themselves, not as a ghost). */
function currentVoteRequest(g, p) {
  if (g.phase !== 'day') return null;
  const nom = g.nominations.find(n => n.day === g.nightNumber && !n.closed);
  if (!nom) return null;
  const isGhostVote = !p.alive;
  if (isGhostVote && p.ghostVoteUsed) return null;
  return {
    nominationId: nom.id,
    nomineeName: nom.nomineeName,
    windowEndsAt: nom.windowEndsAt,
    isGhostVote,
    alreadyVoted: nom.votes.some(v => v.playerId === p.id),
  };
}

module.exports = {
  DATA, CHARACTERS, SETUP_TABLE, char, scriptPool,
  newGame, byId, byToken, alive, dealRoles,
  actingTonight, promptFor, resolveNight, needsWaveTwo,
  generateHint, logEvent, publicState, privateState,
  checkVictory, succeedDemon, trueChar, impaired,
  checkKill, wouldBlockKill, publiclyAlive, randomKiller,
  isEvil, minionDiedToday, triggerMoonchildIfNeeded, triggerDeathHooks, resolveMastermindDay,
  resolveDayVote, gameSummary, resolveMadness, buildSavantStatements, evaluateClaim,
  activeScriptPool, applyConfigPatch, buildStorytellerContext, BUCKET4_IDS,
  applyCannibalTransform,
};
