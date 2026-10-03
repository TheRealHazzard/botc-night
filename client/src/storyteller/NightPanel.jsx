import { useEffect, useState } from 'react';
import { api } from './api.js';

/** One living player's own prompt, entered by the Storyteller instead of
    that player's own phone — every seat gets a real-or-decoy prompt every
    night by design (promptFor, game/engine.js), submitted is already
    visible on hostState.players[].submitted so this never needs its own
    "done" tracking. */
function SeatRow({ player, onSubmitted, onError }) {
  const [prompt, setPrompt] = useState(undefined); // undefined = not loaded yet, null = none
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [characterGuess, setCharacterGuess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (player.submitted) return;
    api.playerState(player.id).then(s => setPrompt(s.prompt || null)).catch(() => setPrompt(null));
  }, [player.id, player.submitted]);

  function toggle(id) {
    setSelected(sel => {
      if (sel.includes(id)) return sel.filter(x => x !== id);
      if (sel.length >= prompt.count) return prompt.count === 1 ? [id] : sel;
      return [...sel, id];
    });
  }

  async function submit() {
    setBusy(true);
    try {
      await api.submitAction(player.id, selected, characterGuess || undefined);
      setOpen(false);
      onSubmitted();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (player.submitted) {
    return <li className="st-seat st-seat-done">{player.name} <span className="st-tag">submitted</span></li>;
  }
  if (prompt === undefined) return <li className="st-seat">{player.name} <span className="st-tag">loading…</span></li>;
  if (prompt === null) return <li className="st-seat st-seat-done">{player.name} <span className="st-tag">nothing tonight</span></li>;

  return (
    <li className="st-seat">
      <div className="st-seat-row">
        <span>{player.name}</span>
        <button onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Enter choice'}</button>
      </div>
      {open && (
        <div className="st-seat-entry">
          <p className="st-prompt-text">{prompt.text}</p>
          <div className="st-target-grid">
            {prompt.targets.map(t => (
              <label key={t.id} className={selected.includes(t.id) ? 'st-target st-target-on' : 'st-target'}>
                <input
                  type={prompt.count === 1 ? 'radio' : 'checkbox'}
                  checked={selected.includes(t.id)}
                  onChange={() => toggle(t.id)}
                />
                {t.name}
              </label>
            ))}
          </div>
          {prompt.guessCharacter && (
            <select value={characterGuess} onChange={e => setCharacterGuess(e.target.value)}>
              <option value="">No character guess</option>
              {(prompt.characterOptions || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button
            className="st-primary"
            disabled={busy || (selected.length !== prompt.count && !(prompt.optional && selected.length === 0))}
            onClick={submit}
          >
            Submit
          </button>
        </div>
      )}
    </li>
  );
}

export default function NightPanel({ hostState, onChange, onError }) {
  const living = (hostState.players || []).filter(p => p.alive);
  return (
    <div className="st-panel">
      <h2>Night {hostState.nightNumber}</h2>
      <p className="st-hint">Enter each living seat's own choice as they tell it to you. Chef/Empath-style seats still need a tap — they just have nothing real to choose.</p>
      <ul className="st-roster st-roster-night">
        {living.map(p => <SeatRow key={p.id} player={p} onSubmitted={onChange} onError={onError} />)}
      </ul>
    </div>
  );
}
