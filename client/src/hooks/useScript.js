import { useEffect, useState } from 'react';

// The script overlay's roster doesn't change mid-game — fetched once,
// lazily (only once the overlay is actually opened, matching the vanilla
// version's openScript()), and cached at module scope so reopening it
// never re-fetches. It DOES change across games in the same browser
// session (the SPA is designed to persist across a table's second game
// without a reload — see useTableState.js) — cached.edition is compared
// against the game's current script so a script switch invalidates the
// stale cache instead of silently showing the previous game's roster.
let cached = null;
let inflight = null;

export function useScript(enabled, currentScript) {
  const [data, setData] = useState(cached);

  useEffect(() => {
    if (!enabled) return;
    if (cached && (!currentScript || cached.edition === currentScript)) return;
    if (!inflight) inflight = fetch('/api/script').then(r => r.json());
    let cancelled = false;
    inflight.then(d => {
      cached = d;
      inflight = null;
      if (!cancelled) setData(d);
    });
    return () => { cancelled = true; };
  }, [enabled, currentScript]);

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
