import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../components/DashboardLayout.jsx';
import DayCounterLabel from '../components/DayCounterLabel.jsx';
import RingSeats from '../components/RingSeats.jsx';
import TriviaLine from '../components/TriviaLine.jsx';
import GameLeftPanel from '../components/GameLeftPanel.jsx';
import ControlPanelRow from '../components/ControlPanelRow.jsx';
import NominationPanel from '../components/NominationPanel.jsx';
import DayReport from '../components/DayReport.jsx';
import Icon from '../components/Icon.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { post } from '../../lib/api.js';

export default function DayView({ players, nightNumber, deaths, mastermindExtraDay, nominations, config, script, scriptChars, activeScriptMeta, muted }) {
  const lastNight = deaths.filter(d => d.night === nightNumber && d.cause !== 'execution');
  const line = lastNight.length ? `${lastNight.map(d => d.name).join(' and ')} did not wake.` : 'Everyone wakes. That should worry you.';
  useSpeak(line, { dread: !!lastNight.length, muted });

  const anyOpen = nominations.some(n => n.day === nightNumber && !n.closed);

  const main = (
    <div className="stage-main">
      <DayCounterLabel text={`Day ${nightNumber}`} />
      <div className="narration">Dawn.</div>
      <div className="deaths">
        {lastNight.length > 0 && <Icon name="skull" size={18} />}
        <span>{line}</span>
      </div>
      {mastermindExtraDay && (
        <div className="hint">
          <Icon name="bolt" size={16} />
          <span>The Demon has fallen — but the Mastermind's power lingers. Play one more day. If a good player is executed now, evil wins. If evil is, good does.</span>
        </div>
      )}
      <RingSeats players={players} />
      {anyOpen && <TriviaLine scriptId={script} />}
    </div>
  );

  const left = <GameLeftPanel scriptChars={scriptChars} activeScriptMeta={activeScriptMeta} />;

  const right = (
    <div className="sidepanel">
      <ControlPanelRow />
      <NominationPanel nominations={nominations} nightNumber={nightNumber} players={players} voteWindowSeconds={config.voteWindowSeconds} />
      <DayReport deaths={deaths} players={players} nightNumber={nightNumber} />
      <DayActions players={players} nominations={nominations} nightNumber={nightNumber} anyOpen={anyOpen} mastermindExtraDay={mastermindExtraDay} />
    </div>
  );

  return <DashboardLayout left={left} main={main} right={right} />;
}

// The exact formula resolveDayVote() (game/engine.js) uses server-side —
// majority threshold, highest yes-count among qualifying nominations, a
// tie meaning no clear winner — read off the same already-computed
// yesCount field the server sends, not raw votes. This can't drift from
// what the server would actually execute: same numbers, same math, just
// run here too so the dropdown can show it before anyone taps a button.
function leadingNominee(nominations, nightNumber, aliveCount) {
  const today = nominations.filter(n => n.day === nightNumber && n.closed);
  const threshold = Math.max(1, Math.ceil(aliveCount / 2));
  const qualifying = today.filter(n => (n.yesCount || 0) >= threshold);
  if (!qualifying.length) return null;
  const max = Math.max(...qualifying.map(n => n.yesCount));
  const top = qualifying.filter(n => n.yesCount === max);
  return top.length === 1 ? top[0].nomineeId : null;
}

// Same "compare during render, only ever write the ref from an effect"
// discipline useEnteringSeatIds uses — flips true for exactly the render
// right after the computed leader actually changes to someone new, so the
// Kick Player button can call attention to itself the moment the room's
// decision flips, not on every re-render while it stays the same.
function useLeaderChanged(winnerId) {
  const knownRef = useRef(winnerId);
  const changed = !!winnerId && knownRef.current !== winnerId;

  useEffect(() => {
    knownRef.current = winnerId;
  });

  return changed;
}

function DayActions({ players, nominations, nightNumber, anyOpen, mastermindExtraDay }) {
  const alive = players.filter(p => p.alive);
  // null = "follow the computed leader" — the moment the host actually
  // touches the dropdown, their choice sticks instead, same as any other
  // auto-filled-but-overridable form field.
  const [overrideId, setOverrideId] = useState(null);

  const autoWinner = leadingNominee(nominations, nightNumber, alive.length);
  const leaderChanged = useLeaderChanged(autoWinner);
  const effectiveId = overrideId !== null ? overrideId : (autoWinner || '');
  const effectivePlayer = alive.find(p => p.id === effectiveId);

  const nightFalls = () => post('/api/table/night');
  const kick = () => {
    if (effectiveId && !confirm(`Execute ${effectivePlayer ? effectivePlayer.name : 'this player'}?`)) return;
    post('/api/table/execute', { playerId: effectiveId || null }).then(r => r.error && alert(r.error));
  };

  return (
    <div className="sidepanel-actions">
      <select value={effectiveId} onChange={e => setOverrideId(e.target.value)}>
        <option value="">No execution</option>
        {alive.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button
        type="button"
        className={'primary' + (leaderChanged && overrideId === null ? ' leader-changed' : '')}
        disabled={anyOpen}
        onClick={kick}
      >
        <Icon name="skull" size={15} /> Kick Player
      </button>
      <button type="button" disabled={anyOpen || mastermindExtraDay} onClick={nightFalls}>
        <Icon name="moon" size={15} /> Night falls
      </button>
    </div>
  );
}
