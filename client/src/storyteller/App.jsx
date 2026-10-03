import { useEffect, useState, useCallback } from 'react';
import CodeGate, { alreadyAuthed } from './CodeGate.jsx';
import LobbyPanel from './LobbyPanel.jsx';
import NightPanel from './NightPanel.jsx';
import NightDraftReview from './NightDraftReview.jsx';
import DayPanel from './DayPanel.jsx';
import { api } from './api.js';

/** Polling, not an EventSource — every state change on this screen is
    something the Storyteller themselves just triggered (there's no bot or
    LLM moving the game along on its own the way Core/LLM Mode's host
    screen has to watch for), so a short poll after every action is simple,
    correct, and good enough for a first version. A live SSE connection
    (the same /host-events stream the TV already has) is a reasonable
    future upgrade, not a correctness requirement. */
const POLL_MS = 2000;

export default function App() {
  const [authed, setAuthed] = useState(null); // null = still checking
  const [hostState, setHostState] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    alreadyAuthed().then(setAuthed);
  }, []);

  const refresh = useCallback(() => {
    api.hostState().then(setHostState).catch(e => setError(e.message));
  }, []);

  // Switching the table into Assist mode is what actually unlocks every
  // other host-tier route for this cookie (see blockedByGate's own comment
  // in server.js) — /api/table/config is the one deliberate exception
  // reachable regardless of current mode, specifically so this can happen
  // the instant the console considers itself authed, not as a step tied to
  // CodeGate's own form submit. That distinction matters: with no
  // STORYTELLER_CODE set at all, the gate is off entirely (the same
  // LAN-only default every other code in this app already has) and
  // alreadyAuthed() resolves true immediately — CodeGate never renders,
  // so anything wired to its own onEntered would silently never run.
  // Idempotent and harmless to repeat (mode is lobby-only in
  // applyConfigPatch, so this silently no-ops once a game is already under
  // way) — safe to fire on every mount, gate on or off alike.
  useEffect(() => {
    if (!authed) return;
    api.setConfig({ mode: 'assist' }).catch(() => {});
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [authed, refresh]);

  if (authed === null) return null; // avoid a flash of the gate while checking
  if (!authed) return <CodeGate onEntered={() => setAuthed(true)} />;
  if (!hostState) return <div className="st-loading">Loading the table…</div>;

  return (
    <div className="st-app">
      <header className="st-header">
        <h1>Storyteller Console</h1>
        <span className="st-phase">{hostState.phase}</span>
      </header>
      {error && <div className="st-error st-error-banner">{error}</div>}
      <main className="st-main">
        {hostState.phase === 'lobby' && <LobbyPanel hostState={hostState} onChange={refresh} onError={setError} />}
        {hostState.phase === 'reveal' && (
          <div className="st-panel">
            <p>Roles are dealt. Reveal cards are showing on the TV — once the table's ready, begin the night.</p>
            <button onClick={() => api.startNight().then(refresh).catch(e => setError(e.message))}>Begin night 1</button>
          </div>
        )}
        {hostState.phase === 'night' && hostState.nightPendingConfirmation && (
          <NightDraftReview hostState={hostState} onChange={refresh} onError={setError} />
        )}
        {hostState.phase === 'night' && !hostState.nightPendingConfirmation && (
          <NightPanel hostState={hostState} onChange={refresh} onError={setError} />
        )}
        {hostState.phase === 'day' && <DayPanel hostState={hostState} onChange={refresh} onError={setError} />}
        {hostState.phase === 'over' && (
          <div className="st-panel">
            <h2>{hostState.victory ? (hostState.victory.winner === 'good' ? 'Good wins' : 'Evil wins') : 'Game over'}</h2>
            {hostState.victory && <p>{hostState.victory.reason}</p>}
            <button onClick={() => { if (confirm('Start a new game? This resets the table.')) api.reset().then(refresh).catch(e => setError(e.message)); }}>
              New game
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
