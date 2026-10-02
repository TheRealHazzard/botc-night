import GameStage from '../components/GameStage.jsx';
import DayCounterLabel from '../components/DayCounterLabel.jsx';
import TriviaLine from '../components/TriviaLine.jsx';
import ScriptRosterCard from '../components/ScriptRosterCard.jsx';
import ScriptViewPanel from '../components/script/ScriptViewPanel.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import Countdown from '../components/Countdown.jsx';
import WhimBeat from '../components/WhimBeat.jsx';
import VoiceVisualizer from '../components/VoiceVisualizer.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { useWhimBeat } from '../hooks/useWhimBeat.js';
import { nightOpenLine } from '../lib/narratorLines.js';

export default function NightView({ players, nightNumber, windowEndsAt, windowTotalSeconds, config, script, scriptChars, activeScriptMeta, muted, log, ringSlotRef, narrationSlot, fadeClass = '' }) {
  const deathsSoFar = players.filter(p => !p.alive).length;
  const line = nightOpenLine(nightNumber, deathsSoFar, config.narratorPersona);
  useSpeak(line, { dread: deathsSoFar > 0, muted });
  const whim = useWhimBeat(log);

  const acted = players.filter(p => p.submitted).length;
  const living = players.filter(p => p.alive).length;
  const label = `Night ${nightNumber}`;

  const narration = (
    <div className={`fade-wrap stage-narration ${fadeClass}`}>
      <DayCounterLabel text={label} />
      <div className="narration dread">{line}</div>
      <VoiceVisualizer />
      {whim && <WhimBeat />}
    </div>
  );

  const tabs = [
    { id: 'characters', label: 'Characters', content: <ScriptRosterCard characters={scriptChars} /> },
    { id: 'script', label: 'Script', content: activeScriptMeta ? <ScriptViewPanel meta={activeScriptMeta} locked /> : null },
    {
      id: 'controls',
      label: 'Controls',
      content: (
        <>
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
        </>
      ),
    },
  ];

  return (
    <GameStage
      narration={narration}
      narrationSlot={narrationSlot}
      ringSlotRef={ringSlotRef}
      tabs={tabs}
      fadeClass={`fade-wrap ${fadeClass}`}
    />
  );
}
