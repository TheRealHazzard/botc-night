'use strict';

/* Hits the real /api/nanoleaf/* routes through a real server process — no
   physical panels needed. game/nanoleaf.js's own unit tests (test/
   nanoleaf.js) cover the request/response logic against a mocked fetch;
   this proves the routes are actually wired up and that pairing against
   an address nothing's listening on fails cleanly within the timeout
   instead of hanging the request (or the server) forever. */

const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

(async () => {
  const server = await startServer();
  try {
    const status = await request(server.baseUrl, '/api/nanoleaf/status');
    check('a fresh table (isolated temp DATA_DIR) reports an empty device list', status.status === 200 && Array.isArray(status.json.devices) && status.json.devices.length === 0, JSON.stringify(status.json));

    const noIp = await request(server.baseUrl, '/api/nanoleaf/pair', { method: 'POST', body: {} });
    check('pairing with no IP fails cleanly, not a 500', noIp.status === 200 && noIp.json.ok === false, JSON.stringify(noIp));

    // 192.0.2.1 is TEST-NET-1 (RFC 5737) — reserved for documentation/
    // testing, guaranteed nothing real is listening there. This exercises
    // the actual network-timeout path end to end, not a mock of it.
    const start = Date.now();
    const badIp = await request(server.baseUrl, '/api/nanoleaf/pair', { method: 'POST', body: { ip: '192.0.2.1' } });
    const elapsedMs = Date.now() - start;
    check('pairing against an unreachable IP fails rather than hanging', badIp.status === 200 && badIp.json.ok === false, JSON.stringify(badIp));
    check('the failure returns within a bounded time, not stuck forever', elapsedMs < 15000, `${elapsedMs}ms`);

    const stillUnpaired = await request(server.baseUrl, '/api/nanoleaf/status');
    check('a failed pairing attempt never leaves the table looking paired', stillUnpaired.json.devices.length === 0, JSON.stringify(stillUnpaired.json));

    const forgetNothing = await request(server.baseUrl, '/api/nanoleaf/forget', { method: 'POST', body: { ip: '192.0.2.1' } });
    check('forgetting a device that was never paired is a no-op, not an error', forgetNothing.status === 200 && forgetNothing.json.ok === true, JSON.stringify(forgetNothing));

    // No real Nanoleaf on the CI/dev machine to actually find — this just
    // proves the route is wired up and the SSDP scan resolves within a
    // bounded time (it has its own internal timeout) instead of hanging
    // the request.
    const discoverStart = Date.now();
    const discover = await request(server.baseUrl, '/api/nanoleaf/discover');
    const discoverElapsedMs = Date.now() - discoverStart;
    check('discover returns 200 with a devices array, even if empty', discover.status === 200 && Array.isArray(discover.json.devices), JSON.stringify(discover.json));
    check('discover resolves within a bounded time, not stuck forever', discoverElapsedMs < 10000, `${discoverElapsedMs}ms`);
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
