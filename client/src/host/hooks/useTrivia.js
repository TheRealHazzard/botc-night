import { useEffect, useState } from 'react';

// Fetched once, cached at module scope, same pattern as useTokens.js.
let cached = null;
let inflight = null;

export function useTrivia() {
  const [trivia, setTrivia] = useState(cached || []);

  useEffect(() => {
    if (cached) return;
    if (!inflight) inflight = fetch('/trivia.json').then(r => r.json()).catch(() => []);
    let cancelled = false;
    inflight.then(t => {
      cached = t;
      if (!cancelled) setTrivia(t);
    });
    return () => { cancelled = true; };
  }, []);

  return trivia;
}
