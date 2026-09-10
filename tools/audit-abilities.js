'use strict';

/*
 * Generic, per-character invariant audit over the whole ability REGISTRY —
 * the complement to tools/simulate.js, not a replacement for it.
 * simulate.js's hand-written checks catch "this specific character does
 * this specific documented thing"; today's bug hunt found that all 12
 * fixed bugs shared a root cause that no amount of hand-written checks
 * would have caught for the *next* character to make the same mistake:
 * the invariant only existed as a comment, not as something the pipeline
 * enforced. This script iterates every entry in the built REGISTRY
 * (game/abilities/index.js) and checks the same handful of invariants
 * against all of them at once, present and future — see
 * game/abilities/README.md and the "grand plan" this was written from.
 *
 * Deliberately does not touch server.js's half of the pipeline (botChoice,
 * chooseExecution, recordExecution) — server.js has no module.exports and
 * no require.main guard, so requiring it starts a live listener as a side
 * effect. That's its own follow-up (see the plan's Phase 4), not this.
 */

const fs = require('fs');
const path = require('path');
const E = require('../game/engine');

const REGISTRY = E.REGISTRY;
let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks++;
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

/* ------------------------------------------------------------ minimal game */

function mk(id, characterId) {
  return { id, name: id, characterId, believedId: characterId, alive: true, statuses: {} };
}

// A fixed, deliberately diverse filler cast: one of each team, none of which
// have a registry entry that could ever matter here — only the subject
// under test ever has resolve() called on it, so a filler's own ability
// (Imp, Poisoner) is simply never invoked.
const FILLER_IDS = ['imp', 'poisoner', 'baron', 'soldier', 'slayer', 'saint', 'drunk'];

/** A fresh minimal-but-valid game with `subjectId` as the one player under
    test, plus enough varied filler players for any 1- or 2-target ability
    to find eligible targets. Deterministic — same subjectId always builds
    the same player ids in the same order, so two independent calls (the
    broken/unbroken pair below) produce directly comparable games. */
function buildMinimalGame(subjectId) {
  const g = E.newGame();
  const info = E.char(subjectId);
  // Match the subject's own script so any decoy/false-info generation
  // (activeScriptPool, scriptPool) draws from the right character pool
  // instead of always falling back to newGame()'s 'tb' default.
  g.script = info ? (Array.isArray(info.edition) ? info.edition[0] : info.edition) : g.script;
  g.nightNumber = 2; // avoid accidentally tripping first-night-only branches
  g.phase = 'night';
  g.wave = (REGISTRY[subjectId] && REGISTRY[subjectId].wave) || 1;
  g.results = {};
  const subject = mk('subject', subjectId);
  const fillers = FILLER_IDS.filter(id => id !== subjectId).map((id, i) => mk('filler' + i, id));
  g.players = [subject, ...fillers];
  return { g, subject };
}

/* -------------------------------------------------- 1. entry shape checks */

console.log('\nEntry shape');
for (const id of Object.keys(REGISTRY)) {
  const entry = REGISTRY[id];
  check(`${id}: entry.id matches its registry key`, entry.id === id);
  check(`${id}: targets is a function`, typeof entry.targets === 'function');
  check(`${id}: text is a function`, typeof entry.text === 'function');
  check(`${id}: resolve is a function`, typeof entry.resolve === 'function');
  for (const field of ['choiceCount', 'optional', 'acts', 'extraPrompt', 'onDeath']) {
    if (entry[field] !== undefined) {
      check(`${id}: ${field}, if present, is a function`, typeof entry[field] === 'function');
    }
  }
  if (entry.wave !== undefined) {
    check(`${id}: wave, if present, is a number`, typeof entry.wave === 'number');
  }
  if (entry.usesOnceFlag !== undefined) {
    check(`${id}: usesOnceFlag, if present, is a boolean`, typeof entry.usesOnceFlag === 'boolean');
  }
}

/* ------------------------------------------- 2. broken never goes silent */

