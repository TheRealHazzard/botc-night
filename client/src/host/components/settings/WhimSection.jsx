import { CHANCE_FIELDS } from '../../../lib/settingsFields.js';
import { useCommittedInput } from '../../../hooks/useCommittedInput.js';

export default function WhimSection({ config, patch }) {
  const llmOn = !!config.llmStorytellerEnabled;
  return (
    <div className="settings-section">
      <h3>Storyteller whim</h3>
      {CHANCE_FIELDS.map(f => (
        <ChanceRow key={f.key} field={f} value={config[f.key]} onCommit={v => patch({ [f.key]: Number(v) })} llmOn={llmOn} />
      ))}
    </div>
  );
}

function ChanceRow({ field, value, onCommit, llmOn }) {
  const { ref, display, setDisplay } = useCommittedInput(value, onCommit);
  return (
    <div className="settings-row">
      <div className="lbl">
        <b>{field.label}</b>
        <span>
          {field.help}
          {/* Only worth saying while it's actually true — with the LLM
              Storyteller off, all six chances below behave identically,
              and the distinction would just be confusing noise. */}
          {field.fallbackOnly && llmOn && ' — currently a fallback only; the LLM Storyteller judges this instead when it can.'}
        </span>
      </div>
      <span className="val">{Number(display).toFixed(2)}</span>
      <input ref={ref} type="range" min="0" max="1" step="0.05" value={display} onChange={e => setDisplay(e.target.value)} />
    </div>
  );
}
