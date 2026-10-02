import { useEffect, useState } from 'react';
import GameStage from '../components/GameStage.jsx';
import GameSummaryCard from '../components/GameSummaryCard.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import SessionStatsCard from '../components/SessionStatsCard.jsx';
import PowerLogOverlay from '../components/PowerLogOverlay.jsx';
import Icon from '../components/Icon.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { useVictoryReveal } from '../hooks/useVictoryReveal.js';

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

export default function OverView({ players, victory, gameSummary, log, actionLog, resultsLog, nightNumber, muted, ringSlotRef, narrationSlot, fadeClass = '' }) {
  const [showPowerLog, setShowPowerLog] = useState(false);

  const victoryLine = victory ? `${victory.winner === 'good' ? 'Good wins.' : 'Evil wins.'} ${victory.reason}` : '';
  useSpeak(victoryLine, { dread: !!victory && victory.winner !== 'good', muted });

  // Also drives the ring's own verdict glow — see App.jsx, which calls
  // this same hook independently to time the glow to the same beat.
  const bannerShown = useVictoryReveal(victory);

  // No "Good wins"/"Evil wins" label and no separate banner box — the
  // ring's border glow (rendered by App.jsx now — see ringSlotRef)
  // already says who won, so this line only has to carry the win
  // condition itself, e.g. "Only the Demon and one other live."
  const narration = victory ? (
    <div className={'fade-wrap stage-narration ' + fadeClass}>
      <div className={'narration reveal' + (victory.winner !== 'good' ? ' dread' : '') + (bannerShown ? ' show' : '')}>
        {victory.reason}
      </div>
    </div>
  ) : null;

  const tabs = [
    {
      id: 'summary',
      label: 'Summary',
      content: (
        <>
          {gameSummary && <GameSummaryCard gs={gameSummary} />}
          <SidepanelCard icon="scroll" title="What actually happened">
            <div className="log">
              {log.map((l, i) => <p key={i}>{logLabel(l)}{l.text}</p>)}
            </div>
          </SidepanelCard>
        </>
      ),
    },
    {
      id: 'roster',
      label: 'Roster',
      content: (
        <SidepanelCard icon="users" title="Full roster">
          <div className="rosterlist">
            {players.map(p => <RosterRow key={p.id} player={p} />)}
          </div>
        </SidepanelCard>
      ),
    },
    {
      id: 'controls',
      label: 'Controls',
      content: (
        <>
          {((actionLog && actionLog.length > 0) || (resultsLog && resultsLog.length > 0)) && (
            <button type="button" onClick={() => setShowPowerLog(true)}>
              <Icon name="scroll" size={15} /> Power log
            </button>
          )}
          {/* Only worth a card once there's a second game tonight to
              compare against — SessionStatsCard removes itself if there
              isn't one. */}
          <SessionStatsCard />
        </>
      ),
    },
  ];

  return (
    <>
      <GameStage
        narration={narration}
        narrationSlot={narrationSlot}
        ringSlotRef={ringSlotRef}
        tabs={tabs}
        defaultTab="summary"
        fadeClass={`fade-wrap ${fadeClass}`}
      />
      {showPowerLog && (
        <PowerLogOverlay players={players} actionLog={actionLog} resultsLog={resultsLog} nightNumber={nightNumber} onClose={() => setShowPowerLog(false)} />
      )}
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
