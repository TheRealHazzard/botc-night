'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  if (tc.id === 'sailor' && !impaired(target) && !executionAttack) return 'sailor';
  if (tealadyProtects(g, target)) return 'tea-lady';
  if (tc.id === 'fool' && !target.statuses.foolUsed && !impaired(target)) return 'fool';
  if (tc.id === 'zombuul' && !target.statuses.zombuulFaked && !impaired(target)) return 'zombuul-fake';
  return null;
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

const CHOICE_CHARS = {
  poisoner: 1,
  monk: 1,
  imp: 1,
  butler: 1,
  fortuneteller: 2,
  ravenkeeper: 1,
  sailor: 1,
  chambermaid: 2,
  exorcist: 1,
  innkeeper: 2,
  courtier: 1, // "choose a character" — reframed as choosing the player who holds it
  professor: 1,
  devilsadvocate: 1,
  assassin: 1,
  godfather: 1,
  pukka: 1,
  shabaloth: 2,
  po: 1, // variable — overridden below the night after Po chooses no one
  zombuul: 1,
};

/** Once-per-game (or "may pass") abilities that can legally submit zero
    targets — Assassin, Courtier, and Professor may hold their charge, and
    Po may choose no one on a normal night. Everyone else must act. */
const OPTIONAL_CHARS = new Set(['courtier', 'professor', 'assassin', 'po']);

/** Characters whose action depends on what happened earlier the same night. */
const WAVE_TWO = new Set(['ravenkeeper']);

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

