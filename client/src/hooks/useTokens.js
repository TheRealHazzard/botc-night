import { useEffect, useState } from 'react';

// Character art if it exists on this machine — fetched once and cached at
// module scope (not per-mount) since the manifest never changes mid-session,
// same as the vanilla version's single fetch('/api/tokens') at boot.
let cached = null;
let inflight = null;

export function useTokens() {
  const [tokens, setTokens] = useState(cached || {});

  useEffect(() => {
    if (cached) return;
    if (!inflight) {
      inflight = fetch('/api/tokens').then(r => r.json()).catch(() => ({}));
    }
    let cancelled = false;
    inflight.then(t => {
      cached = t;
      if (!cancelled) setTokens(t);
    });
    return () => { cancelled = true; };
  }, []);

  return tokens;
}
