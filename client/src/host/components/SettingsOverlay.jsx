import { useState } from 'react';
import Icon from './Icon.jsx';
import TimingSection from './settings/TimingSection.jsx';
import DramaSection from './settings/DramaSection.jsx';
import WhimSection from './settings/WhimSection.jsx';
import RosterSection from './settings/RosterSection.jsx';
import LlmSection from './settings/LlmSection.jsx';
import NanoleafSection from './settings/NanoleafSection.jsx';
import AmbientAudioSection from './settings/AmbientAudioSection.jsx';
import NarratorSection from './settings/NarratorSection.jsx';
import { showToast } from '../../lib/toast.js';

// Tabs, not an ever-growing row of columns — this used to be 2, then 3
// unlabeled columns, balanced purely by height with no actual
// categorization; every new setting just got appended to whichever
// column was shortest. 8 sections already span "how the game paces
// itself," "how it feels in the room," and "the AI backend," which are
// genuinely different questions a host asks at different times — the
// tabs below are that real split, not a cosmetic relabel, so the next
// new setting has an actual home instead of becoming a 4th column.
const TABS = [
  { id: 'pacing', label: 'Pacing' },
  { id: 'atmosphere', label: 'Atmosphere' },
  { id: 'ai', label: 'AI' },
];

export default function SettingsOverlay({ config, phase, llmConfigured, llmProvider, llmModel, liveDramaBias, patchConfig, onClose }) {
  const [tab, setTab] = useState('pacing');

  // None of the 6 call sites across the 5 sections below ever handled a
  // failed PATCH — the input's own display state already updates
  // optimistically on every keystroke/drag tick (see useCommittedInput.js),
  // so a network failure here left the field looking saved with nothing
  // telling the host otherwise, until an unrelated SSE push eventually
  // reverted it back with no explanation. One wrapper here covers every
  // section instead of fixing each call site separately.
  const patch = cfg => patchConfig(cfg).then(r => {
    if (r.error) showToast(r.error);
    return r;
  });

  return (
    <div className="settings-overlay">
      <div className="settings-header">
        <h2>Table settings</h2>
        <button type="button" className="ghostbtn" onClick={onClose}><Icon name="close" size={15} /> Close</button>
      </div>
      <div className="settings-body">
        <div className="settings-tabs-col">
          <div className="checklist-filters">
            {TABS.map(t => (
              <button type="button" key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'pacing' && (
            <div className="settings-tab-grid">
              <div className="settings-col">
                <TimingSection config={config} patch={patch} />
                <DramaSection config={config} patch={patch} liveDramaBias={liveDramaBias} />
              </div>
              <div className="settings-col">
                <WhimSection config={config} patch={patch} />
                <RosterSection config={config} phase={phase} patch={patch} />
              </div>
            </div>
          )}

          {tab === 'atmosphere' && (
            <div className="settings-tab-grid">
              <div className="settings-col">
                <NarratorSection config={config} patch={patch} />
                <AmbientAudioSection config={config} patch={patch} />
              </div>
              <div className="settings-col">
                <NanoleafSection />
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div className="settings-tab-grid single-col">
              <div className="settings-col">
                <LlmSection config={config} llmConfigured={llmConfigured} llmProvider={llmProvider} llmModel={llmModel} patch={patch} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
