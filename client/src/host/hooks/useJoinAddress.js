import { useEffect, useState } from 'react';

// Whatever address loaded this very page is, by definition, one every
// other device can already reach it by too — true whether that's the LAN
// IP typed in directly, or a tunnel's public hostname, for a game hosted
// online. The one address that's *not* usable elsewhere is localhost/
// 127.0.0.1 — the TV's own loopback, meaningless to a phone — so that's
// the only case that still asks the server for the real LAN IP.
const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

let cached = null;
let inflight = null;

export function useJoinAddress() {
  const [addr, setAddr] = useState(() => {
    if (cached) return cached;
    if (!LOCALHOST_RE.test(location.host)) return location.origin;
    return null;
  });

  useEffect(() => {
    if (addr || cached) return;
    if (!inflight) inflight = fetch('/api/join-address').then(r => r.json()).catch(() => null);
    let cancelled = false;
    inflight.then(r => {
      if (!r) return;
      cached = r.url;
      if (!cancelled) setAddr(r.url);
    });
    return () => { cancelled = true; };
  }, [addr]);

  return addr;
}
