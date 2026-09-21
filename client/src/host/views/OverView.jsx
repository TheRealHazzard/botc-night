import { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout.jsx';
import RingSeats from '../components/RingSeats.jsx';
import GameSummaryCard from '../components/GameSummaryCard.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import ControlPanelRow from '../components/ControlPanelRow.jsx';
import ControlsDrawer from '../components/ControlsDrawer.jsx';
import SessionStatsCard from '../components/SessionStatsCard.jsx';
import PowerLogOverlay from '../components/PowerLogOverlay.jsx';
import Icon from '../components/Icon.jsx';
import { useSpeak } from '../hooks/useSpeak.js';

// A day commonly has execution/nomination log lines mixed in with the
// night's own — every entry used to render "Night N" regardless, including
// day-time events (executions never happen at night) and lobby events
// (before "Night N" is even a real thing — nightNumber is still 0 there).
// `phase`, recorded on each entry as of the log line's own real phase (see
// logEvent in game/helpers.js), lets this tell them apart.
function logLabel(l) {
  if (l.phase === 'night') return `Night ${l.night}: `;
  if (l.phase === 'day') return `Day ${l.night}: `;
  return ''; // lobby/reveal/over, or older data with no recorded phase
}

export default function OverView({ players, victory, gameSummary, log, actionLog, resultsLog, nightNumber, muted }) {
  const [showPowerLog, setShowPowerLog] = useState(false);

  const victoryLine = victory ? `${victory.winner === 'good' ? 'Good wins.' : 'Evil wins.'} ${victory.reason}` : '';
  useSpeak(victoryLine, { dread: !!victory && victory.winner !== 'good', muted });

  const main = (
    <div className="stage-main">
      <div className="narration">The truth, then.</div>
      {victory && (
        <div className="victory-banner">
          <div className="icon-badge"><Icon name={victory.winner === 'good' ? 'sun' : 'skull'} size={24} /></div>
          <div>
            <div className="who">{victory.winner === 'good' ? 'Good wins' : 'Evil wins'}</div>
            <div>{victory.reason}</div>
          </div>
        </div>
      )}
      {/* Same ring the table's watched all game — avatars swap for the real
          token art now that it's revealed, with a shroud over anyone who died. */}
      <RingSeats players={players} revealed />
    </div>
  );

  const left = (
    <div className="sidepanel">
      {gameSummary && <GameSummaryCard gs={gameSummary} />}
      <SidepanelCard icon="scroll" title="What actually happened">
        <div className="log">
          {log.map((l, i) => <p key={i}>{logLabel(l)}{l.text}</p>)}
        </div>
      </SidepanelCard>
    </div>
  );

  const right = (
    <div className="sidepanel">
      {((actionLog && actionLog.length > 0) || (resultsLog && resultsLog.length > 0)) && (
        <button type="button" onClick={() => setShowPowerLog(true)}>
          <Icon name="scroll" size={15} /> Power log
        </button>
      )}
      {/* Only worth a card once there's a second game tonight to compare
          against — SessionStatsCard removes itself if there isn't one. */}
      <SessionStatsCard />
      <SidepanelCard icon="users" title="Full roster">
        <div className="rosterlist">
          {players.map(p => <RosterRow key={p.id} player={p} />)}
        </div>
      </SidepanelCard>
    </div>
  );

  return (
    <>
      <DashboardLayout left={left} main={main} right={right} />
      {showPowerLog && (
        <PowerLogOverlay players={players} actionLog={actionLog} resultsLog={resultsLog} nightNumber={nightNumber} onClose={() => setShowPowerLog(false)} />
      )}
      <ControlsDrawer>
        <ControlPanelRow />
      </ControlsDrawer>
    </>
  );
}

function RosterRow({ player: p }) {
  const [career, setCareer] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // A game just got written to this name's record — show the updated line.
    fetch('/api/profile?name=' + encodeURIComponent(p.name))
      .then(r => r.json())
      .then(r => {
        if (!cancelled && r.found && r.stats && r.stats.gamesPlayed) setCareer(r.stats);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [p.name]);

  return (
    <div className="rosterrow" style={p.color ? { borderLeftColor: p.color.hex } : undefined}>
      <div className="rosterrow-top">
        <strong className={p.alive ? undefined : 'deadname'}>{p.name}</strong>
        <span className="rosterrole">{p.character || 'unknown'}</span>
      </div>
      <div className="career">
        {career && (
          <>
            <Icon name="trend" size={12} />
            <span>{career.gamesPlayed} games · {Math.round((career.winRate || 0) * 100)}% win rate</span>
          </>
        )}
      </div>
    </div>
  );
}
