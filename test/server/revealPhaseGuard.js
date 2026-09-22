'use strict';

/* /api/table/reveal used to have no phase guard at all — reachable from
   the lobby (LeaderControlsOverlay renders its Reveal button in every
   phase) before anyone was ever dealt a character. That didn't just end
   an empty game harmlessly: recordGameHistory() writes a real, permanent
   record for every seated player with characterId null and alive still
   true (never flipped), silently inflating their lifetime gamesPlayed and
   diluting survivalRate. This drives the real route both ways: rejected
   from the lobby with nothing recorded, accepted once a real game exists. */

const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

(async () => {
  const server = await startServer();
  try {
    await request(server.baseUrl, '/api/table/reset', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] },
    });
    for (const name of ['Ada', 'Bo', 'Cy', 'Di', 'Ed']) {
      await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
    }

    const revealRes = await request(server.baseUrl, '/api/table/reveal', { method: 'POST', body: {} });
    check('rejected with a real error while still in the lobby', revealRes.status === 409 && !!revealRes.json.error, JSON.stringify(revealRes));

    const afterState = await request(server.baseUrl, '/api/host-state');
    check('the game is still in the lobby, not corrupted into "over"', afterState.json.phase === 'lobby', afterState.json.phase);
    check('nobody was actually revealed', afterState.json.revealed === false);

    const { json: gamesBefore } = await request(server.baseUrl, '/api/games');
    check('no history record was written by the rejected call', gamesBefore.games.length === 0, JSON.stringify(gamesBefore));

    // Once a real game exists (roles dealt), Reveal should still work
    // exactly as before this fix.
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    const revealRes2 = await request(server.baseUrl, '/api/table/reveal', { method: 'POST', body: {} });
    check('accepted once roles have actually been dealt', revealRes2.status === 200 && revealRes2.json.ok === true, JSON.stringify(revealRes2));

    const afterState2 = await request(server.baseUrl, '/api/host-state');
    check('the game correctly reaches "over" and gets revealed', afterState2.json.phase === 'over' && afterState2.json.revealed === true);
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
