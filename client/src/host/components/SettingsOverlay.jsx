import Icon from './Icon.jsx';
import TimingSection from './settings/TimingSection.jsx';
import DramaSection from './settings/DramaSection.jsx';
import WhimSection from './settings/WhimSection.jsx';
import RosterSection from './settings/RosterSection.jsx';
import LlmSection from './settings/LlmSection.jsx';
import NanoleafSection from './settings/NanoleafSection.jsx';
import AmbientAudioSection from './settings/AmbientAudioSection.jsx';
import { showToast } from '../../lib/toast.js';

export default function SettingsOverlay({ config, phase, llmConfigured, llmProvider, llmModel, patchConfig, onClose }) {
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
        <div className="settings-col">
          <TimingSection config={config} patch={patch} />
          <DramaSection config={config} patch={patch} />
          <RosterSection config={config} phase={phase} patch={patch} />
        </div>
        <div className="settings-col">
          <WhimSection config={config} patch={patch} />
        </div>
        <div className="settings-col">
          <LlmSection config={config} llmConfigured={llmConfigured} llmProvider={llmProvider} llmModel={llmModel} patch={patch} />
          <NanoleafSection />
          <AmbientAudioSection config={config} patch={patch} />
        </div>
      </div>
    </div>
  );
}
