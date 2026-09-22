import { useEffect, useReducer } from 'react';

const YELLOW_AT_MS = 3 * 60_000; // below this much remaining, turn yellow
const RED_AT_MS = 60_000; // below this much remaining, turn red

/** A silent visual "time bomb" on the day's own seating ring — fills in as
    the day runs long, shifting green -> yellow -> red, with no functional
    effect on the phase itself (see RingSeats.jsx's glow prop for the
    game-over ring's own sibling use of this same dashed circle). Same
    stroke-dasharray/stroke-dashoffset technique as Countdown.jsx, but
    fills UP as time is used rather than draining down as a window closes
    — this is a fuse burning, not a countdown to a deadline the game
    actually enforces. */
export default function DayCountdownRing({ startedAt, totalMs }) {
  const [, tick] = useReducer(n => n + 1, 0);

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;

  const elapsed = Math.max(0, Math.min(totalMs, Date.now() - startedAt));
  const remaining = totalMs - elapsed;
  const filledFrac = totalMs ? elapsed / totalMs : 0;
  const stage = remaining > YELLOW_AT_MS ? 'green' : remaining > RED_AT_MS ? 'yellow' : 'red';

  const r = 48, c = 2 * Math.PI * r;

  return (
    <div className="day-countdown-ring" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle
          className={'day-countdown-fill ' + stage}
          cx="50" cy="50" r={r} fill="none"
          strokeDasharray={c.toFixed(2)}
          strokeDashoffset={(c * (1 - filledFrac)).toFixed(2)}
          transform="rotate(-90 50 50)"
        />
      </svg>
    </div>
  );
}
