'use strict';

const crypto = require('crypto');
const H = require('./helpers');
const { buildRegistry } = require('./abilities');

const {
  DATA, CHARACTERS, SETUP_TABLE, char, scriptPool,
  shuffle, pick, take,
  byId, byToken, alive, actingChar, trueChar, impaired, publiclyAlive,
  wouldBlockKill, randomKiller, checkKill, isEvil, triggerMoonchildIfNeeded,
  logEvent, outsiderDiedToday, minionDiedToday, somebodyDiedYesterday,
  numberSignal, falseNumber, evilNeighbourCount, evilPairCount, pairInfo,
} = H;

// One registry entry per active character (real night prompt and/or
// resolveNight behavior) — see game/abilities/tb.js and bmr.js. Built once;
// every call below just looks a character up by id instead of touching a
// switch statement plus several parallel by-id maps.
const REGISTRY = buildRegistry(H);

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
      voteWindowSeconds: 20, // how long a nomination stays open for votes
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
  };
}

/* ------------------------------------------------------------------ setup */

function dealRoles(g) {
  const n = g.players.length;
  const table = SETUP_TABLE[String(n)];
  if (!table) throw new Error(`No setup defined for ${n} players (need 5-15).`);

  const pool = scriptPool(g.script);
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

  g.phase = 'reveal';
  logEvent(g, `Roles dealt to ${n} players.`);
}

/* ------------------------------------------------- night: who acts, when */

function actingTonight(g) {
  const first = g.nightNumber === 1;
  const entries = [];

  for (const p of g.players) {
    if (!p.alive && !(first === false && p.believedId === 'ravenkeeper')) continue;
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
  const c = actingChar(p);
  if (!c || !p.alive) {
    // The Ravenkeeper is the one role that acts from beyond.
    if (!(p.believedId === 'ravenkeeper' && p.statuses.diedTonight && g.wave === 2)) return null;
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

  const acts =
    !!need &&
    !!order &&
    waveFor(c.id) === g.wave &&
    !usedUp &&
    (entry.acts ? entry.acts(g, p, H) : true);

  if (!acts) return p.alive ? decoyPrompt(g, p) : null;

  const targets = entry.targets(g, p, H);
  const text = entry.text(g, p, H);
  const extra = entry.extraPrompt ? entry.extraPrompt(g, p, H) : null;

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
      shown = pick(scriptPool(g.script));
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

  const minions = g.players.filter(p => trueChar(p) && trueChar(p).team === 'minion');
  for (const m of minions) {
    results[m.id] = {
      title: 'Your allies',
      body: `${demon.name} is the Demon.`,
      names: minions.filter(x => x.id !== m.id).map(x => `${x.name} — fellow Minion`),
    };
  }

  const inPlay = new Set(g.players.map(p => p.characterId));
  const bluffPool = scriptPool(g.script).filter(
    c => !inPlay.has(c.id) && (c.team === 'townsfolk' || c.team === 'outsider')
  );
  const bluffs = take(bluffPool, 3).map(c => c.name);

  results[demon.id] = {
    title: 'Your Minions',
    body: (minions.length ? `${minions.map(m => m.name).join(', ')} serve you.` : 'You act alone.') +
      (results[demon.id] ? ` ${results[demon.id].body}` : ''),
    names: bluffs.map(b => `${b} — not in play`),
  };
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
    }
    g.exorcistBlockedId = null;
    g.goonFlippedTonight = false;
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

  // Apply deaths
  for (const d of deaths) {
    d.player.alive = false;
    d.player.statuses.diedTonight = true;
    delete d.player.statuses.appearsDead; // no longer just appearing dead — this one's real
    g.deaths.push({ night: g.nightNumber, name: d.player.name, cause: d.cause, killedByDemon: !!d.killedByDemon });
    logEvent(g, `${d.player.name} died in the night (${d.cause}).`, true);
    triggerMoonchildIfNeeded(g, d.player);
    if (!d.skipSuccession) succeedDemon(g, d.player);
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

/** Does anyone need a second window tonight? */
function needsWaveTwo(g) {
  return g.players.some(p => p.believedId === 'ravenkeeper' && p.statuses.diedTonight);
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

/* ------------------------------------------------------------ victory */

/** Returns null while the game is still alive, else {winner, reason}. */
function checkVictory(g) {
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
    return { winner: 'good', reason: 'The Demon is dead.' };
  }
  if (living.length <= 2) {
    return { winner: 'evil', reason: 'Only the Demon and one other remain.' };
  }
  if (g.saintExecuted) {
    return { winner: 'evil', reason: 'The Saint was executed.' };
  }
  // "If only 3 players live & no execution occurs, your team wins" — reads
  // as conditional on the Mayor still being alive to claim it, matching the
  // general rule that a dead character's passive text stops applying unless
  // it explicitly says otherwise (Recluse, Spy, and Saint all say "even if
  // dead"; Mayor doesn't).
  const mayor = living.find(x => x.characterId === 'mayor');
  if (mayor && living.length === 3 && g.noExecutionToday) {
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
    // "Each day, you MAY" — once per day, never once per game, and never
    // told whether it was true (that's only ever revealed by tonight's
    // prompt existing at all, same indirect leak Godfather's conditional
    // prompt already has). Any player, living or dead, is a fair claim
    // target — a claim about someone already dead is still a real read.
    gossipClaim: (g.phase === 'day' && c && c.id === 'gossip' && p.statuses.gossipClaimDay !== g.nightNumber)
      ? {
          targets: g.players.map(x => ({ id: x.id, name: x.name, color: x.color || null, alive: x.alive })),
          characterOptions: scriptPool(g.script).map(x => ({ id: x.id, name: x.name })),
        }
      : null,
    // Acts from beyond, same as the Ravenkeeper — offered once, the first
    // time this player ever dies, in whatever phase that happens to be.
    moonchildChoice: p.statuses.moonchildPending
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
  isEvil, minionDiedToday, triggerMoonchildIfNeeded, resolveMastermindDay,
  resolveDayVote, gameSummary,
};
