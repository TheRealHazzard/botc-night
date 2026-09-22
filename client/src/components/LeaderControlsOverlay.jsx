import { useEffect, useState } from 'react';
import { useLeaderState, isHostCodeError } from '../hooks/useLeaderState.js';
import { leadingNominee } from '../lib/leadingNominee.js';
import { SECONDS_FIELDS } from '../lib/settingsFields.js';
import { useCommittedInput } from '../hooks/useCommittedInput.js';
import { post } from '../lib/api.js';
import { showToast } from '../lib/toast.js';

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
export default function LeaderControlsOverlay({ open, onClose, token, myId }) {
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
      if (r && r.error) { showToast(r.error); return; }
      if (onSuccess) onSuccess(r);
    });
  };

  const handOff = (toPlayerId, name) => {
    run('/api/table/hand-off-leader', { token, toPlayerId }, `Hand the Storyteller controls to ${name}? You'll lose access to this overlay.`, onClose);
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
          {/* Independent of whatever phase view is showing underneath, same
              reasoning as the host TV's own ReclaimBanner.jsx — a reconnect
              request can land mid-night and someone needs to see it
              immediately, not after the next phase change. Previously had
              no equivalent here at all: the exact table this overlay
              exists for (no dedicated Storyteller device) was the one
              table where a reconnecting player's request could never be
              approved — stuck on "Waiting…" forever. */}
          {S && S.pendingReclaims && S.pendingReclaims.length > 0 && (
            <ReclaimCard pendingReclaims={S.pendingReclaims} run={run} />
          )}
          {S && S.phase === 'lobby' && <LobbyControls S={S} busy={busy} run={run} />}
          {S && S.phase === 'reveal' && <RevealControls busy={busy} run={run} />}
          {S && S.phase === 'day' && <DayControls S={S} busy={busy} run={run} />}
          {/* Reveal/New game — matches the host TV exactly: ControlPanelRow
              (their real home) only ever mounts from RevealView/NightView/
              DayView/OverView, never LobbyView, which has its own dedicated
              Start game/Clear the lobby pair instead (LobbyControls above).
              Reveal specifically also has its own server-side phase guard
              now (/api/table/reveal), so this is UX clarity on top of a
              real fix, not the only thing stopping it. */}
          {S && S.phase !== 'lobby' && <AlwaysControls busy={busy} run={run} />}
          {S && <SettingsCard S={S} run={run} />}
          {S && <HandOffControl S={S} myId={myId} busy={busy} handOff={handOff} />}
        </div>
      </div>
    </div>
  );
}

/** Port of the host TV's own ReclaimBanner.jsx — same data (S.pendingReclaims,
    already on the shared /api/host-state payload this overlay already
    drives itself off), same two routes, same run() helper everything else
    here already uses. No confirm on either button: approving/denying a
    reconnect is exactly as low-stakes here as it already is on the host
    screen, which has never asked for one either. */
