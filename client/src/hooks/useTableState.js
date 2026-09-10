import { useCallback, useEffect, useState } from 'react';

const TOKEN_KEY = 'botc-player-token';

// Missed this many consecutive 20-second server pings (see server.js's
// openStream) before treating the connection as stalled and falling back
// to polling — generous enough that a couple of dropped/delayed pings on a
// shaky connection doesn't cause a false-positive switch.
const STALE_AFTER_MS = 65000;
const STALE_CHECK_INTERVAL_MS = 10000;

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
    let es;
    let fallbackTimer;
    let pollTimer;
    let staleCheckTimer;
    let liveMessageReceived = false;
    let lastActivityAt = Date.now();

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

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      if (es) es.close();
      pollOnce();
      pollTimer = setInterval(pollOnce, 1500);
    };

    es = new EventSource('/events?token=' + encodeURIComponent(token));
    es.onmessage = e => {
      liveMessageReceived = true;
      lastActivityAt = Date.now();
      clearTimeout(fallbackTimer);
      applyState(JSON.parse(e.data));
    };
    // The server's keep-alive (every 20s, see openStream in server.js) —
    // real state pushes only happen when something actually changes, so a
    // long quiet stretch (nothing to report) is expected and not itself a
    // sign of trouble; only a *missing* ping means the connection died.
    es.addEventListener('ping', () => { lastActivityAt = Date.now(); });
    es.onerror = () => {
      // Token no longer matches anyone server-side (new game, or it was
      // never valid) — clear it and start over rather than spin forever.
      // Any other error is a genuine connection failure (server restart,
      // network drop) — fall back to polling rather than waiting on the
      // browser's own EventSource retry.
      fetch('/events?token=' + encodeURIComponent(token))
        .then(r => { if (r.status === 404) forgetToken(); else startPolling(); })
        .catch(() => startPolling());
    };
    // A proxy sitting in front of this server (a tunnel, most likely) can
    // hold the connection open without ever delivering anything — by that
    // point the join itself already succeeded, so without this the screen
    // would just sit frozen with no indication anything's wrong. If
    // nothing real arrives quickly, fall back to plain polling.
    fallbackTimer = setTimeout(() => {
      if (liveMessageReceived || cancelled) return;
      startPolling();
    }, 4000);
    // The above only ever fires once, at cold start — this is what catches
    // the same "proxy silently stalls the stream" failure happening later,
    // mid-game, after messages (and pings) were flowing fine for a while.
    staleCheckTimer = setInterval(() => {
      if (pollTimer || cancelled) return;
      if (Date.now() - lastActivityAt > STALE_AFTER_MS) startPolling();
    }, STALE_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      es.close();
      clearTimeout(fallbackTimer);
      clearInterval(pollTimer);
      clearInterval(staleCheckTimer);
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
