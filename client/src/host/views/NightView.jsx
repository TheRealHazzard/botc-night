import DashboardLayout from '../components/DashboardLayout.jsx';
import DayCounterLabel from '../components/DayCounterLabel.jsx';
import TriviaLine from '../components/TriviaLine.jsx';
import GameLeftPanel from '../components/GameLeftPanel.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import Countdown from '../components/Countdown.jsx';
import WhimBeat from '../components/WhimBeat.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { useWhimBeat } from '../hooks/useWhimBeat.js';

export default function NightView({ players, nightNumber, wave, windowEndsAt, windowTotalSeconds, config, script, scriptChars, activeScriptMeta, muted, log, ringSlotRef, fadeClass = '' }) {
  const again = wave === 2;
  const line = again ? 'Something is not finished.' : 'Close your eyes. The town sleeps.';
  useSpeak(line, { dread: again, muted });
  const whim = useWhimBeat(log);

  const acted = players.filter(p => p.submitted).length;
  const living = players.filter(p => p.alive).length;
  const label = `Night ${nightNumber}${again ? ' — again' : ''}`;

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
      <SidepanelCard icon="clock" title={again ? 'Second window' : 'Night window'}>
        {windowEndsAt && (
          <div className="timerbox">
            <Countdown
              windowEndsAt={windowEndsAt}
              total={windowTotalSeconds ?? (again ? config.wave2Seconds : config.windowSeconds)}
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
