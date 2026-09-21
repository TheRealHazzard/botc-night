'use strict';

/* Act II: the character-tested-live checklist — /api/characters/checklist
   cross-references the full 91-character registry against real (non-
   simulation) games actually recorded, so a beta-testing table can see at
   a glance which characters have never actually been dealt to a real
   player. Seeds a fake game record directly into the isolated DATA_DIR
   (appendGameRecord is a pure file append, same file the running server
   child reads fresh on every request — no need to play a whole game out
   just to exercise this read-only aggregation route). */

const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

(async () => {
  const server = await startServer();
  try {
    process.env.DATA_DIR = server.dataDir;
    const H = require('../../game/history');
    const E = require('../../game/engine');

    const allReal = E.CHARACTERS.filter(c => c.team !== 'special');

    // Before any game is recorded, every character should read as
    // untested — the checklist's whole reason to exist.
    const { json: before } = await request(server.baseUrl, '/api/characters/checklist');
    check('returns every real character', Array.isArray(before) && before.length === allReal.length, `${before && before.length} vs ${allReal.length}`);
    check('nobody is tested yet', before.every(c => c.timesPlayed === 0 && c.winRate === null), JSON.stringify(before.find(c => c.timesPlayed !== 0)));

    H.appendGameRecord({
      id: 'fake-game-1', endedAt: Date.now(), edition: 'tb', playerCount: 5,
      winner: 'good', reason: 'test fixture',
      players: [
        { characterId: 'washerwoman', characterName: 'Washerwoman', team: 'townsfolk', alive: true, won: true },
        { characterId: 'poisoner', characterName: 'Poisoner', team: 'minion', alive: false, won: false },
      ],
      nominations: [],
    });

    const { json: after } = await request(server.baseUrl, '/api/characters/checklist');
    const washerwoman = after.find(c => c.id === 'washerwoman');
    const poisoner = after.find(c => c.id === 'poisoner');
    const untouched = after.find(c => c.id === 'imp'); // never appears in the fake record above

    check('a character with a recorded win shows timesPlayed 1, wins 1, winRate 1',
      washerwoman && washerwoman.timesPlayed === 1 && washerwoman.wins === 1 && washerwoman.winRate === 1,
      JSON.stringify(washerwoman));
    check('a character with a recorded loss shows timesPlayed 1, wins 0, winRate 0',
      poisoner && poisoner.timesPlayed === 1 && poisoner.wins === 0 && poisoner.winRate === 0,
      JSON.stringify(poisoner));
    check('a character never dealt still reads as untested (winRate null, not 0)',
      untouched && untouched.timesPlayed === 0 && untouched.winRate === null,
      JSON.stringify(untouched));
    check('no duplicate characters in the list', new Set(after.map(c => c.id)).size === after.length);
    check('team:special grimoire-only entries are excluded', !after.some(c => c.team === 'special'));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
