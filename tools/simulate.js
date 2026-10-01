'use strict';

/* Drives a whole game through the engine with no browser, and asserts the
   properties that would ruin a real session if they broke. */

const E = require('../game/engine');

const NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy'];
let failures = 0;

function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function seat(g, n) {
  for (let i = 0; i < n; i++) {
    g.players.push({
      id: 'p' + i, name: NAMES[i], characterId: null, believedId: null,
      alive: true, statuses: {}, connected: true,
    });
  }
}

function autoAnswer(g) {
  // Every living player answers, exactly as the real clients do.
  for (const p of g.players) {
    const prompt = E.promptFor(g, p);
    if (!prompt) continue;
    const targets = prompt.targets.slice(0, prompt.count).map(t => t.id);
    const countOk = targets.length === prompt.count || (prompt.optional && targets.length === 0);
    if (countOk) {
      const characterGuess = prompt.guessCharacter ? prompt.characterOptions[0].id : undefined;
      // Sects & Violets' Barber-swap addon (engine.js's barberSwapAddon) —
      // an independent extra field on a living Demon's own prompt, filled
      // in alongside their real choice the same way botsAnswer() does in
      // server.js, so a generic simulated game still exercises the swap
      // whenever the Barber's actually in the roster and could plausibly
      // die tonight.
      const barberSwapTargets = prompt.barberSwap ? prompt.barberSwap.targets.slice(0, 2).map(t => t.id) : undefined;
      g.pending[p.id] = { targets, decoy: !!prompt.decoy, characterGuess, barberSwapTargets };
    }
  }
}

// Wrapped in one async IIFE because resolveNight() (and everything that
// funnels a Storyteller-whim decision through it — randomKiller,
// isEvilRegistration, pairInfo) is async now, so every one of this file's
// ~160 await E.resolveNight(...) calls needs an enclosing async function.
// No judge is ever wired in here (setWhimJudge is only ever called by
// server.js), so every roll below still falls back to the exact same plain
// Math.random() behavior this file always tested — this wrapper changes
// nothing about what's being asserted, only what's needed to await it.
(async () => {

console.log('\nSetup');
const g = E.newGame();
seat(g, 9);
E.dealRoles(g);

const teams = g.players.map(p => E.trueChar(p).team);
const expected = E.SETUP_TABLE['9'];
const hasBaron = g.players.some(p => p.characterId === 'baron');
check('nine roles dealt', g.players.every(p => p.characterId));
check('exactly one demon', teams.filter(t => t === 'demon').length === 1);
check('minion count matches the official table for nine players',
  teams.filter(t => t === 'minion').length === expected.minion,
  `expected ${expected.minion}, got ${teams.filter(t => t === 'minion').length}`);
check('outsider count matches the table, or the Baron explains it',
  teams.filter(t => t === 'outsider').length === expected.outsider + (hasBaron ? 2 : 0),
  `baron ${hasBaron ? 'in' : 'not in'} play, got ${teams.filter(t => t === 'outsider').length}`);
check('bag has no duplicate characters',
  new Set(g.players.map(p => p.characterId)).size === g.players.length);

const drunk = g.players.find(p => p.characterId === 'drunk');
if (drunk) {
  check('the Drunk believes a different, out-of-play role',
    drunk.believedId !== 'drunk' && !g.players.some(p => p.characterId === drunk.believedId));
} else {
  console.log('  --    no Drunk in this bag');
}

console.log('\nDrunk: zero spare townsfolk (a tight custom roster)');
{
  // Can't happen on the real Trouble Brewing sheet (13 townsfolk options,
  // never all dealt at once alongside a Drunk within the 5-15 player
  // range) — only reachable via a deliberately tight custom roster, which
  // this forces: exactly 3 townsfolk options for 6 players' own exact
  // requirement (townsfolk:3), leaving nothing spare for the Drunk to
  // falsely believe.
  const gTight = E.newGame();
  gTight.script = 'custom';
  gTight.customRoster = ['chef', 'empath', 'soldier', 'drunk', 'poisoner', 'imp'];
  seat(gTight, 6);
  E.dealRoles(gTight);
  const drunkTight = gTight.players.find(p => p.characterId === 'drunk');
  check('a real Drunk was dealt in this tight roster', !!drunkTight);
  check('every townsfolk option was actually dealt, leaving nothing spare',
    ['chef', 'empath', 'soldier'].every(id => gTight.players.some(p => p.characterId === id)));
  check('the Drunk still never believes they\'re the Drunk, even with no spare townsfolk',
    drunkTight && drunkTight.believedId !== 'drunk', drunkTight && drunkTight.believedId);
  check('the fallback belief is still a real townsfolk character',
    drunkTight && E.char(drunkTight.believedId) && E.char(drunkTight.believedId).team === 'townsfolk');
}

console.log('\nNight 1');
g.nightNumber = 1; g.phase = 'night'; g.wave = 1;

const prompts = g.players.map(p => ({ p, prompt: E.promptFor(g, p) }));
check('every living player is asked something (decoy wakes)',
  prompts.every(x => !x.p.alive || x.prompt),
  'a silent player would be identifiable as having no night ability');
check('decoys are shaped like real prompts',
  prompts.every(x => !x.prompt || (x.prompt.text && x.prompt.targets.length && x.prompt.count >= 1)));

autoAnswer(g);
await E.resolveNight(g);

const demon = g.players.find(p => E.trueChar(p).team === 'demon');
const minions = g.players.filter(p => E.trueChar(p).team === 'minion');
check('demon learned its minions', !!g.results[demon.id]);
check('each minion learned the demon', minions.every(m => g.results[m.id]));
const EVIL_BRIEFINGS = ['Your allies', 'Your Minions'];
check('no good player received the evil briefing',
  g.players.filter(p => !['minion', 'demon'].includes(E.trueChar(p).team))
    .every(p => !(g.results[p.id] && EVIL_BRIEFINGS.includes(g.results[p.id].title))));

console.log('\nSmall games (5-6 players): the Demon and Minions don\'t recognize each other');
{
  // The official rule: evil only learns each other's identities at 7+
  // players — small games are the exact case where "you now know your
  // Minion" would make deduction trivial. Checked at 6 (should be silent)
  // and right at the boundary, 7 (should speak up).
  const gSmall = E.newGame();
  seat(gSmall, 6);
  E.dealRoles(gSmall);
  gSmall.nightNumber = 1; gSmall.phase = 'night'; gSmall.wave = 1;
  autoAnswer(gSmall);
  await E.resolveNight(gSmall);
  const demonSmall = gSmall.players.find(p => E.trueChar(p).team === 'demon');
  const minionsSmall = gSmall.players.filter(p => E.trueChar(p).team === 'minion');
  check('at 6 players, the Demon is not told who its Minions are',
    !gSmall.results[demonSmall.id] || gSmall.results[demonSmall.id].title !== 'Your Minions');
  check('at 6 players, no Minion is told who the Demon is',
    minionsSmall.every(m => !gSmall.results[m.id] || gSmall.results[m.id].title !== 'Your allies'));

  const gBoundary = E.newGame();
  seat(gBoundary, 7);
  E.dealRoles(gBoundary);
  gBoundary.nightNumber = 1; gBoundary.phase = 'night'; gBoundary.wave = 1;
  autoAnswer(gBoundary);
  await E.resolveNight(gBoundary);
  const demonBoundary = gBoundary.players.find(p => E.trueChar(p).team === 'demon');
  const minionsBoundary = gBoundary.players.filter(p => E.trueChar(p).team === 'minion');
  check('right at the boundary, 7 players, the Demon IS told who its Minions are',
    !!gBoundary.results[demonBoundary.id] && gBoundary.results[demonBoundary.id].title === 'Your Minions');
  // A Minion who happens to be the Spy also gets their own grimoire-viewing
  // result on the same night-1 pass — both land on results[id], so the Spy
  // case folds the "Your allies" briefing in rather than clobbering it.
  check('at 7 players, every Minion IS told who the Demon is (Spy-as-Minion included)',
    minionsBoundary.every(m => gBoundary.results[m.id] && gBoundary.results[m.id].title === 'Your allies'));
}

console.log('\nImpairment');
const info = g.players.find(p => ['empath', 'chef', 'fortuneteller'].includes(p.believedId));
if (info) {
  info.statuses.poisoned = true;
  const before = JSON.stringify(g.results[info.id] || {});
  let differed = 0;
  for (let i = 0; i < 40; i++) {
    g.pending = {}; g.results = {};
    autoAnswer(g);
    await E.resolveNight(g);
    if (JSON.stringify(g.results[info.id] || {}) !== before) differed++;
  }
  check(`poisoned ${info.believedId} can produce false information`, differed > 0,
    'poisoned players were always told the truth');
  delete info.statuses.poisoned;
} else {
  console.log('  --    no information role in this bag to poison');
}

console.log('\nPrivacy');
const pub = E.publicState(g);
check('table screen carries no roles',
  !JSON.stringify(pub).match(/"character"/) || pub.revealed);
// Everything here is knowledge the whole table legitimately has. Anything new
// appearing in this payload must be justified before being added to the list.
const PUBLIC_FIELDS = ['id', 'name', 'alive', 'connected', 'submitted', 'ghostVoteUsed', 'color'];
check('table screen exposes only publicly-known fields',
  pub.players.every(p => Object.keys(p).every(k => PUBLIC_FIELDS.includes(k))),
  'unexpected field: ' + pub.players.flatMap(p => Object.keys(p)).filter(k => !PUBLIC_FIELDS.includes(k)).join(', '));

const victim = g.players[0];
const priv = E.privateState(g, victim.id);
const leaked = g.players.filter(o => o.id !== victim.id)
  .filter(o => JSON.stringify(priv).includes(E.trueChar(o).name) && !priv.result);
check('a phone stream contains no other player\'s role', leaked.length === 0,
  leaked.map(o => o.name).join(', '));

console.log('\nNights 2-4');
for (let n = 2; n <= 4; n++) {
  g.nightNumber = n; g.phase = 'night'; g.pending = {}; g.results = {};
  autoAnswer(g);
  const before = E.alive(g).length;
  await E.resolveNight(g);
  const after = E.alive(g).length;
  check(`night ${n} resolved (${before} -> ${after} alive)`, after <= before);
  g.hint = E.generateHint(g);
}

check('hints stop after the configured nights', E.generateHint(g) === null || g.nightNumber <= 2);

console.log('\nScarlet Woman succession');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  // The bug this catches: succession only ever fired inside resolveNight,
  // which the Imp's own self-kill (star-pass) is the sole trigger for — and
  // that already names its own heir. Execution, the way most demons actually
  // die, never called it at all.
  const gExec = E.newGame();
  gExec.results = {};
  gExec.players = [mk('imp1', 'imp'), mk('sw1', 'scarletwoman'), mk('t1', 'chef'), mk('t2', 'empath'), mk('t3', 'slayer'), mk('t4', 'soldier')];
  const executedImp = gExec.players[0];
  executedImp.alive = false;
  E.succeedDemon(gExec, executedImp);
  check('Scarlet Woman succeeds an executed demon with 5+ alive',
    gExec.players.find(p => p.id === 'sw1').characterId === 'imp');

  // The official ruling: "5 or more players alive" is counted *including*
  // the dying Demon, i.e. 4 or more others left standing — not 5 others.
  // A 5-player game (4 remain after the demon dies) is the exact boundary
  // that distinguishes that from the wrong "5 others" reading.
  const gBoundary = E.newGame();
  gBoundary.results = {};
  gBoundary.players = [mk('imp4', 'imp'), mk('sw4', 'scarletwoman'), mk('t7b', 'chef'), mk('t8b', 'empath'), mk('t9b', 'slayer')];
  gBoundary.players[0].alive = false;
  E.succeedDemon(gBoundary, gBoundary.players[0]);
  check('succeeds at exactly the boundary: 5 players total, 4 remain after the demon dies',
    gBoundary.players.find(p => p.id === 'sw4').characterId === 'imp');

  const gShort = E.newGame();
  gShort.results = {};
  gShort.players = [mk('imp2', 'imp'), mk('sw2', 'scarletwoman'), mk('t5', 'chef'), mk('t6', 'empath')];
  gShort.players[0].alive = false;
  E.succeedDemon(gShort, gShort.players[0]);
  check('...but not with fewer than 4 players left alive',
    gShort.players.find(p => p.id === 'sw2').characterId === 'scarletwoman');

  const gNonDemon = E.newGame();
  gNonDemon.results = {};
  gNonDemon.players = [mk('imp3', 'imp'), mk('sw3', 'scarletwoman'), mk('t7', 'chef'), mk('t8', 'empath'), mk('t9', 'slayer'), mk('t10', 'soldier')];
  gNonDemon.players[2].alive = false; // the Chef dies, not the demon
  E.succeedDemon(gNonDemon, gNonDemon.players[2]);
  check('a non-demon death never triggers succession',
    gNonDemon.players.find(p => p.id === 'sw3').characterId === 'scarletwoman');

  // Star-pass names its own heir from among the minions — and Scarlet Woman
  // herself IS a minion, so she's a legitimate random pick for that. What
  // must never happen is BOTH her ability and star-pass firing at once,
  // producing two new Imps. Run it repeatedly since the heir is random.
  let allDied = true;
  const newImpCounts = new Set();
  for (let i = 0; i < 20; i++) {
    const gStar = E.newGame();
    gStar.nightNumber = 2; gStar.phase = 'night'; gStar.wave = 1;
    gStar.results = {};
    gStar.players = [mk('imp4', 'imp'), mk('sw4', 'scarletwoman'), mk('min1', 'poisoner'), mk('t11', 'chef'), mk('t12', 'empath'), mk('t13', 'soldier')];
    gStar.pending = { imp4: { targets: ['imp4'], decoy: false } };
    await E.resolveNight(gStar, 1);
    if (gStar.players.find(p => p.id === 'imp4').alive) allDied = false;
    newImpCounts.add(gStar.players.filter(p => p.characterId === 'imp' && p.id !== 'imp4').length);
  }
  check('star-pass kills the original Imp every time (20 runs)', allDied);
  check('star-pass always hands the Imp to exactly one minion, never two (20 runs)',
    newImpCounts.size === 1 && newImpCounts.has(1),
    'saw counts: ' + [...newImpCounts].join(', '));
}

console.log('\nImp self-target respects protection, same as any other target');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  // A self-targeted kill is still a kill — a Monk-protected Imp targeting
  // themselves should survive with no star-pass at all, not die and hand
  // the Imp to a Minion anyway. This branch used to skip checkKill
  // entirely, unlike the normal-target branch right next to it. A real
  // Monk action in the same night's pending (Monk acts before the Imp in
  // night order) is what actually sets .protected — pre-setting the
  // status directly wouldn't survive resolveNight's own per-night reset
  // of it right at the start of wave 1.
  const g = E.newGame();
  g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('imp1', 'imp'), mk('min1', 'poisoner'), mk('mo1', 'monk'), mk('t1', 'chef')];
  g.pending = { mo1: { targets: ['imp1'], decoy: false }, imp1: { targets: ['imp1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('a Monk-protected Imp survives targeting themselves',
    g.players.find(p => p.id === 'imp1').alive);
  check('...and no star-pass happens — the Minion stays a Minion',
    g.players.find(p => p.id === 'min1').characterId === 'poisoner');
  // Engine groundwork for a future "pivotal moment" scoring pass — see
  // checkKill()'s own comment in helpers.js. A blocked kill used to leave
  // no structured trace at all, only a prose log line.
  const blocked = g.blockedKills.find(b => b.targetId === 'imp1');
  check('the blocked kill leaves a structured record, not just a prose log line',
    !!blocked && blocked.reason === 'protected' && blocked.night === 2, JSON.stringify(g.blockedKills));
}

console.log('\nPoison timing');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const gp = E.newGame();
  gp.nightNumber = 1; gp.phase = 'night'; gp.wave = 1; gp.results = {};
  gp.players = [mk('poi1', 'poisoner'), mk('emp1', 'empath'), mk('t1', 'chef'), mk('t2', 'soldier'), mk('t3', 'slayer')];
  gp.pending = { poi1: { targets: ['emp1'], decoy: false } };
  await E.resolveNight(gp, 1);
  check('poison is applied the night it is used', gp.players.find(p => p.id === 'emp1').statuses.poisoned === true);
  // Engine groundwork for a future "pivotal moment" scoring pass — see
  // logTrueValue()'s own comment in helpers.js. The Empath's real count
  // used to be discarded the instant a falsified one was shown; this is
  // the only place it's recoverable at all now.
  const empathTrue = gp.trueValueLog.find(e => e.characterId === 'empath');
  const empathShown = gp.results.emp1;
  check('a poisoned Empath\'s true count is preserved, distinct from the shown one',
    !!empathTrue && empathTrue.impaired === true && typeof empathTrue.trueValue === 'number' && empathTrue.shown === empathShown.count,
    JSON.stringify({ empathTrue, empathShown }));

  gp.nightNumber = 2; gp.pending = { poi1: { targets: ['t1'], decoy: false } }; gp.results = {};
  await E.resolveNight(gp, 1);
  check('...but is cleared before the following night resolves (was lasting a night too long)',
    !gp.players.find(p => p.id === 'emp1').statuses.poisoned);

  // blockedKills/trueValueLog are storyteller/analysis-only data — same
  // reveal gate actionLog/resultsLog already use, never a live spoiler.
  const beforeReveal = E.publicState(gp);
  check('trueValueLog is withheld before the game is revealed',
    Array.isArray(beforeReveal.trueValueLog) && beforeReveal.trueValueLog.length === 0);
  check('blockedKills is withheld before the game is revealed',
    Array.isArray(beforeReveal.blockedKills) && beforeReveal.blockedKills.length === 0);
  gp.revealed = true;
  const afterReveal = E.publicState(gp);
  check('trueValueLog is exposed once the game is revealed',
    afterReveal.trueValueLog.some(e => e.characterId === 'empath'));
}

console.log('\nFortune Teller');
{
  const mk = (id, characterId, isAlive = true) => ({ id, name: id, characterId, believedId: characterId, alive: isAlive, statuses: {} });

  const gd = E.newGame();
  gd.nightNumber = 2; gd.phase = 'night'; gd.wave = 1; gd.results = {};
  gd.players = [mk('ft1', 'fortuneteller'), mk('t1', 'chef', false), mk('imp1', 'imp'), mk('t2', 'soldier'), mk('t3', 'slayer')];
  const prompt = E.promptFor(gd, gd.players[0]);
  check('can target a dead player (re-testing a dead red herring is a real, common play)',
    prompt.targets.some(t => t.id === 't1'));
  check('can also target themselves — official ruling explicitly allows this',
    prompt.targets.some(t => t.id === 'ft1'));

  let yes = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const gr = E.newGame();
    gr.config.recluseRegistersEvil = 0.5;
    gr.nightNumber = 2; gr.phase = 'night'; gr.wave = 1; gr.results = {};
    gr.players = [mk('ft1', 'fortuneteller'), mk('rec1', 'recluse'), mk('imp1', 'imp'), mk('t1', 'soldier'), mk('t2', 'slayer')];
    gr.pending = { ft1: { targets: ['rec1', 't1'], decoy: false } };
    await E.resolveNight(gr, 1);
    if (gr.results.ft1.body.startsWith('Yes')) yes++;
  }
  check('pings on a Recluse roughly half the time (registration roll was being skipped entirely)',
    yes > trials * 0.3 && yes < trials * 0.7, `saw ${yes}/${trials} yes`);

  const gWhim = E.newGame();
  gWhim.config.recluseRegistersEvil = 1;
  gWhim.nightNumber = 2; gWhim.phase = 'night'; gWhim.wave = 1; gWhim.results = {};
  gWhim.players = [mk('ft1', 'fortuneteller'), mk('rec1', 'recluse'), mk('imp1', 'imp'), mk('t1', 'soldier'), mk('t2', 'slayer')];
  gWhim.pending = { ft1: { targets: ['rec1', 't1'], decoy: false } };
  await E.resolveNight(gWhim, 1);
  check('a Recluse registering evil leaves the same non-secret whim line, visible live',
    gWhim.log.some(l => l.text === 'A quiet decision was made, unseen.' && l.secret === false));

  // Real bug: the Demon (order 24 on other nights) acts before the Fortune
  // Teller (order 54) — a Fortune Teller the Demon kills this same night
  // must not get a reading at all, same as any other standing-ability
  // character who dies before their own turn. p.alive isn't flipped false
  // until resolveNight's "Apply deaths" pass runs *after* the whole
  // night's order, so this only shows up when the killer's order number is
  // genuinely lower — a same-game unit test with both in the right order,
  // not just "she's alive when resolve() checks her".
  const gk = E.newGame();
  gk.nightNumber = 2; gk.phase = 'night'; gk.wave = 1; gk.results = {};
  gk.players = [mk('imp1', 'imp'), mk('ft1', 'fortuneteller'), mk('t1', 'chef'), mk('t2', 'soldier'), mk('t3', 'slayer')];
  gk.pending = { imp1: { targets: ['ft1'], decoy: false }, ft1: { targets: ['t1', 't2'], decoy: false } };
  await E.resolveNight(gk, 1);
  check('a Fortune Teller killed by the Demon this same night gets no reading',
    !gk.results.ft1, gk.results.ft1 && JSON.stringify(gk.results.ft1));
  check('...and no action-log entry either — she never actually got a turn',
    !gk.actionLog.some(a => a.playerId === 'ft1'));
}

console.log('\nEmpath');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  // Real bug, same family as the Fortune Teller one above but structurally
  // different: the Empath isn't dead, but her *count* went stale. Seat
  // order (not just night order) matters here: p0=Empath, p1=an evil
  // Minion seated as her immediate neighbor and about to be killed by the
  // Imp this same night (order 24, vs. Empath's 53), p2/p3=good, p4=Imp
  // (her other neighbor). True neighbors before any kill: p4 (evil) and
  // p1 (evil) -> 2. Once p1's death is decided (even though p1.alive isn't
  // flipped false until after the whole order runs), the CORRECT reading
  // must skip past p1 to the next living player, p2 (good) -> 1.
  const g = E.newGame();
  g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('emp', 'empath'), mk('m1', 'poisoner'), mk('t1', 'chef'), mk('t2', 'butler'), mk('imp1', 'imp')];
  g.pending = { imp1: { targets: ['m1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('a same-night neighbor death is reflected, not a stale pre-kill snapshot',
    g.results.emp.body === 'Evil living neighbours: 1', g.results.emp && g.results.emp.body);
}

console.log('\nExperimental: Steward');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('st', 'steward'), mk('t1', 'chef'), mk('m1', 'poisoner'), mk('d', 'imp')];
  await E.resolveNight(g, 1);
  check('unbroken: names an actually-good player', g.results.st.body === 't1 is a good player.', g.results.st.body);

  const g2 = E.newGame();
  g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('st', 'steward'), mk('t1', 'chef'), mk('m1', 'poisoner'), mk('d', 'imp')];
  g2.players[0].statuses.poisoned = true;
  await E.resolveNight(g2, 1);
  check('broken: guaranteed wrong — names an evil player as "good"',
    g2.results.st.body === 'm1 is a good player.' || g2.results.st.body === 'd is a good player.', g2.results.st.body);
}

