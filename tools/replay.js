'use strict';

/*
 * Replay tool, slice 2: given a real game id, actually reproduce it —
 * spins up a fresh isolated server.js (test/server/harness.js's own
 * "test the true deployed artifact" pattern, reused rather than
 * reimplemented), injects the recorded setup directly (bypassing
 * dealRoles' own shuffle via presetAssignment), feeds every recorded
 * private action, nomination, vote, and execution back through the real
 * API in original order, and diffs the result against what actually
 * happened.
 *
 * Every id in the recorded game is the ORIGINAL server's own
 * crypto.randomBytes id — meaningless to this fresh instance, which
 * assigns its own on join. The one id-remapping step below (buildNameMap)
 * is what makes every other step possible: every recorded
 * privateActionLog/nomination/vote entry already carries a name
 * alongside its id (for exactly this reason — nothing else in this app
 * needed it before now), so a name is the one stable key that survives
 * the trip through a brand new server instance.
 *
 * Category-A rolls (output-only — Godfather's setup flip, Savant's
 * statement ordering, the impaired-info coin flip, the two Vortox
 * flips, the Minion fake-count roll) are deliberately left to re-roll
 * fresh during replay: nothing downstream of them branches on their
 * value, only resultsLog's display text does, and state fidelity (who's
 * alive, who wins) is this tool's actual job. See the plan this
 * implements for the full reasoning.
 *
 * Usage: node tools/replay.js <gameId>
 */

const H = require('../game/history');
const { startServer, request } = require('../test/server/harness.js');

function log(...args) { console.log(...args); }
// REPLAY_DEBUG=1: trace every night-phase transition and action
// submission — the actual debugging surface this tool exists for, not
// leftover scaffolding. `node tools/replay.js <gameId>` alone stays quiet
// unless (or until) something diverges.
const trace = process.env.REPLAY_DEBUG ? (...args) => log('  trace   ', ...args) : () => {};

/** Every recorded id this game ever produced, mapped to its seat name.
    startingAssignment (added alongside this driver) carries playerId
    specifically for this — the only complete source, since a seat with
    no active night ability (a Baron, say) never acts, nominates, or
    votes, and so never appears anywhere else with its id paired to a
    name, even though it can still be the TARGET of someone else's
    recorded action. privateActionLog/nominations/votes are scanned too,
    as the fallback for games recorded before startingAssignment carried
    ids at all — reduced fidelity (a silent victim like that stays
    unmappable) is the accepted cost for old data, same as everywhere
    else this driver falls back for it. */
function buildOriginalNameMap(record) {
  const nameById = new Map();
  for (const p of record.startingAssignment || []) if (p.playerId) nameById.set(p.playerId, p.seatName);
  for (const a of record.privateActionLog || []) nameById.set(a.playerId, a.playerName);
  for (const n of record.nominations || []) {
    nameById.set(n.nominatorId, n.nominatorName);
    nameById.set(n.nomineeId, n.nomineeName);
    for (const v of n.votes || []) nameById.set(v.playerId, v.playerName);
  }
  return nameById;
}

async function joinReplaySeats(baseUrl, record) {
  const byName = new Map(); // seatName -> {id, token}
  for (const seat of record.players) {
    const { json } = await request(baseUrl, '/api/join', { method: 'POST', body: { name: seat.seatName } });
    byName.set(seat.seatName, { id: json.playerId, token: json.token });
  }
  return byName;
}

function waitUntil(fn, timeoutMs, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (async function poll() {
      const result = await fn();
      if (result) return resolve(result);
      if (Date.now() > deadline) return reject(new Error('timed out waiting for replay to progress'));
      setTimeout(poll, intervalMs);
    })();
  });
}

