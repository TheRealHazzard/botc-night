'use strict';

/* Spawns the real server.js as a real child process and drives it over
   real HTTP — the same thing this whole session's own bug-hunting did by
   hand via curl, formalized into a reusable harness. Deliberately not a
   refactor of server.js into an importable module: it calls
   server.listen() immediately with no require.main guard and no exports,
   and reshaping 2600 lines of currently-untested, currently-working code
   just to make it importable would itself need the very safety net this
   effort exists to build. This tests the true deployed artifact, not a
   parallel implementation of it. */

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER_PATH = path.join(__dirname, '..', '..', 'server.js');

/** A free port, found by briefly binding to port 0 ourselves and reading
    back whatever the OS assigned, then releasing it immediately before the
    child binds the same number. A small window for another process to grab
    it first, same tradeoff every "find a free port" test helper makes —
    not worth a full retry-loop for what's otherwise a sequential, single-
    machine test run. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Spawns a real server.js against an isolated temp DATA_DIR (see
    game/history.js's own DATA_DIR override) and an ephemeral port, off by
    default for the LLM path (LLM_PROVIDER unset) — this suite is for
    engine/server correctness, hermetic and fast, not live-model behavior,
    which stays the manual spot-check category it's been all session.
    Resolves once /api/host-state actually answers, or rejects fast if the
    child dies first (e.g. the port really was taken after all) rather than
    waiting out the full timeout either way. */
async function startServer({ env = {} } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botc-night-test-'));
  const port = await findFreePort();
  const baseUrl = `http://localhost:${port}`;

  const child = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      LLM_PROVIDER: '',
      ANTHROPIC_API_KEY: '',
      // Spread last, after the blank defaults above — a caller that
      // actually wants a live LLM path exercised (see llmDryRunExecution.js
      // and harness.js's own startMockOllama) needs its own LLM_PROVIDER/
      // OLLAMA_HOST to really take effect, not get silently overwritten by
      // them. This parameter existed but was never actually wired into the
      // spawned env at all until now — nothing else in this suite passes
      // it, so every other test's always-blank default is unaffected.
      ...env,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });

  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });

  const deadline = Date.now() + 8000;
  let lastErr = null;
  while (Date.now() < deadline) {
    if (exited) {
      fs.rmSync(dataDir, { recursive: true, force: true });
      throw new Error(`server.js exited before becoming ready (code ${exited.code}, signal ${exited.signal})\nstderr:\n${stderr}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/host-state`);
      if (res.ok) {
        return {
          baseUrl,
          dataDir,
          getStderr: () => stderr,
          stop: () => stopServer(child, dataDir),
        };
      }
    } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 150));
  }
  child.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
  throw new Error(`server never became ready on ${baseUrl}: ${lastErr ? lastErr.message : 'no response'}\nstderr:\n${stderr}`);
}

/** Waits for the child to actually exit (not just for kill() to be called —
    that only sends the signal) before removing its data directory, rather
    than tearing both down at once. The fallback timer covers the unlikely
    case the child never signals exit; it's unref'd and cleared on finish
    so it can't itself become a dangling handle. (The real fix for an
    intermittent Windows-only crash this surfaced — "Assertion failed:
    !(handle->flags & UV_HANDLE_CLOSING)" appearing well after every real
    check had already passed, corrupting an otherwise-passing run's exit
    code — turned out to be in each test file's own teardown, not here:
    calling process.exit() forces Node to tear down the event loop
    immediately, racing whatever handles (this child, fetch's own
    connection pool, ...) hadn't finished closing yet. Every test file now
    sets process.exitCode and lets the process exit on its own instead.) */
function stopServer(child, dataDir) {
  return new Promise(resolve => {
    let done = false;
    let fallback;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(fallback);
      fs.rmSync(dataDir, { recursive: true, force: true });
      resolve();
    };
    child.once('exit', finish);
    fallback = setTimeout(finish, 2000);
    fallback.unref();
    child.kill();
  });
}