console.log('\nExperimental: Knight');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('kn', 'knight'), mk('t1', 'chef'), mk('t2', 'butler'), mk('m1', 'poisoner'), mk('d', 'imp')];
  await E.resolveNight(g, 1);
  check('unbroken: never includes the real Demon', !g.results.kn.names.includes('d'), g.results.kn.names);

  const g2 = E.newGame();
  g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('kn', 'knight'), mk('t1', 'chef'), mk('t2', 'butler'), mk('m1', 'poisoner'), mk('d', 'imp')];
  g2.players[0].statuses.poisoned = true;
  await E.resolveNight(g2, 1);
  check('broken: guaranteed wrong — the real Demon is one of the two shown',
    g2.results.kn.names.includes('d'), g2.results.kn.names);
}

console.log('\nExperimental: Shugenja');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  // Seat order is the ring: sh, t1(good), t2(good), evil, t3(good) — the
  // only evil player is 2 seats clockwise (index 3 vs. Shugenja's index 0)
  // and 2 seats anti-clockwise the other way around a 5-seat ring... to
  // make the direction unambiguous, use an odd split: evil at index 1
  // (1 seat clockwise) vs. wrapping the other way being longer.
  const g = E.newGame();
  g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('sh', 'shugenja'), mk('d', 'imp'), mk('t1', 'chef'), mk('t2', 'butler'), mk('t3', 'soldier')];
  await E.resolveNight(g, 1);
  check('closest evil one seat clockwise is correctly read as clockwise',
    g.results.sh.body === 'Your closest evil player is clockwise.', g.results.sh.body);

  const g2 = E.newGame();
  g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('sh', 'shugenja'), mk('t1', 'chef'), mk('t2', 'butler'), mk('t3', 'soldier'), mk('d', 'imp')];
  await E.resolveNight(g2, 1);
  check('closest evil one seat anti-clockwise (wrapping) is correctly read as anti-clockwise',
    g2.results.sh.body === 'Your closest evil player is anti-clockwise.', g2.results.sh.body);
}

console.log('\nExperimental: Bounty Hunter');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('bh', 'bountyhunter'), mk('t1', 'chef'), mk('m1', 'poisoner'), mk('d', 'imp')];
  await E.resolveNight(g, 1);
  const firstKnown = g.players.find(p => p.id === 'bh').statuses.bountyHunterTargetId;
  check('night 1: names a real evil player and tracks them', ['m1', 'd'].includes(firstKnown), firstKnown);

  const idlePrompt = E.promptFor({ ...g, nightNumber: 2 }, g.players.find(p => p.id === 'bh'));
  check('does not re-trigger while the known target is still alive — gets a decoy, not a real prompt',
    idlePrompt && idlePrompt.decoy === true, idlePrompt);

  // Kill the tracked target, then confirm night 2 hands back a *different*
  // still-living evil player, not the one who just died.
  const known = g.players.find(p => p.id === firstKnown);
  known.alive = false;
  g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  const otherEvilId = firstKnown === 'm1' ? 'd' : 'm1';
  await E.resolveNight(g, 1);
  check('re-triggers once the known target dies, naming the other evil player',
    g.results.bh && g.results.bh.body === `${otherEvilId} is an evil player.`, g.results.bh);
}

console.log('\nExperimental: King');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  // Not yet at the dead >= living threshold: 1 dead of 4 — no action.
  const g = E.newGame();
  g.script = 'tb'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('kg', 'king'), mk('t1', 'chef'), mk('t2', 'butler'), mk('d', 'imp')];
  g.players[1].alive = false;
  await E.resolveNight(g, 1);
  check('does not act while the living still outnumber the dead', !g.results.kg, g.results.kg);

  // 2 dead of 4 — threshold met (dead equals living).
  const g2 = E.newGame();
  g2.script = 'tb'; g2.nightNumber = 3; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('kg', 'king'), mk('t1', 'chef'), mk('t2', 'butler'), mk('d', 'imp')];
  g2.players[1].alive = false; g2.players[2].alive = false;
  await E.resolveNight(g2, 1);
  check('acts once the dead equal the living', !!g2.results.kg, g2.results.kg);
  const namedId = g2.results.kg.body.split(' is the ')[0];
  const namedPlayer = g2.players.find(p => p.id === namedId);
  const namedChar = g2.results.kg.body.split(' is the ')[1].replace('.', '');
  check('unbroken: names a real character actually held by the named player',
    E.trueChar(namedPlayer).name === namedChar, g2.results.kg.body);

  // Demon told "X is the King" — a passive reveal, checked at 7+ players
  // (deliverOpeningInfo's own minion/demon section is gated there, and
  // this line sits just above that gate so it's independent of it, but
  // testing at a size where the rest of the demon's briefing also fires
  // keeps this realistic).
  const g3 = E.newGame();
  g3.script = 'tb'; g3.nightNumber = 1; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('kg', 'king'), mk('t1', 'chef'), mk('t2', 'butler'), mk('t3', 'soldier'), mk('m1', 'poisoner'), mk('m2', 'baron'), mk('d', 'imp')];
  await E.resolveNight(g3, 1);
  check('the Demon is told "X is the King"', g3.results.d && g3.results.d.body.includes('kg is the King.'), g3.results.d && g3.results.d.body);
}

console.log('\nExperimental: Choirboy');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  // The Demon kills the King — Choirboy should learn the Demon's identity.
  const g = E.newGame();
  g.script = 'tb'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('kg', 'king'), mk('cb', 'choirboy'), mk('t1', 'chef'), mk('d', 'imp')];
  g.pending = { d: { targets: ['kg'], decoy: false } };
  await E.resolveNight(g, 1);
  check('fires when the Demon kills the King, naming the real Demon',
    g.results.cb && g.results.cb.body === 'd is the Demon.', g.results.cb);

  // Killed by a Minion instead — same distinction Sage's own test already
  // covers for its "killedByDemon specifically" gate.
  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('kg', 'king'), mk('cb', 'choirboy'), mk('as1', 'assassin'), mk('d', 'fanggu')];
  g2.players.find(p => p.id === 'as1').statuses.assassinUsed = false;
  g2.pending = { as1: { targets: ['kg'], decoy: false } };
  await E.resolveNight(g2, 1);
  check("a Minion kill does not trigger Choirboy's reveal", !g2.results.cb, g2.results.cb);

  // No Choirboy in the game at all — the King's onDeath hook must not
  // throw or write anywhere just because there's no one to inform.
  const g3 = E.newGame();
  g3.script = 'tb'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('kg', 'king'), mk('t1', 'chef'), mk('d', 'imp')];
  g3.pending = { d: { targets: ['kg'], decoy: false } };
  await E.resolveNight(g3, 1);
  check('no Choirboy in play: King still dies cleanly, nothing else happens', !g3.players.find(p => p.id === 'kg').alive);
}

console.log('\nExperimental: Acrobat');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  const g = E.newGame();
  g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ac', 'acrobat'), mk('t1', 'chef'), mk('t2', 'butler')];
  g.players.find(p => p.id === 't1').statuses.poisoned = true;
  g.pending = { ac: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('choosing a poisoned player kills the Acrobat', !g.players.find(p => p.id === 'ac').alive);

  const g2 = E.newGame();
  g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('ac', 'acrobat'), mk('t1', 'chef'), mk('t2', 'butler')];
  g2.pending = { ac: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('choosing a clean player does nothing', g2.players.find(p => p.id === 'ac').alive);

  // Poisoned/drunk Acrobat: the check itself simply doesn't run, even
  // though the chosen player really is poisoned — an impaired active
  // effect does nothing, it doesn't misfire.
  const g3 = E.newGame();
  g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('ac', 'acrobat'), mk('t1', 'chef'), mk('t2', 'butler')];
  g3.players.find(p => p.id === 'ac').statuses.poisoned = true;
  g3.players.find(p => p.id === 't1').statuses.poisoned = true;
  g3.pending = { ac: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g3, 1);
  check('an impaired Acrobat never dies from the check, even on a true match',
    g3.players.find(p => p.id === 'ac').alive);
}

console.log('\nExperimental: Nightwatchman');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  // Paired with a Chef (also acts night 1, order 36) specifically to
  // exercise the real bug this test caught: Chef's own resolve() does a
  // blind results[p.id] = {...} overwrite, so if Nightwatchman ran
  // *before* Chef in the order, Chef would clobber the reveal entirely.
  // Nightwatchman's order-90 placement plus the merge-not-overwrite fix
  // is what keeps both intact together.
  const g = E.newGame();
  g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('nw', 'nightwatchman'), mk('t1', 'chef')];
  g.pending = { nw: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('the chosen player — not the Nightwatchman — receives the reveal, merged alongside their own info',
    g.results.t1 && g.results.t1.body === 'Pairs of neighbouring evil players: 0 nw is the Nightwatchman.' && !g.results.nw, g.results);
  check('the once-per-game flag is spent on a real choice', g.players.find(p => p.id === 'nw').statuses.nightwatchmanUsed === true);

  // A pass never spends the once-ever charge.
  const g2 = E.newGame();
  g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('nw', 'nightwatchman'), mk('t1', 'chef')];
  g2.pending = { nw: { targets: [], decoy: false } };
  await E.resolveNight(g2, 1);
  check('passing does not spend the once-per-game charge', !g2.players.find(p => p.id === 'nw').statuses.nightwatchmanUsed);
}

console.log('\nExperimental: Snitch');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  const g = E.newGame();
  g.script = 'tb'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('sn', 'snitch'), mk('t1', 'chef'), mk('t2', 'butler'), mk('t3', 'soldier'), mk('t4', 'slayer'), mk('m1', 'poisoner'), mk('d', 'imp')];
  await E.resolveNight(g, 1);
  const minionNames = g.results.m1.names;
  check('the Minion gets fellow-Minion info plus 3 bluffs', minionNames.filter(n => n.includes('not in play')).length === 3, minionNames);

  // Fewer than 7 players: the whole evil-briefing section (bluffs
  // included) is gated off, same as it already is without a Snitch.
  const g2 = E.newGame();
  g2.script = 'tb'; g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('sn', 'snitch'), mk('t1', 'chef'), mk('m1', 'poisoner'), mk('d', 'imp')];
  await E.resolveNight(g2, 1);
  check('under 7 players, evil still stays in the dark — no bluffs handed out', !g2.results.m1);
}

console.log('\nButler');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  const g = E.newGame();
  g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('bu1', 'butler'), mk('t1', 'chef')];
  g.pending = { bu1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('an unpoisoned Butler\'s choice sets the next-day master restriction',
    g.players.find(p => p.id === 't1').statuses.master === true);

  // Poisoned/drunk: the ability just doesn't work, same as any other
  // action-only role — no restriction should get set at all, or server.js's
  // vote enforcement would silently discard a vote the Butler should have
  // been free to cast however they liked.
  const g2 = E.newGame();
  g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('bu1', 'butler'), mk('t1', 'chef')];
  g2.players.find(p => p.id === 'bu1').statuses.poisoned = true;
  g2.pending = { bu1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('a poisoned Butler\'s choice sets no restriction at all',
    !g2.players.find(p => p.id === 't1').statuses.master);
}

console.log('\nSpy grimoire under impairment');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const lineup = () => [mk('spy1', 'spy'), mk('imp1', 'imp'), mk('t1', 'chef'), mk('t2', 'soldier'), mk('t3', 'slayer')];

  const gs = E.newGame();
  gs.nightNumber = 2; gs.phase = 'night'; gs.wave = 1; gs.results = {};
  gs.players = lineup();
  await E.resolveNight(gs, 1);
  const trueNames = gs.players.map(p => E.trueChar(p).name);
  check('an unpoisoned Spy sees the true grimoire',
    JSON.stringify(gs.results.spy1.grimoire.map(r => r.character)) === JSON.stringify(trueNames));

  let anyDiffered = false;
  for (let i = 0; i < 20; i++) {
    const gp2 = E.newGame();
    gp2.nightNumber = 2; gp2.phase = 'night'; gp2.wave = 1; gp2.results = {};
    gp2.players = lineup();
    gp2.players[0].statuses.poisoned = true;
    await E.resolveNight(gp2, 1);
    const shown = gp2.results.spy1.grimoire.map(r => r.character);
    const truth = gp2.players.map(p => E.trueChar(p).name);
    if (JSON.stringify(shown) !== JSON.stringify(truth)) anyDiffered = true;
  }
  check('a poisoned Spy can see wrong attributions instead of the real grimoire (20 attempts)', anyDiffered);
}

console.log('\nSpy grimoire: also shows what the Drunk (and Lunatic) believe they are');
{
  // The whole reason the Storyteller's real Grimoire tracks a believed
  // character at all is the Drunk (and Lunatic) — the Spy's ability is
  // "you see the Grimoire", so it should show the same thing, not just the
  // true character each row already had.
  const g = E.newGame();
  g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [
    { id: 'spy1', name: 'spy1', characterId: 'spy', believedId: 'spy', alive: true, statuses: {} },
    { id: 'drunk1', name: 'drunk1', characterId: 'drunk', believedId: 'empath', alive: true, statuses: {} },
    { id: 'imp1', name: 'imp1', characterId: 'imp', believedId: 'imp', alive: true, statuses: {} },
    { id: 't1', name: 't1', characterId: 'chef', believedId: 'chef', alive: true, statuses: {} },
    { id: 't2', name: 't2', characterId: 'soldier', believedId: 'soldier', alive: true, statuses: {} },
  ];
  await E.resolveNight(g, 1);
  const grim = g.results.spy1 && g.results.spy1.grimoire;
  const drunkRow = grim && grim.find(r => r.name === 'drunk1');
  const spyRow = grim && grim.find(r => r.name === 'spy1');
  check('the Drunk\'s row shows their true character', drunkRow && drunkRow.character === 'Drunk');
  check('...and separately what they believe they are', drunkRow && drunkRow.believedCharacter === 'Empath');
  check('a row whose belief matches the truth carries no believedCharacter',
    spyRow && (spyRow.believedCharacter === null || spyRow.believedCharacter === undefined));
}

console.log('\nSpy grimoire: internal bookkeeping stays out of the shown statuses');
{
  // Real gap found on review: the Spy's own filter only ever excluded one
  // key (poisonedUntilNight), while ~50 status keys have accumulated
  // across tb/bmr/sv/carousel since — a real Spy was seeing raw,
  // meaningless tags like "grandchildId" or "jugglerGuesses" (an array;
  // Object.keys() only returns the key, never what it holds, so it could
  // never render as a sensible tag regardless of name). Now backed by the
  // same shared h.INTERNAL_ONLY_STATUSES set server.js's Dry Run observer
  // uses, instead of two independently-drifting lists.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.nightNumber = 2; g.phase = 'night'; g.results = {};
  g.players = [
    mk('spy1', 'spy'), mk('imp1', 'imp'), mk('t1', 'chef'), mk('t2', 'soldier'), mk('t3', 'slayer'),
  ];
  const target = g.players.find(p => p.id === 't1');
  // A mix of genuinely meaningful statuses (should still show) and
  // internal-only bookkeeping (should now be hidden) on the same player.
  // diedTonight is deliberately NOT included here — resolveNight's own
  // "reset per-night markers" step unconditionally clears it before any
  // character's resolve() runs at all (including the Spy's own), so it
  // could never appear in a same-night grimoire regardless of this
  // filter; testing it here would pass for the wrong reason.
  target.statuses.poisoned = true;
  target.statuses.master = true;
  target.statuses.grandchildId = 'imp1';
  target.statuses.evilTwinId = 'imp1';
  target.statuses.jugglerGuesses = [{ playerId: 'imp1', characterId: 'imp' }];
  target.statuses.gossipClaimDay = 2;
  target.statuses.cannibalPoisoned = true; // redundant with `poisoned`, already shown
  target.statuses.poisonedUntilNight = 2;

  await E.resolveNight(g);
  const row = g.results.spy1.grimoire.find(r => r.name === 't1');
  check('meaningful statuses still show (poisoned, master)',
    row.statuses.includes('poisoned') && row.statuses.includes('master'), JSON.stringify(row.statuses));
  check('id-reference bookkeeping is hidden (grandchildId, evilTwinId)',
    !row.statuses.includes('grandchildId') && !row.statuses.includes('evilTwinId'), JSON.stringify(row.statuses));
  check('array/day-number bookkeeping is hidden (jugglerGuesses, gossipClaimDay)',
    !row.statuses.includes('jugglerGuesses') && !row.statuses.includes('gossipClaimDay'), JSON.stringify(row.statuses));
  check('redundant/night-threshold bookkeeping is hidden (cannibalPoisoned, poisonedUntilNight)',
    !row.statuses.includes('cannibalPoisoned') && !row.statuses.includes('poisonedUntilNight'), JSON.stringify(row.statuses));
}

console.log('\nSpy/Recluse as a registered subject for Washerwoman-type reveals');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const townsfolkNames = E.scriptPool('tb').filter(c => c.team === 'townsfolk').map(c => c.name);
  let sawSpyAsSubject = false; // subject specifically, not just present as a decoy
  let namedRealTownsfolk = true;
  for (let i = 0; i < 60 && !sawSpyAsSubject; i++) {
    const gw = E.newGame();
    gw.config.recluseRegistersEvil = 1; // force the registration roll itself; picking as subject is still random
    gw.nightNumber = 1; gw.phase = 'night'; gw.wave = 1; gw.results = {};
    gw.players = [mk('ww1', 'washerwoman'), mk('spy1', 'spy'), mk('imp1', 'imp'), mk('t1', 'soldier'), mk('t2', 'slayer')];
    await E.resolveNight(gw, 1);
    const info = gw.results.ww1;
    // The Spy is the *subject* (not merely the decoy) exactly when the named
    // character isn't Soldier or Slayer — the only two true Townsfolk here.
    if (info.names.includes('spy1') && !info.body.includes('Soldier') && !info.body.includes('Slayer')) {
      sawSpyAsSubject = true;
      namedRealTownsfolk = townsfolkNames.some(n => info.body.includes(n)) && !info.body.includes('Spy');
    }
  }
  check('with registration forced on, the Spy can be shown as Washerwoman\'s subject (60 attempts)', sawSpyAsSubject);
  check('...and the named character is a real Townsfolk role, never "Spy" itself', namedRealTownsfolk);
}

console.log('\nLibrarian: "no Outsider in play", under impairment');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  // "You learn that no Outsider is in play" is itself real information —
  // a poisoned/drunk Librarian must be lied to here too, same as any other
  // answer. This branch used to return the true "none in play" text before
  // ever checking the impairment flag.
  const g = E.newGame();
  g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('li1', 'librarian'), mk('imp1', 'imp'), mk('t1', 'soldier'), mk('t2', 'slayer')]; // no Outsider dealt
  await E.resolveNight(g, 1);
  check('an unpoisoned Librarian is truthfully told no Outsider is in play (sanity check)',
    g.results.li1.body.includes('no outsider is in play'));

  const g2 = E.newGame();
  g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('li1', 'librarian'), mk('imp1', 'imp'), mk('t1', 'soldier'), mk('t2', 'slayer')];
  g2.players.find(p => p.id === 'li1').statuses.poisoned = true;
  await E.resolveNight(g2, 1);
  check('a poisoned Librarian is NOT told the true "no Outsider in play" fact',
    !g2.results.li1.body.includes('no outsider is in play'));
  check('...gets a fabricated false-positive pair instead',
    g2.results.li1.names.length === 2);
}

console.log('\nMayor win condition');
{
  const mk = (id, characterId, isAlive = true) => ({ id, name: id, characterId, believedId: characterId, alive: isAlive, statuses: {} });

  const gm1 = E.newGame();
  gm1.phase = 'day'; gm1.noExecutionToday = true;
  gm1.players = [mk('mayor1', 'mayor'), mk('t1', 'soldier'), mk('imp1', 'imp'), mk('dead1', 'chef', false), mk('dead2', 'empath', false)];
  check('3 alive, no execution, Mayor alive -> good wins',
    JSON.stringify(E.checkVictory(gm1)) ===
    JSON.stringify({ winner: 'good', reason: 'Only 3 remain, no one was executed, and the Mayor still lives.' }));

  const gm2 = E.newGame();
  gm2.phase = 'day'; gm2.noExecutionToday = true;
  gm2.players = [mk('mayor1', 'mayor', false), mk('t1', 'soldier'), mk('imp1', 'imp'), mk('t2', 'chef')];
  check('...but not if the Mayor is dead', E.checkVictory(gm2) === null);

  const gm3 = E.newGame();
  gm3.phase = 'day'; gm3.noExecutionToday = false;
  gm3.players = [mk('mayor1', 'mayor'), mk('t1', 'soldier'), mk('imp1', 'imp')];
  check('...or if an execution happened today', E.checkVictory(gm3) === null);

  const gm4 = E.newGame();
  gm4.phase = 'day'; gm4.noExecutionToday = true;
  gm4.players = [mk('mayor1', 'mayor'), mk('t1', 'soldier'), mk('t2', 'chef'), mk('imp1', 'imp')];
  check('...or if the count isn\'t exactly 3', E.checkVictory(gm4) === null);
}

