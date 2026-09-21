import { useEffect } from 'react';

/** The Bluff's visible half — see useBluffBeat.js. Purely decorative: a
    ~1.4s flicker across the whole screen, no text, no icon, nothing that
    could be read as meaning anything, since the entire point is that it
    doesn't. Toggles a class on <body> rather than rendering its own DOM,
    so it affects the whole view (the host's ring, a player's role card,
    whatever's on screen) without needing to be threaded through every
    view component — same reasoning FatalFlashOverlay's host-side cousin
    has for being a top-level overlay, just body-wide instead of a mounted
    element. Respects prefers-reduced-motion by doing nothing at all
    rather than a static substitute: there's no non-motion way to convey
    "ambiguous theater," and a meaningless effect isn't worth degrading
    gracefully for. */
export default function BluffBeat({ active }) {
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.body.classList.add('bluff-beat-active');
    const t = setTimeout(() => document.body.classList.remove('bluff-beat-active'), 1400);
    return () => { clearTimeout(t); document.body.classList.remove('bluff-beat-active'); };
  }, [active]);

  return null;
}