async function replay(gameId) {
  const record = H.getGame(gameId);
  if (!record) throw new Error(`No such game: ${gameId}`);
  log(`Replaying ${gameId} (${record.edition}, ${record.playerCount} players, recorded winner: ${record.winner})`);

  const originalNameById = buildOriginalNameMap(record);

  // players[] carries each seat's FINAL characterId — a star-pass,
  // succession, or Barber/Snake Charmer/Pit-Hag swap can leave that
  // different from what it actually started as. startingAssignment (added
  // alongside this driver) is the real starting point; older games
  // recorded before it existed fall back to players[], accepting reduced
  // fidelity for any game with a mid-game reassignment.
  const startingAssignment = (record.startingAssignment && record.startingAssignment.length)
    ? record.startingAssignment
    : record.players.map(p => ({ seatName: p.seatName, characterId: p.characterId, believedId: p.believedId, statuses: p.statuses || {} }));

  const server = await startServer();
  try {
    await request(server.baseUrl, '/api/table/script', {
      method: 'POST',
      body: { customRoster: [...new Set([...startingAssignment, ...record.players].flatMap(p => [p.characterId, p.believedId]))] },
    });
    await request(server.baseUrl, '/api/table/config', {
      method: 'POST',
      body: { config: { voteWindowSeconds: 2, windowSeconds: 3, wave2Seconds: 2 } },
    });

    const seats = await joinReplaySeats(server.baseUrl, record);
    const remapId = originalId => {
      const name = originalNameById.get(originalId);
      const seat = name && seats.get(name);
      return seat ? seat.id : originalId; // unmapped ids (rare) pass through unchanged
    };

    const presetAssignment = startingAssignment.map(p => ({
      playerId: seats.get(p.seatName).id,
      characterId: p.characterId,
      believedId: p.believedId,
      statuses: p.statuses || {},
    }));
    const puzzlemasterId = record.puzzlemasterDrunkId ? remapId(record.puzzlemasterDrunkId) : null;

    const dealRes = await request(server.baseUrl, '/api/table/deal', {
      method: 'POST',
      body: {
        presetAssignment, puzzlemasterId,
        replayFeed: {
          decisions: (record.decisionLog || []).map(d => ({ tag: d.tag, value: d.value })),
          llmResponses: (record.llmLog || []).map(l => ({ kind: l.kind, ok: l.ok, data: l.data, reason: l.reason })),
        },
      },
    });
    if (!dealRes.json || !dealRes.json.ok) throw new Error(`presetAssignment deal failed: ${JSON.stringify(dealRes.json)}`);
    trace('dealt:', JSON.stringify(presetAssignment.map(p => p.characterId)));

    const nightsAndDays = Math.max(
      ...(record.privateActionLog || []).map(a => a.night),
      ...(record.nominations || []).map(n => n.day),
      1,
    );

    for (let night = 1; night <= nightsAndDays; night++) {
      const { json: hostBefore } = await request(server.baseUrl, '/api/host-state');
      if (hostBefore.phase === 'over') break;
      const nightRes = await request(server.baseUrl, '/api/table/night', { method: 'POST', body: {} });
      trace(`night ${night}: was ${hostBefore.phase}/${hostBefore.nightNumber} ->`, JSON.stringify(nightRes.json));

      // Keyed by name (never id — those are the ORIGINAL game's, useless
      // here) since a night can have at most one real submission per seat.
      const recordedByName = new Map(
        (record.privateActionLog || []).filter(a => a.night === night).map(a => [a.playerName, a]),
      );
      // Every LIVING seat needs something submitted, not just the ones
      // privateActionLog recorded: a character that doesn't truly act
      // tonight (the Imp on night 1, say) never enters actingTonight()'s
      // own loop at all — see game/engine.js's own gate — so its decoy
      // prompt is never logged, even though the live client still has to
      // answer it for allSubmitted() to ever close the window. Recorded
      // decoys hit the same "value never mattered" case for the same
      // reason (see below) — both fall back to any current valid answer.
      for (let pass = 0; pass < 2; pass++) {
        for (const seat of seats.values()) {
          const { json: state } = await request(server.baseUrl, `/api/state?token=${seat.token}`);
          if (!state.you.alive || !state.prompt || state.submitted) continue;
          const recorded = recordedByName.get(state.you.name);
          const targets = (recorded && !recorded.decoy)
            ? (recorded.targets || []).map(remapId)
            : state.prompt.targets.slice(0, state.prompt.count).map(t => t.id);
          const body = { token: seat.token, targets };
          if (recorded && recorded.characterGuess) body.characterGuess = recorded.characterGuess;
          const actionRes = await request(server.baseUrl, '/api/action', { method: 'POST', body });
          trace(`${state.you.name} (${state.you.character && state.you.character.id}): recorded ${recorded ? JSON.stringify(recorded.targets) + (recorded.decoy ? ' [decoy]' : '') : '(none)'}, submitted ${JSON.stringify(targets)} ->`, JSON.stringify(actionRes.json));
        }
      }

      const { json: hostAfterNight } = await request(server.baseUrl, '/api/host-state');
      if (hostAfterNight.phase === 'over') break;
      if (hostAfterNight.phase !== 'day') continue;

      for (const nom of (record.nominations || []).filter(n => n.day === night)) {
        await request(server.baseUrl, '/api/table/nominate', {
          method: 'POST',
          body: { nominatorId: remapId(nom.nominatorId), nomineeId: remapId(nom.nomineeId) },
        });
        for (const v of nom.votes || []) {
          await request(server.baseUrl, '/api/table/vote', {
            method: 'POST',
            body: { playerId: remapId(v.playerId), vote: v.vote },
          });
        }
        await waitUntil(async () => {
          const { json } = await request(server.baseUrl, '/api/host-state');
          const n = json.nominations.find(x => x.day === night && x.nomineeId === remapId(nom.nomineeId));
          return n && n.closed ? true : null;
        }, 4000).catch(() => {}); // a nomination the Golem/Virgin already resolved is closed instantly — fine either way
      }

      const executed = record.players.find(p => p.diedPhase === 'execution' && p.diedNight === night);
      const { json: hostBeforeExecute } = await request(server.baseUrl, '/api/host-state');
      if (hostBeforeExecute.phase === 'day') {
        await request(server.baseUrl, '/api/table/execute', {
          method: 'POST',
          body: { playerId: executed ? seats.get(executed.seatName).id : null },
        });
      }
    }

    await waitUntil(async () => {
      const { json } = await request(server.baseUrl, '/api/host-state');
      return json.phase === 'over' ? json : null;
    }, 10000).catch(() => null);

    const { json: final } = await request(server.baseUrl, '/api/host-state');
    return { record, final };
  } finally {
    await server.stop();
  }
}

