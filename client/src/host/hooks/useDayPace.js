import { useEffect, useState } from 'react';

const YELLOW_AT_MS = 3 * 60_000; // below this much remaining, turn yellow
const RED_AT_MS = 60_000; // below this much remaining, turn red

/** The day's own silent "time bomb" — a real disadvantage to evil (a long
    day is free time for good to keep talking), so this applies visible
    pressure without touching the phase itself. Green from the moment the
    day starts, yellow under 3 minutes remaining, red under 1 — a plain
    elapsed-time read, same shape as useRoomPacing.js's own tick, just a
    harder always-on signal instead of a soft, content-aware nudge (the
    two run side by side on purpose, not one replacing the other). */
export function useDayPace(dayStartedAt, totalMs) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!dayStartedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [dayStartedAt]);

  if (!dayStartedAt) return null;

  const remaining = totalMs - (now - dayStartedAt);
  if (remaining > YELLOW_AT_MS) return 'green';
  if (remaining > RED_AT_MS) return 'yellow';
  return 'red';
}
