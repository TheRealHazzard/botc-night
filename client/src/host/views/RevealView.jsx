import { useState } from 'react';
import GameStage from '../components/GameStage.jsx';
import ScriptRosterCard from '../components/ScriptRosterCard.jsx';
import ScriptViewPanel from '../components/script/ScriptViewPanel.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import Icon from '../components/Icon.jsx';
import VoiceVisualizer from '../components/VoiceVisualizer.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { revealLine } from '../lib/narratorLines.js';
import { post } from '../../lib/api.js';

export default function RevealView({ config, scriptChars, activeScriptMeta, muted, ringSlotRef, narrationSlot, fadeClass = '' }) {
  // Captured once per mount — App.jsx only mounts RevealView while
  // phase === 'reveal', so this is stable for this game's whole reveal
  // phase and fresh again for the next game's.
  const [seed] = useState(() => Date.now());
  useSpeak(revealLine(seed, config?.narratorPersona), { dread: true, muted });

  const narration = (
    <div className={`fade-wrap stage-narration ${fadeClass}`}>
      <div className="narration dread">Look at your hands.</div>
      <VoiceVisualizer />
      <div className="sub">Each of you now knows only yourself. No one in this room knows the rest.</div>
    </div>
  );

  const tabs = [
    { id: 'characters', label: 'Characters', content: <ScriptRosterCard characters={scriptChars} /> },
    { id: 'script', label: 'Script', content: activeScriptMeta ? <ScriptViewPanel meta={activeScriptMeta} locked /> : null },
    {
      id: 'controls',
      label: 'Controls',
      content: (
        <SidepanelCard icon="gear" title="Storyteller controls">
          <div className="sidepanel-actions">
            <button type="button" className="primary" onClick={() => post('/api/table/night')}>
              <Icon name="moon" size={15} /> Night falls
            </button>
          </div>
        </SidepanelCard>
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
