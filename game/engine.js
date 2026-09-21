'use strict';

const crypto = require('crypto');
const H = require('./helpers');
const { buildRegistry } = require('./abilities');

const {
  DATA, CHARACTERS, SETUP_TABLE, char, scriptPool, BUCKET4_IDS, activeScriptPool,
  shuffle, pick, take, excludingPick,
  byId, byToken, alive, actingChar, trueChar, impaired, impairedFlip, publiclyAlive,
  wouldBlockKill, randomKiller, checkKill, isEvil, isEvilRegistration, resolveWhim, setWhimJudge,
  heuristicWhim, maybeMercy, triggerMoonchildIfNeeded, flagAbnormal,
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
    // A caller-supplied character-id list, dealt instead of a named
    // edition's own roster (see activeScriptPool in helpers.js) — null
    // whenever the table's playing an actual meta.editions script, same as
    // most tables always will be. Set alongside script:'custom'.
    customRoster: null,
    nightNumber: 0,
    wave: 0,
    windowEndsAt: null,
    // The Read — when today's day phase actually began (server.js's
    // endNight() sets this), so the host client can judge pacing (see
    // client/src/host/hooks/useRoomPacing.js) purely from elapsed real
    // time, without polling. Host-only: never in privateState(), since a
    // player doesn't need a pacing nudge, only the host does.
    dayStartedAt: null,
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
      voteWindowSeconds: 30, // how long a nomination stays open for votes
      disabledCharacterIds: [], // Bucket 4 toggle — see BUCKET4_IDS in helpers.js
      llmStorytellerEnabled: false, // see game/llmStoryteller.js
    },
    players: [],
    pending: {},
    // The live delivery slot for whatever a player's own client should
    // currently be showing — reset to {} every startNight() (see
    // server.js), because it's only ever meant to hold "this night's"
    // results. That reset is also why it can't be the durable record of
    // what someone was actually told: by the time anyone notices a result
    // never rendered, the night that produced it is long gone. resultsLog
    // below is the fix — flushNightResults() (server.js) snapshots this
    // object into it right before every reset, and again at game-over for
    // whatever the final night left behind, so nothing in here is ever
    // lost even though this object itself is deliberately ephemeral.
    results: {},
    resultsLog: [],
    deaths: [],
    executedToday: null,
    noExecutionToday: false,
    executionAttemptedToday: false, // at most one execution per day, including a blocked/survived one
    nominations: [],
    hint: null,
    log: [],
    // Who chose whom, night by night and day by day — kept only for the
    // post-game "power log" table, never surfaced before revealed (see
    // publicState). Info-only abilities (Empath, Chef, ...) don't appear
    // here at all; only real "choose a player" moments do.
    actionLog: [],
    // The Confirm — host-facing, advisory-only records of a whim decision
    // (see resolveWhim/logWhimConfirm in helpers.js) close enough to the
    // game's outcome to be worth surfacing live, not just after reveal.
    whimConfirmations: [],
    // The Mercy — at most once ever per game (see maybeMercy in helpers.js).
    mercyUsed: false,
    // The Bluff — a rare, deliberately meaningless flicker rolled in
    // server.js (never derived from any real game fact — see
    // client/src/hooks/useBluffBeat.js), visible to the host and every
    // player alike, unlike everything else The Whim's family surfaces.
    bluffBeatAt: null,
    // Whoever took the first seat this game (server.js's /api/join) — with
    // no designated Storyteller, someone at the table needs a way to run
    // the game without walking up to the host screen. Keyed to a player
    // id, not a token/connection, so it survives that player reconnecting
    // or reclaiming their seat; only ever reassigned by a fresh newGame()
    // or an emptied lobby (see /api/table/clear-lobby), never mid-game.
    leaderId: null,
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

  // Every Outsider-count modifier below shares one clamp: never past what
  // this script's own Outsider pool can actually supply, and never below
  // zero. A small-pool script (a Teensyville with only 2 Outsiders on the
  // sheet, say) hitting Baron's usual +2 is exactly the real rule too —
  // the printed sheet for one of TPI's own recommended Teensyville scripts
  // spells this out explicitly: Baron only adds as many as the script
  // actually has. Whatever the pool can't cover just doesn't move, rather
  // than dealRoles() coming up short of players later.
  const outsiderPoolSize = of('outsider').length;
  const adjustOutsiders = wanted => {
    const clampedTotal = Math.max(0, Math.min(outsiderPoolSize, counts.outsider + wanted));
    const delta = clampedTotal - counts.outsider;
    counts.outsider += delta;
    counts.townsfolk -= delta;
  };

  // Baron: [+2 Outsiders]
  if (minions.some(c => c.id === 'baron')) adjustOutsiders(2);
  // Godfather: [-1 or +1 Outsider] — no Storyteller here to choose, so it's
  // a coin flip.
  if (minions.some(c => c.id === 'godfather')) adjustOutsiders(Math.random() < 0.5 ? 1 : -1);
  // Fang Gu: [+1 Outsider] — flat and deterministic, no coin flip needed.
  if (demons.some(c => c.id === 'fanggu')) adjustOutsiders(1);
  // Vigormortis: [-1 Outsider]
  if (demons.some(c => c.id === 'vigormortis')) adjustOutsiders(-1);

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
    // Having a night-order slot at all isn't the same as actually waking
    // tonight — Godfather (needs an Outsider executed today), Zombuul
    // (needs nobody to have died yesterday), and any other conditionally-
    // triggered character all keep their order number on nights they sit
    // out, same as promptFor's own `acts` check already accounts for
    // (search REGISTRY[c.id].acts there) — Chambermaid's "how many woke"
    // count has to respect the same gate, or it overcounts a character on
    // exactly the nights they didn't actually act.
    const entry = REGISTRY[c.id];
    if (entry && entry.acts && !entry.acts(g, p, H)) continue;
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
      // Wrong, not silent — and the fabricated subject has to exclude the
      // real grandchild specifically, or an impaired reveal can coincide
      // with the truth by chance (this predates excludingPick/impairedFlip
      // and was never retrofitted when those were added).
      subject = excludingPick(g.players, [grandmother.id, grandmother.statuses.grandchildId], 1)[0];
      shown = pick(activeScriptPool(g));
    }
    results[grandmother.id] = { title: 'Grandmother', body: `${subject.name} is your grandchild — the ${shown.name}.` };
  }

  const godfather = g.players.find(p => p.characterId === 'godfather' && p.alive);
  if (godfather) {
    const trueOutsiders = g.players.filter(x => trueChar(x) && trueChar(x).team === 'outsider');
    let outsiders = trueOutsiders.map(x => x.name);
    if (impaired(godfather)) {
      // Wrong, not silent — the old version reused the TRUE count via
      // take(g.players, outsiders.length), which meant a table with 0
      // real Outsiders (a common SETUP_TABLE case) always fell through to
      // the same "No Outsiders are in play" the truth is, 100% of the
      // time, exactly when poisoning the Godfather should matter most.
      // Draw the fake set from non-Outsiders only, with a nonzero count
      // even when the truth is 0, so the reveal can never coincide with it.
      const fakeCount = trueOutsiders.length || (1 + Math.floor(Math.random() * 2));
      outsiders = excludingPick(g.players, [...trueOutsiders.map(x => x.id), godfather.id], fakeCount).map(x => x.name);
    }
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

  // King: "The Demon knows you are the King" — a passive reveal, same
  // shape and same ungated-by-small-game-exception treatment as the
  // Lunatic's own line just above (this isn't "evil learns each other,"
  // it's "the Demon is told about one specific other character").
  const king = g.players.find(p => p.characterId === 'king');
  if (demon && king) {
    results[demon.id] = results[demon.id] || { title: 'Your Minions', body: '' };
    results[demon.id].body += `${results[demon.id].body ? ' ' : ''}${king.name} is the King.`;
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
  const inPlay = new Set(g.players.map(p => p.characterId));
  const bluffPool = activeScriptPool(g).filter(
    c => !inPlay.has(c.id) && (c.team === 'townsfolk' || c.team === 'outsider')
  );
  // Snitch: "Each Minion gets 3 bluffs" — the same not-in-play-character
  // briefing the Demon gets below, rolled independently per Minion (each
  // one genuinely doesn't know the others').
  const snitch = g.players.find(p => p.characterId === 'snitch');
  for (const m of minions) {
    results[m.id] = {
      title: 'Your allies',
      body: `${magician ? magician.name : demon.name} is the Demon.` + (damsel ? ` ${damsel.name} is the Damsel.` : ''),
      names: minions.filter(x => x.id !== m.id).map(x => `${x.name} — fellow Minion`),
    };
    if (snitch) {
      const ownBluffs = take(bluffPool, 3).map(c => c.name);
      results[m.id].names.push(...ownBluffs.map(b => `${b} — not in play`));
    }
  }

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
async function resolveNight(g, wave = 1) {
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
    // A player killed earlier THIS SAME night (by an earlier character in
    // tonight's order — the Demon, typically) never wakes for their own
    // later turn, same as the real rules — but p.alive itself isn't
    // flipped to false until the "Apply deaths" step below (a kill only
    // takes effect once everyone's turn tonight has run, so death-order
    // interactions like Grandmother's link can see every kill decided
    // tonight). Checking `deaths` directly is the only way to see
    // "already dead, just not yet applied" at this point in the loop. The
    // Ravenkeeper's own "acts even though they just died" exception is a
    // real rule too, but it's handled entirely by its own wave-2 slot (a
    // separate resolveNight call with its own order/deaths), not here.
    if (deaths.some(d => d.player.id === p.id)) continue;

    const submitted = g.pending[p.id];
    // A decoy submission is never allowed to drive a real ability.
    const action = submitted && !submitted.decoy ? submitted : null;
    const broken = impaired(p);
    // The Mercy — checked for every acting player, every night, but a cheap
    // no-op for anyone not both impaired and eligible (see maybeMercy's own
    // early-outs), so this needs no per-character wiring anywhere else:
    // every info role's resolve() already treats `broken` as "show wrong
    // info," and mercied quietly cancels just that, for this one player,
    // this one time, this one game.
    const mercied = broken && await maybeMercy(g, p);
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
    // drunk until dusk, and they become that chooser's alignment. "Each
    // night" — this re-evaluates every night, not a one-way ratchet, so a
    // later night's good chooser has to flip a previously-evil Goon back to
    // good, not just leave goonEvil stuck true forever. Reactive to *any*
    // other character's action, so it stays here rather than needing its
    // own turn (Goon never acts).
    if (action && !g.goonFlippedTonight) {
      const goon = alive(g).find(x => x.characterId === 'goon' && x.id !== p.id);
      if (goon && target(action.targets).some(x => x.id === goon.id)) {
        g.goonFlippedTonight = true;
        goon.statuses.drunk = true;
        goon.statuses.drunkUntilNight = g.nightNumber;
        goon.statuses.goonEvil = isEvil(g, p);
        logEvent(g, `${goon.name} (the Goon) is drunk until dusk, and turns ${goon.statuses.goonEvil ? 'evil' : 'good'}.`, true);
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
      // await works fine here whether a given character's resolve() is
      // sync or async — only the handful that actually need a whim
      // decision (randomKiller/isEvilRegistration/pairInfo) are async; the
      // rest just resolve on the next microtask tick, same net effect.
      // `broken && !mercied` here, not `broken`, is The Mercy's entire
      // mechanism — see maybeMercy's own comment in helpers.js.
      await entry.resolve(g, p, action, { broken: broken && !mercied, target, deaths, results, order });
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
        // A real death happening tonight — Innkeeper's protection is
        // attacker-agnostic and has to apply here too (nightKill, not
        // demonAttack, since this isn't the Demon and shouldn't also
        // grant Soldier's Demon-only immunity).
        const blocked = checkKill(g, tinker, { nightKill: true });
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
    // phase: every death recorded here comes from resolveNight itself, so
    // it's always a real night death — server.js's day-phase death sites
    // (execution, Slayer, Moonchild, ...) stamp their own phase directly,
    // since server.js's recordGameHistory() reads this back to label a
    // player's outcome and used to infer it from `cause` alone, which
    // mislabeled every non-execution day death (Slayer, Virgin, Witch,
    // Golem) as a night death.
    g.deaths.push({ night: g.nightNumber, name: d.player.name, cause: d.cause, killedByDemon: !!d.killedByDemon, phase: 'night' });
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
  // "You become the Demon" — not specifically the Imp, which used to be
  // hardcoded here on the assumption the only Demon around was ever the
  // Imp. Several playable scripts (last-rites, minotaurs-labyrinth,
  // boozling, ...) pair Scarlet Woman with Shabaloth/Po/Fang Gu instead —
  // last-rites doesn't even include the Imp on its sheet.
  sw.characterId = deadChar.id;
  sw.believedId = deadChar.id;
  g.results[sw.id] = { title: `You are the ${deadChar.name}`, body: 'The Demon has fallen. You take its place.' };
  logEvent(g, `Scarlet Woman became the ${deadChar.name}.`, true);
}

/** The Mastermind's bonus day has just ended (an execution happened, or
    didn't) — this decides the game, replacing the normal "no living Demon"
    win condition for this one day only. */
function resolveMastermindDay(g, executedPlayer) {
  // The ability only reverses the outcome "if a player is THEN executed" —
  // no execution (or one that's blocked and kills no one) never triggers
  // that, so good's win from killing the Demon simply stands.
  if (!executedPlayer) return { winner: 'good', reason: "The Mastermind's bonus day passed with no execution." };
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
        // A real execution in every sense but who called for it — everything
        // server.js's own execution branch does once a kill actually lands
        // has to happen here too, or Vortox/Mayor (keyed on noExecutionToday),
        // Saint, Evil Twin, and the Cannibal all silently miss it.
        const tc = trueChar(p);
        p.alive = false;
        g.noExecutionToday = false;
        if (tc && tc.id === 'saint') g.saintExecuted = true;
        if (p.statuses.evilTwinId) g.evilTwinGoodExecuted = true;
        g.deaths.push({ night: g.nightNumber, name: p.name, cause: 'madness', killedByDemon: false, phase: 'day' });
        logEvent(g, `${p.name} didn't act mad enough and is executed for it.`);
        triggerDeathHooks(g, p, { killedByDemon: false });
        applyCannibalTransform(g, p);
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
function buildSavantStatements(g, p, { broken = false } = {}) {
  const others = g.players.filter(x => x.id !== p.id);
  const [a, b] = others.length >= 2 ? take(others, 2) : [pick(others), pick(others)];
  const statementFor = (subject, tellTruth) => {
    if (tellTruth) return `${subject.name} is the ${trueChar(subject).name}.`;
    const wrongPool = activeScriptPool(g).filter(c => c.id !== trueChar(subject).id);
    return `${subject.name} is the ${pick(wrongPool).name}.`;
  };
  // Sober: the card's own guarantee, exactly one true and one false.
  if (!broken) return shuffle([statementFor(a, true), statementFor(b, false)]);
  // Poisoned/drunk: the one-true-one-false guarantee is itself real
  // information, so it can't hold — each statement is independently a coin
  // flip instead, same "wrong, not silent" doctrine every other impaired
  // info role follows (the Savant still visits and still gets two
  // statements, just not ones that reliably split true/false).
  return [statementFor(a, Math.random() < 0.5), statementFor(b, Math.random() < 0.5)];
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
async function evaluateClaim(g, body) {
  if (body.claimType === 'team') {
    const target = byId(g, body.targetId);
    if (!target) return { error: 'Invalid target.' };
    if (!['good', 'evil'].includes(body.claimValue)) return { error: 'Invalid claim.' };
    return { isTrue: await isEvilRegistration(g, target) === (body.claimValue === 'evil') };
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
    // A plain .filter() can't await — count matches with a for-loop instead.
    let matchCount = 0;
    for (const t of targets) {
      if (await isEvilRegistration(g, t) === (body.claimValue === 'evil')) matchCount++;
    }
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
 * character, registration-aware team (isEvilRegistration(), matching
 * evaluateClaim's own semantics — not literal trueChar().team, so a
 * misregistering Recluse/Spy reads the same way to a free-text claim as it
 * does to a structured one), and public alive status (a faked-dead Zombuul
 * reads as dead, matching what the table could truthfully claim). Nothing
 * from p.statuses (poison/drunk/protection internals), no night-order or
 * ability-text detail. Async now (isEvilRegistration() may await a real
 * Storyteller-whim judgment, not just roll Math.random()) — still must be
 * called exactly once per request and its result reused, never recomputed
 * mid-request, since each call is its own independent decision.
 */
async function buildStorytellerContext(g) {
  const out = [];
  for (const p of g.players) {
    out.push({
      name: p.name,
      character: trueChar(p) ? trueChar(p).name : null,
      team: await isEvilRegistration(g, p) ? 'evil' : 'good',
      alive: publiclyAlive(p),
    });
  }
  return out;
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
 * at least half of the living, rounded up — and a tie at the qualifying top
 * means no execution, same as an in-person vote would). Math.ceil(n/2), not
 * floor(n/2)+1 — the two only agree when the living count is odd; for an
 * even count (e.g. 10 alive) the real threshold is 5, not 6.
 */
function resolveDayVote(g) {
  const today = g.nominations.filter(n => n.day === g.nightNumber && n.closed);
  if (!today.length) return null;
  const threshold = Math.ceil(alive(g).length / 2);
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

/**
 * Politician: the real rule is a PERSONAL win-while-your-team-still-loses
 * exception for "whoever was most responsible for the loss" — this engine's
 * victory model is team-wide only, so this is simplified to flipping the
 * whole team's fate instead, and "most responsible" is dropped entirely
 * (merely being in the game is enough — "even if dead" is in the card
 * text, so no alive/impaired check either, unlike almost everything else
 * here). A deliberate reduction, not a full translation, same spirit as
 * Sailor/Innkeeper's coin-flip standing in for a Storyteller's judgment
 * call.
 *
 * Pulled out to its own function, not inlined into checkVictory, because
 * checkVictory isn't the only place a raw win/loss result gets decided —
 * the Mastermind's bonus day and the Klutz's/Damsel's instant-evil-win
 * routes (all in server.js) each build their own {winner, reason} outside
 * checkVictoryRaw entirely and need the same flip applied before it
 * becomes game.victory, or a Politician in one of those games silently
 * never gets their turn.
 */
function applyPoliticianFlip(g, result) {
  if (result && result.winner === 'evil' && g.players.some(p => p.characterId === 'politician')) {
    return { winner: 'good', reason: `${result.reason} But the Politician turns it around.` };
  }
  return result;
}

/** Returns null while the game is still alive, else {winner, reason}. */
function checkVictory(g) {
  return applyPoliticianFlip(g, checkVictoryRaw(g));
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
  // rule below, only while Vortox is actually alive AND unimpaired to claim
  // it (poisoned/drunk means the ability doesn't function at all, same as
  // any other character's — a passive/automatic win condition is no
  // exception, matching randomKiller's own Mayor-redirect check elsewhere
  // in this codebase, which already gates on !impaired for the same
  // reason). Checked before the Mayor's own no-execution rule: the rare
  // case where both could apply at once (3 living, Vortox AND a Mayor both
  // alive, no execution) has no official tie-break I know of, and favoring
  // the Demon's own win condition over the Mayor's corner-case rule felt
  // like the safer default.
  if (g.noExecutionToday && living.some(x => x.characterId === 'vortox' && !impaired(x))) {
    return { winner: 'evil', reason: 'No one was executed, and the Vortox lives.' };
  }
  // "If only 3 players live & no execution occurs, your team wins" — reads
  // as conditional on the Mayor still being alive to claim it, matching the
  // general rule that a dead character's passive text stops applying unless
  // it explicitly says otherwise (Recluse, Spy, and Saint all say "even if
  // dead"; Mayor doesn't) — and, same as Vortox above, conditional on not
  // being impaired, since a poisoned/drunk Mayor's ability doesn't function
  // either.
  const mayor = living.find(x => x.characterId === 'mayor');
  if (mayor && !impaired(mayor) && living.length === 3 && g.noExecutionToday && !evilTwinBlocksGood(g)) {
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
    dayStartedAt: g.dayStartedAt,
    script: g.script,
    hint: g.hint,
    config: g.config,
    // The official Townsfolk/Outsider/Minion/Demon split for however many
    // are seated right now — Baron/Fang Gu/Godfather/Vigormortis can still
    // shift Outsiders once roles are actually dealt (see dealRoles), so
    // this is the base ratio before any in-play modifier, not a promise of
    // the exact post-deal split. Null outside the valid 5-15 range (no
    // table entry) rather than a misleading guess.
    setupRatio: SETUP_TABLE[String(g.players.length)] || null,
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
    // Same reveal gate as actionLog — every info role's actual result,
    // night by night, for exactly the situation that prompted this: a
    // result that never rendered on someone's phone used to be
    // unrecoverable the moment the next night reset g.results. Empty pre-
    // reveal for the same reason actionLog is: this is exactly what
    // Bucket-4-style true-character info looks like, not something a
    // still-playing table should be able to read.
    resultsLog: g.revealed ? g.resultsLog : [],
    // The Confirm — unlike resultsLog/actionLog's all-or-nothing reveal
    // gate, this needs to stay usable *during* play (a host-facing card in
    // the moment is the whole point), so only the two fields that could
    // name a character or ability (`kind`, `reason`) are withheld
    // pre-reveal — helpsGood/livingCount/goodAlive/evilAlive are already
    // publicly-observable aggregate facts, safe to show live.
    whimConfirmations: g.whimConfirmations.map(w => (g.revealed ? w : {
      night: w.night, fired: w.fired, helpsGood: w.helpsGood,
      livingCount: w.livingCount, goodAlive: w.goodAlive, evilAlive: w.evilAlive, at: w.at,
    })),
    // The Bluff — unlike everything else above, safe to show exactly as-is
    // at every stage of the game, revealed or not: it's a bare timestamp
    // that never encoded anything about who's evil or what happened.
    bluffBeatAt: g.bluffBeatAt,
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
    // Not sensitive (the same value is already fetchable, unauthenticated,
    // via /api/script) — exposed here specifically so the client's script
    // overlay can tell a stale cached roster (from a previous game on a
    // different script, same browser session) apart from a fresh one.
    script: g.script,
    nightNumber: g.nightNumber,
    wave: g.wave,
    windowEndsAt: g.windowEndsAt,
    // The Bluff — the one thing on this screen meant to be seen by
    // everyone at once, host and every player alike (see
    // client/src/hooks/useBluffBeat.js).
    bluffBeatAt: g.bluffBeatAt,
    // Whoever took the first seat gets an extra "Storyteller controls"
    // button on their own phone (see LeaderControlsOverlay.jsx) — nothing
    // else in this object changes for them; the overlay drives itself off
    // the same /api/host-state the TV already uses, once opened.
    isLeader: !!g.leaderId && p.id === g.leaderId,
    prompt: g.phase === 'night' ? promptFor(g, p) : null,
    submitted: !!g.pending[p.id],
    result: g.results[p.id] || null,
    // Only ever this player's own entries — resultsLog holds every
    // player's results, so this is the one place that needs to filter,
    // never just spread the whole thing. Lets a player check their own
    // past nights themselves (e.g. "did I actually get told anything as
    // the Ravenkeeper?") without needing the host to peek at anyone's
    // info, and without waiting for the game to end: resultsLog only ever
    // holds already-flushed nights (see flushNightResults in server.js),
    // so tonight's own not-yet-flushed result is appended here too, or a
    // still-open night that already produced one would be invisible to
    // its own owner until the night ends.
    resultHistory: [
      ...g.resultsLog.filter(r => r.playerId === p.id),
      ...(g.results[p.id] ? [{ night: g.nightNumber, playerId: p.id, playerName: p.name, ...g.results[p.id] }] : []),
    ],
    // Every living player's own action, not a character ability — no
    // x.id !== p.id exclusion the way slayerShot/jugglerGuess have below,
    // since nominating yourself is legal. Rarer per-day limits (already
    // nominated, already been nominated, the Golem's once-per-game cap)
    // aren't re-checked here — same as those checks already work for
    // every other prompt in this file, the real gate is /api/table/
    // nominate itself; this only covers the common case (alive, day,
    // nothing already open) so the button doesn't show at an obviously
    // wrong moment.
    canNominate: (g.phase === 'day' && publiclyAlive(p) &&
        !g.nominations.some(n => n.day === g.nightNumber && !n.closed))
      ? { targets: g.players.filter(x => publiclyAlive(x)).map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: true })) }
      : null,
    // Shown based on *believed* character, same as everything else — a
    // Drunk who thinks they're the Slayer gets the button too, and simply
    // finds out (or rather, never finds out) that it does nothing.
    slayerShot: (g.phase === 'day' && publiclyAlive(p) && c && c.id === 'slayer' && !p.statuses.slayerUsed)
      ? { targets: g.players.filter(x => x.id !== p.id && publiclyAlive(x)).map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: true })) }
      : null,
    // The Damsel: "if a Minion publicly guesses you (once), your team
    // loses" — gated on the player's true team, not a believed-character
    // check like the others here, since a real Minion always knows they're
    // a Minion (there's no Drunk/Lunatic-style mixup to model). Once per
    // game across the whole evil team, not once per Minion — see
    // game.damselGuessUsed and /api/damsel-guess in server.js.
    damselGuess: (g.phase === 'day' && publiclyAlive(p) && trueChar(p) && trueChar(p).team === 'minion' && !g.damselGuessUsed)
      ? { targets: g.players.filter(x => publiclyAlive(x)).map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: true })) }
      : null,
    // Sects & Violets' Juggler: "on your 1st day" — day one only, once ever,
    // via /api/juggler-guess. That night's reveal of how many were correct
    // is a normal registry entry, not part of this.
    jugglerGuess: (g.phase === 'day' && publiclyAlive(p) && c && c.id === 'juggler' && g.nightNumber === 1 && !p.statuses.jugglerUsed)
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
    gossipClaim: (g.phase === 'day' && publiclyAlive(p) && c && c.id === 'gossip' && p.statuses.gossipClaimDay !== g.nightNumber)
      ? {
          targets: g.players.map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: x.alive })),
          characterOptions: activeScriptPool(g).map(x => ({ id: x.id, name: x.name })),
        }
      : null,
    // Sects & Violets' Savant: "each day, you may" — a plain once-a-day
    // tap, no target of any kind; the two statements land in `result` like
    // any other reveal, via /api/savant-visit.
    savantVisit: (g.phase === 'day' && publiclyAlive(p) && c && c.id === 'savant' && p.statuses.savantVisitDay !== g.nightNumber)
      ? true : null,
    // Sects & Violets' Artist: once per game, the same structured-claim menu
    // Gossip's claim uses (see evaluateClaim in engine.js) — but answered
    // immediately and privately via /api/artist-question, with no public
    // claim and no waiting to see if it comes true.
    artistQuestion: (g.phase === 'day' && publiclyAlive(p) && c && c.id === 'artist' && !p.statuses.artistUsed)
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
  checkVictory, applyPoliticianFlip, succeedDemon, trueChar, impaired, impairedFlip,
  checkKill, wouldBlockKill, publiclyAlive, randomKiller,
  isEvil, isEvilRegistration, resolveWhim, setWhimJudge, heuristicWhim, maybeMercy,
  minionDiedToday, triggerMoonchildIfNeeded, triggerDeathHooks, resolveMastermindDay,
  resolveDayVote, gameSummary, resolveMadness, buildSavantStatements, evaluateClaim,
  activeScriptPool, applyConfigPatch, buildStorytellerContext, BUCKET4_IDS,
  applyCannibalTransform,
  // Exposed for tools/audit-abilities.js's generic per-character invariant
  // checks, which need to iterate every entry rather than dispatch by id —
  // nothing inside game/ itself needs this, since engine.js's own functions
  // already close over REGISTRY directly.
  REGISTRY,
};
