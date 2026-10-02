'use strict';

/* /spectate and /spectate-events — a read-only narration feed for people
   following along without a seat. Deliberately gated like a real
   player's own /events (the table code only), NOT like /host-events
   (which also needs the extra host code) — see isHostRoute()'s own
   comment in server.js. This drives the gate directly with real
   TABLE_CODE/HOST_CODE env vars rather than going through
   /api/enter-table-code, since the cookie it sets is just the same
   sha256 hex hash computed here. */

const crypto = require('crypto');
const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function codeHash(code) { return crypto.createHash('sha256').update(String(code)).digest('hex'); }

/** Reads just the first SSE event off a stream, then aborts the
    connection — this stream never closes on its own, so a plain
    res.text() would hang forever. */
async function firstSseEvent(url, cookie) {
  const controller = new AbortController();
  const res = await fetch(url, { headers: cookie ? { Cookie: cookie } : undefined, signal: controller.signal });
  if (!res.ok) { controller.abort(); return { status: res.status, text: null }; }
  const reader = res.body.getReader();
  const { value } = await reader.read();
  controller.abort();
  return { status: res.status, text: Buffer.from(value).toString('utf8') };
}

(async () => {
  const tableCookie = `table_code=${codeHash('open-sesame')}`;
  const hostCookie = `host_code=${codeHash('super-secret')}`;
  const server = await startServer({ env: { TABLE_CODE: 'open-sesame', HOST_CODE: 'super-secret' } });
  try {
    const noCookie = await fetch(`${server.baseUrl}/spectate`);
    const noCookieText = await noCookie.text();
    check('no cookie at all -> blocked by the table-code gate (served the code-entry page, not spectate.html)',
      !noCookieText.includes('spectate-events'), noCookieText.slice(0, 80));

    const hostOnly = await fetch(`${server.baseUrl}/spectate`, { headers: { Cookie: hostCookie } });
    const hostOnlyText = await hostOnly.text();
    check('the HOST code alone is not enough — table code is the operative gate here, not the host one',
      !hostOnlyText.includes('spectate-events'), hostOnlyText.slice(0, 80));

    const withTable = await fetch(`${server.baseUrl}/spectate`, { headers: { Cookie: tableCookie } });
    const withTableText = await withTable.text();
    check('the TABLE code alone is enough — same privilege level as a real player', withTable.status === 200);
    check('...and actually serves spectate.html, not the code-entry page', withTableText.includes('spectate-events'));

    const streamNoCookie = await firstSseEvent(`${server.baseUrl}/spectate-events`, null);
    check('/spectate-events itself is also table-code gated when hit directly, not just the page', streamNoCookie.text === null || !streamNoCookie.text.includes('"phase"'));

    const streamWithTable = await firstSseEvent(`${server.baseUrl}/spectate-events`, tableCookie);
    check('with the table cookie, /spectate-events streams real game state on connect',
      streamWithTable.text && streamWithTable.text.includes('"phase"'), streamWithTable.text);
    // Parses the SSE frame's own data: line back into JSON to confirm it's
    // the real publicState()/hostState() shape, not just a string that
    // happens to contain "phase" — pre-reveal safety itself (no
    // characterId/team per seat) is already proven generically for this
    // same function in test/server/wave2PrivacyLeak.js; this only needs to
    // confirm THIS route is actually wired to it.
    const dataLine = streamWithTable.text && streamWithTable.text.split('\n').find(l => l.startsWith('data:'));
    const parsed = dataLine && JSON.parse(dataLine.slice(5));
    check('the broadcast frame parses as real JSON with a players array', parsed && Array.isArray(parsed.players), JSON.stringify(parsed));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
