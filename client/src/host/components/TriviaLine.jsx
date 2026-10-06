import { useEffect, useState } from 'react';
import { useTrivia } from '../hooks/useTrivia.js';
import { eligibleTrivia, rollTrivia } from '../lib/trivia.js';
import Icon from './Icon.jsx';

/** Idle-hands trivia — normally left alone across renders (a fact that
    changed every time someone cast a vote would be more distracting than
    idle time ever was), rerolled only on its own 14s timer.

    One real exception, checked on every render rather than only on the
    timer: a script change picked from the selector can leave a now-
    ineligible fact on screen (one scoped to the script just left behind)
    until the next 14s tick happened to fire. `fact` gets corrected
    synchronously during render whenever it's no longer valid for the
    current `trivia`/`scriptId` — an officially-supported React pattern
    for state that needs to react to a prop change without waiting for an
    effect+extra paint.

    One card shape everywhere now, no `compact` variant — every real call
    site already used it, the plain bordered-callout version was dead CSS
    nothing actually rendered. Card styling (a bold title bar over a
    bordered body) adapted from a trading-card design the project's own
    human found on CodePen (codepen.io/simeydotme/pen/abYWJdX), translated
    into this app's dark/brass palette — just the card shape, not that
    pen's own side action-button bar, which had no real use here. */
export default function TriviaLine({ scriptId }) {
  const trivia = useTrivia();
  const eligible = eligibleTrivia(trivia, scriptId);
  const [fact, setFact] = useState(null);

  const stale = fact && !eligible.some(t => t.fact === fact);
  const needsInitialRoll = !fact && eligible.length > 0;
  if (stale || needsInitialRoll) {
    const next = rollTrivia(eligible, fact);
    if (next !== fact) setFact(next);
  }

  useEffect(() => {
    const id = setInterval(() => {
      const currentEligible = eligibleTrivia(trivia, scriptId);
      setFact(current => rollTrivia(currentEligible, current));
    }, 14000);
    return () => clearInterval(id);
  }, [trivia, scriptId]);

  if (!fact) return null;

  return (
    <div className="trivia-card">
      <div className="trivia-card-title">Did you know</div>
      <div className="trivia-card-body">
        <Icon name="bulb" size={15} />
        <span>{fact}</span>
      </div>
    </div>
  );
}
