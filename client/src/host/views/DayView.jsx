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

export default function DayView({ players, nightNumber, deaths, mastermindExtraDay, nominations, config, script, scriptChars, activeScriptMeta, muted, log = [] }) {
  const lastNight = deaths.filter(d => d.night === nightNumber && d.cause !== 'execution');
  const line = lastNight.length ? `${lastNight.map(d => d.name).join(' and ')} did not wake.` : 'Everyone wakes. That should worry you.';
  useSpeak(line, { dread: !!lastNight.length, muted });

  // Empty until an execution actually happens today — useSpeak/speak() both
  // no-op on an empty line, so this stays silent until then. A blocked
  // execution (Pacifist/Devil's Advocate/Tea Lady) leaves no death entry at
  // all, so that case is read straight off the same public, non-secret log
  // line the server already produces for it, verbatim.
  const executedToday = deaths.find(d => d.night === nightNumber && d.cause === 'execution');
  const survivedLine = log.find(l => l.night === nightNumber && l.phase === 'day' && !l.secret && /executed, but survives/.test(l.text));
  const executionLine = executedToday ? `${executedToday.name} is executed.` : (survivedLine ? survivedLine.text : '');
  useSpeak(executionLine, { dread: !!executedToday, muted });

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
    </div>
  );

  const left = <GameLeftPanel scriptChars={scriptChars} activeScriptMeta={activeScriptMeta} />;

  const right = (
    <div className="sidepanel">
      <ControlPanelRow />
      <NominationPanel nominations={nominations} nightNumber={nightNumber} players={players} voteWindowSeconds={config.voteWindowSeconds} />
      <DayReport deaths={deaths} players={players} nightNumber={nightNumber} />
      <DayActions players={players} nominations={nominations} nightNumber={nightNumber} anyOpen={anyOpen} mastermindExtraDay={mastermindExtraDay} />
      {anyOpen && <TriviaLine scriptId={script} compact />}
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
function leadingNominee(nominations, nightNumber, alivePlayers) {
  const today = nominations.filter(n => n.day === nightNumber && n.closed);
  const threshold = Math.max(1, Math.ceil(alivePlayers.length / 2));
  // A day commonly has more than one nomination — a qualifying nominee from
  // earlier today can die from an unrelated cause (Virgin, Witch, Golem, a
  // Slayer shot) before the host ever acts on this, so "closed and met
  // threshold" alone isn't enough; they also have to still be alive now.
  const aliveIds = new Set(alivePlayers.map(p => p.id));
  const qualifying = today.filter(n => (n.yesCount || 0) >= threshold && aliveIds.has(n.nomineeId));
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

  // Same staleness risk as NominationPanel's dropdowns: the host picks an
  // override, then an unrelated day-kill (Virgin, Witch, Golem, a Slayer
  // shot) removes that player before "Kick Player" is clicked — snap back
  // to "follow the computed leader" rather than silently keep pointing at
  // a corpse (a weaker, un-named confirm dialog was the only visible sign
  // something was wrong). An explicit "No execution" choice (empty string,
  // distinct from null/"untouched") is left alone either way.
  useEffect(() => {
    const aliveIds = new Set(players.filter(p => p.alive).map(p => p.id));
    setOverrideId(id => (id && !aliveIds.has(id)) ? null : id);
  }, [players]);

  const autoWinner = leadingNominee(nominations, nightNumber, alive);
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
