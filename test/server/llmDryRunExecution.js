'use strict';

/* llmChooseExecution() orchestrates several sequential LLM calls (ask each
   living bot whether to nominate, stop at the first real "yes," then ask
   every living bot to vote, then tally against the majority threshold) —
   real logic with real room for an off-by-one or a wrong early-return, not
   just a single pass-through call the way llmBotClaim (phase 2a) is. The
   rest of this suite always runs with LLM_PROVIDER/ANTHROPIC_API_KEY
   blanked (see harness.js's own comment), which only ever exercises the
   "LLM off" fallback — this is the one place that actually drives the real
   network call and real response-parsing code path, via a mock Ollama
   server (harness.js's startMockOllama) standing in for a real model. */

const { startServer, request, startMockOllama } = require('./harness.js');

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

/** Pulls the compact JSON object botMemory() embeds in every prompt
    ("What this player knows:\n{...}", sometimes with more text appended
    after it for a vote call) back out as a real object — JSON.stringify
    never emits a literal newline on its own, so splitting on the first
    blank line cleanly separates the memory blob from any trailing text. */
function parseMemory(promptText) {
  const start = promptText.indexOf('{');
  return JSON.parse(promptText.slice(start).split('\n\n')[0]);
}

function makeResponder({ nominate, voteYes }) {
  return body => {
    const system = body.messages[0].content;
    const promptText = body.messages[1].content;
    const memory = parseMemory(promptText);

    if (system.includes('Decide whether to publicly claim')) {
      // Not this test's concern (see dryRunClaims.js / phase 2a) — always
      // decline, so claims never interfere with reading the execution
      // outcome. claimedCharacterId/statement are required by the schema
      // regardless, but llmBotClaim never reads them once shouldClaim is
      // false (same "required but ignored" contract its own comment
      // documents), so any placeholder value is harmless here.
      return { reasoning: 'test', shouldClaim: false, claimedCharacterId: 'imp', statement: '' };
    }

    if (system.includes('deciding whether to nominate')) {
      const others = memory.alivePlayers.filter(p => p.name !== memory.you.name);
      if (!nominate || !others.length) {
        return { reasoning: 'test', shouldNominate: false, nomineeId: others[0] ? others[0].id : 'none' };
      }
      // Always targets Marcus specifically when he's still alive (every
      // bot agrees, regardless of shuffle order, so the actual nominator
      // doesn't matter) — falls back to whoever's first otherwise, so
      // this stays deterministic even if Marcus happens to die at night
      // before day 1 ever runs.
      const marcus = others.find(p => p.name === 'Marcus');
      const target = marcus || others[0];
      return { reasoning: 'test', shouldNominate: true, nomineeId: target.id };
    }

    if (system.includes('deciding how to vote')) {
      return { reasoning: 'test', vote: voteYes ? 'yes' : 'no' };
    }

    throw new Error('Unrecognized system prompt in test mock: ' + system.slice(0, 80));
  };
}

async function runScenario(label, { nominate, voteYes }, assertFn) {
  const mock = await startMockOllama(makeResponder({ nominate, voteYes }));
  const server = await startServer({ env: { LLM_PROVIDER: 'ollama', OLLAMA_HOST: mock.baseUrl } });
  try {
    await request(server.baseUrl, '/api/sim/start', {
      method: 'POST',
      body: { players: 5, speed: 2, script: 'tb', config: { llmStorytellerEnabled: true } },
    });
    await assertFn(server);
  } finally {
    await server.stop();
    await mock.stop();
  }
}

(async () => {
  await runScenario(
    'nomination + unanimous yes votes',
    { nominate: true, voteYes: true },
    async server => {
      const state = await waitUntil(async () => {
        const { json } = await request(server.baseUrl, '/api/host-state');
        return (json.deaths && json.deaths.some(d => d.cause === 'execution')) ? json : null;
      }, 15000);

      check('an execution actually happens when every bot votes yes', !!state, 'no execution within 15s');
      if (state) {
        const executed = state.deaths.find(d => d.cause === 'execution');
        check('it happens on day 1 (every bot agrees to nominate immediately, so there is no reason to wait)',
          executed.night === 1, `executed on night ${executed.night}`);
      }
    },
  );

  await runScenario(
    'nobody ever nominates',
    { nominate: false, voteYes: true },
    async server => {
      // No positive event to wait for here (the whole point is that
      // nothing happens) — give the sim a few real seconds to run through
      // at least a couple of day phases, then confirm no execution was
      // ever recorded despite every bot voting yes on principle: with
      // nominate:false, no nomination is ever reached, so the vote
      // responder never actually gets called at all. Longer than
      // dryRunClaims.js's own wait: this scenario makes up to 10 real
      // sequential HTTP round trips (5 claim + 5 nominate calls) before a
      // single day resolves, not one.
      await new Promise(r => setTimeout(r, 8000));
      const { json: state } = await request(server.baseUrl, '/api/host-state');
      check('no execution ever happens when every bot declines to nominate',
        !state.deaths.some(d => d.cause === 'execution'), JSON.stringify(state.deaths));
      check("the day still actually advances (this isn't just a stalled/hung day phase)",
        state.nightNumber >= 2 || state.phase === 'over', `nightNumber=${state.nightNumber}, phase=${state.phase}`);
    },
  );

  await runScenario(
    'a real nomination, but the vote never reaches threshold',
    { nominate: true, voteYes: false },
    async server => {
      await new Promise(r => setTimeout(r, 8000));
      const { json: state } = await request(server.baseUrl, '/api/host-state');
      check('no execution happens when every bot votes no, even though someone was nominated',
        !state.deaths.some(d => d.cause === 'execution'), JSON.stringify(state.deaths));
      check('the day still actually advances',
        state.nightNumber >= 2 || state.phase === 'over', `nightNumber=${state.nightNumber}, phase=${state.phase}`);
    },
  );

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
