'use strict';

/* A wave-2 night used to push a death — publiclyAlive() already flipped to
   false, plus the deaths[] entry — to every host/TV stream the instant
   wave 1 resolved, well before wave 2 even opened and long before dawn.
   The shared screen showed a skull on that seat while the narration still
   said "the town sleeps." This drives a real Barber kill through the
   actual server and checks /api/host-state at exactly that moment: still
   publicly "alive," no deaths[] entry, right up until endNight() actually
   reaches day.

   Used to be a Ravenkeeper scenario (she was the OTHER wave-2 trigger, and
   dying was itself what put her in wave 2) — moved to the Barber once the
   Ravenkeeper's own reveal moved off wave 2 entirely onto the day
   immediately following her death instead (see server.js's own
   /api/ravenkeeper-choice and its comment on why). The Barber is now the
   only remaining trigger for a second window: the Demon's swap prompt
   still has to wait for wave 1 to decide who died, so the same leak risk
   this test guards against is still very much live. */

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
    // sv: the Barber's wave-2 swap is the one remaining trigger for a
    // second window now that the Ravenkeeper's own reveal has moved to a
    // day-phase route instead — see this file's header comment. 6 players
    // (SETUP_TABLE['6']: 3 townsfolk, 1 outsider, 1 minion, 1 demon) rather
    // than the original 5, since the Barber is an Outsider — a 5-player
    // table deals zero of those — and being the roster's only Outsider
    // option makes it the guaranteed, deterministic pick.
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['barber', 'clockmaker', 'empath', 'oracle', 'poisoner', 'nodashii'] },
    });
    // A long wave2Seconds so the leak window would be trivially observable
    // if the bug were still there — this test doesn't rely on catching a
    // narrow race, it asserts the field is correct for the whole window.
    await request(server.baseUrl, '/api/table/config', {
      method: 'POST',
      body: { config: { windowSeconds: 60, wave2Seconds: 20 } },
    });

    const names = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Fen'];
    const tokens = [];
    for (const name of names) {
      const { json } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name } });
      tokens.push(json.token);
    }
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });

    // No Dashii never acts on night 1 (firstNightOrder: 0 — "each night*")
    // — answer night 1 with whatever, then push straight through to night
    // 2 (no day action is required to do that) before setting up the real
    // kill this test actually needs.
    await answerAllNightPrompts(server.baseUrl, tokens);
    await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 8000);
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });

    const states = await Promise.all(tokens.map(t => request(server.baseUrl, `/api/state?token=${t}`)));
    const demonIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'nodashii');
    const barberIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'barber');
    const poisonerIdx = states.findIndex(r => r.json.you.character && r.json.you.character.id === 'poisoner');
    check('a real No Dashii was dealt', demonIdx !== -1);
    check('a real Barber was dealt', barberIdx !== -1);
    check('a real Poisoner was dealt', poisonerIdx !== -1);
    if (demonIdx === -1 || barberIdx === -1 || poisonerIdx === -1) throw new Error('roster did not deal as requested — aborting');

    const demonId = states[demonIdx].json.you.id;
    const barberId = states[barberIdx].json.you.id;
    const barberName = names[barberIdx];
    // Some other living, non-Demon seat — poisoning the Clockmaker/Empath
    // is a no-op for this test either way; the point is just to keep the
    // Poisoner from landing on the Demon, which would make the kill itself
    // (the one thing this test needs to happen deterministically) uncertain.
    const poisonTargetId = states.map(r => r.json.you.id).find(id => id !== demonId && id !== states[poisonerIdx].json.you.id);
    const poisonRes = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: tokens[poisonerIdx], targets: [poisonTargetId] } });
    check('the Poisoner\'s action is accepted', !poisonRes.json || !poisonRes.json.error, JSON.stringify(poisonRes.json));

    // No Dashii explicitly targets the Barber — everyone else (the
    // Barber's own wave-1 decoy, Clockmaker, Empath) answers however.
    const demonRes = await request(server.baseUrl, '/api/action', { method: 'POST', body: { token: tokens[demonIdx], targets: [barberId] } });
    check('No Dashii\'s kill on the Barber is accepted', !demonRes.json || !demonRes.json.error, JSON.stringify(demonRes.json));
    await answerAllNightPrompts(server.baseUrl, tokens.filter((_, i) => i !== demonIdx && i !== poisonerIdx));

    // allSubmitted() closes wave 1 the instant everyone's in, resolves the
    // kill, fires the Barber's onDeath (flagging the Demon's
    // barberSwapPending) — and, since that flag is set, opens wave 2
    // immediately.
    const midWave2 = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'night' && json.wave === 2 ? json : null;
    }, 8000);
    check('wave 2 actually opened (confirms the Barber really died in wave 1)', !!midWave2, 'never reached wave 2 within 8s');

    if (midWave2) {
      const barberSeat = midWave2.players.find(p => p.id === barberId);
      check('mid-wave-2, the Barber still shows publicly alive on the host/TV stream', barberSeat && barberSeat.alive === true, JSON.stringify(barberSeat));
      check('mid-wave-2, the Barber\'s death has not been pushed to deaths[] yet',
        !midWave2.deaths.some(d => d.name === barberName && d.night === midWave2.nightNumber),
        JSON.stringify(midWave2.deaths));
    }

    // Finish wave 2: the (now-dead) Barber gets no prompt of their own at
    // all — the ability's real actor is the Demon (see sv.js's barber
    // entry) — but every other LIVING player still gets a decoy this wave
    // (promptFor's own "nobody's silence marks them out" rule doesn't stop
    // just because it's wave 2), Demon included: answerAllNightPrompts
    // answers all of them, including the Demon's real synthetic
    // 'barber-swap' prompt, and naturally skips the dead Barber on its own
    // (it only ever acts for a seat whose own state.you.alive is true).
    const { json: demonState } = await request(server.baseUrl, `/api/state?token=${tokens[demonIdx]}`);
    check('the Demon gets the synthetic barber-swap prompt in wave 2', !!demonState.prompt && demonState.prompt.characterId === 'barber-swap', JSON.stringify(demonState.prompt));
    await answerAllNightPrompts(server.baseUrl, tokens);
    const dawn = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 8000);
    check('the night actually ends and day begins', !!dawn, 'never reached day within 8s');

    if (dawn) {
      const barberSeat = dawn.players.find(p => p.id === barberId);
      check('once day actually begins, the Barber correctly shows dead', barberSeat && barberSeat.alive === false, JSON.stringify(barberSeat));
      check('once day actually begins, the death is now visible in deaths[]',
        dawn.deaths.some(d => d.name === barberName), JSON.stringify(dawn.deaths));
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
