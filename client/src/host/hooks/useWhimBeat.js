import { useNewEntryBeat } from '../../hooks/useNewEntryBeat.js';

// The exact, deliberately vague line game/helpers.js's logWhim() writes for
// every hidden Storyteller-whim roll (Mayor redirect, Recluse/Spy
// registration) that actually fired — never which one, never who. Matching
// on the literal string (rather than trusting every future whim to also be
// "the newest log line") is intentional: `log` also grows from ordinary,
// unrelated events (a poison, a death) that must never trigger this.
const WHIM_LINE = 'A quiet decision was made, unseen.';

/** True for a few seconds right after a *new* whim line lands in `log`,
    then false again — never re-fires for a line already seen, and never
    for anything already known about when this hook first mounts. Only
    ever needs a boolean (never which whim), unlike useMinorBeat's own
    useNewEntryBeat call, which needs the matched entry itself. */
export function useWhimBeat(log) {
  return !!useNewEntryBeat(log, {
    findMatch: fresh => fresh.find(l => l.text === WHIM_LINE),
    durationMs: 2600,
  });
}
