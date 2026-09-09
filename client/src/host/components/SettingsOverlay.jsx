import Icon from './Icon.jsx';
import TimingSection from './settings/TimingSection.jsx';
import DramaSection from './settings/DramaSection.jsx';
import WhimSection from './settings/WhimSection.jsx';
import RosterSection from './settings/RosterSection.jsx';
import LlmSection from './settings/LlmSection.jsx';

export default function SettingsOverlay({ config, phase, llmConfigured, patchConfig, onClose }) {
  return (
    <div className="settings-overlay">
      <div className="settings-header">
        <h2>Table settings</h2>
        <button type="button" className="ghostbtn" onClick={onClose}><Icon name="close" size={15} /> Close</button>
      </div>
      <div className="settings-body">
        <div className="settings-col">
          <TimingSection config={config} patch={patchConfig} />
          <DramaSection config={config} patch={patchConfig} />
          <RosterSection config={config} phase={phase} patch={patchConfig} />
        </div>
        <div className="settings-col">
          <WhimSection config={config} patch={patchConfig} />
          <LlmSection config={config} llmConfigured={llmConfigured} patch={patchConfig} />
        </div>
      </div>
    </div>
  );
}
