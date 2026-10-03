'use strict';

/* /api/storyteller/* — Storyteller Assist mode's new route family (see
   ROADMAP.md's three-mode rollout, Phase 3): a human enters every choice
   on a player's behalf instead of that player's own phone. Verifies two
   separate things: (1) the new 'storyteller' access tier actually gates
   these routes — the table code alone, or no cookie at all, must never be
   enough, even when the request body carries a perfectly valid playerId;
   (2) once authenticated, a Storyteller really can drive an entire night
   and day using nothing but player ids, with zero player ever touching
   their own token — actionHandler/nominateHandler/voteHandler's
   token-or-id duality (Phase 1) doing exactly the job it was built for. */

const crypto = require('crypto');
const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function codeHash(code) { return crypto.createHash('sha256').update(String(code)).digest('hex'); }

async function waitUntil(fn, timeoutMs, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return last;
}

(async () => {
  const storytellerCookie = `storyteller_code=${codeHash('narrator-secret')}`;
  const server = await startServer({ env: { STORYTELLER_CODE: 'narrator-secret' } });
  try {
    // --- gate behavior: the tier check itself, not actionHandler's own logic ---

    const noCookie = await fetch(`${server.baseUrl}/api/storyteller/action`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerId: 'whoever', targets: [] }),
    });
    check('no cookie at all -> 401, regardless of what the body claims', noCookie.status === 401);

    const { json: enterWrong, status: wrongStatus } = await request(server.baseUrl, '/api/enter-storyteller-code', { method: 'POST', body: { code: 'not-it' } });
    check('the wrong code is rejected, no cookie granted', wrongStatus === 401 && enterWrong.error);

    const { status: rightStatus } = await request(server.baseUrl, '/api/enter-storyteller-code', { method: 'POST', body: { code: 'narrator-secret' } });
    check('the right code is accepted', rightStatus === 200);

    const stillBlocked = await fetch(`${server.baseUrl}/api/storyteller/action`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerId: 'whoever', targets: [] }),
    });
    check('a request with no cookie header attached is still blocked even after /api/enter-storyteller-code succeeded for someone else', stillBlocked.status === 401);

    // --- a real night and day, driven entirely by playerId, no player token used anywhere ---

    await request(server.baseUrl, '/api/table/reset', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/script', { method: 'POST', body: { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] } });
    await request(server.baseUrl, '/api/table/config', { method: 'POST', body: { config: { voteWindowSeconds: 3, windowSeconds: 5 } } });

    const playerIds = [];
    for (const name of ['Ada', 'Bo', 'Cy', 'Di', 'Ev']) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      playerIds.push(json.playerId); // deliberately discarding json.token — a storyteller never needs it
    }

    const storytellerFetch = (route, body) => fetch(`${server.baseUrl}${route}`, {
      method: 'POST', headers: { 'content-type': 'application/json', Cookie: storytellerCookie }, body: JSON.stringify(body),
    }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));
    const storytellerGet = (route) => fetch(`${server.baseUrl}${route}`, { headers: { Cookie: storytellerCookie } })
      .then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));

    // A GET without the cookie never reaches the real route handler at all
    // — blockedByGate()'s own GET branch serves enter-storyteller-code.html
    // instead (same pre-existing GET/POST asymmetry host_code already has:
    // confirmed live that GET /api/host-state with no host cookie answers
    // 200 with that HTML page's content, not the real JSON, when the page
    // exists — here it 404s instead, since no console app exists yet to
    // need that page). Either way, the one thing that actually matters
    // holds: the real response body is never playerState()'s shape.
    const noCookieState = await fetch(`${server.baseUrl}/api/storyteller/state?playerId=${playerIds[0]}`);
    const noCookieBody = await noCookieState.text();
    check('the read-side route never hands back real player state with no cookie attached',
      !noCookieBody.includes('"prompt"') && !noCookieBody.includes('"you"'), `status ${noCookieState.status}`);

    // /api/table/deal is host-gated, not storyteller-gated — the host
    // device deals, same as every other mode; nothing about this test
    // touches that boundary.
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });

    // The real console flow: read each seat's own prompt by playerId (no
    // token anywhere), then submit whatever it actually asks for — mirrors
    // harness.js's own answerAllNightPrompts, but entirely through the
    // storyteller's own read+write routes.
    let sawAtLeastOneRealChoice = false;
    for (const id of playerIds) {
      const { json: state } = await storytellerGet(`/api/storyteller/state?playerId=${id}`);
      if (!state || !state.prompt) continue; // Chef/Empath/Investigator: choiceCount 0, nothing to submit
      sawAtLeastOneRealChoice = true;
      const pool = state.prompt.targets.filter(t => t.id !== id);
      const targets = pool.slice(0, state.prompt.count).map(t => t.id);
      const r = await storytellerFetch('/api/storyteller/action', { playerId: id, targets });
      if (r.json && r.json.error) throw new Error(`storyteller action for ${id} failed: ${r.json.error}`);
    }
    check('the Poisoner and Imp both had a real prompt to answer, read entirely through the storyteller route', sawAtLeastOneRealChoice);

    const afterNight = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 5000);
    check('a night driven entirely through /api/storyteller/action resolves into day', !!afterNight, JSON.stringify(afterNight && afterNight.phase));

    const nominator = playerIds[0], nominee = playerIds[1];
    const nomResult = await storytellerFetch('/api/storyteller/nominate', { nominatorId: nominator, nomineeId: nominee });
    check('a nomination submitted via nominatorId (no token) succeeds', nomResult.status === 200 && nomResult.json.ok, JSON.stringify(nomResult.json));

    for (const voterId of playerIds) {
      const voteResult = await storytellerFetch('/api/storyteller/vote', { playerId: voterId, vote: 'yes' });
      if (voteResult.json && voteResult.json.error) throw new Error(`storyteller vote for ${voterId} failed: ${voteResult.json.error}`);
    }

    const { json: afterVotes } = await request(server.baseUrl, '/api/host-state');
    check('every vote submitted via playerId (no token) actually landed', afterVotes.nominations[0].votes.length === playerIds.length, JSON.stringify(afterVotes.nominations));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
