import { useEffect, useReducer } from 'react';

/** A fixed viewBox with the actual rendered size left to CSS (100% of
    whatever box this lands in) — needed so this can shrink to fit inside
    the seating ring instead of forcing its own fixed pixel footprint.

    Owns its own 1000ms tick, replacing the vanilla's global interval that
    re-rendered the whole app every second while a countdown was showing —
    "only ticks while shown" becomes "only ticks while mounted" for free,
    since whichever parent stops rendering this once the window closes
    also stops the tick via the effect's own cleanup. */
export default function Countdown({ windowEndsAt, total }) {
  const [, tick] = useReducer(n => n + 1, 0);

  useEffect(() => {
    if (!windowEndsAt) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [windowEndsAt]);

  if (!windowEndsAt) return null;

  const t = total || 1;
  const left = Math.max(0, Math.ceil((windowEndsAt - Date.now()) / 1000));
  const frac = Math.max(0, Math.min(1, left / t));
  const urgent = left <= 10;
  const size = 200, stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r;

  return (
    <div className="clockwrap">
      <svg viewBox={`0 0 ${size} ${size}`} className={'ring-svg' + (urgent ? ' urgent' : '')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c.toFixed(1)} strokeDashoffset={(c * (1 - frac)).toFixed(1)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className={'clock' + (urgent ? ' urgent' : '')}>{left}</div>
    </div>
  );
}
