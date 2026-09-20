import { useEffect, useState } from 'react';

// No rem-based type scale existed anywhere in this stylesheet before —
// body{font-size:17px} was the only sizing rule in the whole player app —
// so this is the one control that actually moves it. Persisted per device
// (a dim room, a shared phone, a table full of different eyes), not per
// game, so a table's regular player only ever sets this once.
const SCALES = [1, 1.15, 1.3];
const KEY = 'botc-text-scale';

export function useTextScale() {
  const [index, setIndex] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      const i = SCALES.indexOf(saved);
      return i === -1 ? 0 : i;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(SCALES[index]));
    try { localStorage.setItem(KEY, String(SCALES[index])); } catch { /* private browsing, quota, etc — just doesn't persist */ }
  }, [index]);

  const cycle = () => setIndex(i => (i + 1) % SCALES.length);
  return { scale: SCALES[index], cycle };
}
