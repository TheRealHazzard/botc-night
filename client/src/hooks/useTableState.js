import { useCallback, useEffect, useState } from 'react';

const TOKEN_KEY = 'botc-player-token';

/** Owns the token + the live connection to the table, replacing the
    vanilla version's connect()/pollPlayerState()/applyPlayerState() trio.
    Per-choice UI state (picked targets, claim-builder progress, etc.) is
    deliberately *not* centralized here the way the old version's globals
    were — each prompt component owns its own useState and gets a fresh
    one via React's own key-based remount whenever the phase changes,
    which is what the old code's manual "reset every local variable on a
    new phase key" block was standing in for. */
export function useTableState() {
  const [token, setTokenState] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [P, setP] = useState(null);

  const setToken = useCallback(t => {
    localStorage.setItem(TOKEN_KEY, t);
    setTokenState(t);
  }, []);

  // The vanilla version did location.reload() here — it had no clean way
  // to unmount and restart the app's state short of a real reload. React
  // doesn't need that: clearing the token flows straight into P becoming
  // null below, which naturally renders the join flow again with no
  // full-page reload.
  const forgetToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setTokenState(null);
  }, []);

  useEffect(() => {
    if (!token) { setP(null); return; }
    let cancelled = false;
    let fallbackTimer;
    let pollTimer;
    let liveMessageReceived = false;

    const applyState = data => { if (!cancelled) setP(data); };

    const pollOnce = () => {
      fetch('/api/state?token=' + encodeURIComponent(token))
        .then(r => {
          if (r.status === 404) { forgetToken(); return null; }
          return r.json();
        })
        .then(data => { if (data) applyState(data); })
        .catch(() => {});
    };

    const es = new EventSource('/events?token=' + encodeURIComponent(token));
    es.onmessage = e => {
      liveMessageReceived = true;
      clearTimeout(fallbackTimer);
      applyState(JSON.parse(e.data));
    };
    es.onerror = () => {
      // Token no longer matches anyone server-side (new game, or it was
      // never valid) — clear it and start over rather than spin forever.
      fetch('/events?token=' + encodeURIComponent(token))
        .then(r => { if (r.status === 404) forgetToken(); })
        .catch(() => {});
    };
    // A proxy sitting in front of this server (a tunnel, most likely) can
    // hold the connection open without ever delivering anything — by that
    // point the join itself already succeeded, so without this the screen
    // would just sit frozen with no indication anything's wrong. If
    // nothing real arrives quickly, fall back to plain polling.
    fallbackTimer = setTimeout(() => {
      if (liveMessageReceived || cancelled) return;
      es.close();
      pollOnce();
      pollTimer = setInterval(pollOnce, 1500);
    }, 4000);

    return () => {
      cancelled = true;
      es.close();
      clearTimeout(fallbackTimer);
      clearInterval(pollTimer);
    };
  }, [token, forgetToken]);

  // A player's chosen color re-brands their own wordmark and primary
  // actions only — set as a CSS custom property so every button/heading
  // that already reads var(--personal-accent) just picks it up.
  useEffect(() => {
    if (P?.you?.color) {
      document.documentElement.style.setProperty('--personal-accent', P.you.color.hex);
    }
  }, [P?.you?.color?.hex]);

  return { P, token, setToken, forgetToken };
}
