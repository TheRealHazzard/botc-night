import { useEffect, useState } from 'react';

/** The current script's own character roster, for the reference grid panel
    — refetched every time `scriptId` changes, unlike the player app's
    `useScript.js` (which caches forever, correct there since a player's
    own game script never changes mid-session, wrong here since the host
    can change scripts repeatedly before dealing).

    /api/script has no scriptId param — it just returns whatever script the
    server currently has — so two fetches can race if the host flips
    scripts again before the first one resolves. The standard effect-
    cleanup `cancelled` flag already solves this correctly: changing
    `scriptId` tears down the in-flight effect for the *previous* id before
    starting a new one, so a late-arriving stale response is discarded
    exactly the way `syncScriptChars()`'s own `data.edition !== S.script`
    check discarded it. */
export function useScriptRoster(scriptId) {
  const [characters, setCharacters] = useState(null);

  useEffect(() => {
    if (!scriptId) { setCharacters(null); return; }
    setCharacters(null);
    let cancelled = false;
    fetch('/api/script')
      .then(r => r.json())
      .then(data => {
        if (cancelled || data.edition !== scriptId) return;
        setCharacters(data.characters);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scriptId]);

  return characters;
}
