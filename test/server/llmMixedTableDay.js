'use strict';

/* Solo practice mode's real technical gap, closed this session: a real
   table padded with bots (/api/table/add-bots) used to run its bots on a
   flat, context-blind heuristic for nominate/vote, and never had them make
   a public claim at all (botsClaim() used to be gated on game.simulation
   only) — a human playing alone against bots got none of the claim-and-
   suspect loop a real table runs on. This drives that exact mixed table
   with a real LLM-shaped mock (via harness.js's startMockOllama, same
   technique llmDryRunExecution.js uses for the pure-sim path) and checks
   all three pieces: bots claim (and only bots, never the real seat), a bot
   nominates via real reasoning, and bots vote via real reasoning — through
   the actual nominateHandler()/voteHandler() routes, not llmChooseExecution's
   sim-only shortcut, so Virgin/Golem/Witch triggers and the live vote
   window still work exactly as they would for a real player's own
   nomination. */

const { startServer, request, startMockOllama, answerAllNightPrompts } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

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

function parseMemory(promptText) {
  const start = promptText.indexOf('{');
  return JSON.parse(promptText.slice(start).split('\n\n')[0]);
}

// Matches the customRoster dealt below — botMemory() only gives
// believedCharacter as a display NAME ("Chef"), but botClaimSchema's
// claimedCharacterId enum wants the character id ("chef"); this test
// controls the roster, so a small fixed map is simpler than parsing
// characters.json just for this.
const NAME_TO_ID = { Chef: 'chef', Empath: 'empath', Investigator: 'investigator', Poisoner: 'poisoner', Imp: 'imp' };

// Always claims honestly (so the claim-presence check below has something
// real to find), always nominates some other living player via real
// reasoning, always votes yes, so the day resolves quickly. "Self" is
// found by matching memory.you.name against alivePlayers — botMemory()
// gives no id for "you" directly, only a name, same as a real model would
// see it.
function responder(body) {
  const system = body.messages[0].content;
  const promptText = body.messages[1].content;
  const memory = parseMemory(promptText);

  if (system.includes('Decide whether to publicly claim')) {
    const id = NAME_TO_ID[memory.you.believedCharacter] || 'chef';
    return { reasoning: 'test', shouldClaim: true, claimedCharacterId: id, statement: 'I am exactly what I seem.' };
  }
  if (system.includes('deciding whether to nominate')) {
    const others = memory.alivePlayers.filter(p => p.name !== memory.you.name);
    if (!others.length) return { reasoning: 'test', shouldNominate: false, nomineeId: 'none' };
    return { reasoning: 'test', shouldNominate: true, nomineeId: others[0].id };
  }
  if (system.includes('deciding how to vote')) {
    return { reasoning: 'test', vote: 'yes' };
  }
  throw new Error('Unrecognized system prompt in test mock: ' + system.slice(0, 80));
}

(async () => {
  let mock, server;
  try {
    mock = await startMockOllama(responder);
    server = await startServer({ env: { LLM_PROVIDER: 'ollama', OLLAMA_HOST: mock.baseUrl } });

    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] },
    });
    await request(server.baseUrl, '/api/table/config', {
      method: 'POST',
      body: { config: { voteWindowSeconds: 3, windowSeconds: 5, llmStorytellerEnabled: true } },
    });
    const { json: joinRes } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name: 'Tester' } });
    await request(server.baseUrl, '/api/table/add-bots', { method: 'POST', body: { count: 4 } });
    await request(server.baseUrl, '/api/table/deal', { method: 'POST', body: {} });
    await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
    await answerAllNightPrompts(server.baseUrl, [joinRes.token]);
    await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'day' ? json : null;
    }, 8000);

    const claimsState = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.claims.length >= 4 ? json : null;
    }, 6000);
    check('every bot seat claims on day 1, via real LLM reasoning', !!claimsState, 'fewer than 4 claims appeared within 6s');
    if (claimsState) {
      check('exactly the 4 bot seats claimed, not the real player\'s own seat',
        claimsState.claims.length === 4 && !claimsState.claims.some(c => c.playerId === joinRes.playerId),
        JSON.stringify(claimsState.claims.map(c => c.playerId)));
    }

    const nomState = await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.nominations.some(n => n.day === json.nightNumber) ? json : null;
    }, 6000);
    check('a bot opens a real nomination via LLM reasoning (not the flat heuristic)', !!nomState, 'no nomination appeared within 6s');

    if (nomState) {
      const closed = await waitUntil(async () => {
        const { json } = await request(server.baseUrl, '/api/host-state');
        const n = json.nominations.find(x => x.day === json.nightNumber);
        return n && n.closed ? n : null;
      }, 6000);
      check('the nomination closes with bot votes landed via LLM reasoning', !!closed && closed.yesCount > 0, JSON.stringify(closed));
    }
  } finally {
    if (server) await server.stop();
    if (mock) await mock.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