console.log('\nMayor redirect on a night kill');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const lineup = () => [mk('imp1', 'imp'), mk('mayor1', 'mayor'), mk('t1', 'chef'), mk('t2', 'soldier'), mk('t3', 'slayer')];

  let redirected = 0, notRedirected = 0;
  for (let i = 0; i < 40; i++) {
    const g = E.newGame();
    g.config.mayorRedirectChance = 0.5;
    g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
    g.players = lineup();
    g.pending = { imp1: { targets: ['mayor1'], decoy: false } };
    await E.resolveNight(g, 1);
    if (g.players.find(p => p.id === 'mayor1').alive) redirected++; else notRedirected++;
  }
  check('the Mayor\'s night death is sometimes redirected, sometimes not (40 trials)',
    redirected > 5 && notRedirected > 5, `redirected ${redirected}, died ${notRedirected}`);

  const gOff = E.newGame();
  gOff.config.mayorRedirectChance = 0;
  gOff.nightNumber = 2; gOff.phase = 'night'; gOff.wave = 1; gOff.results = {};
  gOff.players = lineup();
  gOff.pending = { imp1: { targets: ['mayor1'], decoy: false } };
  await E.resolveNight(gOff, 1);
  check('with the chance forced to 0, the Mayor just dies', !gOff.players.find(p => p.id === 'mayor1').alive);

  const gOn = E.newGame();
  gOn.config.mayorRedirectChance = 1;
  gOn.nightNumber = 2; gOn.phase = 'night'; gOn.wave = 1; gOn.results = {};
  gOn.players = lineup();
  gOn.pending = { imp1: { targets: ['mayor1'], decoy: false } };
  await E.resolveNight(gOn, 1);
  const mayorSurvived = gOn.players.find(p => p.id === 'mayor1').alive;
  const othersDead = gOn.players.filter(p => p.id !== 'mayor1' && p.id !== 'imp1' && !p.alive).length;
  check('with the chance forced to 1, the Mayor survives and someone else dies instead',
    mayorSurvived && othersDead === 1);
  check('the redirect leaves a non-secret, non-attributing whim line the host sees live',
    gOn.log.some(l => l.text === 'A quiet decision was made, unseen.' && l.secret === false));

  const gPoison = E.newGame();
  gPoison.config.mayorRedirectChance = 1;
  gPoison.nightNumber = 2; gPoison.phase = 'night'; gPoison.wave = 1; gPoison.results = {};
  gPoison.players = lineup();
  gPoison.players.find(p => p.id === 'mayor1').statuses.poisoned = true;
  gPoison.pending = { imp1: { targets: ['mayor1'], decoy: false } };
  await E.resolveNight(gPoison, 1);
  check('a poisoned Mayor gets no redirect (the ability just fails) and dies normally',
    !gPoison.players.find(p => p.id === 'mayor1').alive);
}

console.log('\nBMR: Sailor');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  let sailorDrunk = 0, targetDrunk = 0, bad = 0;
  for (let i = 0; i < 60; i++) {
    const g = E.newGame();
    g.script = 'bmr'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
    g.players = [mk('sailor1', 'sailor'), mk('t1', 'chef')];
    g.pending = { sailor1: { targets: ['t1'], decoy: false } };
    await E.resolveNight(g, 1);
    const sd = !!g.players[0].statuses.drunk, td = !!g.players[1].statuses.drunk;
    if (sd && !td) sailorDrunk++; else if (td && !sd) targetDrunk++; else bad++;
  }
  check('Sailor makes exactly one of {self, target} drunk, never both or neither (60 trials)',
    bad === 0 && sailorDrunk > 5 && targetDrunk > 5, `sailor ${sailorDrunk}, target ${targetDrunk}, bad ${bad}`);

  const gs = E.newGame();
  gs.players = [mk('sailor1', 'sailor'), mk('imp1', 'imp')];
  check('a functioning Sailor cannot be killed by the Demon',
    E.wouldBlockKill(gs, gs.players[0], { demonAttack: true }) === 'sailor');
  check('...nor executed — "You can\'t die" has no carve-out for execution',
    E.wouldBlockKill(gs, gs.players[0], { executionAttack: true }) === 'sailor');

  gs.players[0].statuses.drunk = true;
  check('...but a drunk Sailor has no protection at all, including from execution',
    E.wouldBlockKill(gs, gs.players[0], { executionAttack: true }) === null);
}

console.log('\nBMR: Chambermaid');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  // Poisoner genuinely acts; Empath is a pure-info role that still "wakes";
  // Soldier has no night ability at all and isn't in tonight's order.
  g.players = [mk('cm1', 'chambermaid'), mk('poi1', 'poisoner'), mk('emp1', 'empath'), mk('t1', 'soldier')];
  g.pending = { cm1: { targets: ['poi1', 'emp1'], decoy: false }, poi1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('Chambermaid counts both a choice-role and a pure-info role as woken',
    g.results.cm1.body.includes('2'), g.results.cm1.body);

  // Official ruling: "Players that woke tonight due to their ability but are
  // drunk or poisoned still count as having woke tonight" — impairment
  // silences the effect, not the physical act of waking. A character with
  // no night ability at all (never in the acting order) still doesn't count.
  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('cm1', 'chambermaid'), mk('poi1', 'poisoner'), mk('t1', 'soldier')];
  g2.players.find(p => p.id === 'poi1').statuses.poisoned = true;
  g2.pending = { cm1: { targets: ['poi1', 't1'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('an impaired role that still wakes counts as 1, not 0',
    g2.results.cm1.body.includes('1'), g2.results.cm1.body);

  const g3 = E.newGame();
  g3.script = 'bmr'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('cm1', 'chambermaid'), mk('t1', 'soldier'), mk('t2', 'fool')];
  g3.pending = { cm1: { targets: ['t1', 't2'], decoy: false } };
  await E.resolveNight(g3, 1);
  check('...but a character with no night ability at all is never counted',
    g3.results.cm1.body.includes('0'), g3.results.cm1.body);

  // A night-order slot isn't the same as actually waking — Godfather only
  // acts once an Outsider's been executed. actingTonight() used to count
  // purely from the static order number and never checked this, so a
  // Godfather sitting out a quiet night was still counted as having woken.
  const g4 = E.newGame();
  g4.script = 'bmr'; g4.nightNumber = 2; g4.phase = 'night'; g4.wave = 1; g4.results = {};
  g4.players = [mk('cm1', 'chambermaid'), mk('gf1', 'godfather'), mk('t1', 'soldier')];
  g4.pending = { cm1: { targets: ['gf1', 't1'], decoy: false } };
  await E.resolveNight(g4, 1);
  check('a Godfather with no qualifying Outsider execution today does not count as woken',
    g4.results.cm1.body.includes('0'), g4.results.cm1.body);
}

console.log('\nBMR: Exorcist blocks the Demon');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ex1', 'exorcist'), mk('imp1', 'imp'), mk('t1', 'chef'), mk('t2', 'soldier')];
  g.pending = { ex1: { targets: ['imp1'], decoy: false }, imp1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('a Demon targeted by the Exorcist does not act — their target survives',
    g.players.find(p => p.id === 't1').alive);
  check('the Demon is told the Exorcist\'s actual name, not just flavor text saying "the Exorcist"',
    !!g.results.imp1 && g.results.imp1.body.includes('ex1'));

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 3; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('ex1', 'exorcist'), mk('imp1', 'imp'), mk('t1', 'chef'), mk('t2', 'empath')];
  g2.pending = { ex1: { targets: ['t1'], decoy: false }, imp1: { targets: ['t2'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('...but targeting a non-Demon leaves the Demon free to act',
    !g2.players.find(p => p.id === 't2').alive);
}

console.log('\nBMR: Innkeeper');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ik1', 'innkeeper'), mk('imp1', 'imp'), mk('t1', 'chef'), mk('t2', 'soldier')];
  g.pending = { ik1: { targets: ['t1', 't2'], decoy: false }, imp1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  const t1 = g.players.find(p => p.id === 't1'), t2 = g.players.find(p => p.id === 't2');
  check('both Innkeeper picks survive a Demon attack', t1.alive && t2.alive);
  check('exactly one of the two ends up drunk until dusk',
    (!!t1.statuses.drunk) !== (!!t2.statuses.drunk));
}

console.log('\nBMR: Gambler');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ga1', 'gambler'), mk('t1', 'chef')];
  g.pending = { ga1: { targets: ['t1'], decoy: false, characterGuess: 'chef' } };
  await E.resolveNight(g, 1);
  check('a correct guess costs the Gambler nothing', g.players.find(p => p.id === 'ga1').alive);

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('ga1', 'gambler'), mk('t1', 'chef')];
  g2.pending = { ga1: { targets: ['t1'], decoy: false, characterGuess: 'empath' } };
  await E.resolveNight(g2, 1);
  check('a wrong guess kills the Gambler', !g2.players.find(p => p.id === 'ga1').alive);
  check('the Gambler is never told whether they were right or wrong',
    !g2.results.ga1);

  const g3 = E.newGame();
  g3.script = 'bmr'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('ga1', 'gambler'), mk('t1', 'chef')];
  g3.players[0].statuses.poisoned = true;
  g3.pending = { ga1: { targets: ['t1'], decoy: false, characterGuess: 'empath' } };
  await E.resolveNight(g3, 1);
  check('a poisoned Gambler never dies from a wrong guess — the ability just fails',
    g3.players.find(p => p.id === 'ga1').alive);

  // Goes through the same protection stack as everyone else (checkKill with
  // no special flags) — not a bypass-all kill like the Assassin's. Forcing
  // characterId/believedId apart like this only happens for real via Drunk
  // or Lunatic, but it's the direct way to prove the death check reads true
  // character (protection) independently of believed character (dispatch).
  const g4 = E.newGame();
  g4.script = 'bmr'; g4.nightNumber = 2; g4.phase = 'night'; g4.wave = 1; g4.results = {};
  g4.players = [{ id: 'ga1', name: 'ga1', characterId: 'fool', believedId: 'gambler', alive: true, statuses: {} }, mk('t1', 'chef')];
  g4.pending = { ga1: { targets: ['t1'], decoy: false, characterGuess: 'empath' } };
  await E.resolveNight(g4, 1);
  check('a wrong guess still respects the Fool\'s one-time survival',
    g4.players.find(p => p.id === 'ga1').alive && g4.players.find(p => p.id === 'ga1').statuses.foolUsed);

  // Innkeeper's "can't die tonight" is absolute — not Demon-specific — so
  // it has to block the Gambler's own self-inflicted death too. This used
  // to call checkKill with no flags at all, skipping every protection
  // check including this one.
  const g5 = E.newGame();
  g5.script = 'bmr'; g5.nightNumber = 2; g5.phase = 'night'; g5.wave = 1; g5.results = {};
  g5.players = [mk('ga1', 'gambler'), mk('ik1', 'innkeeper'), mk('t1', 'chef')];
  g5.pending = {
    ik1: { targets: ['ga1', 't1'], decoy: false },
    ga1: { targets: ['t1'], decoy: false, characterGuess: 'empath' },
  };
  await E.resolveNight(g5, 1);
  check('an Innkeeper-protected Gambler survives a wrong guess',
    g5.players.find(p => p.id === 'ga1').alive);
}

console.log('\nBMR: Gossip');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  // The Gossip never chooses who dies any more — the kill is fully
  // automatic (randomKiller()), so there's nothing left for a real prompt
  // to offer. Always a decoy, regardless of whether the claim was true —
  // which also means there's no real-vs-decoy leak of the claim's truth.
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('go1', 'gossip'), mk('t1', 'chef')];
  g.players[0].statuses.gossipClaimDay = 1;
  g.players[0].statuses.gossipClaimTrue = true;
  check('a true claim still gets a decoy prompt — there is nothing left to choose',
    E.promptFor(g, g.players[0]).decoy === true);

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('go1', 'gossip'), mk('t1', 'chef')];
  g2.players[0].statuses.gossipClaimDay = 1;
  g2.players[0].statuses.gossipClaimTrue = false;
  check('a false claim also gets a decoy', E.promptFor(g2, g2.players[0]).decoy === true);

  // A true claim from yesterday kills someone tonight — chosen at random,
  // since gossipClaimDay/gossipClaimTrue are frozen by /api/gossip-claim
  // (server.js), and this only tests what the engine does once they're set.
  const g3 = E.newGame();
  g3.script = 'bmr'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('go1', 'gossip'), mk('t1', 'chef')];
  g3.players[0].statuses.gossipClaimDay = 1;
  g3.players[0].statuses.gossipClaimTrue = true;
  await E.resolveNight(g3, 1);
  check('a true claim from yesterday kills the only other player automatically',
    !g3.players.find(p => p.id === 't1').alive);

  // No claim, or a claim from an earlier day (not yesterday relative to
  // tonight), never kills anyone.
  const g4 = E.newGame();
  g4.script = 'bmr'; g4.nightNumber = 3; g4.phase = 'night'; g4.wave = 1; g4.results = {};
  g4.players = [mk('go1', 'gossip'), mk('t1', 'chef')];
  g4.players[0].statuses.gossipClaimDay = 1; // would have fired night 2, not night 3
  g4.players[0].statuses.gossipClaimTrue = true;
  await E.resolveNight(g4, 1);
  check('a stale claim from an earlier day never kills anyone', g4.players.find(p => p.id === 't1').alive);

  const g5 = E.newGame();
  g5.script = 'bmr'; g5.nightNumber = 2; g5.phase = 'night'; g5.wave = 1; g5.results = {};
  g5.players = [mk('go1', 'gossip'), mk('t1', 'chef')];
  await E.resolveNight(g5, 1);
  check('no claim made at all never kills anyone', g5.players.find(p => p.id === 't1').alive);

  // Impairment at the moment the kill would happen (independent of the
  // frozen day-time truth) blocks it entirely, same as every other ability.
  const g6 = E.newGame();
  g6.script = 'bmr'; g6.nightNumber = 2; g6.phase = 'night'; g6.wave = 1; g6.results = {};
  g6.players = [mk('go1', 'gossip'), mk('t1', 'chef')];
  g6.players[0].statuses.gossipClaimDay = 1;
  g6.players[0].statuses.gossipClaimTrue = true;
  g6.players[0].statuses.poisoned = true;
  await E.resolveNight(g6, 1);
  check('poisoned at the moment of the kill, it fails even though the claim was true',
    g6.players.find(p => p.id === 't1').alive);

  // The Gossip is never their own random victim.
  let goSurvivedAll = true;
  for (let i = 0; i < 30; i++) {
    const gt = E.newGame();
    gt.script = 'bmr'; gt.nightNumber = 2; gt.phase = 'night'; gt.wave = 1; gt.results = {};
    gt.players = [mk('go1', 'gossip'), mk('t1', 'chef'), mk('t2', 'soldier'), mk('t3', 'empath')];
    gt.players[0].statuses.gossipClaimDay = 1;
    gt.players[0].statuses.gossipClaimTrue = true;
    await E.resolveNight(gt, 1);
    if (!gt.players.find(p => p.id === 'go1').alive) goSurvivedAll = false;
  }
  check('the Gossip is never their own random victim (30 trials)', goSurvivedAll);

  // The kill is tagged distinctly from both the Demon and a Minion — it
  // must never trigger the Grandmother's link, whichever random victim it
  // happens to land on.
  let linkNeverFalselyTriggered = true;
  for (let i = 0; i < 30; i++) {
    const gl = E.newGame();
    gl.script = 'bmr'; gl.nightNumber = 2; gl.phase = 'night'; gl.wave = 1; gl.results = {};
    gl.players = [mk('go1', 'gossip'), mk('gm1', 'grandmother'), mk('gc1', 'chef'), mk('t1', 'soldier')];
    gl.players[0].statuses.gossipClaimDay = 1;
    gl.players[0].statuses.gossipClaimTrue = true;
    gl.players.find(p => p.id === 'gm1').statuses.grandchildId = 'gc1';
    await E.resolveNight(gl, 1);
    const gc1Died = !gl.players.find(p => p.id === 'gc1').alive;
    const gmAlive = gl.players.find(p => p.id === 'gm1').alive;
    if (gc1Died && !gmAlive) linkNeverFalselyTriggered = false;
  }
  check('whenever the random victim is the Grandmother\'s grandchild, the Grandmother never also dies (30 trials)',
    linkNeverFalselyTriggered);
}

console.log('\nBMR: randomKiller (shared Mayor-redirect resolver)');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  const g = E.newGame();
  g.players = [mk('t1', 'chef')];
  check('a non-Mayor single-candidate pool is returned as-is',
    await E.randomKiller(g, [g.players[0]]) === g.players[0]);

  // Forcing the roll (chance = 1) against a lone Mayor with alternates
  // available must redirect to one of them, never the Mayor.
  let redirectedEveryTime = true;
  for (let i = 0; i < 20; i++) {
    const gm = E.newGame();
    gm.config.mayorRedirectChance = 1;
    gm.players = [mk('may1', 'mayor'), mk('t1', 'chef'), mk('t2', 'soldier')];
    const result = await E.randomKiller(gm, [gm.players[0]]);
    if (result.id === 'may1') redirectedEveryTime = false;
  }
  check('mayorRedirectChance=1 always redirects away from the Mayor (20 trials)', redirectedEveryTime);

  // chance = 0 must never redirect.
  const gm0 = E.newGame();
  gm0.config.mayorRedirectChance = 0;
  gm0.players = [mk('may1', 'mayor'), mk('t1', 'chef')];
  check('mayorRedirectChance=0 never redirects', (await E.randomKiller(gm0, [gm0.players[0]])).id === 'may1');

  // An impaired Mayor never redirects — the ability just fails.
  const gmi = E.newGame();
  gmi.config.mayorRedirectChance = 1;
  gmi.players = [mk('may1', 'mayor'), mk('t1', 'chef')];
  gmi.players[0].statuses.poisoned = true;
  check('a poisoned Mayor never redirects, even at chance=1', (await E.randomKiller(gmi, [gmi.players[0]])).id === 'may1');

  // With no alternates to redirect to, the Mayor is the result regardless.
  const gmSolo = E.newGame();
  gmSolo.config.mayorRedirectChance = 1;
  gmSolo.players = [mk('may1', 'mayor')];
  check('no living alternates to redirect to -> the Mayor stands', (await E.randomKiller(gmSolo, [gmSolo.players[0]])).id === 'may1');

  // A pool of many, no Mayor involved, spreads across more than one victim.
  const seen = new Set();
  const gp = E.newGame();
  gp.players = [mk('a', 'chef'), mk('b', 'soldier'), mk('c', 'empath'), mk('d', 'fool')];
  for (let i = 0; i < 30; i++) seen.add((await E.randomKiller(gp, gp.players)).id);
  check('a multi-candidate pool is genuinely randomized, not always the same pick (30 trials)', seen.size > 1);

  // dramaBias's one real hook: weighting toward whoever's already been
  // nominated today. With nobody nominated at all, weights collapse to
  // uniform regardless of bias (every existing randomKiller() test above
  // relies on exactly this — none of them set up nominations).
  const trials = 400;
  const gBias0 = E.newGame();
  gBias0.config.dramaBias = 0;
  gBias0.players = [mk('a', 'chef'), mk('b', 'soldier'), mk('c', 'empath'), mk('d', 'fool')];
  gBias0.nominations = [{ nomineeId: 'a' }, { nomineeId: 'a' }, { nomineeId: 'a' }];
  let aCountBias0 = 0;
  for (let i = 0; i < trials; i++) if ((await E.randomKiller(gBias0, gBias0.players)).id === 'a') aCountBias0++;
  check('dramaBias=0 ignores nomination history — roughly a flat 1-in-4, even with "a" nominated 3 times',
    aCountBias0 > trials * 0.15 && aCountBias0 < trials * 0.35, `saw a picked ${aCountBias0}/${trials}`);

  const gBias1 = E.newGame();
  gBias1.config.dramaBias = 1;
  gBias1.players = [mk('a', 'chef'), mk('b', 'soldier'), mk('c', 'empath'), mk('d', 'fool')];
  gBias1.nominations = [{ nomineeId: 'a' }, { nomineeId: 'a' }, { nomineeId: 'a' }];
  let aCountBias1 = 0;
  for (let i = 0; i < trials; i++) if ((await E.randomKiller(gBias1, gBias1.players)).id === 'a') aCountBias1++;
  check('dramaBias=1 clearly favors the most-nominated candidate over the flat-bias rate',
    aCountBias1 > aCountBias0 + trials * 0.15, `bias0 saw ${aCountBias0}/${trials}, bias1 saw ${aCountBias1}/${trials}`);
}

console.log('\nBMR: Courtier');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 3; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('co1', 'courtier'), mk('t1', 'chef')];
  g.pending = { co1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  const t1 = g.players.find(p => p.id === 't1');
  check('Courtier makes the target drunk', t1.statuses.drunk === true);
  check('...for exactly 3 nights and days (clears at dusk of night 6, not before)',
    t1.statuses.drunkUntilNight === 5);
  check('Courtier is marked used, so cannot act again', g.players.find(p => p.id === 'co1').statuses.courtierUsed === true);
}

