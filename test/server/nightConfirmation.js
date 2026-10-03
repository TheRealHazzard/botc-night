'use strict';

/* Storyteller Assist mode's "draft, then confirm" night flow (ROADMAP.md's
   Phase 3 design doc) — closeWindow() stops short of committing a resolved
   night, a human reviews /api/storyteller/night-draft, and
   /api/storyteller/confirm-night is the only thing that actually calls
   endNight(). Verifies the mechanism end to end, AND that Core mode (the
   default) is completely untouched by any of it — the branch in
   closeWindow() must never fire unless game.config.mode is literally
   'assist'. */

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

/** Joins 5 players, deals a fixed roster with one real choice each for the
    Poisoner and Imp, starts the night, and answers every seat's prompt
    through the storyteller routes (playerId only, no tokens) — stops right
    as the window should be closing, so the caller can observe what happens
    at that exact moment under whichever mode is already configured. */
async function playThroughNight1(baseUrl, storytellerCookie) {
  await request(baseUrl, '/api/table/script', { method: 'POST', body: { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] } });
  await request(baseUrl, '/api/table/config', { method: 'POST', body: { config: { voteWindowSeconds: 3, windowSeconds: 5 } } });
  const playerIds = [];
  for (const name of ['Ada', 'Bo', 'Cy', 'Di', 'Ev']) {
    const { json } = await request(baseUrl, '/api/join', { method: 'POST', body: { name } });
    playerIds.push(json.playerId);
  }
  await request(baseUrl, '/api/table/deal', { method: 'POST', body: {} });
  await request(baseUrl, '/api/table/night', { method: 'POST', body: {} });

  const storytellerFetch = (route, body) => fetch(`${baseUrl}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: storytellerCookie }, body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));
  const storytellerGet = (route) => fetch(`${baseUrl}${route}`, { headers: { Cookie: storytellerCookie } })
    .then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));

  for (const id of playerIds) {
    const { json: state } = await storytellerGet(`/api/storyteller/state?playerId=${id}`);
    if (!state || !state.prompt) continue;
    const pool = state.prompt.targets.filter(t => t.id !== id);
    const targets = pool.slice(0, state.prompt.count).map(t => t.id);
    const r = await storytellerFetch('/api/storyteller/action', { playerId: id, targets });
    if (r.json && r.json.error) throw new Error(`action for ${id} failed: ${r.json.error}`);
  }
  return { playerIds, storytellerFetch, storytellerGet };
}

(async () => {
  const storytellerCookie = `storyteller_code=${codeHash('narrator-secret')}`;
  const server = await startServer({ env: { STORYTELLER_CODE: 'narrator-secret' } });
  try {
    // --- Core mode (the default) — completely unaffected ---
    await request(server.baseUrl, '/api/table/reset', { method: 'POST', body: {} });
    const core = await playThroughNight1(server.baseUrl, storytellerCookie);
    const coreAfter = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 5000);
    check('Core mode: the night still resolves straight into day on its own, same as always', !!coreAfter);
    check('Core mode: nightPendingConfirmation never gets set', coreAfter && coreAfter.nightPendingConfirmation === false);

    // --- Assist mode — the night stops and waits ---
    await request(server.baseUrl, '/api/table/reset', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/config', { method: 'POST', body: { config: { mode: 'assist' } } });
    const { storytellerFetch, storytellerGet } = await playThroughNight1(server.baseUrl, storytellerCookie);

    const { json: pendingState } = await waitUntil(async () => {
      const r = await request(server.baseUrl, '/api/host-state');
      return r.json.nightPendingConfirmation ? r : null;
    }, 5000) || {};
    check('Assist mode: the night stops short and flags itself as pending confirmation', pendingState && pendingState.nightPendingConfirmation === true);
    check('Assist mode: the table never actually sees day phase yet — resolveNight() ran, but nothing committed', pendingState && pendingState.phase === 'night');

    // A GET without the cookie never reaches the real handler — same
    // pre-existing GET/POST asymmetry documented in storytellerRoutes.js
    // (blockedByGate's GET branch serves enter-storyteller-code.html
    // instead of a clean 401, and that file doesn't exist yet). What
    // matters is confirmed the same way: no real draft content comes back.
    const draftNoCookie = await fetch(`${server.baseUrl}/api/storyteller/night-draft`);
    const draftNoCookieBody = await draftNoCookie.text();
    check('the draft read route never hands back real content with no cookie attached',
      !draftNoCookieBody.includes('"results"') && !draftNoCookieBody.includes('"whimOutcomes"'));

    const { json: draft } = await storytellerGet('/api/storyteller/night-draft');
    check('the draft exposes tonight\'s results — exactly what each player is about to be told', draft && draft.results && Object.keys(draft.results).length > 0, JSON.stringify(draft && Object.keys(draft.results || {})));
    check('the draft carries a whimOutcomes array (empty is fine — this roster has none), not undefined', draft && Array.isArray(draft.whimOutcomes));

    const confirmNoCookie = await fetch(`${server.baseUrl}/api/storyteller/confirm-night`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    check('confirming without the storyteller cookie is blocked, not just discouraged', confirmNoCookie.status === 401);

    const { json: stillPending } = await request(server.baseUrl, '/api/host-state');
    check('...and the night really is still pending after that blocked attempt', stillPending.nightPendingConfirmation === true);

    const confirmed = await storytellerFetch('/api/storyteller/confirm-night', {});
    check('confirming with the real cookie succeeds', confirmed.status === 200 && confirmed.json.ok);

    const { json: afterConfirm } = await request(server.baseUrl, '/api/host-state');
    check('the table finally sees day phase, only now', afterConfirm.phase === 'day');
    check('the pending flag clears once confirmed', afterConfirm.nightPendingConfirmation === false);

    const secondConfirm = await storytellerFetch('/api/storyteller/confirm-night', {});
    check('confirming again with nothing pending is a clean 409, not a crash or a double-commit', secondConfirm.status === 409);
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
