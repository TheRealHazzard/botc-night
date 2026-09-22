'use strict';

/* /api/table/deal was the only lobby route with no game.phase guard —
   every sibling (add-bots, clear-lobby, script) already checks
   game.phase !== 'lobby'. dealRoles() unconditionally reassigns every
   seat's characterId/alive/statuses and flips phase to 'reveal', so this
   drives the real route to confirm a second deal attempt against an
   already-dealt game is rejected outright, not silently re-shuffled. */

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

    const firstDeal = await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    check('the first deal, from the lobby, succeeds', firstDeal.status === 200 && firstDeal.json.ok === true, JSON.stringify(firstDeal));

    const { json: dealt } = await request(server.baseUrl, '/api/host-state');

    const secondDeal = await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    check('a second deal attempt, no longer in the lobby, is rejected outright', secondDeal.status === 409 && !!secondDeal.json.error, JSON.stringify(secondDeal));

    const { json: afterSecond } = await request(server.baseUrl, '/api/host-state');
    // characterId itself is never sent over publicState (roles stay
    // secret pre-reveal) — the phase and player identities not silently
    // re-shuffling is what a rejected second deal actually has to prove.
    check('the game was not silently re-dealt — same phase, same seats, same player count',
      afterSecond.phase === dealt.phase && afterSecond.players.length === dealt.players.length &&
      afterSecond.players.every((p, i) => p.id === dealt.players[i].id),
      JSON.stringify({ before: dealt.phase, after: afterSecond.phase }));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
