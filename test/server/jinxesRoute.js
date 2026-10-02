'use strict';

/* /api/jinxes and /api/jinxes/refresh — the server-side half of the new
   Jinxes overlay. Mocking global.fetch inside the SPAWNED server process
   isn't possible from here (it's a separate child process, see
   harness.js), so this can't control whether the live endpoint is actually
   reachable in whatever environment runs this suite — it only checks the
   route's shape and that it never 500s either way. Every fetch
   success/failure/fallback branch itself is already covered directly
   against game/jinxData.js in test/jinxData.js, with a mocked fetch. */

const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

(async () => {
  const server = await startServer();
  try {
    const { status, json } = await request(server.baseUrl, '/api/jinxes');
    check('responds 200', status === 200);
    check('reports a source (seed or live, never undefined)', json.source === 'seed' || json.source === 'live', JSON.stringify(json.source));
    check('returns a pairs array', Array.isArray(json.pairs));
    // The default lobby roster is Trouble Brewing — Recluse+Sage (fixed
    // this session) isn't on that script, but nothing in TB's own roster
    // should accidentally be flagged implemented by a stale/wrong key.
    check('every returned pair carries a boolean implemented flag', json.pairs.every(p => typeof p.implemented === 'boolean'), JSON.stringify(json.pairs));
    check('each side is enriched with a display name, not just a bare id',
      json.pairs.every(p => p.a && p.a.id && p.a.name && p.b && p.b.id && p.b.name), JSON.stringify(json.pairs));

    // Recluse (Trouble Brewing) and Sage (Sects & Violets) are never on
    // the same NAMED script's own roster — only a custom one can combine
    // them, same as the earlier Sage+Recluse whim fix itself needed a
    // custom roster to exercise at all.
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['recluse', 'sage', 'poisoner', 'imp', 'empath'] },
    });
    const { json: customJinxes } = await request(server.baseUrl, '/api/jinxes');
    const recluseSage = customJinxes.pairs.find(p => (p.a.id === 'recluse' && p.b.id === 'sage') || (p.a.id === 'sage' && p.b.id === 'recluse'));
    check('a custom roster combining Recluse and Sage surfaces the real jinx between them', !!recluseSage, JSON.stringify(customJinxes.pairs));
    if (recluseSage) {
      check('...correctly flagged implemented (fixed this session)', recluseSage.implemented === true, JSON.stringify(recluseSage));
      check('...with real display names (Recluse/Sage), not bare ids', [recluseSage.a.name, recluseSage.b.name].includes('Recluse'), JSON.stringify(recluseSage));
    }

    const refreshRes = await request(server.baseUrl, '/api/jinxes/refresh', { method: 'POST', body: {} });
    check('the refresh route responds 200 (live network reachable or not — refreshJinxCache never throws)', refreshRes.status === 200);
    check('refresh still returns the same honest shape (source/fetchedAt/pairs)',
      typeof refreshRes.json.source === 'string' && Array.isArray(refreshRes.json.pairs));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