function report(record, final) {
  const ok = [];
  const mismatches = [];
  const push = (label, matches, detail) => (matches ? ok : mismatches).push(detail ? `${label} — ${detail}` : label);

  push('reached "over"', final.phase === 'over', `got "${final.phase}"`);
  push('winner matches', final.victory && final.victory.winner === record.winner,
    `expected ${record.winner}, got ${final.victory && final.victory.winner}`);
  push('death count matches', (final.deaths || []).length === (record.players || []).filter(p => !p.alive).length,
    `expected ${(record.players || []).filter(p => !p.alive).length}, got ${(final.deaths || []).length}`);

  log(`\n${mismatches.length ? 'DIVERGED' : 'Reproduced cleanly'} — ${ok.length} matched, ${mismatches.length} diverged`);
  for (const m of mismatches) log(`  DIVERGED  ${m}`);
  for (const o of ok) log(`  ok        ${o}`);
  return mismatches.length === 0;
}

// Guarded so test/server/replaySuccession.js can require {replay, report}
// as a library, against its own already-running isolated server, without
// this also firing off a second, argv-less CLI invocation as a side
// effect of the require() itself.
if (require.main === module) {
  const gameId = process.argv[2];
  if (!gameId) {
    console.error('Usage: node tools/replay.js <gameId>');
    process.exitCode = 1;
  } else {
    replay(gameId)
      .then(({ record, final }) => { process.exitCode = report(record, final) ? 0 : 1; })
      .catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; });
  }
}

module.exports = { replay, report };
