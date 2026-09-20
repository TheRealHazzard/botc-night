import { useState } from 'react';

// Tap to reveal (pointerdown, not click — feels more immediate than
// waiting on a full click cycle), tap Hide to put it away again. The
// secret content isn't just visually hidden — it isn't rendered into the
// DOM at all until shown, same privacy property the vanilla version had by
// only building it inside show(). `children` is a function for exactly
// that reason: a plain element would already exist (and be inspectable)
// before the first tap.
export default function HoldToReveal({ label, children }) {
  const [shown, setShown] = useState(false);

  if (!shown) {
    return (
      // A real button: onPointerDown keeps the original tap-immediate feel
      // for touch/mouse (no need to wait out a full click cycle), onClick
      // is what a keyboard's Enter/Space actually fires — calling
      // setShown(true) twice on a real pointer tap is a harmless no-op.
      <button type="button" className="hold" onPointerDown={() => setShown(true)} onClick={() => setShown(true)}>
        {label}
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
