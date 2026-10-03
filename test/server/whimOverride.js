'use strict';

/* /api/storyteller/override-whims — Phase 3 step 3 (ROADMAP.md's "Phase 3
   Design" doc): a Storyteller reviewing a night's draft can force a
   specific whim outcome instead of accepting what the real judge decided,
   by restoring the pre-night snapshot and cleanly re-running resolveNight()
   with that one kind forced. Doesn't try to predict what the UNFORCED
   outcome would have been (the real judge here is the synchronous
   heuristic, not a live LLM — this harness runs LLM-off by default, same
   as every other test:server file) — instead proves the override is
   authoritative over it by forcing BOTH directions in turn and confirming
   the Mayor's own fate in the draft actually flips each time. */

const crypto = require('crypto');
const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function codeHash(code) { return crypto.createHash('sha256').update(String(code)).digest('hex'); }

/** Submits every living seat's own prompt for the current night, reading
    each one for real (never assuming blank is valid — a decoy prompt can
    still demand a shaped submission) — same pattern harness.js's own
    answerAllNightPrompts uses, just through the storyteller routes
    (playerId, no tokens) instead. `pick(name, prompt)` lets the caller
    override specific seats' targets (for the Poisoner, and later the Imp)
    rather than taking whatever the generic pool-slice would choose —
    necessary here since a generic pick can land on the Mayor, poisoning
    (impairing) them, which makes randomKiller() skip the mayor-redirect
    check entirely (`!impaired(picked)`) and silently defeats this whole
    test. */
async function submitEveryPrompt(baseUrl, storytellerCookie, seats, pick) {
  const storytellerFetch = (route, b) => fetch(`${baseUrl}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: storytellerCookie }, body: JSON.stringify(b),
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));
  const storytellerGet = (route) => fetch(`${baseUrl}${route}`, { headers: { Cookie: storytellerCookie } })
    .then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));

  for (const name of Object.keys(seats)) {
    const { json: s } = await storytellerGet(`/api/storyteller/state?playerId=${seats[name]}`);
    if (!s || !s.prompt) continue;
    const override = pick && pick(name, s.prompt);
    const pool = s.prompt.targets.filter(t => t.id !== seats[name]);
    const targets = override || pool.slice(0, s.prompt.count).map(t => t.id);
    const r = await storytellerFetch('/api/storyteller/action', { playerId: seats[name], targets });
    if (r.json && r.json.error) throw new Error(`${name}'s action failed: ${r.json.error}`);
  }
  return { storytellerFetch, storytellerGet };
}

/** Deals a fixed Mayor/Chef/Empath/Poisoner/Imp roster via presetAssignment
    (the replay tool's own mechanism — see dealRoles' doc comment) so this
    test knows exactly who's who, then plays through night 1 (nobody has a
    real first-night choice on this roster — the Imp's own kill doesn't
    start until night 2, per the official Trouble Brewing night order) and
    into night 2, where the Imp's real kill is pointed at the Mayor
    directly — guaranteeing resolveWhim's mayor-redirect check actually
    fires — leaving that night pending confirmation. */
async function dealAndTargetMayorNight2(baseUrl, storytellerCookie) {
  await request(baseUrl, '/api/table/reset', { method: 'POST', body: {} });
  await request(baseUrl, '/api/table/config', { method: 'POST', body: { config: { mode: 'assist', voteWindowSeconds: 3, windowSeconds: 5 } } });
  await request(baseUrl, '/api/table/script', { method: 'POST', body: { customRoster: ['mayor', 'chef', 'empath', 'poisoner', 'imp'] } });

  const seats = {};
  for (const name of ['Mayor', 'Chef', 'Empath', 'Poisoner', 'Imp']) {
    const { json } = await request(baseUrl, '/api/join', { method: 'POST', body: { name } });
    seats[name] = json.playerId;
  }
  const presetAssignment = Object.entries(seats).map(([name, playerId]) =>
    ({ playerId, characterId: name.toLowerCase(), believedId: name.toLowerCase(), statuses: {} }));
  await request(baseUrl, '/api/table/deal', { method: 'POST', body: { presetAssignment } });
  await request(baseUrl, '/api/table/night', { method: 'POST', body: {} });

  // Night 1: nothing real to choose for anyone on this roster — poison
  // the Chef specifically (never the Mayor) so night 2's redirect check
  // still has an unimpaired Mayor to work with.
  await submitEveryPrompt(baseUrl, storytellerCookie, seats,
    (name) => name === 'Poisoner' ? [seats.Chef] : null);
  const confirmNight1 = await (await fetch(`${baseUrl}/api/storyteller/confirm-night`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: storytellerCookie }, body: '{}',
  })).json();
  if (confirmNight1.error) throw new Error(`confirming night 1 failed: ${confirmNight1.error}`);

  await request(baseUrl, '/api/table/night', { method: 'POST', body: {} });
  const { storytellerFetch, storytellerGet } = await submitEveryPrompt(baseUrl, storytellerCookie, seats,
    (name) => name === 'Imp' ? [seats.Mayor] : name === 'Poisoner' ? [seats.Chef] : null);

  return { seats, storytellerFetch, storytellerGet };
}

