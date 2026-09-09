import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from '../../lib/scriptMeta.js';

// A bigger, standalone difficulty readout for the script view panel's
// column — the same Easy/Medium/Hard/Very Hard dots ScriptDifficultyRow
// draws, just sized up into its own boxed panel.
export default function ScriptDifficultyPanel({ meta }) {
  return (
    <div className="detail-stat-panel">
      <div className="detail-stat-panel-title">Difficulty</div>
      <div className="detail-difficulty-big">
        <div className="detail-difficulty-dots">
          {DIFFICULTY_LEVELS.map(i => (
            <span key={i} className={'dot' + (i <= meta.difficulty ? ' on' : '')} />
          ))}
        </div>
        <span className="detail-difficulty-label">{DIFFICULTY_LABELS[meta.difficulty] || ''}</span>
      </div>
    </div>
  );
}
