'use strict';

/* game/history.js's theoryLeaderboard() — "best theorist" across every
   recorded game, modeled on votingLeaderboard's own good-only filter: a
   theory shared while EVIL that game must not count toward the ranking
   at all, since it's informed by things an evil player already knows,
   not a real deduction. Pure function over readAllGames(), so this just
   writes synthetic records into an isolated DATA_DIR and calls it
   directly — no server needed, same reasoning charactersChecklist.js
   gives for going straight at game/engine.js. */

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-night-history-test-'));
const H = require('../../game/history');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function seat({ profileId, seatName, characterId, team }) {
  return { profileId, seatName, characterId, team };
}

function theory({ day = 1, playerName, guesses }) {
  return { day, playerName, guesses };
}

try {
  // Game 1: Ada (good, townsfolk) shares a theory about Bo and Cy — one
  // right, one wrong.
  H.appendGameRecord({
    id: 'g1',
    players: [
      seat({ profileId: 'ada', seatName: 'Ada', characterId: 'chef', team: 'townsfolk' }),
      seat({ profileId: 'bo', seatName: 'Bo', characterId: 'empath', team: 'townsfolk' }),
      seat({ profileId: 'cy', seatName: 'Cy', characterId: 'imp', team: 'demon' }),
    ],
    theories: [
      theory({
        playerName: 'Ada',
        guesses: [
          { targetName: 'Bo', characterId: 'empath' }, // correct
          { targetName: 'Cy', characterId: 'poisoner' }, // wrong
        ],
      }),
    ],
  });

  // Game 2: Ada again, this time EVIL (the Imp) — three guesses, all
  // correct. None of this should count toward her ranking.
  H.appendGameRecord({
    id: 'g2',
    players: [
      seat({ profileId: 'ada', seatName: 'Ada', characterId: 'imp', team: 'demon' }),
      seat({ profileId: 'bo', seatName: 'Bo', characterId: 'chef', team: 'townsfolk' }),
      seat({ profileId: 'cy', seatName: 'Cy', characterId: 'poisoner', team: 'minion' }),
    ],
    theories: [
      theory({
        playerName: 'Ada',
        guesses: [
          { targetName: 'Bo', characterId: 'chef' },
          { targetName: 'Cy', characterId: 'poisoner' },
        ],
      }),
    ],
  });

  // Game 3: Bo (good) shares a theory about a target who isn't in this
  // game's own roster — should be silently skipped, not crash.
  H.appendGameRecord({
    id: 'g3',
    players: [
      seat({ profileId: 'bo', seatName: 'Bo', characterId: 'empath', team: 'townsfolk' }),
      seat({ profileId: 'cy', seatName: 'Cy', characterId: 'imp', team: 'demon' }),
    ],
    theories: [
      theory({ playerName: 'Bo', guesses: [{ targetName: 'Nobody', characterId: 'chef' }] }),
    ],
  });

  const full = H.theoryLeaderboard({ minGuesses: 1 });
  const ada = full.find(e => e.profileId === 'ada');
  check('Ada appears exactly once (not once per game)', full.filter(e => e.profileId === 'ada').length === 1, JSON.stringify(full));
  check(
    'only Ada\'s GOOD game\'s guesses count — 1 correct of 2 total, not 1 of 2 plus 2 of 2',
    ada && ada.correctGuesses === 1 && ada.totalGuesses === 2,
    JSON.stringify(ada),
  );
  // Bo's one guess (against a target not in game 3's own roster) was
  // skipped rather than crashing the whole pass — so either Bo never
  // made it into the tally at all, or did with a total of 0. Either way,
  // minGuesses:1 (>= 1, not > 0) excludes him from the result either way.
  const bo = full.find(e => e.profileId === 'bo');
  check('a guess against a target not in that game\'s own roster is skipped, not crashed on', !bo || bo.totalGuesses === 0, JSON.stringify(bo));

  const filtered = H.theoryLeaderboard({ minGuesses: 5 });
  check('the minGuesses threshold excludes everyone here (nobody has 5+)', filtered.length === 0, JSON.stringify(filtered));

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
}
