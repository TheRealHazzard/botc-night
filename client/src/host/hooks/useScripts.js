import { useEffect, useState } from 'react';

// The script picker's own metadata list (name/difficulty/stats per
// script) — fetched once, cached at module scope, same pattern as
// useTokens/useTrivia. Distinct from useScriptRoster, which fetches the
// CURRENT script's own character roster and refetches on every change.
let cached = null;
let inflight = null;

export function useScripts() {
  const [scripts, setScripts] = useState(cached);

  useEffect(() => {
    if (cached) return;
    if (!inflight) inflight = fetch('/api/scripts').then(r => r.json()).catch(() => null);
    let cancelled = false;
    inflight.then(s => {
      if (!s) return;
      cached = s;
      if (!cancelled) setScripts(s);
    });
    return () => { cancelled = true; };
  }, []);

  return scripts;
}
