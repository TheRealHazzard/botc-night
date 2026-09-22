'use strict';

/* /api/table/clear-lobby reset game.players and game.leaderId but never
   touched game.pendingReclaims — unlike /api/table/reset, which clears it
   implicitly by replacing the whole game object via E.newGame(). A
   reclaim request pending at the moment of a clear kept showing up in the
   host's ReclaimBanner, referencing a seat id that no longer existed:
   approving it told the host "reconnected" while the requester's own
   status poll fell through to "denied" — two contradictory outcomes for
   the same tap. This drives that exact sequence through the real server. */

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
    const { json: joined } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name: 'Ada' } });

    const reclaimRes = await request(server.baseUrl, '/api/reclaim/request', { method: 'POST', body: { targetId: joined.playerId } });
    check('a reclaim request against a real seat is accepted', reclaimRes.status === 200 && !!reclaimRes.json.requestId, JSON.stringify(reclaimRes));
    const requestId = reclaimRes.json.requestId;

    const { json: beforeClear } = await request(server.baseUrl, '/api/host-state');
    check('the pending reclaim shows up on the host screen', beforeClear.pendingReclaims.some(r => r.requestId === requestId), JSON.stringify(beforeClear.pendingReclaims));

    await request(server.baseUrl, '/api/table/clear-lobby', { method: 'POST', body: {} });

    const { json: afterClear } = await request(server.baseUrl, '/api/host-state');
    check('the stale reclaim request is gone from the host screen after a clear', afterClear.pendingReclaims.length === 0, JSON.stringify(afterClear.pendingReclaims));

    const statusRes = await request(server.baseUrl, `/api/reclaim/status?requestId=${requestId}`);
    check('the original requester\'s own status poll now cleanly reports "not found", not a stale/contradictory result', statusRes.status === 404, JSON.stringify(statusRes));

    const approveRes = await request(server.baseUrl, '/api/table/reclaim/approve', { method: 'POST', body: { requestId } });
    check('a host approving the now-gone request gets a real 404, not a false "approved"', approveRes.status === 404, JSON.stringify(approveRes));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
