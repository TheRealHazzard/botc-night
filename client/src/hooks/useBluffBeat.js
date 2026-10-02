import { useValueBeat } from './useValueBeat.js';

/** The Bluff — a rare, deliberately meaningless flicker, shared by the
    host TV and every player's phone at once. A human Storyteller sells a
    bluff partly by visibly moving a token at the Grimoire — ambiguous
    theater the whole table half-sees together, not a private tell handed
    to one player — so unlike everything else in this app's "whim" family,
    this reaches every connected client, not just the host.
    `bluffBeatAt` is a bare timestamp server.js rolls independently of any
    real game fact (see maybeBluffBeat in server.js). Never fires for a
    beat already in state when this first mounts (a fresh reconnect
    landing mid-game isn't "one just happened"), only for a genuinely new,
    truthy arrival — same baseline-then-diff shape useValueBeat itself
    gives every caller. */
export function useBluffBeat(bluffBeatAt) {
  return useValueBeat(bluffBeatAt, {
    shouldFire: (prev, next) => !!next && next !== prev,
    durationMs: 1400,
  });
}
