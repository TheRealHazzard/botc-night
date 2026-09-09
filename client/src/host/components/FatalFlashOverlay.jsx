import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

/** A handful of game endings are dramatic enough to earn a beat of their
    own before the usual reveal fades in. Self-contained timing, mirroring
    the vanilla's playFatalBlow(blow, onDone) almost exactly: appears
    instantly, gets a `.show` class on the next animation frame (so the CSS
    transition actually has something to transition from), holds for
    2200ms, fades out over 380ms, then calls onDone — the parent
    (useFatalBlowSequencer) uses that to know the real reveal can render
    now, not a moment before.

    Meant to be freshly mounted for the lifetime of exactly one flash (the
    parent conditionally renders it, not this component managing its own
    show/hide) — the empty effect dependency array is deliberate, not an
    oversight: `blow`/`onDone` are only ever read from the props this
    instance was mounted with. */
export default function FatalFlashOverlay({ blow, onDone }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    const hideTimer = setTimeout(() => setShow(false), 2200);
    const doneTimer = setTimeout(onDone, 2580);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={'fatal-flash' + (show ? ' show' : '')}>
      <Icon name={blow.icon} size={88} />
      <div className="fatal-flash-text">{blow.text}</div>
    </div>
  );
}
