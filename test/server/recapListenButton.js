'use strict';

/* "Narrated recap export" (the roadmap's Phase B item) — public/recap.html
   already rendered a text recap built from the game's own history
   (game/history.js's recapNarration); this just confirms the new TTS
   "Listen" button it gained is actually in the served markup and wired to
   a real finished game's narration, not just present in the source file in
   the abstract. No browser here to exercise real speechSynthesis playback
   — that part was checked by hand and by the inline script's own syntax
   (`node --check`-equivalent via `new Function(...)`) when it was written;
   this is the part a server test actually can check. */

const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

(async () => {
  const server = await startServer();
  // appendGameRecord is a pure file append under DATA_DIR (same technique
  // test/server/charactersChecklist.js and gameHistoryBotFilter.js use) —
  // this process's own game/history.js require has to point at the exact
  // same isolated DATA_DIR the spawned server child is actually reading
  // from, or the record never reaches it.
  process.env.DATA_DIR = server.dataDir;
  const H = require('../../game/history.js');
  try {
    H.appendGameRecord({
      id: 'recap-listen-test', endedAt: Date.now(), edition: 'tb', playerCount: 5,
      winner: 'good', reason: 'The Demon fell.',
      players: [
        { seatName: 'Ada', team: 'townsfolk', diedNight: null },
        { seatName: 'Bo', team: 'demon', diedNight: 3, diedPhase: 'execution', characterName: 'Imp' },
      ],
      nominations: [], log: [],
    });

    const { json: recap } = await request(server.baseUrl, '/api/recap?id=recap-listen-test');
    check('the recap API still returns real narration for the Listen button to read', recap.narration && recap.narration.length > 0, JSON.stringify(recap));

    const pageRes = await fetch(`${server.baseUrl}/recap`);
    const html = await pageRes.text();
    check('serves the recap page', pageRes.status === 200);
    check('the page feature-detects speechSynthesis before offering the button', html.includes("'speechSynthesis' in window"));
    check('the Listen button markup is present', html.includes('listenbtn') && html.includes('Listen to the recap'));
    check('the toggle handler reads the same narration/winner/reason fields the text recap renders',
      html.includes('recap.narration') && html.includes('recap.winner') && html.includes('recap.reason'));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
