import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../components/DashboardLayout.jsx';
import DayCounterLabel from '../components/DayCounterLabel.jsx';
import RingSeats from '../components/RingSeats.jsx';
import TriviaLine from '../components/TriviaLine.jsx';
import GameLeftPanel from '../components/GameLeftPanel.jsx';
import ControlPanelRow from '../components/ControlPanelRow.jsx';
import ControlsDrawer from '../components/ControlsDrawer.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import NominationList from '../components/NominationList.jsx';
import NominateAction from '../components/NominateAction.jsx';
import DayReport from '../components/DayReport.jsx';
import Icon from '../components/Icon.jsx';
import WhimBeat from '../components/WhimBeat.jsx';
import MinorBeatOverlay from '../components/MinorBeatOverlay.jsx';
import RoomPacingNudge from '../components/RoomPacingNudge.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { useWhimBeat } from '../hooks/useWhimBeat.js';
import { useMinorBeat } from '../hooks/useMinorBeat.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import { useRoomPacing } from '../hooks/useRoomPacing.js';
import { post } from '../../lib/api.js';
import { showToast } from '../../lib/toast.js';
import { leadingNominee } from '../../lib/leadingNominee.js';

export default function DayView({ players, nightNumber, deaths, nominations, config, script, scriptChars, activeScriptMeta, muted, log = [], dayStartedAt }) {
  const lastNight = deaths.filter(d => d.night === nightNumber && d.cause !== 'execution');
  const line = lastNight.length ? `${lastNight.map(d => d.name).join(' and ')} did not wake.` : 'Everyone wakes. That should worry you.';
  useSpeak(line, { dread: !!lastNight.length, muted });
  const whim = useWhimBeat(log);
  const reduceMotion = usePrefersReducedMotion();
  const minorBeat = useMinorBeat(deaths, { muted, reduceMotion });

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
  const livingCount = players.filter(p => p.alive).length;
  // DayView only ever mounts while phase === 'day' (App.jsx's own
  // conditional render), so that's passed as a literal rather than a prop.
  const pacing = useRoomPacing('day', dayStartedAt, nightNumber, livingCount, anyOpen);

  const main = (
    <div className="stage-main">
      <DayCounterLabel text={`Day ${nightNumber}`} />
      <div className="narration">Dawn.</div>
      <div className="deaths">
        {lastNight.length > 0 && <Icon name="skull" size={18} />}
        <span>{line}</span>
      </div>
      {/* No Mastermind hint here on purpose — the wiki is explicit: "Add a
          shroud as normal. Do not say that the Demon has died." The bonus
          day has to look exactly like any other day, including the fully
          ordinary possibility that night just falls with nobody executed
          (see server.js's resolveMastermindBonusDay). */}
      {whim && <WhimBeat />}
      <RoomPacingNudge level={pacing} />
      <RingSeats players={players} />
    </div>
  );

  const left = <GameLeftPanel scriptChars={scriptChars} activeScriptMeta={activeScriptMeta} />;

  // Rendered twice on purpose (also inside ControlsDrawer below) — once
  // plainly on the right, once in the collapsed drawer for a phone driving
  // this same screen via the leader overlay. Two independent widget
  // instances, so a dropdown selection made in one copy doesn't reflect in
  // the other — an accepted cost of true duplication, not synchronized.
  const right = (
    <div className="sidepanel">
      <NominationList nominations={nominations} nightNumber={nightNumber} players={players} voteWindowSeconds={config.voteWindowSeconds} />
      <DayReport deaths={deaths} players={players} nightNumber={nightNumber} />
      {anyOpen && <TriviaLine scriptId={script} compact />}
      <SidepanelCard icon="gear" title="Storyteller controls">
        <div className="sidepanel-card-stack">
          <ControlPanelRow />
          <NominateAction nominations={nominations} nightNumber={nightNumber} players={players} />
          <DayActions players={players} nominations={nominations} nightNumber={nightNumber} anyOpen={anyOpen} />
        </div>
      </SidepanelCard>
    </div>
  );

  return (
    <>
      <DashboardLayout left={left} main={main} right={right} />
      {minorBeat && <MinorBeatOverlay name={minorBeat.name} />}
      <ControlsDrawer forceClosed={!!minorBeat}>
        <ControlPanelRow />
        <NominateAction nominations={nominations} nightNumber={nightNumber} players={players} />
        <DayActions players={players} nominations={nominations} nightNumber={nightNumber} anyOpen={anyOpen} />
      </ControlsDrawer>
    </>
  );
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

function DayActions({ players, nominations, nightNumber, anyOpen }) {
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

  const { id: autoWinnerId, tied } = leadingNominee(nominations, nightNumber, alive);
  const leaderChanged = useLeaderChanged(autoWinnerId);
  const effectiveId = overrideId !== null ? overrideId : (autoWinnerId || '');
  const effectivePlayer = alive.find(p => p.id === effectiveId);
  // Only worth flagging while nothing overrides it — a host who's already
  // picked someone manually has already made the real decision either way.
  const showTied = tied && overrideId === null;

  // "Kick Player" already confirms an execution — "Night falls" used to
  // have no such guard at all, even with a real candidate queued (the
  // computed leader, or the host's own override): one misclick in the
  // drawer silently skipped a legitimate execution, and the result was
  // indistinguishable afterward from a day nobody ever qualified on.
  const nightFalls = () => {
    if (effectiveId && !confirm(`${effectivePlayer ? effectivePlayer.name : 'This player'} would be executed if you clicked Kick Player instead — end the day with no execution anyway?`)) return;
    post('/api/table/night');
  };
  const kick = () => {
    if (effectiveId && !confirm(`Execute ${effectivePlayer ? effectivePlayer.name : 'this player'}?`)) return;
    post('/api/table/execute', { playerId: effectiveId || null }).then(r => r.error && showToast(r.error));
  };

  return (
    <div className="sidepanel-actions">
      <select value={effectiveId} onChange={e => setOverrideId(e.target.value)}>
        <option value="">No execution</option>
        {alive.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {/* Without this, a tie and "nobody's ever qualified" look identical —
          the select just quietly reads "No execution" either way, with no
          sign a real tie is why. */}
      {showTied && <p className="sub tied-note">Tied — no clear leader. Pick one yourself, or let the day pass.</p>}
      <button
        type="button"
        className={'primary' + (leaderChanged && overrideId === null ? ' leader-changed' : '')}
        disabled={anyOpen}
        onClick={kick}
      >
        <Icon name="skull" size={15} /> Kick Player
      </button>
      {/* No mastermindExtraDay check here — see DayView.jsx's own note:
          Night falls has to behave identically during the Mastermind's
          bonus day, right down to being a perfectly normal way for that
          day to end with nobody executed. */}
      <button type="button" disabled={anyOpen} onClick={nightFalls}>
        <Icon name="moon" size={15} /> Night falls
      </button>
    </div>
  );
}