console.log('\nBMR: Professor');
{
  const mk = (id, characterId, isAlive = true) => ({ id, name: id, characterId, believedId: characterId, alive: isAlive, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 3; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('pr1', 'professor'), mk('dead1', 'chef', false), mk('dead2', 'imp', false)];
  g.pending = { pr1: { targets: ['dead1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('Professor resurrects a dead Townsfolk', g.players.find(p => p.id === 'dead1').alive);

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 3; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('pr1', 'professor'), mk('dead2', 'imp', false)];
  g2.pending = { pr1: { targets: ['dead2'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('...but not a dead Demon', !g2.players.find(p => p.id === 'dead2').alive);
}

console.log('\nBMR: Devil\'s Advocate execution immunity');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('da1', 'devilsadvocate'), mk('t1', 'chef')];
  g.pending = { da1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('the chosen player is immune to execution tomorrow',
    E.wouldBlockKill(g, g.players.find(p => p.id === 't1'), { executionAttack: true }) === 'devils-advocate');

  g.nightNumber = 3; g.results = {}; g.pending = { da1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1); // wave-1 reset should clear yesterday's immunity before granting a fresh one
  check('...and that immunity does not linger past the one day it covers (fresh grant re-applies, doesn\'t double)',
    E.wouldBlockKill(g, g.players.find(p => p.id === 't1'), { executionAttack: true }) === 'devils-advocate');

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('da1', 'devilsadvocate'), mk('t1', 'chef')];
  g2.pending = {};
  await E.resolveNight(g2, 1); // no DA action at all this night — clears any stale immunity
  check('with no DA action, no one is execution-immune',
    E.wouldBlockKill(g2, g2.players.find(p => p.id === 't1'), { executionAttack: true }) === null);
}

console.log('\nBMR: Assassin bypasses all protection');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('as1', 'assassin'), mk('t1', 'soldier'), mk('t2', 'fool')];
  g.pending = { as1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('the Assassin kills straight through the Soldier\'s demon-only immunity',
    !g.players.find(p => p.id === 't1').alive);
  check('the Assassin is marked used after a real kill', g.players.find(p => p.id === 'as1').statuses.assassinUsed);

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('as1', 'assassin'), mk('t2', 'fool')];
  g2.pending = { as1: { targets: ['t2'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('...and even through the Fool\'s one-time survival',
    !g2.players.find(p => p.id === 't2').alive);

  const g3 = E.newGame();
  g3.script = 'bmr'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('as1', 'assassin'), mk('t1', 'chef')];
  g3.pending = { as1: { targets: [], decoy: false } };
  await E.resolveNight(g3, 1);
  check('passing does not consume the once-per-game charge',
    !g3.players.find(p => p.id === 'as1').statuses.assassinUsed);
}

console.log('\nBMR: Godfather');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  const outsiderCounts = new Set();
  for (let i = 0; i < 30; i++) {
    const g = E.newGame();
    g.script = 'bmr';
    g.players = Array.from({ length: 8 }, (_, i) => ({ id: 'p' + i, name: 'p' + i, statuses: {} }));
    const table = E.SETUP_TABLE['8'];
    // Force a Godfather into the minion slot by re-running setup until it appears,
    // rather than reaching into dealRoles internals.
    let hasGodfather = false;
    for (let j = 0; j < 40 && !hasGodfather; j++) {
      E.dealRoles(g);
      hasGodfather = g.players.some(p => p.characterId === 'godfather');
    }
    if (hasGodfather) {
      const teams = g.players.map(p => E.trueChar(p).team);
      outsiderCounts.add(teams.filter(t => t === 'outsider').length - table.outsider);
    }
  }
  check('Godfather setup shifts the Outsider count by exactly +1 or -1 (never 0 or more)',
    [...outsiderCounts].every(d => d === 1 || d === -1), 'saw deltas: ' + [...outsiderCounts].join(', '));

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 3; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('gf1', 'godfather'), mk('t1', 'chef')];
  const noOutsiderDied = !E.promptFor(g2, g2.players[0]) || E.promptFor(g2, g2.players[0]).decoy;
  check('Godfather does not act on a night with no executed Outsider', noOutsiderDied);

  g2.deaths = [{ night: 2, name: 'o1', cause: 'execution' }];
  g2.players.push({ id: 'o1', name: 'o1', characterId: 'tinker', believedId: 'tinker', alive: false, statuses: {} });
  const prompt = E.promptFor(g2, g2.players[0]);
  check('...but does after an Outsider is executed', !!prompt && !prompt.decoy && prompt.characterId === 'godfather');
  g2.pending = { gf1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('...and then actually kills', !g2.players.find(p => p.id === 't1').alive);

  // Soldier's card is explicitly "safe from the Demon" — not from a
  // Minion. Godfather used to pass demonAttack: true purely to get
  // Innkeeper protection recognized, which incorrectly granted Soldier
  // immunity as a side effect too.
  const g3 = E.newGame();
  g3.script = 'bmr'; g3.nightNumber = 3; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('gf1', 'godfather'), mk('so1', 'soldier')];
  g3.deaths = [{ night: 2, name: 'o1', cause: 'execution' }]; // outsiderDiedToday checks night === nightNumber - 1
  g3.players.push({ id: 'o1', name: 'o1', characterId: 'tinker', believedId: 'tinker', alive: false, statuses: {} });
  g3.pending = { gf1: { targets: ['so1'], decoy: false } };
  await E.resolveNight(g3, 1);
  check('a Godfather kill is NOT blocked by Soldier immunity — that\'s Demon-only',
    !g3.players.find(p => p.id === 'so1').alive);
}

console.log('\nBMR: Pukka');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('pu1', 'pukka'), mk('t1', 'chef'), mk('t2', 'soldier')];
  g.pending = { pu1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('the first poison target is poisoned but does not die yet',
    g.players.find(p => p.id === 't1').statuses.poisoned && g.players.find(p => p.id === 't1').alive);

  g.nightNumber = 3; g.results = {};
  g.pending = { pu1: { targets: ['t2'], decoy: false } };
  await E.resolveNight(g, 1);
  check('choosing a new target kills the previously poisoned player',
    !g.players.find(p => p.id === 't1').alive);
  check('...and the new target becomes poisoned in their place',
    g.players.find(p => p.id === 't2').statuses.poisoned && g.players.find(p => p.id === 't2').alive);

  // "Becomes healthy" applies even when the follow-up kill is blocked — a
  // survivor shouldn't stay permanently poisoned just because Pukka moved
  // on. Uses a real Monk protection rather than Soldier: a poisoned Soldier
  // actually loses their demon immunity (poison disables the ability,
  // correctly), so that combination wouldn't isolate this fix from that
  // other rule. The Monk resolves before Pukka every night (order 12 vs
  // 26), so t1 is freshly protected by the time Pukka's follow-up runs.
  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('pu1', 'pukka'), mk('t1', 'chef'), mk('t2', 'chef'), mk('mo1', 'monk')];
  g2.pending = { pu1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g2, 1);
  g2.nightNumber = 3; g2.results = {};
  g2.pending = { pu1: { targets: ['t2'], decoy: false }, mo1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g2, 1);
  const t1After = g2.players.find(p => p.id === 't1');
  check('a Monk-protected survivor of Pukka\'s follow-up kill becomes healthy again',
    t1After.alive && !t1After.statuses.poisoned);
}

console.log('\nBMR: Shabaloth');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('sh1', 'shabaloth'), mk('t1', 'chef'), mk('t2', 'empath'), mk('t3', 'slayer')];
  g.pending = { sh1: { targets: ['t1', 't2'], decoy: false } };
  await E.resolveNight(g, 1);
  check('Shabaloth kills both chosen players',
    !g.players.find(p => p.id === 't1').alive && !g.players.find(p => p.id === 't2').alive);

  let revived = 0;
  for (let i = 0; i < 40; i++) {
    const g2 = E.newGame();
    g2.script = 'bmr'; g2.config.shabalothRegurgitateChance = 0.5;
    g2.nightNumber = 3; g2.phase = 'night'; g2.wave = 1; g2.results = {};
    g2.players = [mk('sh1', 'shabaloth'), mk('t1', 'chef', ), mk('t3', 'slayer')];
    g2.players.find(p => p.id === 't1').alive = false;
    g2.deaths = [{ night: 2, name: 't1', cause: 'demon', killedByDemon: true }];
    g2.pending = { sh1: { targets: ['t3'], decoy: false } };
    await E.resolveNight(g2, 1);
    if (g2.players.find(p => p.id === 't1').alive) revived++;
  }
  check('regurgitation sometimes brings back last night\'s kill, sometimes not (40 trials)',
    revived > 5 && revived < 35, `revived ${revived}/40`);

  // A Minion's same-night kill must never be an eligible regurgitate target —
  // "a player YOU chose last night" means Shabaloth's own targets only.
  const g3 = E.newGame();
  g3.script = 'bmr'; g3.config.shabalothRegurgitateChance = 1; // force a pick every trial
  g3.nightNumber = 3; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('sh1', 'shabaloth'), mk('t1', 'chef'), mk('t3', 'slayer')];
  g3.players.find(p => p.id === 't1').alive = false; // Assassin's kill last night, not Shabaloth's
  g3.deaths = [{ night: 2, name: 't1', cause: 'minion', killedByDemon: false }];
  g3.pending = { sh1: { targets: ['t3'], decoy: false } };
  await E.resolveNight(g3, 1);
  check('a Minion\'s kill from the same night is never regurgitated by Shabaloth',
    !g3.players.find(p => p.id === 't1').alive);
}

console.log('\nBMR: Po');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('po1', 'po'), mk('t1', 'chef'), mk('t2', 'undertaker'), mk('t3', 'slayer'), mk('t4', 'empath')];
  g.pending = { po1: { targets: [], decoy: false } };
  await E.resolveNight(g, 1);
  check('choosing no one charges Po up, and kills no one',
    g.players.find(p => p.id === 'po1').statuses.poChargedUp === true &&
    g.players.filter(p => p.alive).length === 5);

  g.nightNumber = 3; g.results = {};
  const chargedPrompt = E.promptFor(g, g.players.find(p => p.id === 'po1'));
  check('the next prompt asks for exactly 3 targets', chargedPrompt.count === 3);
  g.pending = { po1: { targets: ['t1', 't2', 't3'], decoy: false } };
  await E.resolveNight(g, 1);
  check('a charged Po kills all 3 chosen players',
    !g.players.find(p => p.id === 't1').alive && !g.players.find(p => p.id === 't2').alive && !g.players.find(p => p.id === 't3').alive);
  check('...and is no longer charged afterward', !g.players.find(p => p.id === 'po1').statuses.poChargedUp);
}

console.log('\nBMR: Zombuul');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 3; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('zo1', 'zombuul'), mk('t1', 'chef')];
  g.deaths = [{ night: 2, name: 'someone', cause: 'execution' }];
  check('Zombuul does not act the night after any death',
    E.promptFor(g, g.players[0]).decoy === true);

  g.deaths = [];
  const prompt = E.promptFor(g, g.players[0]);
  check('...but does after a quiet day', !prompt.decoy && prompt.characterId === 'zombuul');
  g.pending = { zo1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('Zombuul\'s own kill is a normal kill, not a faked one', !g.players.find(p => p.id === 't1').alive);

  // The "faked death" one-shot protects the Zombuul *player* the first time
  // anything would kill them — not their victims.
  const g3 = E.newGame();
  g3.script = 'bmr';
  g3.players = [mk('zo1', 'zombuul')];
  check('the first time the Zombuul would die, it is faked instead',
    E.wouldBlockKill(g3, g3.players[0], { executionAttack: true }) === 'zombuul-fake');
  E.checkKill(g3, g3.players[0], { executionAttack: true });
  const zo = g3.players[0];
  check('after being faked once, the Zombuul is secretly alive but publicly dead',
    zo.alive && E.publiclyAlive(zo) === false);
  check('...and a second attempt on the same Zombuul is no longer faked',
    E.wouldBlockKill(g3, zo, { executionAttack: true }) === null);
}

console.log('\nBMR: Goon');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const gEvil = E.newGame();
  gEvil.script = 'bmr'; gEvil.nightNumber = 2; gEvil.phase = 'night'; gEvil.wave = 1; gEvil.results = {};
  gEvil.players = [mk('goon1', 'goon'), mk('imp1', 'imp'), mk('t1', 'chef')];
  gEvil.pending = { imp1: { targets: ['goon1'], decoy: false } };
  await E.resolveNight(gEvil, 1);
  const goon = gEvil.players.find(p => p.id === 'goon1');
  check('targeted by an evil character, the Goon is drunk and flips evil',
    goon.statuses.drunk === true && goon.statuses.goonEvil === true);
  // Engine groundwork for a future "pivotal moment" scoring pass — see
  // pivotalEvents' own comment in engine.js. A quiet but genuinely
  // game-swinging moment (a good player becomes evil) used to leave no
  // trace a scoring pass could read, only prose.
  const goonFlipEvent = gEvil.pivotalEvents.find(e => e.type === 'goon-flip');
  check('the flip leaves a structured pivotalEvents record naming who caused it',
    !!goonFlipEvent && goonFlipEvent.goonId === 'goon1' && goonFlipEvent.chooserId === 'imp1' && goonFlipEvent.resultingAlignment === 'evil',
    JSON.stringify(gEvil.pivotalEvents));

  const gGood = E.newGame();
  gGood.script = 'bmr'; gGood.nightNumber = 2; gGood.phase = 'night'; gGood.wave = 1; gGood.results = {};
  gGood.players = [mk('goon1', 'goon'), mk('monk1', 'monk'), mk('imp1', 'imp')];
  gGood.pending = { monk1: { targets: ['goon1'], decoy: false } };
  await E.resolveNight(gGood, 1);
  const goon2 = gGood.players.find(p => p.id === 'goon1');
  check('targeted by a good character, the Goon is drunk but stays good',
    goon2.statuses.drunk === true && !goon2.statuses.goonEvil);
}

console.log('\nBMR: Lunatic never actually kills');
{
  const mk = (id, characterId, believedId) => ({ id, name: id, characterId, believedId: believedId || characterId, alive: true, statuses: {} });
  const g = E.newGame();
  // Night 1, not night 2: the real Imp doesn't act night 1 (firstNightOrder
  // 0), so a Lunatic who believes they're the Imp wouldn't be prompted
  // either — this has to run on a night the believed character actually acts.
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('lu1', 'lunatic', 'imp'), mk('imp1', 'imp'), mk('t1', 'chef')];
  g.pending = { lu1: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('the Lunatic\'s fake target does not actually die', g.players.find(p => p.id === 't1').alive);
  check('the real Demon is told what the Lunatic pointed at',
    !!g.results.imp1 && /Lunatic/.test(g.results.imp1.body) && /t1/.test(g.results.imp1.body));
}

console.log('\nBMR: Grandmother');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('gm1', 'grandmother'), mk('gc1', 'chef'), mk('imp1', 'imp')];
  g.players.find(p => p.id === 'gm1').statuses.grandchildId = 'gc1';
  g.pending = { imp1: { targets: ['gc1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('the Grandmother dies alongside a grandchild killed by the Demon',
    !g.players.find(p => p.id === 'gm1').alive);

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('gm1', 'grandmother'), mk('gc1', 'chef'), mk('imp1', 'imp')];
  g2.players.find(p => p.id === 'gm1').statuses.grandchildId = 'gc1';
  g2.pending = { imp1: { targets: ['gm1'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('the Demon killing the Grandmother directly does not also kill an untouched grandchild',
    g2.players.find(p => p.id === 'gc1').alive && !g2.players.find(p => p.id === 'gm1').alive);

  // A Minion's kill (Assassin, Godfather) must NOT trigger the link — only
  // "the Demon kills them" does. Both used to share the 'demon' cause tag.
  const g3 = E.newGame();
  g3.script = 'bmr'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('gm1', 'grandmother'), mk('gc1', 'chef'), mk('as1', 'assassin')];
  g3.players.find(p => p.id === 'gm1').statuses.grandchildId = 'gc1';
  g3.pending = { as1: { targets: ['gc1'], decoy: false } };
  await E.resolveNight(g3, 1);
  check('the Assassin killing the grandchild does NOT also kill the Grandmother',
    !g3.players.find(p => p.id === 'gc1').alive && g3.players.find(p => p.id === 'gm1').alive);

  const g4 = E.newGame();
  g4.script = 'bmr'; g4.nightNumber = 3; g4.phase = 'night'; g4.wave = 1; g4.results = {};
  g4.players = [mk('gm1', 'grandmother'), mk('gc1', 'chef'), mk('gf1', 'godfather')];
  g4.players.find(p => p.id === 'gm1').statuses.grandchildId = 'gc1';
  g4.deaths = [{ night: 2, name: 'o1', cause: 'execution' }];
  g4.players.push({ id: 'o1', name: 'o1', characterId: 'tinker', believedId: 'tinker', alive: false, statuses: {} });
  g4.pending = { gf1: { targets: ['gc1'], decoy: false } };
  await E.resolveNight(g4, 1);
  check('...nor does the Godfather',
    !g4.players.find(p => p.id === 'gc1').alive && g4.players.find(p => p.id === 'gm1').alive);
}

console.log('\nBMR: Mastermind bonus-day resolution (pure function)');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  check('no execution on the bonus day -> good wins (the reversal only fires "if a player is THEN executed")',
    E.resolveMastermindDay(g, null).winner === 'good');
  check('a good player executed on the bonus day -> evil wins',
    E.resolveMastermindDay(g, mk('t1', 'chef')).winner === 'evil');
  check('an evil player executed on the bonus day -> good wins',
    E.resolveMastermindDay(g, mk('m1', 'poisoner')).winner === 'good');
}

console.log('\nBMR: Pacifist\'s pacifistSaved status (engine-level)');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  const t = mk('t1', 'chef');
  t.statuses.pacifistSaved = true;
  check('pacifistSaved blocks an execution attack', E.wouldBlockKill(g, t, { executionAttack: true }) === 'pacifist');
  check('...but a night-time demon attack is a different check entirely',
    E.wouldBlockKill(g, t, { demonAttack: true }) === null);
}

console.log('\nBMR: Tea Lady');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  // 3-seat circle: with only two others, both are the Tea Lady's neighbors.
  const g = E.newGame();
  g.players = [mk('tl1', 'tealady'), mk('nA', 'chef'), mk('nB', 'soldier')];
  const [tl1, nA, nB] = g.players;
  check('a good neighbor is protected from a demon attack',
    E.wouldBlockKill(g, nA, { demonAttack: true }) === 'tea-lady');
  check('...and from execution too — "can\'t die" has no carve-out',
    E.wouldBlockKill(g, nB, { executionAttack: true }) === 'tea-lady');
  check('the Tea Lady herself is not protected by her own ability',
    E.wouldBlockKill(g, tl1, { demonAttack: true }) !== 'tea-lady');

  // One evil neighbor voids the protection for BOTH neighbors, not just the
  // evil one — the ability requires both to be good.
  const g2 = E.newGame();
  g2.players = [mk('tl1', 'tealady'), mk('nA', 'chef'), mk('nB', 'poisoner')];
  check('a good neighbor loses protection when the other neighbor is evil',
    E.wouldBlockKill(g2, g2.players[1], { demonAttack: true }) !== 'tea-lady');

  // 4 seats: a good player who ISN'T adjacent to the Tea Lady gets nothing.
  const g3 = E.newGame();
  g3.players = [mk('tl1', 'tealady'), mk('nA', 'chef'), mk('far', 'soldier'), mk('nB', 'empath')];
  check('a good player who is not a neighbor is not protected',
    E.wouldBlockKill(g3, g3.players[2], { demonAttack: true }) !== 'tea-lady');

  // An impaired Tea Lady protects no one at all.
  const g4 = E.newGame();
  g4.players = [mk('tl1', 'tealady'), mk('nA', 'chef'), mk('nB', 'soldier')];
  g4.players[0].statuses.poisoned = true;
  check('a poisoned Tea Lady\'s neighbors have no protection',
    E.wouldBlockKill(g4, g4.players[1], { demonAttack: true }) !== 'tea-lady');

  // Adjacency is live, not fixed at setup — once a neighbor dies, the next
  // living player around the circle becomes the new neighbor.
  const g5 = E.newGame();
  g5.players = [mk('tl1', 'tealady'), mk('nA', 'chef'), mk('nB', 'empath'), mk('nC', 'soldier')];
  check('with 4 alive, the far side (nB) starts unprotected',
    E.wouldBlockKill(g5, g5.players[2], { demonAttack: true }) !== 'tea-lady');
  g5.players[1].alive = false; // nA dies — the circle closes up
  check('once nA dies, nB becomes the Tea Lady\'s new live neighbor and is protected',
    E.wouldBlockKill(g5, g5.players[2], { demonAttack: true }) === 'tea-lady');
}

console.log('\nBMR: drunk-until-dusk clears at the right night (the mechanism Minstrel/Sailor/Innkeeper/Courtier all share)');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 3; g.phase = 'night'; g.wave = 1; g.results = {};
  const t = mk('t1', 'chef');
  // What server.js does when a Minion is executed on the day after night 2
  // (nightNumber is still 2 at that point, unincremented until night falls).
  t.statuses.drunk = true;
  t.statuses.drunkUntilNight = 2;
  g.players = [t];
  g.pending = {};
  await E.resolveNight(g, 1); // night 3's wave-1 reset: 2 < 3 -> clears now, exactly at this dusk
  check('drunk-until-dusk set for night 2 is cleared by night 3\'s reset, not held an extra night',
    !E.impaired(t));
}

console.log('\nBMR: Moonchild trigger fires once');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  const mc = mk('mc1', 'moonchild');
  g.players = [mc];
  g.results = {};
  E.triggerMoonchildIfNeeded(g, mc);
  check('the first death opens the Moonchild\'s choice', mc.statuses.moonchildPending === true);
  mc.statuses.moonchildPending = false;
  E.triggerMoonchildIfNeeded(g, mc);
  check('a later death does not reopen it (already used)', mc.statuses.moonchildPending === false);
}

console.log('\nVoting: resolveDayVote');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const nomOf = (nomineeId, yesCount) => ({ day: 2, nomineeId, closed: true, yesCount });

  const base = () => {
    const g = E.newGame();
    g.nightNumber = 2;
    // 7 living players -> majority threshold is ceil(7/2) = 4.
    g.players = Array.from({ length: 7 }, (_, i) => mk('p' + i, 'chef'));
    g.nominations = [];
    return g;
  };

  {
    const g = base();
    check('no nominations today -> no execution', E.resolveDayVote(g) === null);
  }
  {
    const g = base();
    g.nominations = [nomOf('p0', 3)]; // below the threshold of 4
    check('below the majority threshold -> no execution', E.resolveDayVote(g) === null);
  }
  {
    const g = base();
    g.nominations = [nomOf('p0', 4)]; // exactly the threshold
    check('meeting the threshold exactly -> executed', E.resolveDayVote(g) === 'p0');
  }
  {
    const g = base();
    g.nominations = [nomOf('p0', 4), nomOf('p1', 6)];
    check('the higher of two qualifying nominees is chosen', E.resolveDayVote(g) === 'p1');
  }
  {
    const g = base();
    g.nominations = [nomOf('p0', 5), nomOf('p1', 5)];
    check('a tie between qualifying nominees -> no execution (real rule, not a coin flip)', E.resolveDayVote(g) === null);
  }
  {
    const g = base();
    g.nominations = [nomOf('p0', 4), nomOf('p1', 2)];
    check('a qualifying nominee beats a non-qualifying one even if nominated later', E.resolveDayVote(g) === 'p0');
  }
  {
    const g = base();
    g.nominations = [{ day: 1, nomineeId: 'p0', closed: true, yesCount: 7 }];
    check('a closed nomination from a different day is ignored', E.resolveDayVote(g) === null);
  }
  {
    const g = base();
    g.nominations = [{ day: 2, nomineeId: 'p0', closed: false, yesCount: 7 }];
    check('an unclosed (still-open) nomination is never counted', E.resolveDayVote(g) === null);
  }
  {
    // Fewer living players lowers the threshold — 3 living -> needs 2.
    const g = base();
    g.players = g.players.slice(0, 3);
    g.nominations = [nomOf('p0', 2)];
    check('the threshold scales down with fewer living players', E.resolveDayVote(g) === 'p0');
  }
  {
    // An EVEN living count is the case that actually distinguishes the real
    // rule (at least half, rounded up — ceil(n/2)) from the bug this once
    // was ("strictly more than half" — floor(n/2)+1). The two formulas only
    // agree for an odd count, which every check above uses; 10 living needs
    // exactly 5 yes votes, not 6.
    const g = base();
    g.players = Array.from({ length: 10 }, (_, i) => mk('p' + i, 'chef'));
    g.nominations = [nomOf('p0', 5)];
    check('an even living count uses ceil(n/2), not floor(n/2)+1 — 10 living needs exactly 5, not 6',
      E.resolveDayVote(g) === 'p0');
    const g2 = base();
    g2.players = Array.from({ length: 10 }, (_, i) => mk('p' + i, 'chef'));
    g2.nominations = [nomOf('p0', 4)];
    check('...and one vote short of that (4 of 10) still fails', E.resolveDayVote(g2) === null);
  }
  {
    // The threshold snapshot itself — closeNomination() (server.js) now
    // freezes each nomination's own threshold at the moment IT closed. A
    // same-day death afterward (Virgin, Witch, Golem, a Slayer shot)
    // shrinks the living count, but can't retroactively change whether a
    // nomination that already closed actually passed.
    const g = base(); // 7 living at close time -> the real threshold was 4
    g.nominations = [{ day: 2, nomineeId: 'p0', closed: true, yesCount: 3, threshold: 4 }]; // fell short of its own real threshold
    g.players = g.players.slice(0, 4); // 3 died afterward, same day -> naive live recompute would be ceil(4/2) = 2
    check('a nomination that fell short of its OWN snapshotted threshold stays a non-execution, even after a later same-day death shrinks the living count',
      E.resolveDayVote(g) === null);
  }
  {
    const g = base();
    g.nominations = [{ day: 2, nomineeId: 'p0', closed: true, yesCount: 4, threshold: 4 }]; // met its own real threshold
    g.players = [g.players[0], g.players[1]]; // even a big same-day drop in living count afterward
    check('a nomination that met its own snapshotted threshold still executes regardless of a later same-day change in living count',
      E.resolveDayVote(g) === 'p0');
  }
  {
    // Pre-existing data with no `threshold` field at all (a nomination
    // closed before this feature existed) still falls back to a live
    // recompute rather than silently never qualifying.
    const g = base();
    g.nominations = [{ day: 2, nomineeId: 'p0', closed: true, yesCount: 4 }];
    check('a nomination with no snapshotted threshold falls back to a live recompute',
      E.resolveDayVote(g) === 'p0');
  }
}