/** {status, json} — a thin wrapper over fetch, matching this project's own
    stated no-SDK-needed convention (game/llmStoryteller.js's own header
    comment): Node's built-in fetch is already everything a JSON API needs. */
async function request(baseUrl, routePath, { method = 'GET', body } = {}) {
  const res = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* not every route returns a JSON body */ }
  return { status: res.status, json };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Every living player gets a real-or-decoy prompt every night by design
    (see promptFor in game/engine.js) — read each one's own /api/state and
    answer with a random valid target, so this stays roster-agnostic
    instead of hand-coding per-character behavior.

    Two real bugs this random choice has produced, both fixed here once
    rather than in each test file that used to keep its own copy:
    (1) "always pick the first listed target" could deterministically make
    the same Poisoner re-poison the same Imp forever, since target order
    is stable night to night — fixed by shuffling. (2) A properly random
    pick can still choose to SELF-target — legal for most abilities, but
    for the Imp specifically that's a real star-pass, and if its own
    Poisoner happened to have died earlier in the SAME random-targeting
    run, there's nobody left to inherit it, ending the game as a good win
    the test never expects. A real evil player's own bot logic
    (server.js's botChoice()) already avoids exactly this by never
    self-targeting while another option exists; this mirrors that one
    rule, without needing this HTTP-only test to also know who's evil
    (a real privacy boundary /api/state correctly never exposes mid-game). */
async function answerAllNightPrompts(baseUrl, tokens) {
  for (const token of tokens) {
    const { json: state } = await request(baseUrl, `/api/state?token=${token}`);
    if (!state.you.alive || !state.prompt || state.submitted) continue;
    const pool = state.prompt.targets.filter(t => t.id !== state.you.id);
    const candidates = pool.length >= state.prompt.count ? pool : state.prompt.targets;
    const targets = shuffle(candidates).slice(0, state.prompt.count).map(t => t.id);
    const body = { token, targets };
    if (state.prompt.guessCharacter && state.prompt.characterOptions && state.prompt.characterOptions.length) {
      body.characterGuess = shuffle(state.prompt.characterOptions)[0].id;
    }
    const r = await request(baseUrl, '/api/action', { method: 'POST', body });
    if (r.json && r.json.error) throw new Error(`/api/action for ${token} failed: ${r.json.error}`);
  }
}

/** A minimal stand-in for a local Ollama server, so an LLM-backed code path
    (bot claim/nominate/vote reasoning, the whim judge, Gossip/Savant/
    Artist) can be driven through its REAL network call and REAL response
    parsing — not just the "LLM off" fallback this harness's own
    startServer() otherwise forces every test down (see its own comment:
    LLM_PROVIDER/ANTHROPIC_API_KEY are blanked by default, deliberately,
    for a hermetic suite with no live model and no per-call cost).
    Point a test's own startServer() at this instead, via
    `env: { LLM_PROVIDER: 'ollama', OLLAMA_HOST: mock.baseUrl }`.

    `responder(requestBody)` receives the exact body askOllama() sent
    ({model, messages, stream, format, options}) and returns the plain
    object to hand back as the model's reply — this mock does the JSON
    stringify/wrap into Ollama's own `{message:{content}}` response shape,
    so a test's responder only has to reason about this project's own
    request/response contract, not Ollama's transport details. Throw from
    `responder` (or return undefined) to simulate a malformed/failed call —
    the mock answers 500 in that case, which askOllama() already turns
    into `{ok:false, reason:'http-500'}` the same as a real outage would. */
function startMockOllama(responder) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method !== 'POST' || !req.url.endsWith('/api/chat')) {
        res.writeHead(404).end();
        return;
      }
      let raw = '';
      req.on('data', c => { raw += c; });
      req.on('end', () => {
        let reply;
        try {
          const body = JSON.parse(raw);
          reply = responder(body);
        } catch (e) { reply = undefined; }
        if (reply === undefined) { res.writeHead(500).end(); return; }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: { content: JSON.stringify(reply) } }));
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        stop: () => new Promise(r => server.close(r)),
      });
    });
  });
}

module.exports = { startServer, request, shuffle, answerAllNightPrompts, startMockOllama };
