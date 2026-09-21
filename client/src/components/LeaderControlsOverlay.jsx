import { useEffect, useState } from 'react';
import { useLeaderState, isHostCodeError } from '../hooks/useLeaderState.js';
import { leadingNominee } from '../lib/leadingNominee.js';
import { post } from '../lib/api.js';

const PHASE_LABEL = { lobby: 'Lobby', reveal: 'Revealing roles', night: 'Night', day: 'Day', over: 'Game over' };

/** The lobby leader's stand-in for the host TV's right-hand control panel
    (ControlPanelRow/NominateAction/DayActions) — for a table with no
    designated Storyteller, someone still has to trigger these, and this
    lets whoever took the first seat do it from their own phone instead of
    walking up to the screen. Drives itself off the same /api/host-state
    the TV uses (see useLeaderState.js) and posts to the exact same
    /api/table/* routes — nothing here is a separate code path from what
    the host screen already does, just a second place to tap it from.
    Deliberately shows only the same aggregate, already-public state the
    TV shows (who's alive, nominations, phase) — never a character or team
    before g.revealed, same as everyone else at this table. */
export default function LeaderControlsOverlay({ open, onClose }) {
  const S = useLeaderState(open);
  const [busy, setBusy] = useState(false);
  const [hostCodeNeeded, setHostCodeNeeded] = useState(false);

  // Same iOS-background-scroll guard ScriptOverlay.jsx already uses.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const run = (route, body, confirmMsg, onSuccess) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    post(route, body).then(r => {
      setBusy(false);
      if (isHostCodeError(r)) { setHostCodeNeeded(true); return; }
      if (r && r.error) { alert(r.error); return; }
      if (onSuccess) onSuccess(r);
    });
  };

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="overlay-card">
        <div className="overlay-head">
          <h2>Storyteller controls</h2>
          <button type="button" className="linklike" onClick={onClose}>Close</button>
        </div>
        <div className="overlay-scroll">
          {!S && <p className="dim small">Connecting…</p>}
          {hostCodeNeeded && (
            <p className="dim small">
              This table requires a host code before these controls will work. Open{' '}
              <a className="linklike-a" href="/enter-host-code.html" target="_blank" rel="noreferrer">/enter-host-code.html</a>{' '}
              on this phone, enter it once, then try again.
            </p>
          )}
          {S && (
            <p className="dim small">
              {PHASE_LABEL[S.phase] || S.phase}
              {S.phase !== 'lobby' && S.nightNumber ? ` ${S.nightNumber}` : ''}
              {' · '}{S.players.length} seated{S.phase !== 'lobby' ? `, ${S.players.filter(p => p.alive).length} living` : ''}
            </p>
          )}
          {S && S.phase === 'lobby' && <LobbyControls S={S} busy={busy} run={run} />}
          {S && S.phase === 'day' && <DayControls S={S} busy={busy} run={run} />}
          {S && <AlwaysControls busy={busy} run={run} />}
        </div>
      </div>
    </div>
  );
}

function LobbyControls({ S, busy, run }) {
  const count = S.players.length;
  const canStart = count >= 5;
  return (
    <div className="card">
      <button type="button" className="primary" disabled={busy || !canStart} onClick={() => run('/api/table/deal', {})}>
        {canStart ? 'Start game' : `Start game (need ${5 - count} more)`}
      </button>
      <button
        type="button"
        disabled={busy || !count}
        onClick={() => run('/api/table/clear-lobby', {}, `Remove all ${count} seated player${count === 1 ? '' : 's'} and start the count over?`)}
      >
        Clear the lobby
      </button>
    </div>
  );
}

function DayControls({ S, busy, run }) {
  const alive = S.players.filter(p => p.alive);
  const nightNumber = S.nightNumber;
  const anyOpen = S.nominations.some(n => n.day === nightNumber && !n.closed);

  const [nominatorId, setNominatorId] = useState(() => alive[0]?.id || '');
  const [nomineeId, setNomineeId] = useState(() => alive[0]?.id || '');
  const [executeId, setExecuteId] = useState('');

  const autoWinner = leadingNominee(S.nominations, nightNumber, alive);
  const effectiveExecuteId = executeId || autoWinner || '';
  const effectivePlayer = alive.find(p => p.id === effectiveExecuteId);

  return (
    <>
      {!anyOpen && alive.length >= 2 && (
        <div className="card">
          <div className="nomrow">
            <select value={nominatorId} onChange={e => setNominatorId(e.target.value)}>
              {alive.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span aria-hidden="true"> → </span>
            <select value={nomineeId} onChange={e => setNomineeId(e.target.value)}>
              {alive.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('/api/table/nominate', { nominatorId, nomineeId }, null, r => {
              if (r.virginFired) alert('The Virgin was nominated by a Townsfolk — the nominator is executed immediately.');
            })}
          >
            Open for voting
          </button>
        </div>
      )}
      <div className="card">
        <select value={effectiveExecuteId} onChange={e => setExecuteId(e.target.value)}>
          <option value="">No execution</option>
          {alive.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          type="button"
          className="primary"
          disabled={busy || anyOpen}
          onClick={() => run(
            '/api/table/execute',
            { playerId: effectiveExecuteId || null },
            `Execute ${effectivePlayer ? effectivePlayer.name : 'this player'}?`,
          )}
        >
          Kick player
        </button>
        <button type="button" disabled={busy || anyOpen || S.mastermindExtraDay} onClick={() => run('/api/table/night', {})}>
          Night falls
        </button>
      </div>
    </>
  );
}

function AlwaysControls({ busy, run }) {
  return (
    <div className="card">
      <button type="button" disabled={busy} onClick={() => run('/api/table/reveal', {}, 'End the game and reveal every role?')}>
        Reveal
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => run('/api/table/reset', {}, 'Clear the table and start over?', () => location.reload())}
      >
        New game
      </button>
    </div>
  );
}
