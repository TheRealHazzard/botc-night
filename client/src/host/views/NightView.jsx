import { useEffect } from 'react';
import GameStage from '../components/GameStage.jsx';
import TriviaLine from '../components/TriviaLine.jsx';
import ScriptRosterCard from '../components/ScriptRosterCard.jsx';
import ScriptViewPanel from '../components/script/ScriptViewPanel.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import NarratorLogCard from '../components/NarratorLogCard.jsx';
import Countdown from '../components/Countdown.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { useWhimBeat } from '../hooks/useWhimBeat.js';
import { nightOpenLine } from '../lib/narratorLines.js';
import { logNarration } from '../lib/narratorLog.js';

export default function NightView({ players, nightNumber, windowEndsAt, windowTotalSeconds, config, script, scriptChars, activeScriptMeta, muted, log, ringSlotRef, fading, transClass }) {
  const deathsSoFar = players.filter(p => !p.alive).length;
  const line = nightOpenLine(nightNumber, deathsSoFar, config.narratorPersona);
  useSpeak(line, { dread: deathsSoFar > 0, muted });
  const whim = useWhimBeat(log);
  // WhimBeat no longer renders on-stage (see GameStage.jsx) — logged
  // instead, same "never shown, only felt" spirit, just via the narrator
  // log rather than a fleeting on-screen chip.
  useEffect(() => {
    if (whim) logNarration('A quiet decision, unseen.');
  }, [whim]);

  const acted = players.filter(p => p.submitted).length;
  const living = players.filter(p => p.alive).length;
  const label = `Night ${nightNumber}`;

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
          <NarratorLogCard />
          <TriviaLine scriptId={script} compact />
        </>
      ),
    },
  ];

  return (
    <GameStage
      phaseHeading={label}
      ringSlotRef={ringSlotRef}
      tabs={tabs}
      // Controls (the countdown, who's answered) is what a host actually
      // checks during a night window — Characters/Script are reference
      // material, not the thing in motion right now.
      defaultTab="controls"
      fading={fading}
      transClass={transClass}
    />
  );
}
