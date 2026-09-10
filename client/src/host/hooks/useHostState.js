import { useCallback, useEffect, useRef, useState } from 'react';
import { post } from '../../lib/api.js';

// Missed this many consecutive 20-second server pings (see server.js's
// openStream) before treating the connection as stalled and falling back
// to polling — generous enough that a couple of dropped/delayed pings on a
// shaky connection doesn't cause a false-positive switch.
const STALE_AFTER_MS = 65000;
const STALE_CHECK_INTERVAL_MS = 10000;

/** Owns the live connection to the table for the host screen — mirrors
    client/src/hooks/useTableState.js's EventSource+poll-fallback shape,
    minus the token (the host has none). `EventSource('/host-events')`
    with the same 4-second-fallback-to-1500ms-polling pattern as the
    player hook (verified identical interval, no discrepancy). */
export function useHostState() {
  const [S, setS] = useState(null);
  const liveMessageReceivedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let es;
    let fallbackTimer;
    let pollTimer;
    let staleCheckTimer;
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
      liveMessageReceivedRef.current = true;
      lastActivityAt = Date.now();
      clearTimeout(fallbackTimer);
      applyState(JSON.parse(e.data));
    };
    // The server's keep-alive (every 20s, see openStream in server.js) —
    // real state pushes only happen when something actually changes, so a
    // long quiet stretch (nothing to report) is expected and not itself a
    // sign of trouble; only a *missing* ping means the connection died.
    es.addEventListener('ping', () => { lastActivityAt = Date.now(); });
    // A genuine connection failure (server restart, network drop) — the
    // browser will keep retrying EventSource on its own, but there's no
    // reason to wait on that when plain polling already works.
    es.onerror = startPolling;
    // A proxy in front of this server (a tunnel, most likely) can hold this
    // connection open without ever delivering anything — the TV would just
    // sit on "finding the address…" forever with no sign anything's wrong.
    fallbackTimer = setTimeout(() => {
      if (liveMessageReceivedRef.current || cancelled) return;
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
  }, []);

  // Mirrors the vanilla's `patch()` closure inside settingsOverlay(): posts
  // a config patch, and on success folds the server's merged config back
  // into S immediately (rather than waiting for the next SSE push). The
  // POST itself fires exactly once per call (it's not inside a setState
  // updater); the merge afterward uses the updater form purely to read the
  // latest S, which is the safe half of the pattern the player port's
  // castVote fix distinguished — the unsafe half would be calling post()
  // *from inside* an updater, which StrictMode's double-invocation would
  // then double-fire.
  const patchConfig = useCallback(cfg => {
    return post('/api/table/config', { config: cfg }).then(r => {
      if (!r.error) setS(s => s && { ...s, config: r.config });
      return r;
    });
  }, []);

  return { S, patchConfig };
}