async function waitUntilPending(baseUrl, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { json } = await request(baseUrl, '/api/host-state');
    if (json.nightPendingConfirmation) return true;
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

(async () => {
  const storytellerCookie = `storyteller_code=${codeHash('narrator-secret')}`;
  const server = await startServer({ env: { STORYTELLER_CODE: 'narrator-secret' } });
  try {
    const { seats, storytellerFetch, storytellerGet } = await dealAndTargetMayorNight2(server.baseUrl, storytellerCookie);
    check('the night actually reached pending confirmation', await waitUntilPending(server.baseUrl));

    const { json: draftBefore } = await storytellerGet('/api/storyteller/night-draft');
    check('the draft reports a real whimOutcomes entry for mayor-redirect — the Imp really did target the Mayor',
      draftBefore && draftBefore.whimOutcomes.some(w => w.kind === 'mayor-redirect'), JSON.stringify(draftBefore && draftBefore.whimOutcomes));

    const noCookieOverride = await fetch(`${server.baseUrl}/api/storyteller/override-whims`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ overrides: [{ kind: 'mayor-redirect', fire: true }] }),
    });
    check('the override route is gated the same as every other storyteller route', noCookieOverride.status === 401);

    const badKind = await storytellerFetch('/api/storyteller/override-whims', { overrides: [{ kind: 'pacifist-save', fire: true }] });
    check('pacifist-save is explicitly rejected here — it never fires inside resolveNight(), so "overriding" it would silently do nothing', badKind.status === 400);

    const badShape = await storytellerFetch('/api/storyteller/override-whims', { overrides: [{ kind: 'mayor-redirect', fire: 'yes' }] });
    check('a non-boolean fire value is rejected, not coerced', badShape.status === 400);

    // Force the redirect to FIRE — the Mayor must survive, someone else dies instead.
    const firedResult = await storytellerFetch('/api/storyteller/override-whims', { overrides: [{ kind: 'mayor-redirect', fire: true }] });
    check('forcing fire:true succeeds', firedResult.status === 200, JSON.stringify(firedResult.json));
    check('forcing fire:true -> the Mayor is NOT among tonight\'s deaths', firedResult.json && !firedResult.json.deaths.some(d => d.name === 'Mayor'), JSON.stringify(firedResult.json && firedResult.json.deaths));
    check('the overridden outcome is reported back in whimOutcomes, reason included', firedResult.json && firedResult.json.whimOutcomes.some(w => w.kind === 'mayor-redirect' && w.fired === true && w.reason === 'Storyteller override'));
    const { json: hostAfterFire } = await request(server.baseUrl, '/api/host-state');
    check('the night is still (again) pending confirmation after an override — nothing auto-commits', hostAfterFire.nightPendingConfirmation === true);

    // Now force it NOT to fire — the Mayor must actually die this time,
    // proving the override is authoritative in BOTH directions, not just
    // happening to match one natural outcome.
    const notFiredResult = await storytellerFetch('/api/storyteller/override-whims', { overrides: [{ kind: 'mayor-redirect', fire: false }] });
    check('forcing fire:false succeeds', notFiredResult.status === 200);
    check('forcing fire:false -> the Mayor IS among tonight\'s deaths this time', notFiredResult.json && notFiredResult.json.deaths.some(d => d.name === 'Mayor'), JSON.stringify(notFiredResult.json && notFiredResult.json.deaths));

    // Confirm, then prove the snapshot is really gone — a further override
    // attempt must fail clean, not silently resurrect a finished night.
    const confirmed = await storytellerFetch('/api/storyteller/confirm-night', {});
    check('confirming after an override still works normally', confirmed.status === 200 && confirmed.json.ok);
    const overrideAfterConfirm = await storytellerFetch('/api/storyteller/override-whims', { overrides: [{ kind: 'mayor-redirect', fire: true }] });
    check('an override attempt after confirming is a clean 409, not a crash or a resurrected night', overrideAfterConfirm.status === 409);
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
