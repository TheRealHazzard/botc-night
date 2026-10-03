'use strict';

/* Phase 3 step 5 (ROADMAP.md's "Phase 3 Design" doc): in Storyteller
   Assist mode, the storyteller cookie satisfies the SAME host-tier gate
   the TV device uses, so the Storyteller Console can deal/start nights/
   execute without a second set of wrapper routes mirroring every
   /api/table/* action. Verifies the one thing that actually matters about
   that shortcut: it only ever applies while the table is really running
   Assist mode — a storyteller_code holder gets no new power at all on a
   Core or LLM Mode table, where there is never a reason to accept it. */

const crypto = require('crypto');
const { startServer, request } = require('./harness.js');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

function codeHash(code) { return crypto.createHash('sha256').update(String(code)).digest('hex'); }

(async () => {
  const hostCookie = `host_code=${codeHash('host-secret')}`;
  const tableCookie = `table_code=${codeHash('table-secret')}`;
  const storytellerCookie = `storyteller_code=${codeHash('narrator-secret')}`;
  const server = await startServer({ env: { HOST_CODE: 'host-secret', TABLE_CODE: 'table-secret', STORYTELLER_CODE: 'narrator-secret' } });
  const asTable = (route, body) => fetch(`${server.baseUrl}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: `${tableCookie}; ${storytellerCookie}` }, body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));
  const asHost = (route, body) => fetch(`${server.baseUrl}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', Cookie: `${tableCookie}; ${hostCookie}` }, body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));

  try {
    // Real host code always works, mode notwithstanding — unaffected baseline.
    const hostWorks = await asHost('/api/table/reset', {});
    check('the real host code still works as always (Core mode, the default)', hostWorks.status === 200);

    // Storyteller cookie alone, Core mode (the default right after reset): must NOT satisfy the host gate.
    const storytellerBlockedInCore = await asTable('/api/table/script', { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] });
    check('the storyteller cookie grants NO host-tier access on a Core-mode table', storytellerBlockedInCore.status === 401);

    // The bootstrap exception: /api/table/config itself is reachable with
    // JUST the storyteller cookie even on a fresh Core-mode table — the
    // one door that has to stay open before the real shortcut above can
    // ever apply.
    const storytellerBootstraps = await asTable('/api/table/config', { config: { mode: 'assist' } });
    check('the storyteller cookie alone can switch a Core-mode table into Assist mode — the one bootstrap exception', storytellerBootstraps.status === 200, JSON.stringify(storytellerBootstraps.json));

    // Confirm the exception is genuinely narrow: the storyteller cookie
    // still can't reach a DIFFERENT host-tier route while mode is Core.
    await asHost('/api/table/config', { config: { mode: 'core' } });
    const stillBlockedElsewhere = await asTable('/api/table/script', { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] });
    check('...but that exception covers only /api/table/config itself, nothing else, while mode is Core', stillBlockedElsewhere.status === 401);

    const switched = await asHost('/api/table/config', { config: { mode: 'assist' } });
    check('switching to assist mode via the real host code works normally too', switched.status === 200);

    // Now the storyteller cookie alone (no host cookie at all) should satisfy host-tier routes.
    const storytellerWorksInAssist = await asTable('/api/table/script', { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] });
    check('once the table is actually running assist mode, the storyteller cookie alone unlocks host-tier routes', storytellerWorksInAssist.status === 200, JSON.stringify(storytellerWorksInAssist.json));

    // request() (harness.js) sends no cookies at all — since this test
    // actually sets TABLE_CODE, joining needs the table cookie attached
    // the same way asTable()/asHost() already do, or the table gate
    // silently blocks every join.
    for (const name of ['Ada', 'Bo', 'Cy', 'Di', 'Ev']) {
      await fetch(`${server.baseUrl}/api/join`, {
        method: 'POST', headers: { 'content-type': 'application/json', Cookie: tableCookie }, body: JSON.stringify({ name }),
      });
    }
    const dealt = await asTable('/api/table/deal', {});
    check('...including dealing itself — the Storyteller genuinely runs the whole game in this mode', dealt.status === 200, JSON.stringify(dealt.json));

    // /api/table/reset deliberately carries config (including mode) across
    // a reset — explicitly, so a host's own dial-in settings survive a
    // "new game" mid-sitting — so the storyteller cookie staying valid
    // right after THIS reset is the correct behavior, not a leak. Switch
    // back to Core explicitly (via the real host code) to prove the
    // shortcut really does track live mode, not just "was ever assist."
    await asHost('/api/table/reset', {});
    const stillWorksRightAfterReset = await asTable('/api/table/script', { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] });
    check('right after a reset, mode (assist) carried over with the rest of config — the storyteller cookie correctly still works', stillWorksRightAfterReset.status === 200);

    await asHost('/api/table/config', { config: { mode: 'core' } });
    const blockedAgain = await asTable('/api/table/script', { customRoster: ['chef', 'empath', 'investigator', 'poisoner', 'imp'] });
    check('once the table is explicitly switched back to Core mode, the storyteller cookie loses host-tier access again', blockedAgain.status === 401);
  } finally {
    await server.stop();
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exitCode = failures ? 1 : 0;
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
