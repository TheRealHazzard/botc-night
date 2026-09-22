'use strict';

/* A custom roster committed via /api/table/script is only checked for
   duplicates, unknown ids, a 5-character minimum, and "at least one of
   each team" — never that it has enough characters PER TEAM to cover
   however many players actually end up seated. dealRoles() used to find
   this out the hard way: take(pool, n) (game/helpers.js) silently returns
   fewer than n when the pool is short, so the bag ends up shorter than
   the seated player count, and seats.forEach's bag[i] ran off the end
   into undefined — a bare "Cannot read properties of undefined" crash,
   with whichever seats came before it already mutated in place. This
   drives that exact scenario through the real server: a roster with only
   4 Townsfolk seated by 7 players (who need 5), confirming a clean,
   actionable 400 instead — and that the game is left untouched, not
   half-dealt. */

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
    // 7 players need 5 Townsfolk/0 Outsider/1 Minion/1 Demon — this roster
    // only has 4 Townsfolk, but otherwise passes /api/table/script's own
    // checks fine (6 total, at least one of each team).
    const scriptRes = await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['chef', 'empath', 'investigator', 'ravenkeeper', 'poisoner', 'imp'] },
    });
    check('the undersized roster is still accepted at commit time (5 dealt later, unknown at this point)', scriptRes.status === 200, JSON.stringify(scriptRes));

    for (const name of ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Fa', 'Gi']) {
      await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
    }

    const dealRes = await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    check('deal is rejected with a real 400, not a 500 or a raw crash', dealRes.status === 400 && !!dealRes.json.error, JSON.stringify(dealRes));
    check('the error message is actionable, not a raw JS TypeError', /townsfolk/i.test(dealRes.json.error) && !/cannot read propert/i.test(dealRes.json.error), dealRes.json.error);

    const { json: afterState } = await request(server.baseUrl, '/api/host-state');
    check('the game is untouched, not left half-dealt', afterState.phase === 'lobby', afterState.phase);
    check('no seat was mutated before the crash point — every player is still marked alive, none dealt early', afterState.players.every(p => p.alive === true) && afterState.players.length === 7, JSON.stringify(afterState.players));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
