import { NARRATOR_PERSONAS, nightOpenLine } from '../../lib/narratorLines.js';

// A human Storyteller's voice is fixed table to table; an AI one doesn't
// have to be. Purely cosmetic — see narratorLines.js's own header comment
// — so there's no "are you sure" gate here the way llmStorytellerEnabled
// or disabledCharacterIds get.
//
// Each option carries its own real sample line (night 2's "no deaths yet"
// opener, picked because it's short and needs no live game state) instead
// of just a label + blurb — a host choosing a voice blind, with nothing
// to compare, was the whole gap this closes.
export default function NarratorSection({ config, patch }) {
  const current = config.narratorPersona || 'dramatic';

  return (
    <div className="settings-section">
      <h3>Narrator voice</h3>
      <div className="persona-list">
        {NARRATOR_PERSONAS.map(p => (
          <label key={p.id} className="persona-option">
            <input
              type="radio"
              name="narratorPersona"
              aria-label={p.label}
              checked={current === p.id}
              onChange={() => patch({ narratorPersona: p.id })}
            />
            <div className="persona-option-text">
              <div className="persona-option-head">
                <b>{p.label}</b>
                <span className="sub">{p.blurb}</span>
              </div>
              <p className="persona-sample">&ldquo;<span>{nightOpenLine(2, 0, p.id)}</span>&rdquo;</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
