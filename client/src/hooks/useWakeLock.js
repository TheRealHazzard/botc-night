import { useEffect } from 'react';

/** A phone that locks itself mid-window makes a player silently miss their
    turn — the game has no way to tell them apart from someone deliberately
    not answering. Hold the screen awake while `active`, nothing more. Wake
    locks are released by the OS whenever the tab goes to the background, so
    this re-acquires on becoming visible again while still active — the
    same thing the vanilla version's visibilitychange listener did. */
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock = null;
    let cancelled = false;

    const acquire = () => {
      navigator.wakeLock.request('screen').then(l => {
        if (cancelled) { l.release().catch(() => {}); return; }
        lock = l;
      }).catch(() => {});
    };
    acquire();

    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) lock.release().catch(() => {});
    };
  }, [active]);
}
