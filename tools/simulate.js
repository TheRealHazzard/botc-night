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
    if (targets.length === prompt.count) {
      g.pending[p.id] = { targets, decoy: !!prompt.decoy };
    }
  }
}

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

console.log('\nNight 1');
g.nightNumber = 1; g.phase = 'night'; g.wave = 1;

const prompts = g.players.map(p => ({ p, prompt: E.promptFor(g, p) }));
check('every living player is asked something (decoy wakes)',
  prompts.every(x => !x.p.alive || x.prompt),
  'a silent player would be identifiable as having no night ability');
check('decoys are shaped like real prompts',
  prompts.every(x => !x.prompt || (x.prompt.text && x.prompt.targets.length && x.prompt.count >= 1)));

autoAnswer(g);
E.resolveNight(g);

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
  E.resolveNight(gSmall);
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
  E.resolveNight(gBoundary);
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
    E.resolveNight(g);
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
  g.nightNumber = n; g.phase = 'night'; g.wave = 1; g.pending = {}; g.results = {};
  autoAnswer(g);
  const before = E.alive(g).length;
  E.resolveNight(g);
  const after = E.alive(g).length;
  check(`night ${n} resolved (${before} -> ${after} alive)`, after <= before);

  if (E.needsWaveTwo(g)) {
    g.wave = 2; g.pending = {};
    const rk = g.players.find(p => p.believedId === 'ravenkeeper' && p.statuses.diedTonight);
    check('  ravenkeeper is asked only after dying', !!E.promptFor(g, rk));
    autoAnswer(g);
    E.resolveNight(g, 2);
    check('  ravenkeeper learned a character', !!g.results[rk.id]);
    check('  wave 2 did not re-run the whole night',
      g.players.filter(p => p.statuses.diedTonight).length >= 1);
  }
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
    E.resolveNight(gStar, 1);
    if (gStar.players.find(p => p.id === 'imp4').alive) allDied = false;
    newImpCounts.add(gStar.players.filter(p => p.characterId === 'imp' && p.id !== 'imp4').length);
  }
  check('star-pass kills the original Imp every time (20 runs)', allDied);
  check('star-pass always hands the Imp to exactly one minion, never two (20 runs)',
    newImpCounts.size === 1 && newImpCounts.has(1),
    'saw counts: ' + [...newImpCounts].join(', '));
}

console.log('\nPoison timing');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const gp = E.newGame();
  gp.nightNumber = 1; gp.phase = 'night'; gp.wave = 1; gp.results = {};
  gp.players = [mk('poi1', 'poisoner'), mk('emp1', 'empath'), mk('t1', 'chef'), mk('t2', 'soldier'), mk('t3', 'slayer')];
  gp.pending = { poi1: { targets: ['emp1'], decoy: false } };
  E.resolveNight(gp, 1);
  check('poison is applied the night it is used', gp.players.find(p => p.id === 'emp1').statuses.poisoned === true);

  gp.nightNumber = 2; gp.pending = { poi1: { targets: ['t1'], decoy: false } }; gp.results = {};
  E.resolveNight(gp, 1);
  check('...but is cleared before the following night resolves (was lasting a night too long)',
    !gp.players.find(p => p.id === 'emp1').statuses.poisoned);
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

  let yes = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const gr = E.newGame();
    gr.config.recluseRegistersEvil = 0.5;
    gr.nightNumber = 2; gr.phase = 'night'; gr.wave = 1; gr.results = {};
    gr.players = [mk('ft1', 'fortuneteller'), mk('rec1', 'recluse'), mk('imp1', 'imp'), mk('t1', 'soldier'), mk('t2', 'slayer')];
    gr.pending = { ft1: { targets: ['rec1', 't1'], decoy: false } };
    E.resolveNight(gr, 1);
    if (gr.results.ft1.body.startsWith('Yes')) yes++;
  }
  check('pings on a Recluse roughly half the time (registration roll was being skipped entirely)',
    yes > trials * 0.3 && yes < trials * 0.7, `saw ${yes}/${trials} yes`);
}