function ReclaimCard({ pendingReclaims, run }) {
  return (
    <div className="card">
      {pendingReclaims.map(r => (
        <div className="reclaim-row" key={r.requestId}>
          <p className="dim small">A new device wants to reconnect as {r.name}.</p>
          <div className="reclaim-row-btns">
            <button type="button" className="primary" onClick={() => run('/api/table/reclaim/approve', { requestId: r.requestId })}>
              Approve
            </button>
            <button type="button" onClick={() => run('/api/table/reclaim/deny', { requestId: r.requestId })}>
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function LobbyControls({ S, busy, run }) {
  const count = S.players.length;
  const canStart = count >= 5;
  return (
    <div className="card">
      <button
        type="button"
        className="primary"
        disabled={busy || !canStart}
        onClick={() => run('/api/table/deal', {}, "Deal roles and start the game? This can't be undone.")}
      >
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

/** The host TV's RevealView has its own "Night falls" button reachable the
    moment roles are dealt — this overlay had no equivalent at all, so a
    leader running the table entirely from their phone (the whole point of
    this feature) had no way to start night 1 once past the lobby. */
function RevealControls({ busy, run }) {
  return (
    <div className="card">
      <button type="button" className="primary" disabled={busy} onClick={() => run('/api/table/night', {})}>
        Night falls
      </button>
    </div>
  );
}

function DayControls({ S, busy, run }) {
  const alive = S.players.filter(p => p.alive);
  const nightNumber = S.nightNumber;
  const todaysNoms = S.nominations.filter(n => n.day === nightNumber);
  const anyOpen = todaysNoms.some(n => !n.closed);
  // Same as the host's own NominateAction.jsx: /api/table/nominate 409s on
  // a repeat nominee or a nominator who's already used their one
  // nomination today, so both pickers drop the ineligible names instead
  // of offering a pick that can only fail.
  const nominatedTodayIds = new Set(todaysNoms.map(n => n.nomineeId));
  const alreadyNominatorIds = new Set(todaysNoms.map(n => n.nominatorId));
  const eligibleNominees = alive.filter(p => !nominatedTodayIds.has(p.id));
  const eligibleNominators = alive.filter(p => !alreadyNominatorIds.has(p.id));

  const [nominatorId, setNominatorId] = useState(() => eligibleNominators[0]?.id || '');
  const [nomineeId, setNomineeId] = useState(() => eligibleNominees[0]?.id || '');
  const [executeId, setExecuteId] = useState('');

  // Same snap-back as NominateAction.jsx — this overlay stays mounted
  // across a whole day rather than remounting per-nomination, so a stale
  // selection (someone who just got nominated, or just used their own
  // nomination) has to be corrected here, not just excluded at first render.
  useEffect(() => {
    const nominatorIds = new Set(eligibleNominators.map(p => p.id));
    const nomineeIds = new Set(eligibleNominees.map(p => p.id));
    setNominatorId(id => (id && nominatorIds.has(id)) ? id : (eligibleNominators[0]?.id || ''));
    setNomineeId(id => (id && nomineeIds.has(id)) ? id : (eligibleNominees[0]?.id || ''));
  }, [eligibleNominators, eligibleNominees]);

  const { id: autoWinnerId, tied } = leadingNominee(S.nominations, nightNumber, alive);
  const effectiveExecuteId = executeId || autoWinnerId || '';
  const effectivePlayer = alive.find(p => p.id === effectiveExecuteId);
  // Same as DayView.jsx's own showTied — only worth flagging while
  // nothing overrides it.
  const showTied = tied && !executeId;

  return (
    <>
      {/* No Mastermind announcement here — corrected after checking the
          actual wiki text: "Add a shroud as normal. Do not say that the
          Demon has died." The bonus day has to look exactly like any other
          day, including Night falls being a perfectly normal, unremarkable
          way for it to end with nobody executed — see
          server.js's resolveMastermindBonusDay. (An earlier version of
          this file said the opposite — that was wrong.) */}
      {!anyOpen && alive.length >= 2 && eligibleNominators.length > 0 && eligibleNominees.length > 0 && (
        <div className="card">
          <div className="nomrow">
            <select value={nominatorId} onChange={e => setNominatorId(e.target.value)}>
              {eligibleNominators.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span aria-hidden="true"> → </span>
            <select value={nomineeId} onChange={e => setNomineeId(e.target.value)}>
              {eligibleNominees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('/api/table/nominate', { nominatorId, nomineeId }, null, r => {
              if (r.virginFired) showToast('The Virgin was nominated by a Townsfolk — the nominator is executed immediately.', { kind: 'story' });
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
        {showTied && <p className="dim small">Tied — no clear leader. Pick one yourself, or let the day pass.</p>}
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
        <button
          type="button"
          disabled={busy || anyOpen}
          onClick={() => run(
            '/api/table/night',
            {},
            effectiveExecuteId ? `${effectivePlayer ? effectivePlayer.name : 'This player'} would be executed if you tapped Kick player instead — end the day with no execution anyway?` : null,
          )}
        >
          Night falls
        </button>
      </div>
    </>
  );
}

/** Stepping away mid-game shouldn't mean the table's stuck waiting for the
    leader to come back — lets them delegate to a specific other seated
    player, in any phase, not just the lobby. Deliberately not a self-serve
    "become leader" button for anyone else: only the current leader's own
    tap (server.js checks the request's own token against game.leaderId)
    can do this, same as a real Storyteller physically handing someone the
    script rather than someone else just picking it up. */
function HandOffControl({ S, myId, busy, handOff }) {
  const others = S.players.filter(p => p.id !== myId);
  const [toId, setToId] = useState(() => others[0]?.id || '');

  if (!others.length) return null;
  const target = others.find(p => p.id === toId) || others[0];

  return (
    <div className="card">
      <p className="dim small">Stepping away? Hand these controls to someone else at the table.</p>
      <select value={target.id} onChange={e => setToId(e.target.value)}>
        {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button type="button" disabled={busy} onClick={() => handOff(target.id, target.name)}>
        Hand off Storyteller controls
      </button>
    </div>
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

/** A trimmed mirror of the host TV's own SettingsOverlay (Timing section +
    the lobby-only Bucket 4 toggle) — before this, a table running entirely
    off phones, exactly who `leaderId` exists for, had no path to any of
    this: not even once, before dealing, for the Bucket 4 toggle. Everything
    else in SettingsOverlay (Drama/Whim chance sliders, Roster's own script
    controls, the LLM section) stays host-TV-only — genuinely deeper
    configuration a phone-only leader can still reach later by walking up to
    the screen, not the two things that would otherwise be permanently
    unreachable for this table. Posts through the same run() helper, same
    /api/table/config route the host's own patchConfig() uses — no separate
    optimistic local merge the way the host does, since this overlay's `S`
    already refreshes off the same live stream every other section here
    reads from. */
function SettingsCard({ S, run }) {
  const patch = cfg => run('/api/table/config', { config: cfg });
  const bucket4Off = (S.config.disabledCharacterIds || []).length > 0;
  const lobbyOnly = S.phase !== 'lobby';

  return (
    <div className="card">
      <h2 className="settings-head">Table settings</h2>
      {SECONDS_FIELDS.map(f => (
        <SecondsRow key={f.key} field={f} value={S.config[f.key]} onCommit={v => patch({ [f.key]: Number(v) })} />
      ))}
      <label className="settings-toggle-row">
        <input
          type="checkbox"
          disabled={lobbyOnly}
          checked={bucket4Off}
          onChange={e => patch({ disabledCharacterIds: e.target.checked ? ['gossip', 'savant', 'artist'] : [] })}
        />
        <span>
          Turn off Gossip, Savant, and Artist
          {lobbyOnly && <span className="dim small"> — only changeable before roles are dealt.</span>}
        </span>
      </label>
    </div>
  );
}

function SecondsRow({ field, value, onCommit }) {
  const { ref, display, setDisplay } = useCommittedInput(value, onCommit);
  return (
    <div className="settings-num-row">
      <label>{field.label}</label>
      <input ref={ref} type="number" min="5" max="600" step="5" value={display} onChange={e => setDisplay(e.target.value)} />
    </div>
  );
}
