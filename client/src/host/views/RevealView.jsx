import { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout.jsx';
import GameLeftPanel from '../components/GameLeftPanel.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import Icon from '../components/Icon.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { revealLine } from '../lib/narratorLines.js';
import { post } from '../../lib/api.js';

export default function RevealView({ scriptChars, activeScriptMeta, muted, ringSlotRef, fadeClass = '' }) {
  // Captured once per mount — App.jsx only mounts RevealView while
  // phase === 'reveal', so this is stable for this game's whole reveal
  // phase and fresh again for the next game's.
  const [seed] = useState(() => Date.now());
  useSpeak(revealLine(seed), { dread: true, muted });

  const main = (
    <div className="stage-main">
      <div className={`fade-wrap stage-narration ${fadeClass}`}>
        <div className="narration dread">Look at your hands.</div>
        <div className="sub">Each of you now knows only yourself. No one in this room knows the rest.</div>
      </div>
      <div className="ring-zone">
        <div className="ring-slot" ref={ringSlotRef} />
      </div>
    </div>
  );

  const left = <GameLeftPanel scriptChars={scriptChars} activeScriptMeta={activeScriptMeta} />;

  const right = (
    <div className="sidepanel">
      <SidepanelCard icon="gear" title="Storyteller controls">
        <div className="sidepanel-actions">
          <button type="button" className="primary" onClick={() => post('/api/table/night')}>
            <Icon name="moon" size={15} /> Night falls
          </button>
        </div>
      </SidepanelCard>
    </div>
  );

  return <DashboardLayout left={left} main={main} right={right} fadeClass={`fade-wrap ${fadeClass}`} />;
}
