import { SECONDS_FIELDS } from '../../../lib/settingsFields.js';
import { useCommittedInput } from '../../../hooks/useCommittedInput.js';

export default function TimingSection({ config, patch }) {
  return (
    <div className="settings-section">
      <h3>Timing</h3>
      {SECONDS_FIELDS.map(f => (
        <NumberRow key={f.key} field={f} value={config[f.key]} onCommit={v => patch({ [f.key]: Number(v) })} />
      ))}
    </div>
  );
}

function NumberRow({ field, value, onCommit }) {
  const { ref, display, setDisplay } = useCommittedInput(value, onCommit);
  return (
    <div className="settings-row">
      <div className="lbl"><b>{field.label}</b></div>
      <input
        ref={ref}
        type="number"
        min="5"
        max="600"
        step="5"
        value={display}
        onChange={e => setDisplay(e.target.value)}
      />
    </div>
  );
}
