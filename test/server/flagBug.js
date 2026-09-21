'use strict';

/* Act II: an in-app way to flag "something's wrong here" mid-game, for a
   beta tester who isn't running a Claude Code session — captures the full
   server-side game state to a file the table operator can read afterward.
   Verifies the report actually lands on disk, in the isolated test
   DATA_DIR (not the real one), with the shape the button's own client
   code relies on. */

const fs = require('fs');
const path = require('path');
const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function latestReport(dataDir) {
  const dir = path.join(dataDir, 'bug-reports');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  return { dir, files, latest: files.length ? JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8')) : null };
}

(async () => {
  const server = await startServer();
  try {
    const { json: joinRes } = await request(server.baseUrl, '/api/join', { method: 'POST', body: { name: 'Tester' } });

    const flagRes = await request(server.baseUrl, '/api/flag-bug', {
      method: 'POST',
      body: { token: joinRes.token, note: 'the vote count looked off' },
    });
    check('flagging a bug is accepted', flagRes.json.ok === true, JSON.stringify(flagRes.json));

    const { dir, files, latest } = latestReport(server.dataDir);
    check('bug-reports/ was created under the isolated DATA_DIR, not the real one', fs.existsSync(dir) && dir.startsWith(server.dataDir), dir);
    check('exactly one report file exists', files.length === 1, `${files.length} files`);
    check('the report captures who flagged it', !!latest && latest.flaggedBy === 'Tester', JSON.stringify(latest && latest.flaggedBy));
    check('the report captures the note, trimmed', !!latest && latest.note === 'the vote count looked off', JSON.stringify(latest && latest.note));
    check('the report captures a real game snapshot (players present)', !!latest && Array.isArray(latest.game && latest.game.players) && latest.game.players.length === 1, JSON.stringify(latest && latest.game && latest.game.players));
    check('the report has a timestamp', !!latest && typeof latest.at === 'string' && !Number.isNaN(Date.parse(latest.at)), latest && latest.at);

    // An unauthenticated report (no token — e.g. a stale/expired session)
    // is still worth capturing, not rejected outright.
    const anonRes = await request(server.baseUrl, '/api/flag-bug', { method: 'POST', body: { note: 'no token, still worth logging' } });
    check('a report with no token is still accepted', anonRes.json.ok === true, JSON.stringify(anonRes.json));
    const afterAnon = latestReport(server.dataDir);
    check('the anonymous report is captured with flaggedBy: null, not rejected or crashed', afterAnon.files.length === 2 && afterAnon.latest.flaggedBy === null, JSON.stringify(afterAnon.latest && afterAnon.latest.flaggedBy));
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
