// A minimal pub/sub, not a state library — one queue, read by whichever
// <ToastStack> is mounted (client/src/components/ToastStack.jsx for the
// player app, client/src/host/components/ToastStack.jsx for the host
// dashboard; both apps already share this lib/ directory, see api.js).
// Replaces every alert(r.error) across both apps: a native dialog blocks
// the whole page and looks like the browser, not the table, which is
// exactly wrong for an app that otherwise cares this much about ceremony
// (a real hold-to-reveal, phase-fade transitions, a fatal-flash overlay
// for deaths) — every error interrupted all of that with an OS popup.

let nextId = 1;
let listeners = [];

/** `kind: 'error'` (default) is a plain, short-lived failure message —
    the direct alert(r.error) replacement. `kind: 'story'` is for a real
    in-game narrative beat that happens to need the same "make sure
    everyone notices" delivery (the Virgin's immediate execution) — held
    longer and styled with more weight, since it's not an error at all. */
export function showToast(message, { kind = 'error', duration } = {}) {
  const toast = { id: nextId++, message, kind, duration: duration ?? (kind === 'story' ? 9000 : 5000) };
  listeners.forEach(fn => fn(toast));
  return toast.id;
}

export function subscribeToasts(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}