console.log('\nSV: Clockmaker');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  // Seats 0..5, demon at 3, minion at 4 -> 1 step apart.
  g.players = [mk('cm', 'clockmaker'), mk('a', 'oracle'), mk('b', 'oracle'), mk('imp1', 'imp'), mk('min1', 'witch'), mk('c', 'oracle')];
  g.pending = {};
  await E.resolveNight(g, 1);
  check('Clockmaker learns the correct step count', g.results.cm.body.includes('1'));
}

console.log('\nSV: Dreamer');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('dr', 'dreamer'), mk('t1', 'oracle'), mk('imp1', 'imp')];
  g.pending = { dr: { targets: ['imp1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('Dreamer names the targeted player', g.results.dr.names[0] === 'imp1');
  check('Dreamer shows the true character among the pair, since unimpaired', g.results.dr.body.includes('Imp'));

  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('dr', 'dreamer'), mk('t1', 'oracle'), mk('imp1', 'imp')];
  g2.players.find(p => p.id === 'dr').statuses.poisoned = true;
  g2.pending = { dr: { targets: ['imp1'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('a poisoned Dreamer still gets a body, just not a guaranteed-correct one', !!g2.results.dr);
}

console.log('\nSV: Mathematician');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('math', 'mathematician'), mk('sc', 'snakecharmer'), mk('imp1', 'imp'), mk('t1', 'oracle')];
  g.pending = { sc: { targets: ['imp1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('Mathematician counts both players the Snake Charmer swap flagged', g.results.math.body.includes('2'));
}

console.log('\nSV: Flowergirl and Town Crier');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('fg', 'flowergirl'), mk('tc', 'towncrier'), mk('imp1', 'imp'), mk('min1', 'witch'), mk('t1', 'oracle')];
  g.nominations = [{
    day: 1, nomineeId: 't1', nominatorId: 'min1', closed: true,
    votes: [{ playerId: 'imp1', vote: 'yes' }, { playerId: 't1', vote: 'no' }],
  }];
  await E.resolveNight(g, 1);
  check('Flowergirl correctly learns a Demon voted yesterday', g.results.fg.body.includes('Yes'));
  check('Town Crier correctly learns a Minion nominated yesterday', g.results.tc.body.includes('Yes'));

  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('fg', 'flowergirl'), mk('tc', 'towncrier'), mk('imp1', 'imp'), mk('min1', 'witch'), mk('t1', 'oracle')];
  g2.nominations = [{ day: 1, nomineeId: 'imp1', nominatorId: 't1', closed: true, votes: [{ playerId: 't1', vote: 'yes' }] }];
  await E.resolveNight(g2, 1);
  check('Flowergirl correctly learns no Demon voted yesterday', g2.results.fg.body.includes('No'));
  check('Town Crier correctly learns no Minion nominated yesterday', g2.results.tc.body.includes('No'));
}

console.log('\nSV: Oracle');
{
  const mk = (id, characterId, alive = true) => ({ id, name: id, characterId, believedId: characterId, alive, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('or', 'oracle'), mk('d1', 'oracle', false), mk('d2', 'witch', false), mk('t1', 'oracle', true)];
  await E.resolveNight(g, 1);
  check('Oracle counts exactly the dead evil players', g.results.or.body.includes('1'));
}

console.log('\nSV: Seamstress');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('se', 'seamstress'), mk('a', 'oracle'), mk('b', 'witch')];
  g.pending = { se: { targets: ['a', 'b'], decoy: false } };
  await E.resolveNight(g, 1);
  check('two different-alignment players are correctly told apart', g.results.se.body.includes('No'));
  check('the once-per-game charge is spent', g.players.find(p => p.id === 'se').statuses.seamstressUsed === true);

  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('se', 'seamstress'), mk('a', 'oracle'), mk('b', 'oracle')];
  g2.pending = { se: { targets: ['a', 'b'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('two same-alignment players are correctly told to match', g2.results.se.body.includes('Yes'));

  const g3 = E.newGame();
  g3.script = 'sv'; g3.nightNumber = 1; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('se', 'seamstress'), mk('a', 'oracle'), mk('b', 'oracle')];
  g3.players.find(p => p.id === 'se').statuses.poisoned = true;
  g3.pending = { se: { targets: ['a', 'b'], decoy: false } };
  await E.resolveNight(g3, 1);
  check('a poisoned Seamstress still gets a result (wrong, not silent — silence is itself a tell)', !!g3.results.se);
  check('...and the once-per-game charge is spent anyway', g3.players.find(p => p.id === 'se').statuses.seamstressUsed === true);
}

console.log('\nSV: Sage');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('sg', 'sage'), mk('imp1', 'imp'), mk('t1', 'oracle')];
  g.pending = { imp1: { targets: ['sg'], decoy: false } };
  await E.resolveNight(g, 1);
  check('the Sage dies to the Demon', !g.players.find(p => p.id === 'sg').alive);
  check('the Sage learns a pair including the real Demon', g.results.sg.names.includes('imp1'));

  // Killed by a Minion instead — must require killedByDemon specifically,
  // same distinction that mattered for the Grandmother's own link.
  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('sg', 'sage'), mk('as1', 'assassin'), mk('t1', 'oracle')];
  g2.pending = { as1: { targets: ['sg'], decoy: false } };
  await E.resolveNight(g2, 1);
  check("a Minion kill does not trigger the Sage's reveal", !g2.results.sg);

  // Poisoned (or Vortox-killed): the pair shown is supposed to be false,
  // so it has to exclude the real Demon just as deliberately as the true
  // branch does — the fallback used to grab 2 random players with no such
  // exclusion, so a "wrong" answer could still name the real Demon by
  // chance. Many trials since this is a probabilistic bug.
  let sawRealDemon = false;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const g3 = E.newGame();
    g3.script = 'sv'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
    g3.players = [mk('sg', 'sage'), mk('imp1', 'imp'), mk('t1', 'oracle'), mk('t2', 'witch'), mk('t3', 'snakecharmer')];
    g3.players.find(p => p.id === 'sg').statuses.poisoned = true;
    g3.pending = { imp1: { targets: ['sg'], decoy: false } };
    await E.resolveNight(g3, 1);
    if (g3.results.sg.names.includes('imp1')) sawRealDemon = true;
  }
  check(`a poisoned Sage's false pair never actually includes the real Demon (${trials} trials)`, !sawRealDemon);
}

console.log('\nSV: Snake Charmer');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('sc', 'snakecharmer'), mk('imp1', 'imp'), mk('t1', 'oracle')];
  g.pending = { sc: { targets: ['imp1'], decoy: false } };
  await E.resolveNight(g, 1);
  const sc = g.players.find(p => p.id === 'sc');
  const imp1 = g.players.find(p => p.id === 'imp1');
  check('Snake Charmer becomes the Demon after targeting the real Demon', sc.characterId === 'imp' && sc.believedId === 'imp');
  check('the ex-Demon becomes the Snake Charmer', imp1.characterId === 'snakecharmer' && imp1.believedId === 'snakecharmer');
  check('the new Snake Charmer (ex-Demon) is poisoned', !!imp1.statuses.poisoned);
  check('the new Demon (ex-Snake Charmer) is not poisoned', !sc.statuses.poisoned);

  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('sc', 'snakecharmer'), mk('t1', 'oracle'), mk('imp1', 'imp')];
  g2.pending = { sc: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g2, 1);
  const sc2 = g2.players.find(p => p.id === 'sc');
  check('targeting a non-Demon does nothing', sc2.characterId === 'snakecharmer' && !sc2.statuses.poisoned);

  // The genuinely tricky part: the ex-Demon's own kill choice, submitted in
  // good faith before the swap, was already pending for their slot later
  // this same night. It must not still go through.
  const g3 = E.newGame();
  g3.script = 'sv'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('sc', 'snakecharmer'), mk('imp1', 'imp'), mk('v1', 'oracle')];
  g3.pending = { sc: { targets: ['imp1'], decoy: false }, imp1: { targets: ['v1'], decoy: false } };
  await E.resolveNight(g3, 1);
  check("the ex-Demon's already-pending kill this same night is nullified by the fresh poison",
    g3.players.find(p => p.id === 'v1').alive);
}

console.log('\nSV: Philosopher');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ph', 'philosopher'), mk('dr', 'dreamer'), mk('imp1', 'imp')];
  const phPlayer = g.players.find(p => p.id === 'ph');

  const prompt = E.promptFor(g, phPlayer);
  check('the Philosopher gets a real prompt (not a decoy) despite choiceCount 0', !!prompt && prompt.characterId === 'philosopher');
  check('the prompt asks for a character guess with zero player targets', prompt.count === 0 && prompt.guessCharacter === true);
  check('a character with no registry entry at all (Savant) is excluded', !prompt.characterOptions.some(o => o.id === 'savant'));
  check('a purely onDeath-reactive character (Sweetheart) is excluded — gaining it would never fire for the Philosopher\'s own death',
    !prompt.characterOptions.some(o => o.id === 'sweetheart'));
  check('an in-play, genuinely night-active character (Dreamer) is still offered', prompt.characterOptions.some(o => o.id === 'dreamer'));
  check('their own character is excluded from the options', !prompt.characterOptions.some(o => o.id === 'philosopher'));

  g.pending = { ph: { targets: [], decoy: false, characterGuess: 'dreamer' } };
  await E.resolveNight(g, 1);
  check('the Philosopher gains the chosen ability (believedId changes, characterId does not)',
    phPlayer.believedId === 'dreamer' && phPlayer.characterId === 'philosopher');
  check('the once-per-game flag is set', phPlayer.statuses.philosopherUsed === true);
  check('the real holder of the gained character becomes drunk', g.players.find(p => p.id === 'dr').statuses.drunk === true);

  g.nightNumber = 2; g.wave = 1; g.results = {};
  g.pending = { ph: { targets: ['imp1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('the following night, the Philosopher acts as their gained character', !!g.results.ph && g.results.ph.title === 'Dreamer');
}

console.log('\nSV: Pit-Hag');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ph', 'pithag'), mk('t1', 'oracle')];
  g.pending = { ph: { targets: ['t1'], decoy: false, characterGuess: 'empath' } };
  await E.resolveNight(g, 1);
  const t1 = g.players.find(p => p.id === 't1');
  check('Pit-Hag remakes the target into the chosen not-in-play character', t1.characterId === 'empath' && t1.believedId === 'empath');

  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('ph', 'pithag'), mk('t1', 'oracle'), mk('e1', 'empath')];
  g2.pending = { ph: { targets: ['t1'], decoy: false, characterGuess: 'empath' } };
  await E.resolveNight(g2, 1);
  check('Pit-Hag does nothing if the chosen character is already in play',
    g2.players.find(p => p.id === 't1').characterId === 'oracle');
}

console.log('\nSV: Sweetheart');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.results = {};
  g.players = [mk('sh', 'sweetheart'), mk('t1', 'oracle'), mk('t2', 'witch')];
  const sh = g.players.find(p => p.id === 'sh');
  sh.alive = false;
  E.triggerDeathHooks(g, sh, { killedByDemon: false });
  check('Sweetheart\'s death makes exactly one other living player drunk',
    !!g.players.find(p => p.id !== 'sh' && p.statuses.drunk));
}

console.log('\nSV: Klutz');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.results = {};
  g.players = [mk('kl', 'klutz'), mk('imp1', 'imp')];
  const kl = g.players.find(p => p.id === 'kl');
  kl.alive = false;
  E.triggerDeathHooks(g, kl, { killedByDemon: true });
  check('the Klutz\'s public choice opens on death', kl.statuses.klutzPending === true);
  check('the once-only guard is set', kl.statuses.klutzUsed === true);

  kl.statuses.klutzPending = false;
  E.triggerDeathHooks(g, kl, { killedByDemon: false });
  check('a second trigger does not reopen the pending choice', kl.statuses.klutzPending === false);
}

console.log('\nSV: Witch');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('w', 'witch'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('t3', 'oracle'), mk('t4', 'oracle')];
  g.pending = { w: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('Witch curses the chosen player', g.players.find(p => p.id === 't1').statuses.witchCursed === true);

  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1;
  g2.players = [mk('w', 'witch'), mk('t1', 'oracle'), mk('t2', 'oracle')];
  const promptAt3 = E.promptFor(g2, g2.players[0]);
  check('at 3 living, the Witch gets no real prompt (decoy only) — she has lost the ability',
    !!promptAt3 && !promptAt3.characterId);

  const g3 = E.newGame();
  g3.script = 'sv'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('w', 'witch'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('t3', 'oracle')];
  g3.players.find(p => p.id === 't1').statuses.witchCursed = true; // stale, never consumed
  g3.pending = {};
  await E.resolveNight(g3, 1);
  check("a stale, unconsumed curse from a previous night is cleared at the next night's reset",
    !g3.players.find(p => p.id === 't1').statuses.witchCursed);
}

