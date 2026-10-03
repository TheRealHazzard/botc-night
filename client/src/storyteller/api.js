// Every network call the Storyteller Console makes — one place, same
// convention client/src/lib/api.js's own post() already established for
// the player app. Auth rides on the storyteller_code cookie the browser
// already holds (set by /api/enter-storyteller-code, see CodeGate.jsx);
// nothing here ever sends a token, since the whole point of this app is
// acting on a player's behalf without needing theirs (ROADMAP.md's
// three-mode rollout, Phase 3).

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* not every route returns one */ }
  if (!res.ok) throw new Error((json && json.error) || `${path} failed (${res.status})`);
  return json;
}

async function get(path) {
  const res = await fetch(path);
  let json = null;
  try { json = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) throw new Error((json && json.error) || `${path} failed (${res.status})`);
  return json;
}

export const api = {
  enterCode: (code) => post('/api/enter-storyteller-code', { code }),
  hostState: () => get('/api/host-state'),
  playerState: (playerId) => get(`/api/storyteller/state?playerId=${encodeURIComponent(playerId)}`),

  join: (name) => post('/api/join', { name }),
  setScript: (body) => post('/api/table/script', body),
  setConfig: (config) => post('/api/table/config', { config }),
  deal: (presetAssignment) => post('/api/table/deal', presetAssignment ? { presetAssignment } : undefined),
  startNight: () => post('/api/table/night'),
  reset: () => post('/api/table/reset'),

  submitAction: (playerId, targets, characterGuess) =>
    post('/api/storyteller/action', { playerId, targets, characterGuess }),
  nominate: (nominatorId, nomineeId) => post('/api/storyteller/nominate', { nominatorId, nomineeId }),
  vote: (playerId, vote) => post('/api/storyteller/vote', { playerId, vote }),
  execute: (playerId) => post('/api/table/execute', { playerId }),
  tally: () => post('/api/table/tally'),

  nightDraft: () => get('/api/storyteller/night-draft'),
  overrideWhims: (overrides) => post('/api/storyteller/override-whims', { overrides }),
  confirmNight: () => post('/api/storyteller/confirm-night'),

  claimContext: () => get('/api/storyteller/claim-context'),
  gossipClaim: (body) => post('/api/storyteller/gossip-claim', body),
  artistQuestion: (body) => post('/api/storyteller/artist-question', body),
};
