import { useEffect, useState } from 'react';

// Missed this many consecutive 20-second server pings (see server.js's
// openStream) before treating the connection as stalled and falling back
// to polling — same threshold the host TV's own useHostState.js uses.
const STALE_AFTER_MS = 65000;
const STALE_CHECK_INTERVAL_MS = 10000;

/** Powers LeaderControlsOverlay.jsx — the same live table view the host TV
    gets (via /host-events, with the same poll-fallback shape as
    client/src/host/hooks/useHostState.js), just fetched from the leader's
    own phone instead. `enabled` gates the actual connection: pass
    `open` from the overlay so the one player holding leadership doesn't
    carry a second live connection running the entire game in the
    background on top of their own already-open player stream — only
    while they actually have the controls overlay open. */
export function useLeaderState(enabled) {
  const [S, setS] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let es;
    let fallbackTimer;
    let pollTimer;
    let staleCheckTimer;
    let liveMessageReceived = false;
    let lastActivityAt = Date.now();

    const applyState = data => { if (!cancelled) setS(data); };

    const pollOnce = () => {
      fetch('/api/host-state')
        .then(r => r.json())
        .then(applyState)
        .catch(() => {});
    };

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      if (es) es.close();
      pollOnce();
      pollTimer = setInterval(pollOnce, 1500);
    };

    es = new EventSource('/host-events');
    es.onmessage = e => {
      liveMessageReceived = true;
      lastActivityAt = Date.now();
      clearTimeout(fallbackTimer);
      applyState(JSON.parse(e.data));
    };
    es.addEventListener('ping', () => { lastActivityAt = Date.now(); });
    es.onerror = startPolling;
    fallbackTimer = setTimeout(() => {
      if (liveMessageReceived || cancelled) return;
      startPolling();
    }, 4000);
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
  }, [enabled]);

  return S;
}

/** A leader-control action failed specifically because this table requires
    a host code the leader's phone doesn't have (see server.js's
    blockedByGate) — the one case LeaderControlsOverlay.jsx needs to
    explain rather than just show the raw error, since "Enter the host
    code first." means nothing out of context on a phone that never saw
    /host. Deliberately NOT bypassed for the leader: if the table's
    operator locked host actions behind a code, the first person to join
    the lobby doesn't get to skip that. */
export function isHostCodeError(result) {
  return !!result && result.error === 'Enter the host code first.';
}
