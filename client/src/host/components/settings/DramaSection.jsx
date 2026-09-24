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
      <FeatureToggle
        label="Live notable-moment beats"
        description="A quiet ring pulse + chime the instant something pivotal-scored happens — a save, a shot landing on the Demon — never naming what or who."
        checked={config.liveBeatsEnabled}
        onChange={v => patch({ liveBeatsEnabled: v })}
      />
      <FeatureToggle
        label="Adaptive tension audio"
        description="The night/day ambience bed quietly rises as the living count drops or a vote closes in on its threshold."
        checked={config.adaptiveAudioEnabled}
        onChange={v => patch({ adaptiveAudioEnabled: v })}
      />
      <FeatureToggle
        label="Narration variety"
        description="Victory lines are picked from a small pool of phrasings instead of always the same fixed sentence. Off reverts to the original single line per condition."
        checked={config.narrationVarietyEnabled}
        onChange={v => patch({ narrationVarietyEnabled: v })}
      />
      <FeatureToggle
        label="Shareable session card"
        description="Whether the end-of-game screen offers a save/copy-able summary image at all."
        checked={config.shareCardEnabled}
        onChange={v => patch({ shareCardEnabled: v })}
      />
    </div>
  );
}

function FeatureToggle({ label, description, checked, onChange }) {
  return (
    <div className="settings-row">
      <div className="lbl">
        <b>{label}</b>
        <span>{description}</span>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
        <span className="track" />
      </label>
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