function waveFor(characterId) {
  return WAVE_TWO.has(characterId) ? 2 : 1;
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

/** What this player is asked to do. Non-actors get a decoy of the same shape. */
function promptFor(g, p) {
  const c = actingChar(p);
  if (!c || !p.alive) {
    // The Ravenkeeper is the one role that acts from beyond.
    if (!(p.believedId === 'ravenkeeper' && p.statuses.diedTonight && g.wave === 2)) return null;
  }
  const first = g.nightNumber === 1;
  const order = c ? (first ? c.firstNightOrder : c.otherNightOrder) : 0;

  // Po chooses 3 the night after choosing no one; otherwise the base count.
  let need = CHOICE_CHARS[c && c.id];
  if (c && c.id === 'po' && p.statuses.poChargedUp) need = 3;

  // Once-per-game abilities stop being offered once actually used — passing
  // never counts as using it (see the resolveNight cases, which only set
  // these flags on a real choice, never on a pass).
  const usedUp = c && c.id !== 'po' && OPTIONAL_CHARS.has(c.id) && p.statuses[`${c.id}Used`];

  const acts =
    !!need &&
    !!order &&
    waveFor(c.id) === g.wave &&
    !usedUp &&
    !(c.id === 'ravenkeeper' && !p.statuses.diedTonight) &&
    !(c.id === 'monk' && first) &&
    !(c.id === 'imp' && first) &&
    // Godfather's first night is pure information (handled elsewhere as a
    // delivered result, not a choice), and the kill only triggers at all
    // if an Outsider was actually executed the day before.
    !(c.id === 'godfather' && (first || !outsiderDiedToday(g))) &&
    !(c.id === 'zombuul' && somebodyDiedYesterday(g));

  if (!acts) return p.alive ? decoyPrompt(g, p) : null;

  const others = alive(g).filter(x => x.id !== p.id);
  const dead = g.players.filter(x => !x.alive && x.id !== p.id);
  const targetsByChar = {
    poisoner: alive(g),
    monk: others,
    imp: alive(g),
    butler: others,
    // The ability has no "alive" restriction, and testing a dead player is
    // a real, common play — re-confirming a dead red herring, or checking
    // whether a dead suspect was the Demon. Was wrongly limited to `others`.
    fortuneteller: g.players.filter(x => x.id !== p.id),
    ravenkeeper: g.players.filter(x => x.id !== p.id),
    sailor: alive(g),
    chambermaid: others,
    exorcist: others.filter(x => x.id !== p.statuses.exorcistLastTarget),
    innkeeper: others,
    // "Choose a character" reframed as choosing the player who holds it —
    // equivalent in a game where each character maps to exactly one seat.
    courtier: alive(g).filter(x => x.id !== p.id),
    professor: dead,
    devilsadvocate: others.filter(x => x.id !== p.statuses.daLastTarget),
    assassin: others,
    godfather: others,
    pukka: others,
    shabaloth: others,
    po: others,
    zombuul: others,
  };
  const targets = targetsByChar[c.id];

  const text = {
    poisoner: 'Choose a player. They are poisoned.',
    monk: 'Choose a player other than yourself. They are safe from the Demon tonight.',
    imp: 'Choose a player. They die.',
    butler: 'Choose your master. Tomorrow you may only vote if they do.',
    fortuneteller: 'Choose two players. You will learn if either is the Demon.',
    ravenkeeper: 'You died. Choose a player: you learn their character.',
    sailor: 'Choose a player. Either you or they are drunk until dusk. You cannot die.',
    chambermaid: 'Choose two living players. You learn how many woke tonight for their ability.',
    exorcist: 'Choose a player (not who you chose last night). If it’s the Demon, they learn who you are and skip tonight.',
    innkeeper: 'Choose two players. Neither can die tonight, but one of them is drunk until dusk.',
    courtier: 'Choose a player. Their character is drunk for the next 3 nights and days. Once per game.',
    professor: 'Choose a dead player. If they were a Townsfolk, they return to life. Once per game.',
    devilsadvocate: 'Choose a living player (not who you chose last night). If executed tomorrow, they survive.',
    assassin: 'Choose a player, or pass. They die, bypassing all protection. Once per game.',
    godfather: 'An Outsider was executed today. Choose a player. They die.',
    pukka: 'Choose a player. They are poisoned. Whoever you poisoned last night now dies.',
    shabaloth: 'Choose two players. They die.',
    po: p.statuses.poChargedUp
      ? 'You passed last night. Choose three players. They all die.'
      : 'Choose a player, or pass. They die.',
    zombuul: 'Choose a player. They die.',
  }[c.id];

  return {
    decoy: false,
    characterId: c.id,
    count: need,
    optional: OPTIONAL_CHARS.has(c.id) && !(c.id === 'po' && p.statuses.poChargedUp),
    text,
    targets: targets.map(t => ({ id: t.id, name: t.name, color: t.color || null, alive: t.alive })),
  };
}

/* --------------------------------------------------------- information */

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

/* ---------------------------------------------------------- resolution */

/** First night only: evil learns each other, the Demon gets bluffs, and a
    handful of good-team info roles learn their one-time setup info. The
    Grandmother/Godfather info isn't gated by the small-game exception below
    — that exception is specifically "evil doesn't learn each other in a
    5-6 player game," not a general rule about first-night information. */
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
    // and doubling the kill rate. True character must win here, always.
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
    if (g.exorcistBlockedId === p.id && trueChar(p) && trueChar(p).team === 'demon') {
      logEvent(g, `${p.name} is blocked by the Exorcist and does not act tonight.`, true);
      continue;
    }

    // The Goon: the first character (by night order, hence checked freshly
    // on every acting player) to actually target them tonight makes them
    // drunk until dusk, and — if that chooser is evil — flips them evil for
    // the rest of the game.
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
    // player" abilities appear here (CHOICE_CHARS); pure information roles
    // (Empath, Chef, ...) never had a target to record in the first place.
    if (CHOICE_CHARS[c.id] && action && action.targets && action.targets.length) {
      const names = target(action.targets).map(t => t.name);
      if (names.length) {
        g.actionLog.push({
          night: g.nightNumber, phase: 'night',
          playerId: p.id, playerName: p.name, characterId: c.id, characterName: c.name,
          targets: names,
        });
      }
    }

    switch (c.id) {
      case 'poisoner': {
        const [t] = target(action && action.targets);
        if (t && !broken) {
          t.statuses.poisoned = true;
          // "Tonight and tomorrow day" — cured by the start of the *next*
          // night. Was g.nightNumber + 1, which left it active through an
          // extra full night it shouldn't have covered.
          t.statuses.poisonedUntilNight = g.nightNumber;
          logEvent(g, `Poisoner poisoned ${t.name}.`, true);
        }
        break;
      }

      case 'monk': {
        const [t] = target(action && action.targets);
        if (t && !broken) {
          t.statuses.protected = true;
          logEvent(g, `Monk protected ${t.name}.`, true);
        }
        break;
      }

      case 'imp': {
        const [t] = target(action && action.targets);
        if (!t || broken) break;
        if (t.id === p.id) {
          // Star pass: a Minion becomes the Imp. Marked skipSuccession
          // because this already names its own heir explicitly — the
          // generic succession check below must not also fire and hand a
          // *second* player the Imp (that double-Imp bug is exactly how the
          // original Scarlet Woman succession bug happened).
          const minions = alive(g).filter(x => x.id !== p.id && trueChar(x).team === 'minion');
          deaths.push({ player: t, cause: 'demon', skipSuccession: true });
          if (minions.length) {
            const heir = pick(minions);
            heir.characterId = 'imp';
            heir.believedId = 'imp';
            results[heir.id] = { title: 'You are the Imp', body: 'The Imp died by its own hand. You inherit it.' };
            logEvent(g, `Imp star-passed to ${heir.name}.`, true);
          }
          break;
        }
        let finalTarget = t;
        const tc = trueChar(t);
        // Mayor: "If you die at night, another player might die instead."
        // Explicit Storyteller discretion in the real rules — modeled as a
        // roll, same pattern as Recluse registration. The redirect target
        // must be someone who'd actually die — wouldBlockKill() is the
        // read-only check specifically so scanning candidates here can't
        // accidentally spend a Fool's or Zombuul's one-shot protection.
        if (tc.id === 'mayor' && !impaired(t) && Math.random() < g.config.mayorRedirectChance) {
          const alt = alive(g).filter(x =>
            x.id !== p.id && x.id !== t.id && !wouldBlockKill(g, x, { demonAttack: true })
          );
          if (alt.length) {
            finalTarget = pick(alt);
            logEvent(g, `The Imp's attack on the Mayor was redirected to ${finalTarget.name}.`, true);
          }
        }
        const blocked = checkKill(g, finalTarget, { demonAttack: true });
        if (blocked) {
          logEvent(g, `Imp attacked ${finalTarget.name}, who survives (${blocked}).`, true);
          break;
        }
        deaths.push({ player: finalTarget, cause: 'demon' });
        break;
      }

      case 'butler': {
        const [t] = target(action && action.targets);
        for (const x of g.players) delete x.statuses.master;
        if (t) t.statuses.master = true;
        break;
      }

      case 'fortuneteller': {
        const chosen = target(action && action.targets);
        // The Recluse "might register as ... a Demon" — Empath and Chef
        // already roll for this via isEvil(forRegistration), but this check
        // was comparing true team directly and skipping that roll entirely.
        let answer = chosen.some(x => {
          const tc = trueChar(x);
          if (tc.team === 'demon') return true;
          if (x.statuses.redHerring) return true;
          if (tc.id === 'recluse') return Math.random() < g.config.recluseRegistersEvil;
          return false;
        });
        if (broken) answer = Math.random() < 0.5;
        results[p.id] = {
          title: 'Fortune Teller',
          body: answer ? 'Yes — one of them is the Demon.' : 'No — neither is the Demon.',
          names: chosen.map(x => x.name),
        };
        break;
      }

      case 'washerwoman':
      case 'librarian':
      case 'investigator': {
        const team = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' }[c.id];
        const info = pairInfo(g, p, team, broken);
        results[p.id] = { title: c.name, body: info.text, names: info.players };
        break;
      }

      case 'chef': {
        const trueCount = evilPairCount(g);
        const shown = broken ? falseNumber(trueCount, Math.max(2, trueCount + 1)) : trueCount;
        results[p.id] = { title: 'Chef', body: `Pairs of neighbouring evil players: ${numberSignal(shown)}` };
        break;
      }

      case 'empath': {
        const trueCount = evilNeighbourCount(g, p);
        const shown = broken ? falseNumber(trueCount, 2) : trueCount;
        results[p.id] = { title: 'Empath', body: `Evil living neighbours: ${numberSignal(shown)}` };
        break;
      }

      case 'undertaker': {
        if (!g.executedToday) break;
        const dead = byId(g, g.executedToday);
        if (!dead) break;
        let shown = trueChar(dead);
        if (broken) {
          const others = scriptPool(g.script).filter(x => x.id !== shown.id);
          shown = pick(others);
        }
        results[p.id] = { title: 'Undertaker', body: `Executed today: the ${shown.name}.` };
        break;
      }

      case 'ravenkeeper': {
        if (!p.statuses.diedTonight) break;
        const [t] = target(action && action.targets);
        if (!t) break;
        let shown = trueChar(t);
        if (broken) {
          const others = scriptPool(g.script).filter(x => x.id !== shown.id);
          shown = pick(others);
        }
        results[p.id] = { title: 'Ravenkeeper', body: `${t.name} is the ${shown.name}.` };
        break;
      }

      case 'sailor': {
        const [t] = target(action && action.targets);
        if (t && !broken) {
          const drunkOne = Math.random() < 0.5 ? p : t;
          drunkOne.statuses.drunk = true;
          drunkOne.statuses.drunkUntilNight = g.nightNumber;
          logEvent(g, `Sailor's choice of ${t.name} leaves ${drunkOne.name} drunk until dusk.`, true);
        }
        break;
      }

      case 'chambermaid': {
        const chosen = target(action && action.targets);
        // "Woke tonight" means their character genuinely woke for its own
        // ability tonight — present in tonight's real acting order (so a
        // pure-info role like the Empath counts, not just choice-driven
        // ones) and not impaired, which would have silenced them.
        let count = chosen.filter(t => {
          if (t.id === p.id) return false;
          if (impaired(t)) return false;
          return order.some(e => e.player.id === t.id);
        }).length;
        if (broken) count = falseNumber(count, 2);
        results[p.id] = {
          title: 'Chambermaid',
          body: `Of those two, ${numberSignal(count)} woke tonight.`,
          names: chosen.map(x => x.name),
        };
        break;
      }

      case 'exorcist': {
        const [t] = target(action && action.targets);
        if (t) {
          p.statuses.exorcistLastTarget = t.id;
          if (!broken) {
            const tc = trueChar(t);
            if (tc.team === 'demon') {
              g.exorcistBlockedId = t.id;
              results[t.id] = results[t.id] || { title: 'Exorcist', body: '' };
              results[t.id].body += `${results[t.id].body ? ' ' : ''}The Exorcist points at you tonight — you learn who they are, and you do not act.`;
              logEvent(g, `Exorcist targeted the Demon (${t.name}), who is blocked tonight.`, true);
            } else {
              logEvent(g, `Exorcist targeted ${t.name} — nothing happens.`, true);
            }
          }
        }
        break;
      }

      case 'innkeeper': {
        const chosen = target(action && action.targets);
        if (chosen.length && !broken) {
          for (const t of chosen) t.statuses.protected = true;
          const drunkOne = pick(chosen);
          drunkOne.statuses.drunk = true;
          drunkOne.statuses.drunkUntilNight = g.nightNumber;
          logEvent(g, `Innkeeper protects ${chosen.map(x => x.name).join(' and ')}; ${drunkOne.name} is drunk until dusk.`, true);
        }
        break;
      }

      case 'courtier': {
        const [t] = target(action && action.targets);
        if (t && !broken) {
          t.statuses.drunk = true;
          t.statuses.drunkUntilNight = g.nightNumber + 2; // drunk through 3 nights and 3 days
          p.statuses.courtierUsed = true;
          logEvent(g, `Courtier makes ${t.name} drunk for the next 3 nights and days.`, true);
        }
        break;
      }

      case 'professor': {
        const [t] = target(action && action.targets);
        if (t && !broken) {
          p.statuses.professorUsed = true;
          const tc = trueChar(t);
          if (tc.team === 'townsfolk') {
            t.alive = true;
            delete t.statuses.diedTonight;
            delete t.statuses.appearsDead;
            results[p.id] = { title: 'Professor', body: `${t.name} returns to life.` };
            logEvent(g, `Professor resurrects ${t.name}.`, true);
          } else {
            results[p.id] = { title: 'Professor', body: 'Nothing happens.' };
            logEvent(g, `Professor tried to resurrect ${t.name} — not a Townsfolk, nothing happens.`, true);
          }
        }
        break;
      }

      case 'devilsadvocate': {
        const [t] = target(action && action.targets);
        if (t) {
          p.statuses.daLastTarget = t.id;
          if (!broken) {
            t.statuses.executionImmune = true;
            logEvent(g, `Devil's Advocate protects ${t.name} from execution tomorrow.`, true);
          }
        }
        break;
      }

      case 'assassin': {
        const chosen = target(action && action.targets);
        if (chosen.length && !broken) {
          p.statuses.assassinUsed = true;
          const [t] = chosen;
          deaths.push({ player: t, cause: 'demon' });
          logEvent(g, `Assassin strikes ${t.name} down, bypassing all protection.`, true);
        }
        break;
      }

      case 'godfather': {
        const [t] = target(action && action.targets);
        if (t && !broken) {
          const blocked = checkKill(g, t, { demonAttack: true });
          if (blocked) {
            logEvent(g, `Godfather attacked ${t.name}, who survives (${blocked}).`, true);
          } else {
            deaths.push({ player: t, cause: 'demon' });
          }
        }
        break;
      }

      case 'pukka': {
        const [t] = target(action && action.targets);
        if (t && !broken) {
          const prevId = p.statuses.pukkaLastTarget;
          if (prevId) {
            const prev = byId(g, prevId);
            if (prev && prev.alive) {
              const blocked = checkKill(g, prev, { demonAttack: true });
              if (blocked) {
                logEvent(g, `Pukka's poison should have killed ${prev.name}, but they survive (${blocked}).`, true);
              } else {
                deaths.push({ player: prev, cause: 'demon' });
              }
            }
          }
          t.statuses.poisoned = true;
          delete t.statuses.poisonedUntilNight; // Pukka's poison lasts until re-poisoned, not one night
          p.statuses.pukkaLastTarget = t.id;
          logEvent(g, `Pukka poisoned ${t.name}.`, true);
        }
        break;
      }

      case 'shabaloth': {
        const chosen = target(action && action.targets);
        if (chosen.length && !broken) {
          for (const t of chosen) {
            const blocked = checkKill(g, t, { demonAttack: true });
            if (blocked) {
              logEvent(g, `Shabaloth attacked ${t.name}, who survives (${blocked}).`, true);
            } else {
              deaths.push({ player: t, cause: 'demon' });
            }
          }
          const lastNightKills = g.deaths.filter(d => d.night === g.nightNumber - 1 && d.cause === 'demon');
          if (lastNightKills.length && Math.random() < g.config.shabalothRegurgitateChance) {
            const victim = g.players.find(x => x.name === pick(lastNightKills).name && !x.alive);
            if (victim) {
              victim.alive = true;
              delete victim.statuses.diedTonight;
              delete victim.statuses.appearsDead;
              logEvent(g, `Shabaloth regurgitates ${victim.name} — they live again.`, true);
            }
          }
        }
        break;
      }

      case 'po': {
        const chosen = target(action && action.targets);
        if (broken) break;
        if (chosen.length === 0) {
          p.statuses.poChargedUp = true;
          logEvent(g, 'Po chooses no one tonight — building up for a bigger attack.', true);
          break;
        }
        p.statuses.poChargedUp = false;
        for (const t of chosen) {
          const blocked = checkKill(g, t, { demonAttack: true });
          if (blocked) {
            logEvent(g, `Po attacked ${t.name}, who survives (${blocked}).`, true);
          } else {
            deaths.push({ player: t, cause: 'demon' });
          }
        }
        break;
      }

      case 'zombuul': {
        const [t] = target(action && action.targets);
        if (!t || broken) break;
        const blocked = checkKill(g, t, { demonAttack: true });
        if (blocked) {
          logEvent(g, `Zombuul attacked ${t.name}, who survives (${blocked}).`, true);
        } else {
          deaths.push({ player: t, cause: 'demon' });
        }
        break;
      }

      case 'spy': {
        // A poisoned/drunk Spy's ability doesn't work — it was showing the
        // real Grimoire regardless. There's no honest "wrong" full Grimoire,
        // so the identity info gets shuffled — true character and believed
        // character together, as one unit per row, so a broken Spy can't
        // even trust that a shown pairing belongs together.
        const identities = g.players.map(x => ({
          character: trueChar(x).name,
          // The Storyteller's own Grimoire always shows what a player
          // believes they are alongside who they really are — that's the
          // whole reason the Drunk (and the Lunatic) work at all. Only
          // worth a separate line when it actually differs from the truth.
          believedCharacter: x.believedId !== x.characterId ? (char(x.believedId) && char(x.believedId).name) : null,
        }));
        const shown = broken ? shuffle(identities) : identities;
        // At 7+ players, deliverOpeningInfo already wrote this same slot
        // with "X is the Demon" — a Spy who's the dealt Minion would
        // otherwise have that silently overwritten by their own grimoire
        // result below (both land on results[p.id]). Fold it in instead of
        // losing it; the grimoire itself would tell them anyway, but the
        // named briefing is still worth keeping front and center.
        const briefing = results[p.id];
        results[p.id] = {
          title: briefing ? briefing.title : 'Spy',
          body: (briefing ? briefing.body + ' ' : '') + 'You see the Grimoire.',
          names: briefing && briefing.names,
          grimoire: g.players.map((x, i) => ({
            name: x.name,
            character: shown[i].character,
            believedCharacter: shown[i].believedCharacter,
            alive: x.alive,
            statuses: Object.keys(x.statuses).filter(k => k !== 'poisonedUntilNight'),
          })),
        };
        break;
      }

      default:
        break;
    }
  }

  // Grandmother: dies the moment the Demon kills her linked grandchild —
  // specifically the Demon, not execution or any other cause. Checked after
  // the main loop so it sees every demon kill decided tonight, from
  // whichever demon character is actually in the script.
  for (const d of [...deaths]) {
    if (d.cause !== 'demon') continue;
    const gm = alive(g).find(x => x.statuses.grandchildId === d.player.id);
    if (gm && !deaths.some(x => x.player.id === gm.id)) {
      deaths.push({ player: gm, cause: 'grandmother-link' });
      logEvent(g, `${gm.name} (Grandmother) dies alongside their grandchild.`, true);
    }
  }

  // Tinker: pure Storyteller discretion, "might die at any time" — modeled,
  // like Mayor's redirect and Recluse's registration, as a per-night roll.
  if (wave === 1) {
    for (const tinker of alive(g).filter(x => x.characterId === 'tinker')) {
      if (!impaired(tinker) && Math.random() < g.config.tinkerDeathChance) {
        const blocked = checkKill(g, tinker, {});
        if (!blocked) deaths.push({ player: tinker, cause: 'tinker' });
      }
    }
  }

  // Apply deaths
  for (const d of deaths) {
    d.player.alive = false;
    d.player.statuses.diedTonight = true;
    delete d.player.statuses.appearsDead; // no longer just appearing dead — this one's real
    g.deaths.push({ night: g.nightNumber, name: d.player.name, cause: d.cause });
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

/* ----------------------------------------------------------------- log */

function logEvent(g, text, secret = false) {
  g.log.push({ night: g.nightNumber, text, secret, at: Date.now() });
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
  checkKill, wouldBlockKill, publiclyAlive,
  isEvil, minionDiedToday, triggerMoonchildIfNeeded, resolveMastermindDay,
  resolveDayVote, gameSummary,
};
