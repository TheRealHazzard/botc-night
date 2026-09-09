import { useEffect, useState } from 'react';

/** Browser chrome (address bar, tabs) breaks the "this is a shared screen,
    not a browser" illusion a TV mode depends on. `supported` is false
    entirely if the browser doesn't support the Fullscreen API, so the
    caller can hide the button rather than show one that would just fail —
    host-only, player.html has no such button. */
export function useFullscreen() {
  const supported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  const [isFullscreen, setIsFullscreen] = useState(() => supported && !!document.fullscreenElement);

  useEffect(() => {
    if (!supported) return;
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [supported]);

  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  return { supported, isFullscreen, toggle };
}
