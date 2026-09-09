import { useState } from 'react';
import TargetButton from '../TargetButton.jsx';
import { post } from '../../lib/api.js';

export default function JugglerGuess({ jugglerGuess, token }) {
  const [guesses, setGuesses] = useState([]);
  const [pickingFor, setPickingFor] = useState(null);
  const [busy, setBusy] = useState(false);

  const usedIds = new Set(guesses.map(g => g.playerId));
  const remaining = jugglerGuess.targets.filter(t => !usedIds.has(t.id));

  const removeGuess = i => setGuesses(cur => cur.filter((_, j) => j !== i));

  const addGuess = characterGuess => {
    setGuesses(cur => [...cur, { playerId: pickingFor, characterGuess }]);
    setPickingFor(null);
  };

  const submitLabel = guesses.length
    ? `Submit ${guesses.length} guess${guesses.length === 1 ? '' : 'es'}`
    : 'Submit (no guesses)';

  const submit = () => {
    setBusy(true);
    post('/api/juggler-guess', { token, guesses }).then(r => {
      if (r.error) { alert(r.error); setBusy(false); return; }
      setGuesses([]);
      setPickingFor(null);
    });
  };

  return (
    <div className="card">
      <h2>Juggle</h2>
      <p className="dim small">Your first day only. Publicly guess up to 5 players&rsquo; characters — say each guess out loud before adding it. Tonight you&rsquo;ll learn how many were correct.</p>

      {guesses.length > 0 && (
        <ul>
          {guesses.map((guess, i) => {
            const name = (jugglerGuess.targets.find(t => t.id === guess.playerId) || {}).name || '?';
            const charName = (jugglerGuess.characterOptions.find(o => o.id === guess.characterGuess) || {}).name || '?';
            return (
              <li key={i}>
                {name} — {charName}{' '}
                <button type="button" className="linklike" onClick={() => removeGuess(i)}>Remove</button>
              </li>
            );
          })}
        </ul>
      )}

      {guesses.length < 5 && remaining.length > 0 && (
        pickingFor === null ? (
          <>
            <p className="dim small">Guess {guesses.length + 1} of up to 5 — choose a player.</p>
            <div className="targets">
              {remaining.map(t => (
                <TargetButton key={t.id} target={t} selected={false} onClick={() => setPickingFor(t.id)} />
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="dim small">
              Now guess {(jugglerGuess.targets.find(t => t.id === pickingFor) || {}).name}&rsquo;s character.
            </p>
            <div className="targets">
              {jugglerGuess.characterOptions.map(opt => (
                <TargetButton key={opt.id} target={opt} selected={false} onClick={() => addGuess(opt.id)} />
              ))}
            </div>
            <button type="button" className="linklike" onClick={() => setPickingFor(null)}>Cancel this guess</button>
          </>
        )
      )}

      <button type="button" className="primary" disabled={pickingFor !== null || busy} onClick={submit}>
        {submitLabel}
      </button>
    </div>
  );
}
