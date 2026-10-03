// A minimal pub/sub, same shape as ../../lib/toast.js — one running list of
// everything the narrator has said (or would have said, muted or not),
// read by whichever <NarratorLogCard> is mounted. Exists because narration
// no longer has a permanent on-screen home (see NarratorLogCard.jsx's own
// comment) — the table hears it via speech.js's speak(), and this is the
// host's own way to glance back at what was just said without it crowding
// the stage.

let nextId = 1;
let lastText = ''; // consecutive-only dedupe — same spirit as speech.js's own `spoken`
let listeners = [];

/** Logs a line regardless of `muted` — a muted host still wants the text
    record, even though speech.js itself won't actually speak it. */
export function logNarration(text) {
  if (!text || text === lastText) return;
  lastText = text;
  const entry = { id: nextId++, text, at: Date.now() };
  listeners.forEach(fn => fn(entry));
  return entry.id;
}

export function subscribeNarratorLog(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}
