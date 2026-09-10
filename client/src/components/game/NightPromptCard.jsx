import { useEffect, useRef, useState } from 'react';
import TargetButton from '../TargetButton.jsx';
import { post } from '../../lib/api.js';

/** The one really stateful prompt — multi-select targets up to a count,
    an optional character guess, a live countdown, and a window that
    closes on a player who never locked in shouldn't just silently skip
    their character: it auto-fills whatever's missing at random and
    submits. picked/guessedCharacter/autoSubmitted all lived as module
    globals in the vanilla version, reset by hand on every phase change;
    here they're this component's own state, reset for free by React
    remounting it under a fresh key whenever the phase changes (see
    PlayerApp). */
export default function NightPromptCard({ P, token }) {
  const prompt = P.prompt;
  const [picked, setPicked] = useState([]);
  const [guessedCharacter, setGuessedCharacter] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0); // re-render to tick the countdown

  const autoSubmittedRef = useRef(false);
  const pickedRef = useRef(picked);
  const guessedRef = useRef(guessedCharacter);
  pickedRef.current = picked;
  guessedRef.current = guessedCharacter;

  const submitTargets = (targets, characterGuess) =>
    post('/api/action', { token, targets, characterGuess }).then(r => {
      if (!r.error) { setPicked([]); setGuessedCharacter(null); }
      return r;
    });

  useEffect(() => {
    if (P.submitted || P.watching) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
      if (autoSubmittedRef.current) return;
      if (!P.windowEndsAt || Date.now() < P.windowEndsAt) return;
      autoSubmittedRef.current = true;

      const currentPicked = pickedRef.current;
      const need = prompt.count - currentPicked.length;
      let finalPicked = currentPicked;
      if (need > 0) {
        const pool = prompt.targets.filter(t => !currentPicked.includes(t.id));
        const extra = [];
        for (let i = 0; i < need && pool.length; i++) {
          extra.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
        }
        finalPicked = [...currentPicked, ...extra];
        setPicked(finalPicked);
      }
      let guess = guessedRef.current;
      if (prompt.guessCharacter && !guess) {
        guess = prompt.characterOptions[Math.floor(Math.random() * prompt.characterOptions.length)].id;
        setGuessedCharacter(guess);
      }
      // If this fails (a stray network blip — the deadline itself was
      // already checked above), un-flag so the next tick gets another
      // shot at it instead of leaving the player permanently stuck with
      // no submission and no feedback.
      submitTargets(finalPicked, guess).then(r => { if (r.error) autoSubmittedRef.current = false; });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [P.submitted, P.watching, P.windowEndsAt]);

  const left = P.windowEndsAt ? Math.max(0, Math.ceil((P.windowEndsAt - Date.now()) / 1000)) : 0;

  const toggleTarget = id => {
    setPicked(cur => (cur.includes(id) ? cur.filter(x => x !== id) : cur.length < prompt.count ? [...cur, id] : cur));
  };

  const chosenNames = picked
    .map(id => (prompt.targets.find(t => t.id === id) || {}).name)
    .filter(Boolean);
  const guessName = guessedCharacter && prompt.characterOptions
    ? (prompt.characterOptions.find(o => o.id === guessedCharacter) || {}).name
    : null;
  const ready = picked.length === prompt.count && (!prompt.guessCharacter || guessedCharacter);
  const lockLabel = ready
    ? `Lock in ${[chosenNames.join(' & '), guessName].filter(Boolean).join(' — ')}`
    : 'Lock in';

  // The auto-submit interval (above) only ever checked its OWN flag before
  // firing — a manual lockIn()/pass() never set it, so the interval had no
  // way to know a real submission was already in flight. If that manual
  // request resolved (clearing picked/guessedCharacter back to empty) before
  // the next SSE push confirms P.submitted back to this component, the
  // interval's very next tick would see an empty `picked`, conclude nothing
  // had been chosen, and fire a second, random submission that silently
  // overwrote the player's real one. Flagging here closes that window;
  // unflagging only on failure keeps the auto-submit fallback available if
  // the manual attempt didn't actually land.
  const lockIn = () => {
    autoSubmittedRef.current = true;
    setBusy(true);
    submitTargets(picked, guessedCharacter).then(r => {
      if (r.error) { alert(r.error); setBusy(false); autoSubmittedRef.current = false; }
    });
  };
  const pass = () => {
    autoSubmittedRef.current = true;
    setBusy(true);
    submitTargets([], null).then(r => {
      if (r.error) { alert(r.error); setBusy(false); autoSubmittedRef.current = false; }
    });
  };

  return (
    <div className="card">
      <div className={'clock' + (left <= 10 ? ' urgent' : '')}>{left}</div>

      {P.submitted ? (
        <>
          <h2>Answered.</h2>
          <p className="dim">{P.watching ? 'The bot has decided.' : 'Put the phone down. Keep your face still.'}</p>
        </>
      ) : (
        <>
          <h2>{prompt.text}</h2>
          {prompt.count > 1 && <p className="dim small">Choose {prompt.count}.</p>}
          <div className="targets">
            {prompt.targets.map(t => (
              <TargetButton
                key={t.id}
                target={t}
                selected={picked.includes(t.id)}
                disabled={P.watching}
                onClick={P.watching ? undefined : () => toggleTarget(t.id)}
              />
            ))}
          </div>
          {prompt.guessCharacter && !P.watching && (
            <>
              <p className="dim small">Now guess their character.</p>
              <div className="targets">
                {prompt.characterOptions.map(opt => (
                  <TargetButton
                    key={opt.id}
                    target={opt}
                    selected={guessedCharacter === opt.id}
                    onClick={() => setGuessedCharacter(opt.id)}
                  />
                ))}
              </div>
            </>
          )}
          {P.watching ? (
            <p className="dim small">Waiting for the bot to choose&hellip;</p>
          ) : (
            <>
              <button type="button" className="primary" disabled={!ready || busy} onClick={lockIn}>
                {lockLabel}
              </button>
              {prompt.optional && (
                <button type="button" className="linklike" disabled={busy} onClick={pass}>
                  Pass — choose no one
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
