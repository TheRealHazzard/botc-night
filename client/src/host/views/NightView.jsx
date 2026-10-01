import DashboardLayout from '../components/DashboardLayout.jsx';
import DayCounterLabel from '../components/DayCounterLabel.jsx';
import TriviaLine from '../components/TriviaLine.jsx';
import GameLeftPanel from '../components/GameLeftPanel.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import Countdown from '../components/Countdown.jsx';
import WhimBeat from '../components/WhimBeat.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { useWhimBeat } from '../hooks/useWhimBeat.js';
import { nightOpenLine } from '../lib/narratorLines.js';

export default function NightView({ players, nightNumber, windowEndsAt, windowTotalSeconds, config, script, scriptChars, activeScriptMeta, muted, log, ringSlotRef, fadeClass = '' }) {
  const deathsSoFar = players.filter(p => !p.alive).length;
  const line = nightOpenLine(nightNumber, deathsSoFar);
  useSpeak(line, { dread: deathsSoFar > 0, muted });
  const whim = useWhimBeat(log);

  const acted = players.filter(p => p.submitted).length;
  const living = players.filter(p => p.alive).length;
  const label = `Night ${nightNumber}`;

  const main = (
    <div className="stage-main">
      <div className={`fade-wrap stage-narration ${fadeClass}`}>
        <DayCounterLabel text={label} />
        <div className="narration dread">{line}</div>
        {whim && <WhimBeat />}
      </div>
      <div className="ring-zone">
        <div className="ring-slot" ref={ringSlotRef} />
      </div>
    </div>
  );

  const left = <GameLeftPanel scriptChars={scriptChars} activeScriptMeta={activeScriptMeta} />;

  const right = (
    <div className="sidepanel">
      <SidepanelCard icon="clock" title="Night window">
        {windowEndsAt && (
          <div className="timerbox">
            <Countdown
              windowEndsAt={windowEndsAt}
              total={windowTotalSeconds ?? config.windowSeconds}
            />
          </div>
        )}
        <div className="sub">{acted} of {living} have answered.</div>
      </SidepanelCard>
      <TriviaLine scriptId={script} compact />
    </div>
  );

  return <DashboardLayout left={left} main={main} right={right} fadeClass={`fade-wrap ${fadeClass}`} />;
}