console.log('\nSV: No Dashii');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  // Circle: nd - t1 - t2 - v1 - t3 (back to nd). nd's living neighbours are t1 and t3.
  g.players = [mk('nd', 'nodashii'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('v1', 'witch'), mk('t3', 'oracle')];
  g.pending = { nd: { targets: ['t2'], decoy: false } };
  await E.resolveNight(g, 1);
  const t1 = g.players.find(p => p.id === 't1'), t3 = g.players.find(p => p.id === 't3'), t2 = g.players.find(p => p.id === 't2');
  check('No Dashii poisons both Townsfolk neighbours', !!t1.statuses.poisoned && !!t3.statuses.poisoned);
  check('No Dashii kills the chosen target', !t2.alive);

  const g2 = E.newGame();
  g2.script = 'sv'; g2.results = {};
  g2.players = [mk('nd', 'nodashii'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('v1', 'witch'), mk('t3', 'oracle')];
  g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1;
  g2.pending = { nd: { targets: ['v1'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('night 2: t1 and t3 (the living neighbours) are poisoned',
    !!g2.players.find(p => p.id === 't1').statuses.poisoned && !!g2.players.find(p => p.id === 't3').statuses.poisoned);

  // t1 dies between nights — no longer a neighbour at all.
  g2.players.find(p => p.id === 't1').alive = false;
  g2.nightNumber = 3; g2.wave = 1; g2.results = {};
  g2.pending = { nd: { targets: ['t2'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('night 3: the departed neighbour (t1) is no longer poisoned', !g2.players.find(p => p.id === 't1').statuses.poisoned);
  check('night 3: the new adjacent Townsfolk (t2) is poisoned instead', !!g2.players.find(p => p.id === 't2').statuses.poisoned);
  check('night 3: t3 remains a neighbour and stays poisoned', !!g2.players.find(p => p.id === 't3').statuses.poisoned);
}

console.log('\nSV: Juggler');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ju', 'juggler'), mk('t1', 'oracle'), mk('imp1', 'imp')];
  g.players.find(p => p.id === 'ju').statuses.jugglerGuesses = [
    { playerId: 't1', characterGuess: 'oracle' },   // correct
    { playerId: 'imp1', characterGuess: 'witch' },  // wrong
  ];
  await E.resolveNight(g, 1);
  check('Juggler correctly counts 1 of 2 guesses right', g.results.ju.body.includes('1'));
  check('the stored guesses are consumed after the reveal', !g.players.find(p => p.id === 'ju').statuses.jugglerGuesses);
}

console.log('\nSV: Fang Gu / Vigormortis setup modifiers (dealRoles)');
{
  const base = E.SETUP_TABLE['9'].outsider;
  let sawFangGu = false, sawVigormortis = false, allCorrect = true;
  for (let i = 0; i < 30; i++) {
    const g = E.newGame();
    g.script = 'sv';
    seat(g, 9);
    E.dealRoles(g);
    const demon = g.players.find(p => E.trueChar(p).team === 'demon');
    const outsiderCount = g.players.filter(p => E.trueChar(p).team === 'outsider').length;
    if (demon.characterId === 'fanggu') {
      sawFangGu = true;
      if (outsiderCount !== base + 1) allCorrect = false;
    } else if (demon.characterId === 'vigormortis') {
      sawVigormortis = true;
      if (outsiderCount !== base - 1) allCorrect = false;
    } else if (outsiderCount !== base) {
      allCorrect = false;
    }
  }
  check('across 30 deals, Fang Gu always shows exactly +1 Outsider and Vigormortis exactly -1', allCorrect);
  check('...and both demons actually came up at least once, so the check above is meaningful', sawFangGu && sawVigormortis);
}

console.log('\nSV: Evil Twin');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('et', 'eviltwin'), mk('gt', 'oracle'), mk('vx1', 'vortox')];
  g.players.find(p => p.id === 'et').statuses.twinId = 'gt';
  g.players.find(p => p.id === 'gt').statuses.evilTwinId = 'et';
  await E.resolveNight(g, 1);
  check('the Evil Twin learns their Twin', g.results.et.body.includes('gt'));
  check('the good Twin learns the Evil Twin', g.results.gt.body.includes('et'));

  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('et', 'eviltwin'), mk('gt', 'oracle'), mk('vx1', 'vortox')];
  g2.players.find(p => p.id === 'et').statuses.twinId = 'gt';
  g2.players.find(p => p.id === 'et').statuses.poisoned = true;
  await E.resolveNight(g2, 1);
  check('a poisoned Evil Twin tells neither side anything', !g2.results.et && !g2.results.gt);
}

console.log('\nSV: Evil Twin blocks/forces victory');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.phase = 'day';
  g.players = [mk('et', 'eviltwin'), mk('gt', 'oracle'), mk('t1', 'oracle')];
  g.players.find(p => p.id === 'et').statuses.twinId = 'gt';
  g.players.find(p => p.id === 'gt').statuses.evilTwinId = 'et';
  check('good cannot win while the Evil Twin and their Twin are both alive (no Demon in play at all here)',
    E.checkVictory(g) === null);

  g.players.find(p => p.id === 'et').alive = false;
  check('once the Evil Twin dies, good can win normally again', !!E.checkVictory(g) && E.checkVictory(g).winner === 'good');

  // 4 living besides the executed Twin, so this can't accidentally pass via
  // the unrelated "only the Demon and one other remain" rule instead.
  const g2 = E.newGame();
  g2.phase = 'day'; g2.evilTwinGoodExecuted = true;
  g2.players = [mk('et', 'eviltwin'), mk('gt', 'oracle'), mk('vx1', 'vortox'), mk('t1', 'oracle'), mk('t2', 'oracle')];
  g2.players.find(p => p.id === 'gt').alive = false;
  const v2 = E.checkVictory(g2);
  check('executing the good Twin forces an evil win even with a Demon still alive',
    !!v2 && v2.winner === 'evil' && v2.reason.includes('Twin'));
}

console.log('\nSV: Fang Gu');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('fg', 'fanggu'), mk('out1', 'sweetheart'), mk('t1', 'oracle')];
  g.pending = { fg: { targets: ['out1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('the targeted Outsider becomes the new Fang Gu', g.players.find(p => p.id === 'out1').characterId === 'fanggu');
  check('the original Fang Gu dies instead', !g.players.find(p => p.id === 'fg').alive);
  check('the game-wide transform flag is now set', g.fangGuTransformUsed === true);

  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('fg', 'fanggu'), mk('out1', 'sweetheart'), mk('t1', 'oracle')];
  g2.fangGuTransformUsed = true;
  g2.pending = { fg: { targets: ['out1'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('once the transform is already used, a later Outsider kill is just a normal kill',
    !g2.players.find(p => p.id === 'out1').alive && g2.players.find(p => p.id === 'fg').alive);

  const g3 = E.newGame();
  g3.script = 'sv'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('fg', 'fanggu'), mk('t1', 'oracle')];
  g3.pending = { fg: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g3, 1);
  check('killing a Townsfolk is always a normal kill, never a transform',
    !g3.players.find(p => p.id === 't1').alive && g3.players.find(p => p.id === 'fg').alive);
}

console.log('\nSV: Vigormortis');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('vg', 'vigormortis'), mk('min1', 'poisoner'), mk('t1', 'oracle'), mk('t2', 'oracle')];
  g.pending = { vg: { targets: ['min1'], decoy: false } };
  await E.resolveNight(g, 1);
  const min1 = g.players.find(p => p.id === 'min1');
  check('the killed Minion is marked dead', !min1.alive);
  check('...but flagged to keep acting', min1.statuses.vigormortisKept === true);
  check('one Townsfolk neighbour of the dead Minion is poisoned', g.players.find(p => p.id === 't1').statuses.poisoned === true);

  g.nightNumber = 3; g.wave = 1; g.results = {};
  const prompt = E.promptFor(g, min1);
  check('the dead-but-kept Minion still receives a real prompt the following night',
    !!prompt && prompt.characterId === 'poisoner');
  g.pending = { min1: { targets: ['t2'], decoy: false } };
  await E.resolveNight(g, 1);
  check('...and their kept ability actually still works', g.players.find(p => p.id === 't2').statuses.poisoned === true);

  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('vg', 'vigormortis'), mk('t1', 'oracle'), mk('t2', 'oracle')];
  g2.pending = { vg: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g2, 1);
  check('killing a Townsfolk grants no kept-ability status', !g2.players.find(p => p.id === 't1').statuses.vigormortisKept);
}

console.log('\nSV: Vortox');
{
  const mk = (id, characterId, alive = true) => ({ id, name: id, characterId, believedId: characterId, alive, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('vx', 'vortox'), mk('t1', 'oracle')];
  g.pending = { vx: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('Vortox kills its target like any other demon', !g.players.find(p => p.id === 't1').alive);

  const g2 = E.newGame();
  g2.script = 'sv'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('or', 'oracle'), mk('vx', 'vortox'), mk('d1', 'oracle', false)];
  await E.resolveNight(g2, 1);
  check('an unimpaired Oracle shows false info while a living Vortox is in play',
    !g2.results.or.body.includes('Dead players who are evil: 0'));

  // Vortox dead now counts as a dead evil player itself — 1 (Vortox), not 0.
  const g3 = E.newGame();
  g3.script = 'sv'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('or', 'oracle'), mk('vx', 'vortox', false), mk('d1', 'oracle', false)];
  await E.resolveNight(g3, 1);
  check('once Vortox is dead, the same Oracle reports truthfully again',
    g3.results.or.body.includes('Dead players who are evil: 1'));
}

console.log('\nSV: Vortox — "no execution" win condition');
{
  const mk = (id, characterId, alive = true) => ({ id, name: id, characterId, believedId: characterId, alive, statuses: {} });
  const g = E.newGame();
  g.phase = 'day'; g.noExecutionToday = true;
  g.players = [mk('vx', 'vortox'), mk('t1', 'oracle'), mk('t2', 'oracle')];
  const v = E.checkVictory(g);
  check('no execution with a living Vortox -> evil wins immediately', !!v && v.winner === 'evil');

  const g2 = E.newGame();
  g2.phase = 'day'; g2.noExecutionToday = false;
  g2.players = [mk('vx', 'vortox'), mk('t1', 'oracle'), mk('t2', 'oracle')];
  check('an executed day with a living Vortox does not end the game on its own', E.checkVictory(g2) === null);

  // Vortox dead but a second Demon (an unrealistic setup, but isolates the
  // mechanic) still alive — demonAlive stays true, so this can't fall
  // through to the ordinary "Demon is dead" good win instead.
  const g3 = E.newGame();
  g3.phase = 'day'; g3.noExecutionToday = true;
  g3.players = [mk('vx', 'vortox', false), mk('nd', 'nodashii'), mk('t1', 'oracle'), mk('t2', 'oracle')];
  check('no execution once Vortox specifically is dead does not trigger its win condition',
    E.checkVictory(g3) === null);
}

console.log('\nSV: Barber (no wave 2 — the swap rides along with the Demon\'s own turn)');
{
  // Vortox, not Fang Gu — a Fang Gu killing an Outsider triggers its own
  // transform mechanic instead of a plain death (see the Fang Gu tests
  // above), which would confuse what this test is isolating.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.results = {};
  g.players = [mk('fg', 'vortox'), mk('ba', 'barber'), mk('t1', 'oracle'), mk('t2', 'dreamer')];
  const fg = g.players.find(p => p.id === 'fg');

  // The Barber is still alive when the Demon's own prompt is built — this
  // is exactly the "might die tonight" case, asked preemptively.
  const beforePrompt = E.promptFor(g, fg);
  check('a living Demon gets the addon while the Barber is still alive, marked NOT definite',
    !!beforePrompt.barberSwap && beforePrompt.barberSwap.definite === false, JSON.stringify(beforePrompt.barberSwap));
  check('the addon excludes another Demon but allows the Demon\'s own seat', beforePrompt.barberSwap.targets.some(t => t.id === 'fg'));

  // The Demon's kill target AND their swap pick are submitted together, in
  // the exact same action — no second submission, no second window.
  g.pending = { fg: { targets: ['ba'], decoy: false, barberSwapTargets: ['t1', 't2'] } };
  await E.resolveNight(g);
  const t1 = g.players.find(p => p.id === 't1'), t2 = g.players.find(p => p.id === 't2');
  check("the Barber died to the Demon's own kill tonight", !g.players.find(p => p.id === 'ba').alive);
  check('the swap exchanges their characters, since the Barber really did die', t1.characterId === 'dreamer' && t2.characterId === 'oracle');
  check('...and their believedId moves with it', t1.believedId === 'dreamer' && t2.believedId === 'oracle');
  check('the pending flag is cleared after use, one-shot', fg.statuses.barberSwapPending === false);
}
{
  // Passing — no swap targets submitted alongside the kill — leaves
  // everyone's character untouched, even though the Barber genuinely died.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.results = {};
  g.players = [mk('fg', 'vortox'), mk('ba', 'barber'), mk('t1', 'oracle'), mk('t2', 'dreamer')];
  g.pending = { fg: { targets: ['ba'], decoy: false } }; // no barberSwapTargets at all
  await E.resolveNight(g);
  check('passing (no swap targets submitted) leaves everyone unchanged', g.players.find(p => p.id === 't1').characterId === 'oracle');
  check('the flag is still cleared even on a pass', g.players.find(p => p.id === 'fg').statuses.barberSwapPending === false);
}
{
  // A poisoned Demon's pre-submitted swap choice silently fails to apply —
  // same "may look like it worked, doesn't" doctrine the original wave-2
  // version already had; unchanged by moving where the choice is captured.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.results = {};
  g.players = [mk('fg', 'vortox'), mk('ba', 'barber'), mk('t1', 'oracle'), mk('t2', 'dreamer')];
  g.players.find(p => p.id === 'fg').statuses.poisoned = true;
  g.pending = { fg: { targets: ['ba'], decoy: false, barberSwapTargets: ['t1', 't2'] } };
  await E.resolveNight(g);
  check('a poisoned Demon cannot use the barber-swap even if submitted', g.players.find(p => p.id === 't1').characterId === 'oracle');
}
{
  // A chosen swap target who separately dies THIS SAME night (some other
  // kill mechanism entirely) is no longer valid by the time the swap is
  // actually applied — the whole point of re-validating post-resolution,
  // not just trusting whatever the Demon saw when they first submitted.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night'; g.results = {};
  g.players = [mk('fg', 'vortox'), mk('ba', 'barber'), mk('t1', 'oracle'), mk('t2', 'dreamer'), mk('tk', 'tinker')];
  g.config.tinkerDeathChance = 1; // deterministic: the Tinker always dies this trial
  g.pending = { fg: { targets: ['ba'], decoy: false, barberSwapTargets: ['t1', 'tk'] } };
  await E.resolveNight(g);
  check('the Tinker really did die from an unrelated mechanism this same night', !g.players.find(p => p.id === 'tk').alive);
  check('the swap does not apply — one of the two chosen targets is no longer alive to swap',
    g.players.find(p => p.id === 't1').characterId === 'oracle');
}
{
  // The other trigger: executed today (not killed tonight) — the exact
  // mechanism server.js's recordExecution already uses for every execution.
  // Definite, not preemptive, by the time the Demon's next prompt is built.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv';
  g.players = [mk('fg', 'fanggu'), mk('vg', 'vigormortis'), mk('t1', 'oracle')];
  const ba = { id: 'ba', name: 'ba', characterId: 'barber', believedId: 'barber', alive: false, statuses: {} };
  g.players.push(ba);
  E.triggerDeathHooks(g, ba, { killedByDemon: false });
  check('executing the Barber flags a living Demon too', g.players.find(p => p.id === 'fg').statuses.barberSwapPending === true);

  g.nightNumber = 3; g.phase = 'night';
  const prompt = E.promptFor(g, g.players.find(p => p.id === 'fg'));
  check('the addon is now marked definite, not just possible', prompt.barberSwap && prompt.barberSwap.definite === true);
  check('another living Demon is excluded from the swap targets', !prompt.barberSwap.targets.some(t => t.id === 'vg'));
  check('a non-Demon player is still offered', prompt.barberSwap.targets.some(t => t.id === 't1'));
}
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 2; g.phase = 'night';
  g.players = [mk('ba', 'barber'), mk('t1', 'oracle')];
  const prompt = E.promptFor(g, g.players.find(p => p.id === 'ba'));
  check('a living Barber has no active ability of their own — just a decoy, and no addon (they\'re not the Demon)',
    !!prompt && prompt.decoy === true && !prompt.barberSwap);
}
{
  // No Barber at all in the script — the addon must never appear, for
  // any Demon, ever.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'tb'; g.nightNumber = 2; g.phase = 'night';
  g.players = [mk('d', 'imp'), mk('t1', 'soldier')];
  const prompt = E.promptFor(g, g.players.find(p => p.id === 'd'));
  check('no Barber in the script -> no addon at all, even for a living Demon', !prompt.barberSwap);
}

console.log('\nDamsel (opening briefing must confirm she\'s in play, never who she is)');
{
  // The real bug: this used to read `${damsel.name} is the Damsel.`,
  // naming her seat outright — a guaranteed, risk-free win for evil the
  // instant day began, since /api/damsel-guess's whole premise (evil
  // "guesses" and might be wrong) only holds if they genuinely don't know
  // yet. boozling is one of the three scripts that actually carries her.
  // 7+ players — below that, "evil stays in the dark" entirely (this same
  // function's own small-game exception), so nothing would be told to
  // anyone regardless of the Damsel, and this test would prove nothing.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'boozling'; g.nightNumber = 1; g.phase = 'night'; g.results = {};
  g.players = [
    mk('dm', 'damsel'), mk('m1', 'poisoner'), mk('m2', 'baron'), mk('d', 'imp'),
    mk('t1', 'soldier'), mk('t2', 'saint'), mk('t3', 'drunk'),
  ];
  await E.resolveNight(g);
  const m1Body = g.results.m1.body, m2Body = g.results.m2.body;
  check('a Minion is told the Damsel is in play', m1Body.includes('The Damsel is in play.'), m1Body);
  check('...but is never told her actual seat/name', !m1Body.includes('dm'), m1Body);
  check('every Minion gets the same treatment, not just one', m2Body.includes('The Damsel is in play.') && !m2Body.includes('dm'), m2Body);
}
{
  // No Damsel in the roster at all -> no such line for anyone, and
  // definitely never a false positive naming some other player.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'tb'; g.nightNumber = 1; g.phase = 'night'; g.results = {};
  g.players = [
    mk('m1', 'poisoner'), mk('t1', 'soldier'), mk('d', 'imp'),
    mk('t2', 'saint'), mk('t3', 'drunk'), mk('t4', 'virgin'), mk('t5', 'mayor'),
  ];
  await E.resolveNight(g);
  check('no Damsel in the script -> no "Damsel" mention at all', !g.results.m1.body.includes('Damsel'), g.results.m1.body);
}
{
  // The second, separate bug: privateState's damselGuess prompt itself was
  // never gated on a Damsel actually being in the roster at all — every
  // living Minion, in every game (Trouble Brewing included, which doesn't
  // even carry the character), saw the "Guess the Damsel" prompt during
  // the day. Caught live: a real table reported seeing it in a game with
  // no Damsel dealt.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const gNoDamsel = E.newGame();
  gNoDamsel.script = 'tb'; gNoDamsel.phase = 'day';
  gNoDamsel.players = [mk('m1', 'poisoner'), mk('t1', 'soldier'), mk('d', 'imp')];
  check('a living Minion in a Damsel-less game never gets the damselGuess prompt',
    E.privateState(gNoDamsel, 'm1').damselGuess === null);

  const gDamsel = E.newGame();
  gDamsel.script = 'boozling'; gDamsel.phase = 'day';
  gDamsel.players = [mk('dm', 'damsel'), mk('m1', 'poisoner'), mk('d', 'imp')];
  const withDamsel = E.privateState(gDamsel, 'm1').damselGuess;
  check('a living Minion in a real Damsel game DOES get the prompt', !!withDamsel, JSON.stringify(withDamsel));
  check('the target list includes the Damsel herself, among everyone else', withDamsel && withDamsel.targets.some(t => t.id === 'dm'));

  // The new Damsel-presence check is additive — every pre-existing gate
  // still holds alongside it, not replaced by it.
  check('a non-Minion in the same real Damsel game still never gets it', E.privateState(gDamsel, 'd').damselGuess === null);
  gDamsel.damselGuessUsed = true;
  check('a Minion in a real Damsel game, once the guess is already used, no longer gets it',
    E.privateState(gDamsel, 'm1').damselGuess === null);
}

console.log('\nRavenkeeper (day-phase reveal, not wave 2)');
{
  const mk = (id, characterId, alive = true) => ({ id, name: id, characterId, believedId: characterId, alive, statuses: {} });

  // A night kill on the Ravenkeeper no longer opens a second window on its
  // own — see promptFor's own comments in engine.js for why (moved to a
  // day-phase route after a real report: a player who'd just learned they
  // died, needing to also read new instructions and choose a target
  // inside that window's old 20-second deadline, and consistently losing
  // that race). There's no wave-2 mechanism left in this codebase at all
  // now — resolveNight only ever runs one pass, full stop.
  const g = E.newGame();
  g.script = 'tb'; g.nightNumber = 2; g.phase = 'night';
  g.players = [mk('rk', 'ravenkeeper'), mk('t1', 'soldier'), mk('d', 'imp')];
  g.pending = { d: { targets: ['rk'] } };
  await E.resolveNight(g);
  const rk = g.players.find(p => p.id === 'rk');
  check('the Ravenkeeper actually died', rk.alive === false);
  check('she has no night prompt of her own to answer', E.promptFor(g, rk) === null);
  check('instead, she is left with a day-phase choice pending', rk.statuses.ravenkeeperPending === true);

  // A real player's day-phase choice — server.js's /api/ravenkeeper-choice
  // is a thin wrapper around exactly this.
  const result = await E.resolveRavenkeeperChoice(g, rk, 't1');
  check('resolveRavenkeeperChoice returns the reveal', result && result.body === 't1 is the Soldier.', JSON.stringify(result));
  check('logTrueValue recorded the real answer, unfalsified', g.trueValueLog.some(
    tv => tv.playerId === 'rk' && tv.characterId === 'ravenkeeper' && tv.trueValue === 'soldier' && tv.shown === 'soldier' && tv.impaired === false));

  check('an unknown target is rejected, not silently resolved', await E.resolveRavenkeeperChoice(g, rk, 'nobody') === null);
  check('targeting herself is rejected', await E.resolveRavenkeeperChoice(g, rk, 'rk') === null);

  // Poisoned (or otherwise impaired): wrong, never silent — same doctrine
  // as every other info role, see game/abilities/README.md.
  const gPoisoned = E.newGame();
  gPoisoned.script = 'tb';
  gPoisoned.players = [mk('rk2', 'ravenkeeper'), mk('t2', 'soldier'), mk('d2', 'imp')];
  gPoisoned.players.find(p => p.id === 'rk2').statuses.poisoned = true;
  gPoisoned.mercyUsed = true; // deliberately pre-spent so Mercy can't quietly rescue this assertion
  const poisonedResult = await E.resolveRavenkeeperChoice(gPoisoned, gPoisoned.players.find(p => p.id === 'rk2'), 't2');
  check('a poisoned Ravenkeeper is still shown SOME character, never silent', !!poisonedResult, JSON.stringify(poisonedResult));
  check('a poisoned Ravenkeeper\'s shown answer is false, not the real one', poisonedResult.body !== 't2 is the Soldier.', poisonedResult.body);
  check('the false answer is still logged as impaired, with the real truth alongside it', gPoisoned.trueValueLog.some(
    tv => tv.playerId === 'rk2' && tv.trueValue === 'soldier' && tv.impaired === true && tv.shown !== 'soldier'));

  // The pending choice expires if never used, once night falls again — "the
  // day immediately following the death," not indefinitely available.
  const gExpire = E.newGame();
  gExpire.script = 'tb'; gExpire.nightNumber = 2; gExpire.phase = 'night'; gExpire.wave = 1;
  gExpire.players = [mk('rk3', 'ravenkeeper'), mk('t3', 'soldier'), mk('d3', 'imp')];
  gExpire.pending = { d3: { targets: ['rk3'] } };
  await E.resolveNight(gExpire, 1);
  check('pending right after the death', gExpire.players.find(p => p.id === 'rk3').statuses.ravenkeeperPending === true);
  gExpire.nightNumber = 3; gExpire.phase = 'night'; gExpire.wave = 1; gExpire.pending = {};
  await E.resolveNight(gExpire, 1);
  check('no longer pending once the next night\'s wave-1 reset has run', !gExpire.players.find(p => p.id === 'rk3').statuses.ravenkeeperPending);

  // A bot has no day-phase UI to act through — resolveNight resolves a bot
  // Ravenkeeper's reveal immediately instead of leaving it pending, so a
  // full-bot game (npm run sim's own default, /api/sim/start) still
  // exercises this reveal rather than silently losing it.
  const gBot = E.newGame();
  gBot.script = 'tb'; gBot.nightNumber = 2; gBot.phase = 'night'; gBot.wave = 1;
  gBot.players = [
    { ...mk('rkb', 'ravenkeeper'), bot: true },
    mk('t4', 'soldier'), mk('d4', 'imp'),
  ];
  gBot.pending = { d4: { targets: ['rkb'] } };
  await E.resolveNight(gBot, 1);
  const rkb = gBot.players.find(p => p.id === 'rkb');
  check('a bot Ravenkeeper is resolved immediately, not left pending', !rkb.statuses.ravenkeeperPending);
  check('a bot Ravenkeeper still gets a real reveal', !!gBot.results.rkb, JSON.stringify(gBot.results.rkb));
}

console.log('\nSV: Mutant setup (dealRoles)');
{
  let sawMutant = false, allCorrect = true;
  for (let i = 0; i < 40; i++) {
    const g = E.newGame();
    g.script = 'sv';
    seat(g, 9);
    E.dealRoles(g);
    const mutant = g.players.find(p => p.characterId === 'mutant');
    if (mutant) {
      sawMutant = true;
      const reasons = mutant.statuses.madReasons;
      if (!reasons || reasons.length !== 1 || reasons[0].label !== 'an Outsider' || reasons[0].expiresAfterCheck !== false) {
        allCorrect = false;
      }
    }
  }
  check('across 40 deals, the Mutant is always permanently mad about being an Outsider', allCorrect);
  check('...and the Mutant actually came up at least once, so the check above is meaningful', sawMutant);
}

console.log('\nSV: Cerenovus');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ce', 'cerenovus'), mk('t1', 'oracle')];
  g.pending = { ce: { targets: ['t1'], decoy: false, characterGuess: 'dreamer' } };
  await E.resolveNight(g, 1);
  const t1 = g.players.find(p => p.id === 't1');
  check('the target becomes mad about the chosen character',
    t1.statuses.madReasons && t1.statuses.madReasons.length === 1 && t1.statuses.madReasons[0].label === 'Dreamer');
  check("Cerenovus's madness expires after one check", t1.statuses.madReasons[0].expiresAfterCheck === true);
}
{
  // Additive: a Mutant who is also Cerenovus'd keeps both reasons.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ce', 'cerenovus'), mk('mu', 'mutant')];
  g.players.find(p => p.id === 'mu').statuses.madReasons = [{ label: 'an Outsider', expiresAfterCheck: false }];
  g.pending = { ce: { targets: ['mu'], decoy: false, characterGuess: 'oracle' } };
  await E.resolveNight(g, 1);
  const mu = g.players.find(p => p.id === 'mu');
  check("a Mutant who is also Cerenovus'd keeps both madness reasons", mu.statuses.madReasons.length === 2);
}

console.log('\nSV: resolveMadness');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.nightNumber = 2; g.config.madExecutionChance = 1; // deterministic for this test
  g.players = [mk('mu', 'mutant'), mk('t1', 'oracle')];
  g.players.find(p => p.id === 'mu').statuses.madReasons = [{ label: 'an Outsider', expiresAfterCheck: false }];
  E.resolveMadness(g);
  const mu = g.players.find(p => p.id === 'mu');
  check('an unclaimed mad player is executed when the roll always hits', !mu.alive);
  check('the death is recorded with cause "madness"', g.deaths.some(d => d.name === 'mu' && d.cause === 'madness'));
  check('a permanent reason is NOT cleared just because the check ran', mu.statuses.madReasons.length === 1);
}
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.nightNumber = 2; g.config.madExecutionChance = 1;
  g.players = [mk('mu', 'mutant')];
  const mu = g.players[0];
  mu.statuses.madReasons = [{ label: 'an Outsider', expiresAfterCheck: false }];
  mu.statuses.madClaimedToday = true;
  E.resolveMadness(g);
  check('claiming today protects them from the roll entirely', mu.alive);
  check("the claim flag resets for tomorrow's check", mu.statuses.madClaimedToday === false);
}
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.nightNumber = 2; g.config.madExecutionChance = 0; // never fires, but still processes claims/expiry
  g.players = [mk('ceTarget', 'oracle')];
  const t = g.players[0];
  t.statuses.madReasons = [{ label: 'Dreamer', expiresAfterCheck: true }];
  E.resolveMadness(g);
  check('a Cerenovus-style reason is cleared after one check, survived or not', t.statuses.madReasons.length === 0);
  check('they survive when the chance is zero', t.alive);
}
{
  // A mad-executed Demon should let checkVictory notice good has won.
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.phase = 'day'; g.nightNumber = 2; g.config.madExecutionChance = 1;
  g.players = [mk('vx', 'vortox'), mk('t1', 'oracle'), mk('t2', 'dreamer')];
  g.players.find(p => p.id === 'vx').statuses.madReasons = [{ label: 'Oracle', expiresAfterCheck: true }];
  E.resolveMadness(g);
  const v = E.checkVictory(g);
  check('mad-executing the only Demon lets good win', !!v && v.winner === 'good');
}