console.log('\nImpaired info roles: wrong, never silent (generic, every character)');
let brokenCovered = 0, brokenSkipped = 0, brokenConditional = 0;
for (const id of Object.keys(REGISTRY)) {
  const entry = REGISTRY[id];
  if (typeof entry.choiceCount !== 'function' || typeof entry.targets !== 'function' || typeof entry.resolve !== 'function') continue;

  const probe = buildMinimalGame(id);
  let need;
  try { need = entry.choiceCount(probe.g, probe.subject); } catch (e) { brokenSkipped++; continue; }
  if (!need || need < 1) { brokenSkipped++; continue; }

  const pool = entry.targets(probe.g, probe.subject) || [];
  if (pool.length < need) { brokenSkipped++; continue; } // this generic cast can't feed it a full choice — not this check's job to build a bespoke one

  const resultFor = (targetIds, broken) => {
    const { g, subject } = buildMinimalGame(id);
    const results = {};
    const target = ids => (ids || []).map(pid => E.byId(g, pid)).filter(Boolean);
    entry.resolve(g, subject, { targets: targetIds }, { broken, target, deaths: [], results, order: [] });
    return results[subject.id];
  };

  const chosenIds = pool.slice(0, need).map(t => t.id);
  let unbrokenResult, brokenResult;
  try {
    unbrokenResult = resultFor(chosenIds, false);
    brokenResult = resultFor(chosenIds, true);
  } catch (e) {
    check(`${id}: broken-vs-unbroken probe runs without throwing`, false, e.message);
    continue;
  }
  if (!unbrokenResult) { brokenSkipped++; continue; } // doesn't write results[] under a generic setup — not an info role this check can exercise

  // A second, differently-targeted sober probe, before trusting the
  // comparison above: some choiceCount>=1 abilities are conditional STATE
  // CHANGES (Snake Charmer's swap only fires if you actually targeted the
  // Demon), not unconditional info reveals — and for those, staying silent
  // on a miss is already the sober, correct, intentional behavior (there's
  // no meaningful "fake swap" to show as a decoy the way a fake yes/no
  // answer works). Silence in that case doesn't leak impairment, because a
  // sober player already can't tell "I missed" from "I hit but nothing
  // happened" — so the "wrong, never silent" doctrine, which exists
  // specifically because a *reliable* info reveal going quiet is itself a
  // tell, doesn't apply. Only assert the doctrine once a second, disjoint
  // sober target set confirms this ability reliably informs regardless of
  // who's targeted — exactly what distinguishes Seamstress/Fortune Teller
  // from Snake Charmer.
  const altIds = pool.length >= need * 2 ? pool.slice(need, need * 2).map(t => t.id) : null;
  const altUnbrokenResult = altIds ? resultFor(altIds, false) : unbrokenResult;
  if (!altUnbrokenResult) {
    brokenConditional++;
    continue; // conditional/state-changing ability, not a reliable info reveal — not this check's concern
  }

  brokenCovered++;
  check(`${id}: an impaired result is still shown (wrong, never silent)`, !!brokenResult);
}
console.log(`  (${brokenCovered} character(s) actually exercised, ${brokenConditional} conditional/state-changing abilities correctly excluded, ${brokenSkipped} not applicable under a generic minimal game — see tools/simulate.js for anything needing bespoke setup)`);

/* --------------------------- 3. multi-target abilities have enough pool */

console.log('\nMulti-target abilities: enough eligible players to fill the choice');
let poolCovered = 0;
for (const id of Object.keys(REGISTRY)) {
  const entry = REGISTRY[id];
  if (typeof entry.choiceCount !== 'function' || typeof entry.targets !== 'function') continue;
  const { g, subject } = buildMinimalGame(id);
  let need;
  try { need = entry.choiceCount(g, subject); } catch (e) { continue; }
  if (!need || need < 2) continue;
  poolCovered++;
  const pool = entry.targets(g, subject) || [];
  // Not a re-test of server.js's bot picker (untestable without starting a
  // live listener — see this file's header) — this instead checks the
  // necessary condition any correctly-written picker depends on: a target
  // pool at least as large as the choice it has to fill. The actual
  // Shabaloth-class bug (the bot's picker always returning 1 target
  // regardless of count) lived entirely in server.js's slicing logic, not
  // in an undersized pool — this is the adjacent invariant this script can
  // actually verify on its own.
  check(`${id}: a ${need}-target ability has at least ${need} eligible target(s) in a generic game`,
    pool.length >= need, `only ${pool.length} eligible`);
}
console.log(`  (${poolCovered} multi-target character(s) checked)`);

/* --------------------------------------------- 4. death-cause tagging */

console.log('\nDeath-cause tagging: every deaths.push() explicitly sets killedByDemon');
const ABILITY_FILES = ['tb.js', 'bmr.js', 'sv.js', 'carousel.js'];
let deathSitesChecked = 0;
for (const file of ABILITY_FILES) {
  const filePath = path.join(__dirname, '..', 'game', 'abilities', file);
  const src = fs.readFileSync(filePath, 'utf8');
  const calls = src.match(/deaths\.push\(\{[^}]*\}\)/g) || [];
  check(`${file}: deaths.push() call sites were found to check (regex sanity check)`, calls.length > 0);
  calls.forEach((call, i) => {
    deathSitesChecked++;
    check(`${file}: deaths.push() call #${i + 1} explicitly tags killedByDemon (not relying on undefined)`,
      /killedByDemon\s*:/.test(call), call.replace(/\s+/g, ' '));
  });
}
console.log(`  (${deathSitesChecked} deaths.push() call site(s) checked across ${ABILITY_FILES.length} files)`);

console.log(`\n${failures ? failures + ' FAILURES' : 'All ' + checks + ' checks passed'}\n`);
process.exit(failures ? 1 : 0);
