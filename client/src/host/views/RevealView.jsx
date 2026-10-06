import { useState } from 'react';
import GameStage from '../components/GameStage.jsx';
import ScriptRosterCard from '../components/ScriptRosterCard.jsx';
import ScriptViewPanel from '../components/script/ScriptViewPanel.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import NarratorLogCard from '../components/NarratorLogCard.jsx';
import Icon from '../components/Icon.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { revealLine } from '../lib/narratorLines.js';
import { post } from '../../lib/api.js';

export default function RevealView({ config, scriptChars, activeScriptMeta, muted, ringSlotRef, fading, transClass }) {
  // Captured once per mount — App.jsx only mounts RevealView while
  // phase === 'reveal', so this is stable for this game's whole reveal
  // phase and fresh again for the next game's. Spoken (and logged, see
  // useSpeak) — no visible on-screen caption any more, see GameStage.jsx.
  const [seed] = useState(() => Date.now());
  useSpeak(revealLine(seed, config?.narratorPersona), { dread: true, muted });

  const tabs = [
    { id: 'characters', label: 'Characters', content: <ScriptRosterCard characters={scriptChars} /> },
    { id: 'script', label: 'Script', content: activeScriptMeta ? <ScriptViewPanel meta={activeScriptMeta} locked /> : null },
    {
      id: 'controls',
      label: 'Controls',
      content: (
        <>
          <SidepanelCard title="Storyteller controls">
            <div className="sidepanel-actions">
              <button type="button" className="primary" onClick={() => post('/api/table/night')}>
                <Icon name="moon" size={15} /> Night falls
              </button>
            </div>
          </SidepanelCard>
          <NarratorLogCard />
        </>
      ),
    },
  ];

  return (
    <GameStage
      ringSlotRef={ringSlotRef}
      tabs={tabs}
      fading={fading}
      transClass={transClass}
    />
  );
}