console.log('\nSV: evaluateClaim (shared by Gossip and Artist)');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv';
  g.players = [mk('t1', 'oracle'), mk('vx', 'vortox')];
  check('team claim, correctly evil', (await E.evaluateClaim(g, { claimType: 'team', targetId: 'vx', claimValue: 'evil' })).isTrue === true);
  check('team claim, correctly not evil', (await E.evaluateClaim(g, { claimType: 'team', targetId: 't1', claimValue: 'evil' })).isTrue === false);
  check('character claim, correct', (await E.evaluateClaim(g, { claimType: 'character', targetId: 't1', claimValue: 'oracle' })).isTrue === true);
  check('character claim, wrong', (await E.evaluateClaim(g, { claimType: 'character', targetId: 't1', claimValue: 'dreamer' })).isTrue === false);
  check('atleast claim, threshold met', (await E.evaluateClaim(g, { claimType: 'atleast', targetIds: ['t1', 'vx'], threshold: 1, claimValue: 'evil' })).isTrue === true);
  check('atleast claim, threshold not met', (await E.evaluateClaim(g, { claimType: 'atleast', targetIds: ['t1', 'vx'], threshold: 2, claimValue: 'evil' })).isTrue === false);
  check('invalid claim type is rejected', !!(await E.evaluateClaim(g, { claimType: 'nonsense' })).error);
  check('invalid target is rejected', !!(await E.evaluateClaim(g, { claimType: 'team', targetId: 'nope', claimValue: 'evil' })).error);
  check('too few distinct targets for atleast is rejected', !!(await E.evaluateClaim(g, { claimType: 'atleast', targetIds: ['t1'], threshold: 1, claimValue: 'evil' })).error);
}

console.log('\nSV: buildSavantStatements');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv';
  g.players = [mk('sa', 'savant'), mk('t1', 'oracle'), mk('t2', 'dreamer')];
  const statements = E.buildSavantStatements(g, g.players[0]);
  check('exactly two statements are returned', statements.length === 2);
  check("exactly one of the two is a literally true statement about someone's real character",
    statements.filter(s => s === 't1 is the Oracle.' || s === 't2 is the Dreamer.').length === 1);
}

console.log('\nBucket 4: activeScriptPool / dealRoles with disabled characters');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'sv';
  g.config.disabledCharacterIds = ['gossip', 'savant', 'artist']; // gossip isn't even SV, harmless no-op for it here
  g.players = [mk('t1', 'oracle')];
  const pool = E.activeScriptPool(g);
  check('disabled characters are excluded from activeScriptPool', !pool.some(c => c.id === 'savant' || c.id === 'artist'));
  check('everything else stays available', pool.some(c => c.id === 'oracle') && pool.some(c => c.id === 'dreamer'));

  let sawSavantOrArtist = false;
  for (let i = 0; i < 25; i++) {
    const g2 = E.newGame();
    g2.script = 'sv';
    g2.config.disabledCharacterIds = ['savant', 'artist'];
    seat(g2, 9);
    E.dealRoles(g2);
    check('9-player deal always succeeds with 2 of 13 SV Townsfolk disabled', g2.players.every(p => !!p.characterId));
    if (g2.players.some(p => p.characterId === 'savant' || p.characterId === 'artist')) sawSavantOrArtist = true;
  }
  check('disabled characters are never actually dealt (25 trials)', !sawSavantOrArtist);
}

console.log('\nBucket 4: BMR Gossip specifically');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  let sawGossip = false;
  for (let i = 0; i < 25; i++) {
    const g = E.newGame();
    g.script = 'bmr';
    g.config.disabledCharacterIds = ['gossip'];
    seat(g, 9);
    E.dealRoles(g);
    if (g.players.some(p => p.characterId === 'gossip')) sawGossip = true;
  }
  check('a disabled BMR Gossip is never dealt either (25 trials)', !sawGossip);
}

console.log('\napplyConfigPatch');
{
  const g = E.newGame();
  E.applyConfigPatch(g, { mayorRedirectChance: 2, tinkerDeathChance: -1, windowSeconds: 3, wave2Seconds: 99999 });
  check('chance values are clamped to [0,1]', g.config.mayorRedirectChance === 1 && g.config.tinkerDeathChance === 0);
  check('second values are clamped to a sane range', g.config.windowSeconds === 5);
  // No wave-2 mechanism is left in this codebase at all — wave2Seconds is
  // just an unrecognized key now, same as any other unknown patch field.
  check('wave2Seconds is no longer a real config key — silently ignored, not stored', !('wave2Seconds' in g.config));

  const g2 = E.newGame();
  E.applyConfigPatch(g2, { pacifistSaveChance: 0.42, notAKnownKey: 'hello', players: 'ignored' });
  check('a valid known key is applied', g2.config.pacifistSaveChance === 0.42);
  check('unknown keys are silently ignored, not stored', !('notAKnownKey' in g2.config));

  const g3 = E.newGame();
  E.applyConfigPatch(g3, { hintNights: [1, 1, 2, 5, 0, 'x'] });
  check('hintNights keeps only distinct, valid night numbers 1-3, sorted', JSON.stringify(g3.config.hintNights) === JSON.stringify([1, 2]));

  const g4 = E.newGame();
  g4.phase = 'lobby';
  E.applyConfigPatch(g4, { disabledCharacterIds: ['savant', 'artist', 'imp', 'nonsense'] });
  check('disabledCharacterIds keeps only real Bucket 4 ids', JSON.stringify(g4.config.disabledCharacterIds.sort()) === JSON.stringify(['artist', 'savant']));

  const g5 = E.newGame();
  g5.phase = 'night';
  E.applyConfigPatch(g5, { disabledCharacterIds: ['savant'] });
  check('disabledCharacterIds is ignored once roles are dealt (lobby-only, like script selection)', g5.config.disabledCharacterIds.length === 0);

  const g6 = E.newGame();
  E.applyConfigPatch(g6, { llmStorytellerEnabled: 'yes' });
  check('llmStorytellerEnabled is coerced to a real boolean', g6.config.llmStorytellerEnabled === true);
}

console.log('\nbuildStorytellerContext');
{
  const mk = (id, characterId, alive = true) => ({ id, name: id, characterId, believedId: characterId, alive, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr';
  g.players = [mk('Ada', 'imp'), mk('Bo', 'chef', false)];
  const ctx = await E.buildStorytellerContext(g);
  check('one entry per player', ctx.length === 2);
  const ada = ctx.find(x => x.name === 'Ada');
  check('true character name is included', ada.character === 'Imp');
  check('team is registration-aware evil/good, not a raw team string', ada.team === 'evil');
  check('alive status is public alive status', ctx.find(x => x.name === 'Bo').alive === false);
  check('nothing beyond name/character/team/alive leaks through', Object.keys(ada).sort().join(',') === 'alive,character,name,team');
}

console.log('\nCarousel: Noble');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'trust'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('n', 'noble'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('e1', 'baron'), mk('d', 'imp')];
  g.pending = {};
  await E.resolveNight(g, 1);
  const shownNames = g.results.n.names;
  check('Noble is shown exactly 3 players', shownNames.length === 3);
  let shownEvilCount = 0;
  for (const name of shownNames) {
    const p = g.players.find(x => x.name === name);
    if (await E.isEvilRegistration(g, p)) shownEvilCount++;
  }
  check('exactly 1 of the 3 shown is evil', shownEvilCount === 1, `got ${shownEvilCount}`);

  const g2 = E.newGame();
  g2.script = 'trust'; g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('n', 'noble'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('e1', 'baron'), mk('d', 'imp')];
  g2.players.find(p => p.id === 'n').statuses.poisoned = true;
  g2.pending = {};
  await E.resolveNight(g2, 1);
  check('a poisoned Noble still gets shown something (broken, not silent)', g2.results.n.names.length === 3);
}

console.log('\nCarousel: Balloonist');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'boozling'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('b', 'balloonist'), mk('t1', 'oracle'), mk('o1', 'klutz'), mk('m1', 'baron'), mk('d', 'imp')];
  g.pending = {};
  const seenTypes = new Set();
  for (let night = 1; night <= 5; night++) {
    g.nightNumber = night;
    g.phase = 'night';
    g.results = {};
    await E.resolveNight(g, 1);
    const body = g.results.b.body;
    for (const t of ['townsfolk', 'outsider', 'minion', 'demon']) if (body.includes(` a ${t}.`)) seenTypes.add(t);
  }
  check('all 4 character types are eventually learned across nights', seenTypes.size === 4, [...seenTypes].join(','));
  const finalBody = g.results.b.body;
  check('once everything is learned, later nights say so instead of repeating',
    finalBody.includes('already learned') || seenTypes.size < 4);
}

console.log('\nCarousel: Magician (deliverOpeningInfo)');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'lunar-eclipse'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [
    mk('mag', 'magician'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('t3', 'oracle'),
    mk('m1', 'baron'), mk('m2', 'poisoner'), mk('d', 'imp'),
  ];
  g.pending = {};
  await E.resolveNight(g, 1);
  check("Minions are told the Magician, not the real Demon, is the Demon",
    g.results.m1.body.includes('mag is the Demon') && !g.results.m1.body.includes('d is the Demon'));
  check("the Demon is told the Magician appears to be a Minion",
    g.results.d.body.includes('mag') && g.results.d.body.includes('appears to be a Minion'));
}

console.log('\nCarousel: Puzzlemaster');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.players = [mk('pz', 'puzzlemaster'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('m1', 'baron'), mk('d', 'imp')];
  g.puzzlemasterDrunkId = 't1'; // normally set by dealRoles — set directly here for a controlled test
  g.players.find(p => p.id === 't1').statuses.drunk = true;
  g.script = 'lunar-eclipse'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.pending = { pz: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('a correct guess names the real Demon', g.results.pz.body.includes('Correct') && g.results.pz.body.includes('d'));
  check('the guess is spent after use', g.players.find(p => p.id === 'pz').statuses.puzzlemasterUsed === true);

  const promptAfter = E.promptFor(g, g.players.find(p => p.id === 'pz'));
  check('no further prompt is offered once spent', !promptAfter || !promptAfter.characterId);

  const g2 = E.newGame();
  g2.players = [mk('pz', 'puzzlemaster'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('m1', 'baron'), mk('d', 'imp')];
  g2.puzzlemasterDrunkId = 't1';
  g2.players.find(p => p.id === 't1').statuses.drunk = true;
  g2.script = 'lunar-eclipse'; g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.pending = { pz: { targets: ['t2'], decoy: false } }; // guesses wrong
  await E.resolveNight(g2, 1);
  check('a wrong guess is told Wrong, with false info, not the real Demon',
    g2.results.pz.body.includes('Wrong') && !g2.results.pz.body.includes(' d.') && !g2.results.pz.body.endsWith(' d'));

  const g3 = E.newGame();
  g3.players = [mk('pz', 'puzzlemaster'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('m1', 'baron'), mk('d', 'imp')];
  g3.puzzlemasterDrunkId = 't1';
  g3.players.find(p => p.id === 't1').statuses.drunk = true;
  g3.script = 'lunar-eclipse'; g3.nightNumber = 1; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.pending = { pz: { targets: [], decoy: false } }; // passes
  await E.resolveNight(g3, 1);
  check('passing does not spend the once-ever guess', !g3.players.find(p => p.id === 'pz').statuses.puzzlemasterUsed);
}

console.log('\nCarousel: Preacher');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'hide-and-seek'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('pr', 'preacher'), mk('t1', 'oracle'), mk('m1', 'baron'), mk('d', 'imp')];
  g.pending = { pr: { targets: ['m1'], decoy: false } };
  await E.resolveNight(g, 1);
  const minion = g.players.find(p => p.id === 'm1');
  check('a targeted Minion is silenced (poisoned) for the night', minion.statuses.poisoned === true);
  check('the silenced Minion is told so', g.results.m1 && g.results.m1.body.includes('Preacher'));

  const g2 = E.newGame();
  g2.script = 'hide-and-seek'; g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('pr', 'preacher'), mk('t1', 'oracle'), mk('m1', 'baron'), mk('d', 'imp')];
  g2.pending = { pr: { targets: ['t1'], decoy: false } }; // targets a Townsfolk, not a Minion
  await E.resolveNight(g2, 1);
  check('targeting a non-Minion silences nobody', !g2.players.find(p => p.id === 't1').statuses.poisoned);
}

console.log('\nCarousel: Puzzlemaster setup (dealRoles)');
{
  const g = E.newGame();
  g.script = 'lunar-eclipse';
  for (let i = 0; i < 9; i++) {
    g.players.push({ id: 'p' + i, name: NAMES[i], characterId: null, believedId: null, alive: true, statuses: {}, connected: true });
  }
  E.dealRoles(g);
  const puzzlemaster = g.players.find(p => p.characterId === 'puzzlemaster');
  if (puzzlemaster) {
    check('a random player other than the Puzzlemaster is marked drunk', !!g.puzzlemasterDrunkId && g.puzzlemasterDrunkId !== puzzlemaster.id);
    const drunkPlayer = g.players.find(p => p.id === g.puzzlemasterDrunkId);
    check('that player is actually impaired', E.impaired(drunkPlayer));
  } else {
    console.log('  (Puzzlemaster not dealt this trial — nothing to check)');
  }
}

console.log('\nCarousel: Pixie');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'boozling'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('px', 'pixie'), mk('t1', 'oracle'), mk('t2', 'sage'), mk('m1', 'baron'), mk('d', 'imp')];
  g.pending = {};
  await E.resolveNight(g, 1);
  const revealedId = g.players.find(p => p.id === 'px').statuses.pixieRevealedId;
  check('Pixie is shown an in-play Townsfolk', revealedId === 'oracle' || revealedId === 'sage', revealedId);

  const revealedPlayer = g.players.find(p => p.characterId === revealedId);
  const cerenovusLabel = E.char(revealedId).name;
  const pixie = g.players.find(p => p.id === 'px');
  // "If YOU [the Pixie] were mad that YOU were this character" — the mad
  // reason belongs to the Pixie, about themselves, not to the revealed
  // player.
  pixie.statuses.madReasons = [{ label: cerenovusLabel, expiresAfterCheck: true }];
  E.triggerDeathHooks(g, revealedPlayer, { killedByDemon: false });
  check("gains the revealed character's ability once they die while mad about being them",
    pixie.believedId === revealedId && pixie.characterId === 'pixie');

  const g2 = E.newGame();
  g2.script = 'boozling'; g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('px', 'pixie'), mk('t1', 'oracle'), mk('t2', 'sage'), mk('m1', 'baron'), mk('d', 'imp')];
  g2.pending = {};
  await E.resolveNight(g2, 1);
  const revealedId2 = g2.players.find(p => p.id === 'px').statuses.pixieRevealedId;
  const revealedPlayer2 = g2.players.find(p => p.characterId === revealedId2);
  // Not mad about being this character at all — dying should change nothing.
  E.triggerDeathHooks(g2, revealedPlayer2, { killedByDemon: false });
  const pixie2 = g2.players.find(p => p.id === 'px');
  check('does NOT gain an ability from an unrelated death', pixie2.believedId === 'pixie');
}

console.log('\nCarousel: Ojo');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'hide-and-seek'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('t1', 'oracle'), mk('t2', 'sage'), mk('m1', 'baron'), mk('oj', 'ojo')];
  g.pending = { oj: { targets: [], decoy: false, characterGuess: 'oracle' } };
  await E.resolveNight(g, 1);
  check('naming an in-play character kills whoever holds it', g.players.find(p => p.id === 't1').alive === false);

  const g2 = E.newGame();
  g2.script = 'hide-and-seek'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('t1', 'oracle'), mk('t2', 'sage'), mk('m1', 'baron'), mk('oj', 'ojo')];
  g2.pending = { oj: { targets: [], decoy: false, characterGuess: 'empath' } }; // not in this game
  await E.resolveNight(g2, 1);
  const deadCount = g2.players.filter(p => !p.alive).length;
  check('naming a character not in play still kills someone (the Storyteller chooses)', deadCount === 1);

  const g3 = E.newGame();
  g3.script = 'hide-and-seek'; g3.nightNumber = 1; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('t1', 'oracle'), mk('oj', 'ojo')];
  const promptN1 = E.promptFor(g3, g3.players.find(p => p.id === 'oj'));
  check('Ojo does not act on night 1', !promptN1 || !promptN1.characterId);

  // "Not in play" means never dealt to anyone — a character whose holder
  // already died is still in play, just already dead. Naming it should be
  // a no-op ("they die" on someone already dead), not fall through to the
  // Storyteller-chooses-a-random-victim clause meant for a character
  // genuinely never dealt this game.
  const g4 = E.newGame();
  g4.script = 'hide-and-seek'; g4.nightNumber = 2; g4.phase = 'night'; g4.wave = 1; g4.results = {};
  g4.players = [mk('t1', 'oracle'), mk('t2', 'sage'), mk('m1', 'baron'), mk('oj', 'ojo')];
  g4.players.find(p => p.id === 't1').alive = false; // oracle's holder already dead before tonight
  g4.pending = { oj: { targets: [], decoy: false, characterGuess: 'oracle' } };
  await E.resolveNight(g4, 1);
  const newlyDead = g4.players.filter(p => !p.alive && p.id !== 't1');
  check('naming a character whose holder already died kills nobody new', newlyDead.length === 0);
}

console.log('\nCarousel: Lycanthrope');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'lunar-eclipse'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ly', 'lycanthrope'), mk('t1', 'oracle'), mk('m1', 'baron'), mk('d', 'imp')];
  g.pending = { ly: { targets: ['t1'], decoy: false } };
  await E.resolveNight(g, 1);
  check('killing a good target succeeds', g.players.find(p => p.id === 't1').alive === false);
  check("no one else dies the same night, even the demon's own kill", g.deaths.filter(d => d.night === 2).length === 1);

  const g2 = E.newGame();
  g2.script = 'lunar-eclipse'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('ly', 'lycanthrope'), mk('m1', 'baron'), mk('d', 'imp')];
  g2.pending = { ly: { targets: ['m1'], decoy: false } }; // targets evil — nothing happens
  await E.resolveNight(g2, 1);
  check('targeting an evil player kills nobody', g2.players.find(p => p.id === 'm1').alive === true);
}

console.log('\nCarousel: Cannibal (execution-triggered)');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'trust'; g.nightNumber = 2;
  g.players = [mk('c', 'cannibal'), mk('t1', 'oracle'), mk('m1', 'baron')];
  const executee = g.players.find(p => p.id === 't1');
  executee.alive = false;
  E.applyCannibalTransform(g, executee);
  const cannibal = g.players.find(p => p.id === 'c');
  check("gains the executee's ability (good executee)", cannibal.believedId === 'oracle' && cannibal.characterId === 'cannibal');
  check('is not poisoned after a good executee', !cannibal.statuses.poisoned);

  const g2 = E.newGame();
  g2.script = 'trust'; g2.nightNumber = 2;
  g2.players = [mk('c', 'cannibal'), mk('t1', 'oracle'), mk('m1', 'baron')];
  const evilExecutee = g2.players.find(p => p.id === 'm1');
  evilExecutee.alive = false;
  E.applyCannibalTransform(g2, evilExecutee);
  const cannibal2 = g2.players.find(p => p.id === 'c');
  check("gains the executee's ability (evil executee)", cannibal2.believedId === 'baron');
  check('is poisoned after an evil executee', cannibal2.statuses.poisoned === true);

  const goodExecutee2 = g2.players.find(p => p.id === 't1'); // already "dead" above; reused just as a good execution event
  E.applyCannibalTransform(g2, goodExecutee2);
  check('the poison clears once a good player is later executed', !cannibal2.statuses.poisoned);
}

console.log('\nCarousel: Marionette (dealRoles + deliverOpeningInfo)');
{
  const g = E.newGame();
  g.script = 'boozling';
  for (let i = 0; i < 9; i++) {
    g.players.push({ id: 'p' + i, name: NAMES[i], characterId: null, believedId: null, alive: true, statuses: {}, connected: true });
  }
  E.dealRoles(g);
  const marionette = g.players.find(p => p.characterId === 'marionette');
  if (marionette) {
    const believedChar = E.char(marionette.believedId);
    check('believes they are a real good character', believedChar && (believedChar.team === 'townsfolk' || believedChar.team === 'outsider'));
    const results = {};
    g.nightNumber = 1;
    await E.resolveNight(g, 1); // deliverOpeningInfo runs inside this
    const demon = g.players.find(p => E.trueChar(p) && E.trueChar(p).team === 'demon');
    if (demon && g.players.length >= 7) {
      const demonResult = g.results && g.results[demon.id];
      check('the Demon is told who the Marionette is', !!demonResult && demonResult.body.includes('is the Marionette'));
    } else {
      console.log('  (fewer than 7 players this trial — evil info gate not open, nothing to check)');
    }
  } else {
    console.log('  (Marionette not dealt this trial — nothing to check)');
  }
}

console.log('\nCarousel: General');
{
  const mk = (id, characterId, alive = true) => ({ id, name: id, characterId, believedId: characterId, alive, statuses: {} });
  const g = E.newGame();
  g.script = 'trust'; g.nightNumber = 1; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('gn', 'general'), mk('t1', 'oracle'), mk('t2', 'oracle'), mk('t3', 'oracle'), mk('d', 'imp', false)];
  g.pending = {};
  await E.resolveNight(g, 1);
  check('with no living Demon, the verdict is "good"', g.results.gn.body.includes('good'));

  const g2 = E.newGame();
  g2.script = 'trust'; g2.nightNumber = 1; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('gn', 'general'), mk('d', 'imp')];
  g2.pending = {};
  await E.resolveNight(g2, 1);
  check('down to just the General and the Demon, the verdict is "evil"', g2.results.gn.body.includes('evil'));
}

console.log('\nCarousel: Politician (checkVictory)');
{
  const mk = (id, characterId, alive = true) => ({ id, name: id, characterId, believedId: characterId, alive, statuses: {} });
  const g = E.newGame();
  g.phase = 'day';
  g.players = [mk('po', 'politician'), mk('t1', 'oracle', false), mk('d', 'imp')]; // only 2 living -> "Only the Demon and one other remain"
  const v = E.checkVictory(g);
  check('flips an evil win to good while the Politician is in the game', v && v.winner === 'good', JSON.stringify(v));

  const g2 = E.newGame();
  g2.phase = 'day';
  g2.players = [mk('t1', 'oracle'), mk('d', 'imp')]; // no Politician at all
  const v2 = E.checkVictory(g2);
  check('an ordinary evil win is untouched with no Politician in the game', v2 && v2.winner === 'evil', JSON.stringify(v2));

  const g3 = E.newGame();
  g3.phase = 'day';
  g3.players = [mk('po', 'politician', false), mk('t1', 'oracle'), mk('d', 'imp')]; // Politician already dead
  const v3 = E.checkVictory(g3);
  check('still flips it even dead — "even if dead" is in the card text', v3 && v3.winner === 'good', JSON.stringify(v3));
}

