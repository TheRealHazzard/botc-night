import { useCallback, useEffect, useRef, useState } from 'react';
import { post } from '../../lib/api.js';

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
    let fallbackTimer;
    let pollTimer;

    const applyState = data => { if (!cancelled) setS(data); };

    const pollOnce = () => {
      fetch('/api/host-state')
        .then(r => r.json())
        .then(applyState)
        .catch(() => {});
    };

    const es = new EventSource('/host-events');
    es.onmessage = e => {
      liveMessageReceivedRef.current = true;
      clearTimeout(fallbackTimer);
      applyState(JSON.parse(e.data));
    };
    // A proxy in front of this server (a tunnel, most likely) can hold this
    // connection open without ever delivering anything — the TV would just
    // sit on "finding the address…" forever with no sign anything's wrong.
    fallbackTimer = setTimeout(() => {
      if (liveMessageReceivedRef.current || cancelled) return;
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
