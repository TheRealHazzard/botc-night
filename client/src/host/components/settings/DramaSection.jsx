import { useCommittedInput } from '../../../hooks/useCommittedInput.js';

export default function DramaSection({ config, patch }) {
  const hintNights = config.hintNights || [];

  const toggleNight = n => {
    const set = new Set(hintNights);
    if (set.has(n)) set.delete(n); else set.add(n);
    patch({ hintNights: [...set] });
  };

  return (
    <div className="settings-section">
      <h3>Drama</h3>
      <DramaBiasRow value={config.dramaBias} onCommit={v => patch({ dramaBias: Number(v) })} />
      <div className="settings-row">
        <div className="lbl">
          <b>Hint nights</b>
          <span>the dead stop speaking after these nights</span>
        </div>
        <div className="settings-nights">
          {[1, 2, 3].map(n => (
            <label key={n}>
              <input type="checkbox" checked={hintNights.includes(n)} onChange={() => toggleNight(n)} />
              Night {n}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function DramaBiasRow({ value, onCommit }) {
  const { ref, display, setDisplay } = useCommittedInput(value, onCommit);
  return (
    <div className="settings-row">
      <div className="lbl">
        <b>Drama bias</b>
        <span>0 = coldly random, 1 = maximum tension</span>
      </div>
      <span className="val">{Number(display).toFixed(2)}</span>
      <input ref={ref} type="range" min="0" max="1" step="0.05" value={display} onChange={e => setDisplay(e.target.value)} />
    </div>
  );
}