console.log('\nSpy grimoire under impairment');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const lineup = () => [mk('spy1', 'spy'), mk('imp1', 'imp'), mk('t1', 'chef'), mk('t2', 'soldier'), mk('t3', 'slayer')];

  const gs = E.newGame();
  gs.nightNumber = 2; gs.phase = 'night'; gs.wave = 1; gs.results = {};
  gs.players = lineup();
  E.resolveNight(gs, 1);
  const trueNames = gs.players.map(p => E.trueChar(p).name);
  check('an unpoisoned Spy sees the true grimoire',
    JSON.stringify(gs.results.spy1.grimoire.map(r => r.character)) === JSON.stringify(trueNames));

  let anyDiffered = false;
  for (let i = 0; i < 20; i++) {
    const gp2 = E.newGame();
    gp2.nightNumber = 2; gp2.phase = 'night'; gp2.wave = 1; gp2.results = {};
    gp2.players = lineup();
    gp2.players[0].statuses.poisoned = true;
    E.resolveNight(gp2, 1);
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
  E.resolveNight(g, 1);
  const grim = g.results.spy1 && g.results.spy1.grimoire;
  const drunkRow = grim && grim.find(r => r.name === 'drunk1');
  const spyRow = grim && grim.find(r => r.name === 'spy1');
  check('the Drunk\'s row shows their true character', drunkRow && drunkRow.character === 'Drunk');
  check('...and separately what they believe they are', drunkRow && drunkRow.believedCharacter === 'Empath');
  check('a row whose belief matches the truth carries no believedCharacter',
    spyRow && (spyRow.believedCharacter === null || spyRow.believedCharacter === undefined));
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
    E.resolveNight(gw, 1);
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
    E.resolveNight(g, 1);
    if (g.players.find(p => p.id === 'mayor1').alive) redirected++; else notRedirected++;
  }
  check('the Mayor\'s night death is sometimes redirected, sometimes not (40 trials)',
    redirected > 5 && notRedirected > 5, `redirected ${redirected}, died ${notRedirected}`);

  const gOff = E.newGame();
  gOff.config.mayorRedirectChance = 0;
  gOff.nightNumber = 2; gOff.phase = 'night'; gOff.wave = 1; gOff.results = {};
  gOff.players = lineup();
  gOff.pending = { imp1: { targets: ['mayor1'], decoy: false } };
  E.resolveNight(gOff, 1);
  check('with the chance forced to 0, the Mayor just dies', !gOff.players.find(p => p.id === 'mayor1').alive);

  const gOn = E.newGame();
  gOn.config.mayorRedirectChance = 1;
  gOn.nightNumber = 2; gOn.phase = 'night'; gOn.wave = 1; gOn.results = {};
  gOn.players = lineup();
  gOn.pending = { imp1: { targets: ['mayor1'], decoy: false } };
  E.resolveNight(gOn, 1);
  const mayorSurvived = gOn.players.find(p => p.id === 'mayor1').alive;
  const othersDead = gOn.players.filter(p => p.id !== 'mayor1' && p.id !== 'imp1' && !p.alive).length;
  check('with the chance forced to 1, the Mayor survives and someone else dies instead',
    mayorSurvived && othersDead === 1);

  const gPoison = E.newGame();
  gPoison.config.mayorRedirectChance = 1;
  gPoison.nightNumber = 2; gPoison.phase = 'night'; gPoison.wave = 1; gPoison.results = {};
  gPoison.players = lineup();
  gPoison.players.find(p => p.id === 'mayor1').statuses.poisoned = true;
  gPoison.pending = { imp1: { targets: ['mayor1'], decoy: false } };
  E.resolveNight(gPoison, 1);
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
    E.resolveNight(g, 1);
    const sd = !!g.players[0].statuses.drunk, td = !!g.players[1].statuses.drunk;
    if (sd && !td) sailorDrunk++; else if (td && !sd) targetDrunk++; else bad++;
  }
  check('Sailor makes exactly one of {self, target} drunk, never both or neither (60 trials)',
    bad === 0 && sailorDrunk > 5 && targetDrunk > 5, `sailor ${sailorDrunk}, target ${targetDrunk}, bad ${bad}`);

  const gs = E.newGame();
  gs.players = [mk('sailor1', 'sailor'), mk('imp1', 'imp')];
  check('a functioning Sailor cannot be killed by the Demon',
    E.wouldBlockKill(gs, gs.players[0], { demonAttack: true }) === 'sailor');
  check('...but can still be executed',
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
  E.resolveNight(g, 1);
  check('Chambermaid counts both a choice-role and a pure-info role as woken',
    g.results.cm1.body.includes('2'), g.results.cm1.body);

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('cm1', 'chambermaid'), mk('poi1', 'poisoner'), mk('t1', 'soldier')];
  g2.players.find(p => p.id === 'poi1').statuses.poisoned = true; // impaired: does not really wake
  g2.pending = { cm1: { targets: ['poi1', 't1'], decoy: false } };
  E.resolveNight(g2, 1);
  check('...but not an impaired role, nor one with no ability at all',
    g2.results.cm1.body.includes('0'), g2.results.cm1.body);
}

