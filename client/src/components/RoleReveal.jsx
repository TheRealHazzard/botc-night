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

  // A keyboard has no "hold" gesture of its own, so Enter/Space held down
  // is the equivalent: the browser repeats keydown while a key stays
  // pressed (event.repeat), which lines up with a pointer staying down —
  // only the FIRST keydown starts the timer, same as pointerdown firing
  // once. keyup cancels, same as pointerup.
  const onKeyDown = (e) => {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault(); // Space shouldn't also scroll the page
    start();
  };
  const onKeyUp = (e) => {
    if (e.key === 'Enter' || e.key === ' ') cancel();
  };

  if (!shown) {
    return (
      <button
        type="button"
        className="hold role-hold"
        aria-label={label}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <div className="hold-ring" style={{ '--hold-progress': progress }}>
          {/* The whole point of this element is being held down — iOS/
              Android's native "save image" callout on a long-pressed <img>
              directly fights that gesture. pointer-events:none (in CSS)
              keeps the image from ever being the touch target at all, this
              is just the belt-and-suspenders backup for browsers that
              still try. The wrapper (overflow:hidden + the icon's own
              slight overscale) crops out this particular PNG's own edge
              anti-aliasing, which otherwise shows as a faint light fringe
              around the circle. */}
          <div className="hold-ring-icon-wrap">
            <img className="hold-ring-icon" src="/icons/botc_head.png" alt="" draggable="false" onContextMenu={e => e.preventDefault()} />
          </div>
        </div>
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div>
      {children()}
      <button type="button" onClick={() => setShown(false)}>Hide</button>
    </div>
  );
}
