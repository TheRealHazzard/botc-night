'use strict';

/* /tabletop is a read-only, big-text second screen (public/tabletop.html)
   meant for a TV/tablet the whole table can see — see server.js's own
   comment on the route. It rides the same host-gated path as /host itself
   (added to isHostRoute()'s list), not the open GATE_EXEMPT hole /recap
   uses, since it depends on /host-events which is already host-gated. This
   just confirms the route actually serves the file and wires it to the
   live stream it needs — the file's own rendering logic has no server-side
   behavior to test here. */

const { startServer } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

(async () => {
  const server = await startServer();
  try {
    const res = await fetch(`${server.baseUrl}/tabletop`);
    const text = await res.text();
    check('serves 200', res.status === 200, String(res.status));
    check('serves real HTML, not a 404 page', text.includes('<title>Tabletop Display</title>'));
    check('subscribes to the same live stream the host dashboard uses', text.includes("EventSource('/host-events')"));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
