'use strict';

/* Phase 3 step 4 (ROADMAP.md's "Phase 3 Design" doc): Bucket 4's free-text
   judging (Gossip/Artist) in Storyteller Assist mode routes to the human
   directly instead of an LLM — /api/storyteller/claim-context exposes the
   exact ground truth judgeFreeformClaim would have sent the model, and
   /api/storyteller/gossip-claim / /api/storyteller/artist-question accept
   the Storyteller's own verdict instead of calling one. Verifies the gate,
   the ground-truth payload, the freeform-verdict path for both Gossip and
   Artist (including Artist's own "ambiguous stays ambiguous" rule), and
   that extracting gossipClaimHandler/artistQuestionHandler didn't change
   anything about how either route behaves. */

const crypto = require('crypto');
const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function codeHash(code) { return crypto.createHash('sha256').update(String(code)).digest('hex'); }

/** Deals the given roster via presetAssignment (one name per character id,
    capitalized) and plays through night 1 — nobody on either roster this
    file uses has a real first-night choice — landing on day 1 with every
    seat's id known exactly. */
async function dealToDayOne(baseUrl, storytellerCookie, roster) {
  await request(baseUrl, '/api/table/reset', { method: 'POST', body: {} });
  await request(baseUrl, '/api/table/config', { method: 'POST', body: { config: { mode: 'assist', windowSeconds: 5 } } });
  await request(baseUrl, '/api/table/script', { method: 'POST', body: { customRoster: roster } });

  const storytellerFetch = (route, b) => fetch(`${baseUrl}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: storytellerCookie }, body: JSON.stringify(b),
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));
  const storytellerGet = (route) => fetch(`${baseUrl}${route}`, { headers: { Cookie: storytellerCookie } })
    .then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));

  const seats = {};
  for (const id of roster) {
    const name = id[0].toUpperCase() + id.slice(1);
    const { json } = await request(baseUrl, '/api/join', { method: 'POST', body: { name } });
    seats[name] = json.playerId;
  }
  const presetAssignment = Object.entries(seats).map(([name, playerId]) =>
    ({ playerId, characterId: name.toLowerCase(), believedId: name.toLowerCase(), statuses: {} }));
  await request(baseUrl, '/api/table/deal', { method: 'POST', body: { presetAssignment } });
  await request(baseUrl, '/api/table/night', { method: 'POST', body: {} });
  for (const id of Object.values(seats)) {
    const { json: s } = await storytellerGet(`/api/storyteller/state?playerId=${id}`);
    const targets = s && s.prompt ? s.prompt.targets.slice(0, s.prompt.count).map(t => t.id) : [];
    await storytellerFetch('/api/storyteller/action', { playerId: id, targets });
  }
  await storytellerFetch('/api/storyteller/confirm-night', {});
  const { json: hostState } = await request(baseUrl, '/api/host-state');
  if (hostState.phase !== 'day') throw new Error(`expected day 1, got phase=${hostState.phase}`);

  return { seats, storytellerFetch, storytellerGet };
}

(async () => {
  const storytellerCookie = `storyteller_code=${codeHash('narrator-secret')}`;
  const server = await startServer({ env: { STORYTELLER_CODE: 'narrator-secret' } });
  try {
    const { seats, storytellerFetch, storytellerGet } =
      await dealToDayOne(server.baseUrl, storytellerCookie, ['gossip', 'chef', 'empath', 'poisoner', 'vortox']);

    // --- /api/storyteller/claim-context ---

    const noCookieCtx = await fetch(`${server.baseUrl}/api/storyteller/claim-context`);
    const noCookieBody = await noCookieCtx.text();
    check('claim-context is gated like every other storyteller route', !noCookieBody.includes('"context"'));

    const { json: ctx } = await storytellerGet('/api/storyteller/claim-context');
    check('claim-context returns every seated player', ctx && ctx.context.length === 5, JSON.stringify(ctx));
    check('claim-context names real characters and teams, the exact ground truth an LLM judge would get',
      ctx && ctx.context.some(p => p.character === 'Vortox' && p.team === 'evil'), JSON.stringify(ctx && ctx.context));

    // --- /api/storyteller/gossip-claim, freeform path ---

    const noCookieClaim = await fetch(`${server.baseUrl}/api/storyteller/gossip-claim`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: seats.Gossip, claimType: 'freeform', claimText: 'x', verdict: 'true' }),
    });
    check('the write route is gated the same way', noCookieClaim.status === 401);

    const badVerdict = await storytellerFetch('/api/storyteller/gossip-claim', { playerId: seats.Gossip, claimType: 'freeform', claimText: 'Ada is the Vortox.', verdict: 'maybe' });
    check('an invalid verdict value is rejected, not coerced into a guess', badVerdict.status === 409);

    const judged = await storytellerFetch('/api/storyteller/gossip-claim', { playerId: seats.Gossip, claimType: 'freeform', claimText: 'The Vortox is in play.', verdict: 'true' });
    check('a Storyteller-judged true verdict is accepted with no LLM involved at all', judged.status === 200 && judged.json.ok, JSON.stringify(judged.json));

    // gossipClaimTrue/gossipClaimDay are internal (never exposed in
    // privateState() — a real player never learns their own claim's
    // truth either) — the observable proof the claim actually landed is
    // that a second one the same day is now rejected, same rule the
    // player-facing route already enforces.
    const again = await storytellerFetch('/api/storyteller/gossip-claim', { playerId: seats.Gossip, claimType: 'freeform', claimText: 'Another one.', verdict: 'false' });
    check('a second claim the same day is rejected — proof the first one actually set gossipClaimDay', again.status === 409);

    // --- /api/storyteller/artist-question — ambiguous stays ambiguous ---

    const artist = await dealToDayOne(server.baseUrl, storytellerCookie, ['gossip', 'artist', 'empath', 'poisoner', 'vortox']);

    const ambiguous = await artist.storytellerFetch('/api/storyteller/artist-question', { playerId: artist.seats.Artist, claimType: 'freeform', claimText: 'Is the plan a good one?', verdict: 'ambiguous' });
    check('an ambiguous verdict is accepted — Artist has no safety stakes to collapse it to false for', ambiguous.status === 200 && ambiguous.json.ok, JSON.stringify(ambiguous.json));

    const { json: artistResult } = await artist.storytellerGet(`/api/storyteller/state?playerId=${artist.seats.Artist}`);
    check('ambiguous stays ambiguous in the actual result shown — never silently coerced to "No."',
      artistResult && artistResult.result && artistResult.result.body === "The Storyteller isn't sure how to answer that.", JSON.stringify(artistResult && artistResult.result));

    const secondAsk = await artist.storytellerFetch('/api/storyteller/artist-question', { playerId: artist.seats.Artist, claimType: 'freeform', claimText: 'Another question.', verdict: 'true' });
    check('a second question is rejected — once per game, same rule the player route already enforces', secondAsk.status === 409);
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
