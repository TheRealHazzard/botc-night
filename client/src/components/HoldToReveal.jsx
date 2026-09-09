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
      <div className="hold" onPointerDown={() => setShown(true)}>
        {label}
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