console.log('\nBMR: Exorcist blocks the Demon');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('ex1', 'exorcist'), mk('imp1', 'imp'), mk('t1', 'chef'), mk('t2', 'soldier')];
  g.pending = { ex1: { targets: ['imp1'], decoy: false }, imp1: { targets: ['t1'], decoy: false } };
  E.resolveNight(g, 1);
  check('a Demon targeted by the Exorcist does not act — their target survives',
    g.players.find(p => p.id === 't1').alive);
  check('the Exorcist is told who the Demon is',
    !!g.results.imp1 && /Exorcist/.test(g.results.imp1.body));

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 3; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('ex1', 'exorcist'), mk('imp1', 'imp'), mk('t1', 'chef'), mk('t2', 'empath')];
  g2.pending = { ex1: { targets: ['t1'], decoy: false }, imp1: { targets: ['t2'], decoy: false } };
  E.resolveNight(g2, 1);
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
  E.resolveNight(g, 1);
  const t1 = g.players.find(p => p.id === 't1'), t2 = g.players.find(p => p.id === 't2');
  check('both Innkeeper picks survive a Demon attack', t1.alive && t2.alive);
  check('exactly one of the two ends up drunk until dusk',
    (!!t1.statuses.drunk) !== (!!t2.statuses.drunk));
}

console.log('\nBMR: Courtier');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 3; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('co1', 'courtier'), mk('t1', 'chef')];
  g.pending = { co1: { targets: ['t1'], decoy: false } };
  E.resolveNight(g, 1);
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
  E.resolveNight(g, 1);
  check('Professor resurrects a dead Townsfolk', g.players.find(p => p.id === 'dead1').alive);

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 3; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('pr1', 'professor'), mk('dead2', 'imp', false)];
  g2.pending = { pr1: { targets: ['dead2'], decoy: false } };
  E.resolveNight(g2, 1);
  check('...but not a dead Demon', !g2.players.find(p => p.id === 'dead2').alive);
}

console.log('\nBMR: Devil\'s Advocate execution immunity');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('da1', 'devilsadvocate'), mk('t1', 'chef')];
  g.pending = { da1: { targets: ['t1'], decoy: false } };
  E.resolveNight(g, 1);
  check('the chosen player is immune to execution tomorrow',
    E.wouldBlockKill(g, g.players.find(p => p.id === 't1'), { executionAttack: true }) === 'devils-advocate');

  g.nightNumber = 3; g.results = {}; g.pending = { da1: { targets: ['t1'], decoy: false } };
  E.resolveNight(g, 1); // wave-1 reset should clear yesterday's immunity before granting a fresh one
  check('...and that immunity does not linger past the one day it covers (fresh grant re-applies, doesn\'t double)',
    E.wouldBlockKill(g, g.players.find(p => p.id === 't1'), { executionAttack: true }) === 'devils-advocate');

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('da1', 'devilsadvocate'), mk('t1', 'chef')];
  g2.pending = {};
  E.resolveNight(g2, 1); // no DA action at all this night — clears any stale immunity
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
  E.resolveNight(g, 1);
  check('the Assassin kills straight through the Soldier\'s demon-only immunity',
    !g.players.find(p => p.id === 't1').alive);
  check('the Assassin is marked used after a real kill', g.players.find(p => p.id === 'as1').statuses.assassinUsed);

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('as1', 'assassin'), mk('t2', 'fool')];
  g2.pending = { as1: { targets: ['t2'], decoy: false } };
  E.resolveNight(g2, 1);
  check('...and even through the Fool\'s one-time survival',
    !g2.players.find(p => p.id === 't2').alive);

  const g3 = E.newGame();
  g3.script = 'bmr'; g3.nightNumber = 2; g3.phase = 'night'; g3.wave = 1; g3.results = {};
  g3.players = [mk('as1', 'assassin'), mk('t1', 'chef')];
  g3.pending = { as1: { targets: [], decoy: false } };
  E.resolveNight(g3, 1);
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
  E.resolveNight(g2, 1);
  check('...and then actually kills', !g2.players.find(p => p.id === 't1').alive);
}

console.log('\nBMR: Pukka');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('pu1', 'pukka'), mk('t1', 'chef'), mk('t2', 'soldier')];
  g.pending = { pu1: { targets: ['t1'], decoy: false } };
  E.resolveNight(g, 1);
  check('the first poison target is poisoned but does not die yet',
    g.players.find(p => p.id === 't1').statuses.poisoned && g.players.find(p => p.id === 't1').alive);

  g.nightNumber = 3; g.results = {};
  g.pending = { pu1: { targets: ['t2'], decoy: false } };
  E.resolveNight(g, 1);
  check('choosing a new target kills the previously poisoned player',
    !g.players.find(p => p.id === 't1').alive);
  check('...and the new target becomes poisoned in their place',
    g.players.find(p => p.id === 't2').statuses.poisoned && g.players.find(p => p.id === 't2').alive);
}

