import { useCommittedInput } from '../../../hooks/useCommittedInput.js';

export default function DramaSection({ config, patch, liveDramaBias }) {
  const hintNights = config.hintNights || [];

  const toggleNight = n => {
    const set = new Set(hintNights);
    if (set.has(n)) set.delete(n); else set.add(n);
    patch({ hintNights: [...set] });
  };

  return (
    <div className="settings-section">
      <h3>Drama</h3>
      <div className="settings-row">
        <div className="lbl">
          <b>Adaptive pacing</b>
          <span>let it tune itself live from how the game is going, instead of the fixed dial below</span>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            aria-label="Adaptive pacing"
            checked={!!config.adaptiveDrama}
            onChange={e => patch({ adaptiveDrama: e.target.checked })}
          />
          <span className="track" />
        </label>
      </div>
      <DramaBiasRow
        value={config.dramaBias}
        onCommit={v => patch({ dramaBias: Number(v) })}
        disabled={!!config.adaptiveDrama}
        liveValue={config.adaptiveDrama ? liveDramaBias : null}
      />
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

function DramaBiasRow({ value, onCommit, disabled, liveValue }) {
  const { ref, display, setDisplay } = useCommittedInput(value, onCommit);
  return (
    <div className="settings-row">
      <div className="lbl">
        <b>Drama bias</b>
        <span>
          {disabled
            ? `0 = coldly random, 1 = maximum tension — right now, live: ${Number(liveValue ?? 0).toFixed(2)}`
            : '0 = coldly random, 1 = maximum tension'}
        </span>
      </div>
      <span className="val">{Number(display).toFixed(2)}</span>
      <input ref={ref} type="range" min="0" max="1" step="0.05" value={display} onChange={e => setDisplay(e.target.value)} disabled={disabled} />
    </div>
  );
}
