import { useEffect, useState } from 'react';
import { useTrivia } from '../hooks/useTrivia.js';
import { useTokens } from '../../hooks/useTokens.js';
import { eligibleTrivia, rollTrivia } from '../lib/trivia.js';
import Icon from './Icon.jsx';

/** Idle-hands trivia — normally left alone across renders (a fact that
    changed every time someone cast a vote would be more distracting than
    idle time ever was), rerolled only on its own 14s timer.

    One real exception, checked on every render rather than only on the
    timer: a script change picked from the selector can leave a now-
    ineligible fact on screen (one scoped to the script just left behind)
    until the next 14s tick happened to fire. `entry` gets corrected
    synchronously during render whenever it's no longer valid for the
    current `trivia`/`scriptId` — an officially-supported React pattern
    for state that needs to react to a prop change without waiting for an
    effect+extra paint. Tracks the whole trivia entry now, not just its
    `.fact` text — a fact naming one specific character (public/trivia.json's
    own optional `character` id) shows that character's real token
    alongside it when the art actually exists on this machine, same
    useTokens() + graceful-text-fallback pattern ScriptRosterCard's own
    RosterToken already uses; a fact with no `character` (most of them —
    rules trivia, not a character-specific one) just shows the plain bulb
    icon it always has.

    One card shape everywhere now, no `compact` variant — every real call
    site already used it, the plain bordered-callout version was dead CSS
    nothing actually rendered. Card styling (a bold title bar over a
    bordered body) adapted from a trading-card design the project's own
    human found on CodePen (codepen.io/simeydotme/pen/abYWJdX), translated
    into this app's dark/brass palette — just the card shape, not that
    pen's own side action-button bar, which had no real use here. */
export default function TriviaLine({ scriptId }) {
  const trivia = useTrivia();
  const tokens = useTokens();
  const eligible = eligibleTrivia(trivia, scriptId);
  const [entry, setEntry] = useState(null);
  const [tokenFailed, setTokenFailed] = useState(false);

  const stale = entry && !eligible.some(t => t.fact === entry.fact);
  const needsInitialRoll = !entry && eligible.length > 0;
  if (stale || needsInitialRoll) {
    const next = rollTrivia(eligible, entry?.fact);
    if (next !== entry) {
      setEntry(next);
      setTokenFailed(false); // a stale failure from the PREVIOUS character shouldn't follow this one
    }
  }

  useEffect(() => {
    const id = setInterval(() => {
      const currentEligible = eligibleTrivia(trivia, scriptId);
      setEntry(current => {
        const next = rollTrivia(currentEligible, current?.fact);
        if (next !== current) setTokenFailed(false);
        return next;
      });
    }, 14000);
    return () => clearInterval(id);
  }, [trivia, scriptId]);

  if (!entry) return null;

  const tokenSrc = entry.character ? tokens[entry.character] : null;
  const showToken = tokenSrc && !tokenFailed;

  return (
    <div className="trivia-card">
      <div className="trivia-card-title">Did you know</div>
      <div className="trivia-card-body">
        {showToken ? (
          <img
            className="trivia-card-token"
            src={tokenSrc}
            alt=""
            onError={() => setTokenFailed(true)}
          />
        ) : (
          <Icon name="bulb" size={15} />
        )}
        <span>{entry.fact}</span>
      </div>
    </div>
  );
}
