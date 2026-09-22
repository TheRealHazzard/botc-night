import { useEffect, useRef, useState } from 'react';

// Mirrors useHostState.js's own EventSource+poll-fallback shape almost
// exactly (same 4000ms/1500ms constants, same stale-connection recheck) —
// see that file's own comment for why each piece exists. The one real
// difference: /sim-events 403s whenever no simulation is currently
// running, which is a normal, expected state here (show the start form),
// not a connection failure to fall back from — so this probes first with
// a plain fetch and only opens the EventSource once that probe succeeds.
const STALE_AFTER_MS = 65000;
const STALE_CHECK_INTERVAL_MS = 10000;

/** Owns the live connection to a running Dry Run. `payload` stays null
    until a simulation is actually streaming; `reconnect()` is what the
    start form calls right after POST /api/sim/start succeeds, to probe
    and connect without waiting for this hook's own next mount. */
export function useSimStream() {
  const [payload, setPayload] = useState(null);
  const liveMessageReceivedRef = useRef(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let es;
    let fallbackTimer;
    let pollTimer;
    let staleCheckTimer;
    let lastActivityAt = Date.now();
    liveMessageReceivedRef.current = false;

    const applyState = data => { if (!cancelled) setPayload(data); };

    const pollOnce = () => {
      fetch('/api/sim-state')
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('sim not running'))))
        .then(applyState)
        .catch(() => {});
    };

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      if (es) es.close();
      pollOnce();
      pollTimer = setInterval(pollOnce, 1500);
    };

    const connect = () => {
      es = new EventSource('/sim-events');
      es.onmessage = e => {
        liveMessageReceivedRef.current = true;
        lastActivityAt = Date.now();
        clearTimeout(fallbackTimer);
        applyState(JSON.parse(e.data));
      };
      es.addEventListener('ping', () => { lastActivityAt = Date.now(); });
      es.onerror = startPolling;
      // A proxy in front of this server can hold the connection open
      // without ever delivering anything — same reasoning as
      // useHostState.js's own identical fallback.
      fallbackTimer = setTimeout(() => {
        if (liveMessageReceivedRef.current || cancelled) return;
        startPolling();
      }, 4000);
      staleCheckTimer = setInterval(() => {
        if (pollTimer || cancelled) return;
        if (Date.now() - lastActivityAt > STALE_AFTER_MS) startPolling();
      }, STALE_CHECK_INTERVAL_MS);
    };

    // A sim may already be running when this overlay opens (a previous
    // Dry Run still in progress) — probe before committing to a real
    // connection, exactly as simulate.html's own vanilla JS already does.
    fetch('/sim-events', { method: 'GET' })
      .then(r => { if (!cancelled && r.ok) connect(); })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (es) es.close();
      clearTimeout(fallbackTimer);
      clearInterval(pollTimer);
      clearInterval(staleCheckTimer);
    };
  }, [generation]);

  return { payload, reconnect: () => setGeneration(g => g + 1) };
}
