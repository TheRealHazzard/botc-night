'use strict';

/* /api/sim/start had no guard at all — game is one global singleton, and
   startSimulation() fully replaces it (E.newGame() + simulation:true),
   silently overwriting a real table's current game if one's actually in
   progress. This drives the real route to confirm it now rejects that,
   and only that — an idle, empty lobby still starts a Dry Run fine. */

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
    await request(server.baseUrl, '/api/join', { method: 'POST', body: { name: 'Ada' } });

    const rejected = await request(server.baseUrl, '/api/sim/start', { method: 'POST', body: { players: 9 } });
    check('rejected with a real 409 while a real player is seated', rejected.status === 409 && !!rejected.json.error, JSON.stringify(rejected));

    const { json: afterRejected } = await request(server.baseUrl, '/api/host-state');
    check('the real table is untouched — still the lobby, still Ada seated, not overwritten by a sim',
      afterRejected.phase === 'lobby' && !afterRejected.simulation && afterRejected.players.some(p => p.name === 'Ada'),
      JSON.stringify(afterRejected));

    await request(server.baseUrl, '/api/table/clear-lobby', { method: 'POST', body: {} });
    const started = await request(server.baseUrl, '/api/sim/start', { method: 'POST', body: { players: 5 } });
    check('starts fine once the real table is idle and empty', started.status === 200 && started.json.ok === true, JSON.stringify(started));

    const { json: afterStarted } = await request(server.baseUrl, '/api/host-state');
    check('the table now reflects the simulation', afterStarted.simulation === true, JSON.stringify(afterStarted));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
