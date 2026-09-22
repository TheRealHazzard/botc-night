import { CHANCE_FIELDS } from '../../../lib/settingsFields.js';
import { useCommittedInput } from '../../../hooks/useCommittedInput.js';

export default function WhimSection({ config, patch }) {
  return (
    <div className="settings-section">
      <h3>Storyteller whim</h3>
      {CHANCE_FIELDS.map(f => (
        <ChanceRow key={f.key} field={f} value={config[f.key]} onCommit={v => patch({ [f.key]: Number(v) })} />
      ))}
    </div>
  );
}

function ChanceRow({ field, value, onCommit }) {
  const { ref, display, setDisplay } = useCommittedInput(value, onCommit);
  return (
    <div className="settings-row">
      <div className="lbl"><b>{field.label}</b><span>{field.help}</span></div>
      <span className="val">{Number(display).toFixed(2)}</span>
      <input ref={ref} type="range" min="0" max="1" step="0.05" value={display} onChange={e => setDisplay(e.target.value)} />
    </div>
  );
}
