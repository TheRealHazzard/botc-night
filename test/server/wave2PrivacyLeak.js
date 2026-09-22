'use strict';

/* A wave-2 night (the Ravenkeeper or the Barber dying in wave 1) used to
   push that death — publiclyAlive() already flipped to false, plus the
   deaths[] entry — to every host/TV stream the instant wave 1 resolved,
   well before wave 2 even opened and long before dawn. The shared screen
   showed a skull on that seat while the narration still said "the town
   sleeps." This drives a real Ravenkeeper kill through the actual server
   and checks /api/host-state at exactly that moment: still publicly
   "alive," no deaths[] entry, right up until endNight() actually reaches
   day. */

const { startServer, request, answerAllNightPrompts } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function waitUntil(fn, timeoutMs, intervalMs = 100) {
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
      body: { customRoster: ['ravenkeeper', 'chef', 'empath', 'poisoner', 'imp'] },
    });
    // A long wave2Seconds so the leak window would be trivially observable
    // if the bug were still there — this test doesn't rely on catching a
    // narrow race, it asserts the field is correct for the whole window.
    await request(server.baseUrl, '/api/table/config', {
      method: 'POST',
      body: { config: { windowSeconds: 60, wave2Seconds: 20 } },
    });

    const names = ['Ada', 'Bo', 'Cy', 'Di', 'Ed'];
    const tokens = [];
    for (const name of names) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens.push(json.token);
    }
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });

    // The Demon never acts on night 1 (tb.js: `acts: (g) => g.nightNumber
    // !== 1`) — answer night 1 with whatever, then push straight through
    // to night 2 (no day action is required to do that) before setting up
    // the real kill this test actually needs.
    await answerAllNightPrompts(server.baseUrl, tokens);
    await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 8000);
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });

    const states = await Promise.all(tokens.map(t => request(server.baseUrl, `/api/state?token=${t}`)));
    const impIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'imp');
    const rkIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'ravenkeeper');
    const poisonerIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'poisoner');
    check('a real Ravenkeeper was dealt', rkIdx !== -1);
    check('a real Imp was dealt', impIdx !== -1);
    check('a real Poisoner was dealt', poisonerIdx !== -1);
    if (rkIdx === -1 || impIdx === -1 || poisonerIdx === -1) throw new Error('roster did not deal as requested — aborting');

    const rkId = states[rkIdx].json.you.id;
    const rkName = names[rkIdx];
    const impId = states[impIdx].json.you.id;
    // Some other living, non-Imp seat — poisoning the Chef/Empath is a
    // no-op for this test either way; the point is just to keep the
    // Poisoner from landing on the Imp, which would make the kill itself
    // (the one thing this test needs to happen deterministically) uncertain.
    const poisonTargetId = states.map(r => r.json.you.id).find(id => id !== impId && id !== states[poisonerIdx].json.you.id);
    const poisonRes = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: tokens[poisonerIdx], targets: [poisonTargetId] } });
    check('the Poisoner\'s action is accepted', !poisonRes.json || !poisonRes.json.error, JSON.stringify(poisonRes.json));

    // The Imp explicitly targets the Ravenkeeper — everyone else (the
    // Ravenkeeper's own wave-1 decoy, Chef, Empath) answers however.
    const impRes = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: tokens[impIdx], targets: [rkId] } });
    check('the Imp\'s kill on the Ravenkeeper is accepted', !impRes.json || !impRes.json.error, JSON.stringify(impRes.json));
    await answerAllNightPrompts(server.baseUrl, tokens.filter((_, i) => i !== impIdx && i !== poisonerIdx));

    // allSubmitted() closes wave 1 the instant everyone's in, resolves the
    // kill, and — since a Ravenkeeper just died — opens wave 2 immediately.
    const midWave2 = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'night' && json.wave === 2 ? json : null;
    }, 8000);
    check('wave 2 actually opened (confirms the Ravenkeeper really died in wave 1)', !!midWave2, 'never reached wave 2 within 8s');

    if (midWave2) {
      const rkSeat = midWave2.players.find(p => p.id === rkId);
      check('mid-wave-2, the Ravenkeeper still shows publicly alive on the host/TV stream', rkSeat && rkSeat.alive === true, JSON.stringify(rkSeat));
      check('mid-wave-2, the Ravenkeeper\'s death has not been pushed to deaths[] yet',
        !midWave2.deaths.some(d => d.name === rkName && d.night === midWave2.nightNumber),
        JSON.stringify(midWave2.deaths));
    }

    // Finish wave 2: every other living player still gets a decoy this wave
    // (promptFor's own "nobody's silence marks them out" rule doesn't stop
    // just because it's wave 2), so allSubmitted() needs all of them
    // answered too, not just the Ravenkeeper. The Ravenkeeper's own
    // from-beyond submission is manual, not answerAllNightPrompts — it
    // deliberately skips any seat whose OWN private state.you.alive is
    // false, which is exactly the Ravenkeeper right now.
    const { json: rkState } = await request(server.baseUrl, `/api/state?token=${tokens[rkIdx]}`);
    check('the (truly dead) Ravenkeeper still gets their own wave-2 prompt', !!rkState.prompt, JSON.stringify(rkState.prompt));
    if (rkState.prompt) {
      const rkTarget = rkState.prompt.targets[0].id;
      const rkActionRes = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: tokens[rkIdx], targets: [rkTarget] } });
      check('the Ravenkeeper\'s wave-2 action is accepted', !rkActionRes.json || !rkActionRes.json.error, JSON.stringify(rkActionRes.json));
    }
    await answerAllNightPrompts(server.baseUrl, tokens.filter((_, i) => i !== rkIdx));
    const dawn = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 8000);
    check('the night actually ends and day begins', !!dawn, 'never reached day within 8s');

    if (dawn) {
      const rkSeat = dawn.players.find(p => p.id === rkId);
      check('once day actually begins, the Ravenkeeper correctly shows dead', rkSeat && rkSeat.alive === false, JSON.stringify(rkSeat));
      check('once day actually begins, the death is now visible in deaths[]',
        dawn.deaths.some(d => d.name === rkName), JSON.stringify(dawn.deaths));
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
