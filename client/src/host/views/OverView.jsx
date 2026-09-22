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
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';

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
  const reduceMotion = usePrefersReducedMotion();

  const victoryLine = victory ? `${victory.winner === 'good' ? 'Good wins.' : 'Evil wins.'} ${victory.reason}` : '';
  useSpeak(victoryLine, { dread: !!victory && victory.winner !== 'good', muted });

  // The win condition text gets a beat of pause before it animates in —
  // the one line every game has been building toward deserves to land as
  // a moment, not pop in flat the instant this view mounts. Skips
  // straight to shown, no delay, under reduced motion — same as every
  // other staged reveal in this app (FatalFlashOverlay, the phase-fade
  // transitions).
  const [bannerShown, setBannerShown] = useState(reduceMotion);
  useEffect(() => {
    if (!victory || reduceMotion) return;
    setBannerShown(false);
    const t = setTimeout(() => setBannerShown(true), 550);
    return () => clearTimeout(t);
    // victory?.winner/reason, not the victory object itself — OverView can
    // re-render after the game's already over (a Power Log view, a late
    // reclaim, anything else that pushes a fresh game-state object) with a
    // brand-new victory reference carrying the identical outcome; keying
    // off the object would restart this delay and re-hide an already-shown
    // banner on every one of those, not just the real first reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [victory?.winner, victory?.reason, reduceMotion]);

  const main = (
    <div className="stage-main">
      {/* No "Good wins"/"Evil wins" label and no separate banner box — the
          ring's border glow (below) already says who won, so this line only
          has to carry the win condition itself, e.g. "Only the Demon and one
          other live." */}
      {victory && (
        <div className={'narration reveal' + (victory.winner !== 'good' ? ' dread' : '') + (bannerShown ? ' show' : '')}>
          {victory.reason}
        </div>
      )}
      {/* Same ring the table's watched all game — avatars swap for the real
          token art now that it's revealed, with a shroud over anyone who died.
          The dashed circle connecting the seats is the one thing every player
          has been staring at all night, so the verdict lands there too: it
          lights up blue for good, red for evil, on the same beat as the
          text above. */}
      <RingSeats players={players} revealed glow={victory && bannerShown ? victory.winner : null} />
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
      {/* Rendered twice on purpose (also inside ControlsDrawer below) —
          once plainly on the right, once in the collapsed drawer for a
          phone driving this same screen via the leader overlay. */}
      <SidepanelCard icon="gear" title="Storyteller controls">
        <ControlPanelRow />
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
