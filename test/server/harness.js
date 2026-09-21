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

function stopServer(child, dataDir) {
  child.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
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

module.exports = { startServer, request };
