import { useEffect, useRef, useState } from 'react';

const HOLD_MS = 850;

/** The role-reveal ceremony: a real press-and-hold (a filling ring under
    the thumb), not HoldToReveal.jsx's instant tap — this is the one moment
    in the whole app worth a beat of its own, the first thing a player ever
    learns about their own game. Releasing early cancels with no partial
    reveal; there's no way to "peek". Keeps HoldToReveal's core privacy
    property regardless: `children` is a function, so the secret literally
    isn't in the DOM until the hold actually completes. */
export default function RoleReveal({ label, children }) {
  const [shown, setShown] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 while the pointer is held down
  const rafRef = useRef(null);
  const startRef = useRef(0);

  const cancel = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setProgress(0);
  };

  const tick = () => {
    const p = Math.min(1, (Date.now() - startRef.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      setShown(true);
      rafRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const start = () => {
    startRef.current = Date.now();
    rafRef.current = requestAnimationFrame(tick);
  };

  // Only ever cleans up an in-flight hold on unmount — once `shown` is
  // true there's nothing left running to cancel.
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  if (!shown) {
    return (
      <div
        className="hold role-hold"
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
      >
        <div className="hold-ring" style={{ '--hold-progress': progress }} />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div>
      {children()}
      <button type="button" onClick={() => setShown(false)}>Hide</button>
    </div>
  );
}
