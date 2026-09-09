import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from '../../lib/scriptMeta.js';

// Dots + the difficulty name, inline — used by the selector's list rows.
// ScriptDifficultyPanel draws the same information as its own boxed panel
// rather than reusing this directly (different enough markup that sharing
// it would need more parameters than it's worth), but both read the same
// DIFFICULTY_LABELS/DIFFICULTY_LEVELS so they can't drift apart on the
// names or the dot count.
export default function ScriptDifficultyRow({ meta }) {
  return (
    <div className="difficulty">
      <div className="dots">
        {DIFFICULTY_LEVELS.map(i => (
          <span key={i} className={'dot' + (i <= meta.difficulty ? ' on' : '')} />
        ))}
      </div>
      <span>{DIFFICULTY_LABELS[meta.difficulty] || ''}</span>
    </div>
  );
}