console.log('\nBMR: Shabaloth');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('sh1', 'shabaloth'), mk('t1', 'chef'), mk('t2', 'empath'), mk('t3', 'slayer')];
  g.pending = { sh1: { targets: ['t1', 't2'], decoy: false } };
  E.resolveNight(g, 1);
  check('Shabaloth kills both chosen players',
    !g.players.find(p => p.id === 't1').alive && !g.players.find(p => p.id === 't2').alive);

  let revived = 0;
  for (let i = 0; i < 40; i++) {
    const g2 = E.newGame();
    g2.script = 'bmr'; g2.config.shabalothRegurgitateChance = 0.5;
    g2.nightNumber = 3; g2.phase = 'night'; g2.wave = 1; g2.results = {};
    g2.players = [mk('sh1', 'shabaloth'), mk('t1', 'chef', ), mk('t3', 'slayer')];
    g2.players.find(p => p.id === 't1').alive = false;
    g2.deaths = [{ night: 2, name: 't1', cause: 'demon' }];
    g2.pending = { sh1: { targets: ['t3'], decoy: false } };
    E.resolveNight(g2, 1);
    if (g2.players.find(p => p.id === 't1').alive) revived++;
  }
  check('regurgitation sometimes brings back last night\'s kill, sometimes not (40 trials)',
    revived > 5 && revived < 35, `revived ${revived}/40`);
}

console.log('\nBMR: Po');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  g.script = 'bmr'; g.nightNumber = 2; g.phase = 'night'; g.wave = 1; g.results = {};
  g.players = [mk('po1', 'po'), mk('t1', 'chef'), mk('t2', 'undertaker'), mk('t3', 'slayer'), mk('t4', 'empath')];
  g.pending = { po1: { targets: [], decoy: false } };
  E.resolveNight(g, 1);
  check('choosing no one charges Po up, and kills no one',
    g.players.find(p => p.id === 'po1').statuses.poChargedUp === true &&
    g.players.filter(p => p.alive).length === 5);

  g.nightNumber = 3; g.results = {};
  const chargedPrompt = E.promptFor(g, g.players.find(p => p.id === 'po1'));
  check('the next prompt asks for exactly 3 targets', chargedPrompt.count === 3);
  g.pending = { po1: { targets: ['t1', 't2', 't3'], decoy: false } };
  E.resolveNight(g, 1);
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
  E.resolveNight(g, 1);
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
  E.resolveNight(gEvil, 1);
  const goon = gEvil.players.find(p => p.id === 'goon1');
  check('targeted by an evil character, the Goon is drunk and flips evil',
    goon.statuses.drunk === true && goon.statuses.goonEvil === true);

  const gGood = E.newGame();
  gGood.script = 'bmr'; gGood.nightNumber = 2; gGood.phase = 'night'; gGood.wave = 1; gGood.results = {};
  gGood.players = [mk('goon1', 'goon'), mk('monk1', 'monk'), mk('imp1', 'imp')];
  gGood.pending = { monk1: { targets: ['goon1'], decoy: false } };
  E.resolveNight(gGood, 1);
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
  E.resolveNight(g, 1);
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
  E.resolveNight(g, 1);
  check('the Grandmother dies alongside a grandchild killed by the Demon',
    !g.players.find(p => p.id === 'gm1').alive);

  const g2 = E.newGame();
  g2.script = 'bmr'; g2.nightNumber = 2; g2.phase = 'night'; g2.wave = 1; g2.results = {};
  g2.players = [mk('gm1', 'grandmother'), mk('gc1', 'chef'), mk('imp1', 'imp')];
  g2.players.find(p => p.id === 'gm1').statuses.grandchildId = 'gc1';
  g2.pending = { imp1: { targets: ['gm1'], decoy: false } };
  E.resolveNight(g2, 1);
  check('the Demon killing the Grandmother directly does not also kill an untouched grandchild',
    g2.players.find(p => p.id === 'gc1').alive && !g2.players.find(p => p.id === 'gm1').alive);
}

console.log('\nBMR: Mastermind bonus-day resolution (pure function)');
{
  const mk = (id, characterId) => ({ id, name: id, characterId, believedId: characterId, alive: true, statuses: {} });
  const g = E.newGame();
  check('no execution on the bonus day -> evil wins',
    E.resolveMastermindDay(g, null).winner === 'evil');
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
  E.resolveNight(g, 1); // night 3's wave-1 reset: 2 < 3 -> clears now, exactly at this dusk
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
    // 7 living players -> majority threshold is floor(7/2)+1 = 4.
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
}

console.log('\nEnd');
g.revealed = true;
check('reveal exposes the full grimoire',
  E.publicState(g).players.every(p => p.character));

console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
process.exit(failures ? 1 : 0);
