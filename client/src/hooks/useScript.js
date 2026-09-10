import { useEffect, useState } from 'react';

// The script overlay's roster doesn't change mid-game — fetched once,
// lazily (only once the overlay is actually opened, matching the vanilla
// version's openScript()), and cached at module scope so reopening it
// never re-fetches.
let cached = null;
let inflight = null;

export function useScript(enabled) {
  const [data, setData] = useState(cached);

  useEffect(() => {
    if (!enabled || cached) return;
    if (!inflight) inflight = fetch('/api/script').then(r => r.json());
    let cancelled = false;
    inflight.then(d => {
      cached = d;
      if (!cancelled) setData(d);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  return data;
}

// Test-only: without this, whichever test in a file happens to render
// first with the overlay open permanently wins the module-level cache for
// every other test in that file, regardless of what each one mocks
// /api/script to return.
export function __resetScriptCacheForTests() {
  cached = null;
  inflight = null;
}
