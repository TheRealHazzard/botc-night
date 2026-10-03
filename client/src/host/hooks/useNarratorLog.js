import { useEffect, useState } from 'react';
import { subscribeNarratorLog } from '../lib/narratorLog.js';

// Bounded, oldest drops off — a running log for a glance back, not an
// unbounded transcript. Newest first, matching how a host would actually
// scan it (what did it just say?).
const MAX_ENTRIES = 40;

export function useNarratorLog() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    return subscribeNarratorLog(entry => {
      setEntries(list => [entry, ...list].slice(0, MAX_ENTRIES));
    });
  }, []);

  return entries;
}