console.log('\nresultHistory (a player checking their own past results)');
{
  const mk = (id, characterId, alive = true) => ({ id, name: id, characterId, believedId: characterId, alive, statuses: {} });

  const g = E.newGame();
  g.nightNumber = 3;
  g.players = [mk('rk1', 'ravenkeeper'), mk('t1', 'soldier'), mk('imp1', 'imp')];
  // Simulate what flushNightResults() (server.js) would already have
  // written for two earlier nights, plus a live, not-yet-flushed result
  // for tonight — privateState() has to stitch both sources together.
  g.resultsLog = [
    { night: 1, playerId: 'rk1', playerName: 'rk1', characterId: 'ravenkeeper', characterName: 'Ravenkeeper', title: 'Empath', body: 'Evil living neighbours: 0' },
    { night: 2, playerId: 't1', playerName: 't1', characterId: 'soldier', characterName: 'Soldier', title: 'Something', body: 'not this player' },
  ];
  g.results = { rk1: { title: 'Ravenkeeper', body: 'imp1 is the Imp.' } };

  const history = E.privateState(g, 'rk1').resultHistory;
  check('includes this player\'s own already-flushed nights', history.some(r => r.night === 1 && r.body === 'Evil living neighbours: 0'));
  check('never includes another player\'s entries', !history.some(r => r.playerId === 't1'));
  check('includes tonight\'s own not-yet-flushed result, tagged with the current night', history.some(r => r.night === 3 && r.body === 'imp1 is the Imp.'));
  check('exactly 2 entries — nothing duplicated, nothing missing', history.length === 2, JSON.stringify(history));

  const gEmpty = E.newGame();
  gEmpty.players = [mk('rk1', 'ravenkeeper')];
  check('a player with no results at all yet gets an empty array, not undefined/null', Array.isArray(E.privateState(gEmpty, 'rk1').resultHistory) && E.privateState(gEmpty, 'rk1').resultHistory.length === 0);
}

console.log('\nResult kind metadata (Phase 6: differentiated result cards)');
{
  const mk = (id, characterId, alive = true) => ({ id, name: id, characterId, believedId: characterId, alive, statuses: {} });

  const gChef = E.newGame();
  gChef.nightNumber = 1; gChef.phase = 'night'; gChef.wave = 1; gChef.results = {};
  gChef.players = [mk('c1', 'chef'), mk('min1', 'poisoner'), mk('d1', 'imp')];
  await E.resolveNight(gChef, 1);
  check('Chef result carries kind:count and the shown number', gChef.results.c1.kind === 'count' && typeof gChef.results.c1.count === 'number');

  const gEmp = E.newGame();
  gEmp.nightNumber = 1; gEmp.phase = 'night'; gEmp.wave = 1; gEmp.results = {};
  gEmp.players = [mk('e1', 'empath'), mk('min1', 'poisoner'), mk('d1', 'imp')];
  await E.resolveNight(gEmp, 1);
  check('Empath result carries kind:count', gEmp.results.e1.kind === 'count');

  const gFt = E.newGame();
  gFt.nightNumber = 2; gFt.phase = 'night'; gFt.wave = 1; gFt.results = {};
  gFt.players = [mk('ft1', 'fortuneteller'), mk('d1', 'imp'), mk('t1', 'soldier')];
  gFt.pending = { ft1: { targets: ['d1', 't1'], decoy: false } };
  await E.resolveNight(gFt, 1);
  check('Fortune Teller result carries kind:yesno, yes:true, and still keeps names',
    gFt.results.ft1.kind === 'yesno' && gFt.results.ft1.yes === true && Array.isArray(gFt.results.ft1.names) && gFt.results.ft1.names.length === 2);

  const gWw = E.newGame();
  gWw.nightNumber = 1; gWw.phase = 'night'; gWw.wave = 1; gWw.results = {};
  gWw.players = [mk('ww1', 'washerwoman'), mk('t1', 'soldier'), mk('d1', 'imp')];
  await E.resolveNight(gWw, 1);
  check('Washerwoman result carries kind:pointer and two named players',
    gWw.results.ww1.kind === 'pointer' && Array.isArray(gWw.results.ww1.names) && gWw.results.ww1.names.length === 2);

  const gSpy = E.newGame();
  gSpy.nightNumber = 1; gSpy.phase = 'night'; gSpy.wave = 1; gSpy.results = {};
  gSpy.players = [mk('sp1', 'spy'), mk('t1', 'soldier'), mk('d1', 'imp')];
  await E.resolveNight(gSpy, 1);
  check('Spy result carries kind:grimoire alongside its existing grimoire array',
    gSpy.results.sp1.kind === 'grimoire' && Array.isArray(gSpy.results.sp1.grimoire));
}

console.log('\nCustom roster (Phase 9: script builder)');
{
  const mk = (id, characterId, alive = true) => ({ id, name: id, characterId, believedId: characterId, alive, statuses: {} });

  const gc = E.newGame();
  gc.customRoster = ['imp', 'poisoner', 'washerwoman', 'soldier', 'slayer'];
  gc.players = [mk('p1', 'x'), mk('p2', 'x'), mk('p3', 'x'), mk('p4', 'x'), mk('p5', 'x')];
  check('activeScriptPool returns exactly the custom roster, regardless of g.script',
    JSON.stringify(E.activeScriptPool(gc).map(c => c.id).sort()) === JSON.stringify(['imp', 'poisoner', 'slayer', 'soldier', 'washerwoman'].sort()));

  E.dealRoles(gc);
  const dealtIds = gc.players.map(p => p.characterId).sort();
  check('dealRoles deals only from the custom roster, one demon and one minion',
    dealtIds.every(id => gc.customRoster.includes(id)) &&
    dealtIds.filter(id => id === 'imp').length === 1 &&
    dealtIds.filter(id => id === 'poisoner').length === 1,
    JSON.stringify(dealtIds));

  // Bucket-4 disables still apply on top of a custom roster, same as a
  // named edition — activeScriptPool is the one shared choke point both
  // paths run through.
  const gDisabled = E.newGame();
  gDisabled.customRoster = ['imp', 'poisoner', 'gossip', 'washerwoman', 'soldier'];
  gDisabled.config.disabledCharacterIds = ['gossip'];
  check('a Bucket-4 disable still filters a custom roster',
    !E.activeScriptPool(gDisabled).some(c => c.id === 'gossip'));
}

console.log('\nThe Whim: judge injection (setWhimJudge/resolveWhim)');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  // A judge that always says yes overrides even a chance=0 legacy rate.
  E.setWhimJudge(async () => ({ fire: true, reason: 'test judge says yes' }));
  const g1 = E.newGame();
  g1.config.mayorRedirectChance = 0;
  g1.players = [mk('may1', 'mayor'), mk('t1', 'chef'), mk('t2', 'soldier')];
  const r1 = await E.randomKiller(g1, [g1.players[0]]);
  check('a judge saying yes overrides mayorRedirectChance=0', r1.id !== 'may1');

  // A judge that always says no overrides even a chance=1 legacy rate.
  E.setWhimJudge(async () => ({ fire: false, reason: 'test judge says no' }));
  const g2 = E.newGame();
  g2.config.mayorRedirectChance = 1;
  g2.players = [mk('may1', 'mayor'), mk('t1', 'chef'), mk('t2', 'soldier')];
  const r2 = await E.randomKiller(g2, [g2.players[0]]);
  check('a judge saying no overrides mayorRedirectChance=1', r2.id === 'may1');

  // A judge that declines (undefined — "not this table's call to make",
  // e.g. the LLM is off) defers to the plain roll underneath, same as
  // having no judge attached at all.
  E.setWhimJudge(async () => undefined);
  const g3 = E.newGame();
  g3.config.mayorRedirectChance = 0;
  g3.players = [mk('may1', 'mayor'), mk('t1', 'chef'), mk('t2', 'soldier')];
  const r3 = await E.randomKiller(g3, [g3.players[0]]);
  check('a judge returning undefined defers to the plain roll (chance=0 never redirects)', r3.id === 'may1');

  // A judge that throws (a real network failure) never crashes or stalls
  // resolution — falls back to the plain roll, same doctrine Bucket 4
  // already follows for a failed askStoryteller() call.
  E.setWhimJudge(async () => { throw new Error('network blew up'); });
  const g4 = E.newGame();
  g4.config.mayorRedirectChance = 0;
  g4.players = [mk('may1', 'mayor'), mk('t1', 'chef'), mk('t2', 'soldier')];
  const r4 = await E.randomKiller(g4, [g4.players[0]]);
  check('a throwing judge never crashes resolution — falls back to the plain roll', r4.id === 'may1');

  // The Confirm: a high-stakes call (few living) with a judge attached
  // gets a whimConfirmations entry carrying the reason; a low-stakes call
  // (plenty living) never does, even though the exact same judge decided it.
  E.setWhimJudge(async () => ({ fire: true, reason: 'protecting the trailing side' }));
  const g5 = E.newGame();
  g5.config.mayorRedirectChance = 0;
  g5.players = [mk('may1', 'mayor'), mk('t1', 'chef'), mk('t2', 'soldier')]; // 3 living: high stakes
  await E.randomKiller(g5, [g5.players[0]]);
  check('a high-stakes decision (<=5 living) is logged to whimConfirmations',
    g5.whimConfirmations.length === 1, JSON.stringify(g5.whimConfirmations));
  check('the logged entry carries kind, fired, and the judge\'s reason',
    g5.whimConfirmations[0].kind === 'mayor-redirect' &&
    g5.whimConfirmations[0].fired === true &&
    g5.whimConfirmations[0].reason === 'protecting the trailing side');
  check('the logged entry also carries the aggregate counts and which side firing helps',
    g5.whimConfirmations[0].livingCount === 3 && g5.whimConfirmations[0].helpsGood === true);

  const g6 = E.newGame();
  g6.config.mayorRedirectChance = 0;
  g6.players = Array.from({ length: 7 }, (_, i) => mk('p' + i, i === 0 ? 'mayor' : 'chef')); // 7 living: not high stakes
  await E.randomKiller(g6, [g6.players[0]]);
  check('a low-stakes decision (>5 living) is never logged to whimConfirmations, even when it fires',
    g6.whimConfirmations.length === 0);

  // publicState() withholds kind/reason pre-reveal (they could name a
  // character) but keeps the aggregate, already-public fields live — the
  // whole reason this doesn't use resultsLog/actionLog's all-or-nothing gate.
  const pre = E.publicState(g5).whimConfirmations[0];
  check('pre-reveal, kind and reason are withheld', pre.kind === undefined && pre.reason === undefined);
  check('pre-reveal, the aggregate/public fields still come through', pre.fired === true && pre.livingCount === 3);
  g5.revealed = true;
  const post = E.publicState(g5).whimConfirmations[0];
  check('post-reveal, kind and reason are restored', post.kind === 'mayor-redirect' && post.reason === 'protecting the trailing side');

  // setWhimJudge is module-level, global state, not per-game — leaving a
  // fake judge attached here would silently corrupt every other check() in
  // this file that runs after this section.
  E.setWhimJudge(null);
}

console.log('\nThe Mercy: at most once, only when good is clearly losing, info roles only');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });

  E.setWhimJudge(async () => ({ fire: true, reason: 'good is nearly out of the game' }));

  const goodLosing = () => {
    const g = E.newGame();
    g.players = [mk('imp1', 'imp'), mk('poi1', 'poisoner'), mk('emp1', 'empath')]; // 2 evil, 1 good
    return g;
  };
  const evenlyMatched = () => {
    const g = E.newGame();
    g.players = [mk('imp1', 'imp'), mk('emp1', 'empath')]; // 1 evil, 1 good — not "clearly" losing
    return g;
  };

  const empathOf = g => g.players.find(p => p.characterId === 'empath');

  {
    const g = evenlyMatched();
    check('not granted when good is only evenly matched, not clearly losing',
      !(await E.maybeMercy(g, empathOf(g))));
  }

  check('not granted for a character outside MERCY_ELIGIBLE_IDS (e.g. the Spy — a full grimoire shuffle, not a single value)',
    !(await E.maybeMercy(goodLosing(), { characterId: 'spy' })));

  {
    const g = goodLosing();
    const granted = await E.maybeMercy(g, empathOf(g));
    check('granted once good is clearly losing, the character is eligible, and the judge says yes', granted === true);
    check('mercyUsed is set the moment it is granted', g.mercyUsed === true);

    const secondGrant = await E.maybeMercy(g, empathOf(g));
    check('never granted twice in the same game, even asking again immediately after', secondGrant === false);
  }

  // End-to-end: a poisoned, eligible Empath in a clearly-losing game gets
  // the TRUE count once Mercy fires — not the guaranteed-wrong one her own
  // poison would otherwise force.
  {
    const g = goodLosing();
    g.nightNumber = 1; g.phase = 'night'; g.wave = 1;
    empathOf(g).statuses.poisoned = true;
    await E.resolveNight(g, 1);
    // 3-seat ring: the Empath's only two neighbors are the Imp and the
    // Poisoner, so her true count is exactly 2.
    check('a poisoned Empath granted Mercy sees her real result, not a falsified one',
      g.results.emp1.count === 2, JSON.stringify(g.results.emp1));
  }

  // A non-eligible impaired character (Monk — an active protection, not
  // pure info) is never touched by Mercy, even when every other condition
  // holds — this is the "never touching who lives or dies" guarantee.
  {
    const g = E.newGame();
    g.players = [mk('imp1', 'imp'), mk('poi1', 'poisoner'), mk('monk1', 'monk'), mk('sol1', 'soldier')]; // 2 evil, 2 good
    g.nightNumber = 2; g.phase = 'night'; g.wave = 1; // Monk doesn't act night 1
    const monk = g.players.find(p => p.characterId === 'monk');
    monk.statuses.poisoned = true;
    g.pending = { monk1: { targets: ['sol1'] } };
    await E.resolveNight(g, 1);
    check('a poisoned Monk\'s protection still silently fails — Mercy never reaches active/protective abilities',
      !g.players.find(p => p.id === 'sol1').statuses.protected);
  }

  E.setWhimJudge(null);
}

console.log('\nheuristicWhim (Option 1: the non-LLM judgment)');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const trials = 800;

  function fireRate(kind, playerSpec) {
    const g = E.newGame();
    g.players = playerSpec.map(([id, c]) => mk(id, c));
    let fires = 0;
    for (let i = 0; i < trials; i++) if (E.heuristicWhim(g, { kind }).fire) fires++;
    return fires / trials;
  }

  {
    const g = E.newGame();
    g.players = [mk('a', 'imp'), mk('b', 'poisoner'), mk('c', 'chef')];
    const { reason } = E.heuristicWhim(g, { kind: 'mayor-redirect' });
    check('heuristicWhim always includes a one-line reason, even with no LLM in the loop',
      typeof reason === 'string' && reason.length > 0, JSON.stringify(reason));
  }

  // mayor-redirect/pacifist-save both keep a good player alive when they
  // fire, so they should fire MORE often once good is clearly behind.
  const mayorGoodBehind = fireRate('mayor-redirect', [['a', 'imp'], ['b', 'poisoner'], ['c', 'chef']]); // 1 good, 2 evil
  const mayorGoodAhead = fireRate('mayor-redirect', [['a', 'imp'], ['b', 'chef'], ['c', 'soldier'], ['d', 'empath']]); // 3 good, 1 evil
  check('mayor-redirect fires more when good is behind than when good is ahead',
    mayorGoodBehind > mayorGoodAhead, `behind=${mayorGoodBehind}, ahead=${mayorGoodAhead}`);

  const pacifistGoodBehind = fireRate('pacifist-save', [['a', 'imp'], ['b', 'poisoner'], ['c', 'chef']]);
  const pacifistGoodAhead = fireRate('pacifist-save', [['a', 'imp'], ['b', 'chef'], ['c', 'soldier'], ['d', 'empath']]);
  check('pacifist-save fires more when good is behind than when good is ahead',
    pacifistGoodBehind > pacifistGoodAhead, `behind=${pacifistGoodBehind}, ahead=${pacifistGoodAhead}`);

  // registration-ambiguity's "fires" outcome helps EVIL (misleads an info
  // role, or lets a Spy blend in) — so it's the mirror image: fires more
  // often when EVIL is the one behind (good ahead or level).
  const regGoodAhead = fireRate('registration-ambiguity', [['a', 'imp'], ['b', 'chef'], ['c', 'soldier'], ['d', 'empath']]); // evil behind
  const regGoodBehind = fireRate('registration-ambiguity', [['a', 'imp'], ['b', 'poisoner'], ['c', 'chef']]); // evil ahead
  check('registration-ambiguity fires more when evil is behind (good ahead) than when evil is ahead — the mirror of the other two kinds',
    regGoodAhead > regGoodBehind, `good-ahead=${regGoodAhead}, good-behind=${regGoodBehind}`);

  // The endgame bonus: a tight 4-living-or-fewer game should fire more
  // often than an even larger, level game of the same kind.
  const endgame = fireRate('mayor-redirect', [['a', 'imp'], ['b', 'chef']]); // 2 living, endgame, good behind
  const midgame = fireRate('mayor-redirect', [
    ['a', 'imp'], ['b', 'poisoner'], ['c', 'chef'], ['d', 'soldier'], ['e', 'empath'], ['f', 'librarian'],
  ]); // 6 living, not endgame, good ahead
  check('a tight endgame fires more often than a larger, good-ahead midgame', endgame > midgame,
    `endgame=${endgame}, midgame=${midgame}`);

  // Real report: a Mayor that felt unkillable — traced to this escalating
  // all the way to 0.5 * 1.4 * 1.2 = 0.84 in the endgame, silently, with
  // no host visibility until the Confirm card started showing up at
  // <=5 living (by which point the pattern had already shaped the whole
  // game). Softened to a real nudge, not near-immunity — locks in the new
  // ceiling (0.5 * 1.2 * 1.1 = 0.66) so it can't silently climb back up.
  check('the worst case (trailing side, endgame) stays a real nudge, not the old near-immunity',
    endgame > 0.5 && endgame < 0.75, `endgame fire rate: ${endgame}`);
}

console.log('\nBot claims (Dry Run day-phase placeholder, before the LLM reasoning layer)');
{
  const mk = (id, characterId, believedId) => ({
    id, name: id, characterId, believedId: believedId || characterId, alive: true, statuses: {},
  });

  {
    const g = E.newGame();
    g.players = [mk('a', 'chef'), mk('b', 'imp'), mk('c', 'poisoner')];
    const claim = E.heuristicBotClaim(g, g.players[0]);
    check('a good-aligned bot claims its own believed character',
      claim && claim.claimedCharacterId === 'chef', JSON.stringify(claim));
  }

  {
    const g = E.newGame();
    g.players = [mk('a', 'chef'), mk('b', 'imp'), mk('c', 'poisoner')];
    const claim = E.heuristicBotClaim(g, g.players[1]); // the Imp
    const c = claim && E.char(claim.claimedCharacterId);
    check('an evil-aligned bot never claims its own true demon/minion character',
      claim && c && c.team !== 'demon' && c.team !== 'minion', JSON.stringify(claim));
  }

  {
    const g = E.newGame();
    // A Drunk believes they're a Townsfolk (here: Soldier) — not lying,
    // just claiming their own false belief, same as a real Drunk would.
    g.players = [mk('a', 'drunk', 'soldier'), mk('b', 'imp')];
    const claim = E.heuristicBotClaim(g, g.players[0]);
    check('a Drunk claims their believed role, not the true "drunk" character',
      claim && claim.claimedCharacterId === 'soldier', JSON.stringify(claim));
  }

  {
    const g = E.newGame();
    // The Lunatic believes they ARE the Demon — claiming that out loud
    // would be a confession, so the heuristic has to override believedId
    // here specifically, unlike the Drunk case above.
    g.players = [mk('a', 'lunatic', 'imp'), mk('b', 'imp')];
    const claim = E.heuristicBotClaim(g, g.players[0]);
    const c = claim && E.char(claim.claimedCharacterId);
    check('a Lunatic (believes they are the Demon) bluffs a good role instead of claiming the Demon',
      claim && c && c.team !== 'demon' && c.team !== 'minion', JSON.stringify(claim));
  }

  {
    const g = E.newGame();
    g.players = [mk('a', 'imp'), mk('b', 'poisoner'), mk('c', 'chef')];
    const first = E.heuristicBotClaim(g, g.players[0]);
    E.recordClaim(g, g.players[0], first.claimedCharacterId, first.statement);
    const second = E.heuristicBotClaim(g, g.players[1]);
    check('a second evil bot avoids bluffing a character the first one already claimed',
      second.claimedCharacterId !== first.claimedCharacterId,
      `first=${first.claimedCharacterId}, second=${second.claimedCharacterId}`);
  }

  {
    const g = E.newGame();
    g.players = [mk('a', 'chef')];
    const entry = E.recordClaim(g, g.players[0], 'chef', 'I counted 1 pair.');
    check('recordClaim pushes a full entry onto g.claims',
      g.claims.length === 1 && g.claims[0].playerId === 'a' && g.claims[0].claimedCharacterName === 'Chef',
      JSON.stringify(g.claims[0]));
    check('recordClaim logs the claim publicly (not secret)',
      g.log.some(l => !l.secret && l.text.includes('claims the Chef')), JSON.stringify(g.log));
    check("recordClaim's return value is the same entry pushed to g.claims",
      entry === g.claims[0]);
  }

  {
    const g = E.newGame();
    const p = { ...mk('a', 'chef'), personality: 'aggressive' };
    g.players = [p];
    const claim = E.heuristicBotClaim(g, p);
    check("a bot with a personality assigned gets that personality's flavored statement, not the generic default",
      claim.statement === "I'll say it plainly — nothing to hide.", JSON.stringify(claim));
  }

  {
    const g = E.newGame();
    g.players = [mk('a', 'chef')]; // no .personality field at all
    const claim = E.heuristicBotClaim(g, g.players[0]);
    check('a player with no personality assigned (a real player, or a bot outside a Dry Run) still gets the plain generic statement',
      claim.statement === 'Nothing more to report yet.', JSON.stringify(claim));
  }

  check('BOT_PERSONALITIES is a real, non-empty pool, each entry carrying both an id and a blurb',
    Array.isArray(E.BOT_PERSONALITIES) && E.BOT_PERSONALITIES.length > 1 &&
    E.BOT_PERSONALITIES.every(x => typeof x.id === 'string' && typeof x.blurb === 'string'),
    JSON.stringify(E.BOT_PERSONALITIES));
}

console.log('\nEnd');
g.revealed = true;
check('reveal exposes the full grimoire',
  E.publicState(g).players.every(p => p.character));

console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
process.exit(failures ? 1 : 0);

})().catch(e => {
  console.error(e);
  process.exit(1);
});
