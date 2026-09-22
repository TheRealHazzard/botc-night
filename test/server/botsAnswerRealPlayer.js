'use strict';

/* botsAnswer() looped every seat, real and bot alike, with no `!p.bot`
   guard — unlike its sibling botsVote(), which already has one. In a
   mixed real+bot table (the whole point of /api/table/add-bots), a real
   player who took longer than botsAnswer's own scheduled delay to decide
   could have their actual choice silently overwritten by a random
   bot-style guess. This drives that exact scenario: a real player never
   submits, botsAnswer fires on schedule, and their own seat must still
   show unsubmitted — only the bot seats should have answered. */

const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function waitUntil(fn, timeoutMs, intervalMs = 150) {
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
    // A short window so botsAnswer's own scheduled delay
    // (Math.max(400, windowSeconds * 400)) fires quickly and predictably.
    await request(server.baseUrl, '/api/table/config', { method: 'POST', body: { config: { windowSeconds: 3 } } });

    const { json: joined } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name: 'Ada' } });
    await request(server.baseUrl, '/api/table/add-bots', { method: 'POST', body: { count: 4 } });
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });

    // Deliberately never answer as Ada — wait out botsAnswer's own
    // ~1.2s scheduled delay (windowSeconds * 400ms), then a little more.
    await new Promise(r => setTimeout(r, 2000));

    const { json: afterBots } = await request(server.baseUrl, `/api/state?token=${joined.token}`);
    check('the real player\'s own choice was never silently made for them by botsAnswer', afterBots.submitted === false, JSON.stringify({ submitted: afterBots.submitted }));

    const { json: hostState } = await request(server.baseUrl, '/api/host-state');
    const ada = hostState.players.find(p => p.name === 'Ada');
    const bots = hostState.players.filter(p => p.name !== 'Ada');
    check('the host screen agrees — Ada still shows unsubmitted', ada && ada.submitted === false, JSON.stringify(ada));
    check('every bot seat did get answered by botsAnswer, same as always', bots.length === 4 && bots.every(p => p.submitted === true), JSON.stringify(bots));

    // Ada's own real submission still works fine afterward — not blocked
    // by anything botsAnswer left behind.
    const { json: state } = await request(server.baseUrl, `/api/state?token=${joined.token}`);
    if (state.prompt) {
      const targets = state.prompt.targets.slice(0, state.prompt.count).map(t => t.id);
      const actionRes = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: joined.token, targets } });
      check('Ada can still submit her own real choice afterward', !actionRes.json || !actionRes.json.error, JSON.stringify(actionRes));
      const dawn = await waitUntil(async () => {
        const { json } = await request(server.baseUrl, '/api/host-state');
        return json.phase !== 'night' ? json : null;
      }, 5000);
      check('the night actually finishes once Ada submits for real', !!dawn, 'night never closed within 5s of Ada submitting');
    } else {
      check('Ada had a real prompt to submit (decoy is fine too — just confirming the submit path isn\'t blocked)', !!state, 'no state at all');
    }
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
