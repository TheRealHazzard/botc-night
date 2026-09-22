'use strict';

/* The picker on both the player's own phone (canNominate.targets, read
   straight off privateState in game/engine.js) and the host's
   NominateAction.jsx used to offer every living player as a nominee and
   every living player as a nominator, even ones /api/table/nominate would
   immediately 409 on — someone already nominated today, or someone who's
   already used their one nomination for the day. This exercises the real
   fix (privateState's canNominate) end to end over the actual server,
   the same way botDayActions.js already does for bot day behavior. */

const { startServer, request, answerAllNightPrompts } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function waitUntil(fn, timeoutMs, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  return (async () => {
    let last;
    while (Date.now() < deadline) {
      last = await fn();
      if (last) return last;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return last;
  })();
}

(async () => {
  const server = await startServer();
  try {
    await request(server.baseUrl, '/api/table/reset', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] },
    });
    await request(server.baseUrl, '/api/table/config', {
      method: 'POST',
      body: { config: { voteWindowSeconds: 2, windowSeconds: 5, wave2Seconds: 3 } },
    });

    const names = ['Ada', 'Bo', 'Cy', 'Di', 'Ed'];
    const tokens = [];
    for (const name of names) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens.push(json.token);
    }
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
    await answerAllNightPrompts(server.baseUrl, tokens);
    await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 8000);

    const states = await Promise.all(tokens.map(t => request(server.baseUrl, `/api/state?token=${t}`)));
    const [adaId, boId] = states.map(r => r.json.you.id);

    check(
      'before anyone nominates, every living player is a valid target',
      states.every(r => r.json.canNominate && r.json.canNominate.targets.length === 5),
      JSON.stringify(states.map(r => r.json.canNominate)),
    );

    const nomRes = await request(server.baseUrl, '/api/table/nominate', { method: 'POST', body: { token: tokens[0], nomineeId: boId } });
    check('Ada\'s nomination of Bo is accepted', nomRes.json && nomRes.json.ok === true, JSON.stringify(nomRes.json));

    const closed = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      const n = json.nominations.find(x => x.day === json.nightNumber);
      return n && n.closed ? n : null;
    }, 6000);
    check('the nomination closes on its own once the (shortened) vote window elapses', !!closed, 'nomination never closed within 6s');

    const { json: adaAfter } = await request(server.baseUrl, `/api/state?token=${tokens[0]}`);
    check('Ada, having already nominated today, is no longer offered the nominate button at all', adaAfter.canNominate === null, JSON.stringify(adaAfter.canNominate));

    const { json: cyAfter } = await request(server.baseUrl, `/api/state?token=${tokens[2]}`);
    check('Cy, who has not nominated yet, still gets the nominate button', !!cyAfter.canNominate);
    check(
      'Bo — already nominated today — is dropped from Cy\'s own target list',
      cyAfter.canNominate && !cyAfter.canNominate.targets.some(t => t.id === boId),
      JSON.stringify(cyAfter.canNominate),
    );
    check(
      'everyone else still appears in Cy\'s target list',
      cyAfter.canNominate && cyAfter.canNominate.targets.length === 4,
      JSON.stringify(cyAfter.canNominate),
    );
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
