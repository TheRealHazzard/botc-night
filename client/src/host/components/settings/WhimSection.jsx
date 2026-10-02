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
      <div className="lbl">
        <b>{field.label}</b>
        <span>
          {field.help}
          {/* True regardless of the LLM Storyteller toggle, not just while
              it's on — server.js wires a judge in unconditionally, and with
              the LLM off (or unreachable) that judge falls back to
              heuristicWhim's own dynamic "help whoever's behind" call, never
              to this flat rate. The only place this slider is ever the real
              rate is tools/simulate.js, which wires no judge in at all. */}
          {field.fallbackOnly && ' — a real table never actually rolls this: it\'s judged dynamically instead (by the LLM Storyteller when it\'s on and reachable, otherwise by a "help whoever\'s behind" heuristic). Only affects the simulator.'}
        </span>
      </div>
      <span className="val">{Number(display).toFixed(2)}</span>
      <input ref={ref} type="range" min="0" max="1" step="0.05" value={display} onChange={e => setDisplay(e.target.value)} />
    </div>
  );
}
