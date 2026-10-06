import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import SidepanelCard from '../SidepanelCard.jsx';

const PRESETS = [60, 180, 300, 600]; // 1/5/3/10 min — common table-timer lengths

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A general-purpose countdown for anything at the table that isn't a BOTC
    night/day window (see Countdown.jsx for that one) — this one needs to
    pause and resume, which Countdown's always-ticking windowEndsAt design
    doesn't support, so it keeps its own small tick loop rather than
    reusing that component. `endsAt` (a real timestamp, set only while
    running) is the source of truth exactly like the BOTC window timer —
    remainingSeconds is just a display snapshot recomputed from it, so a
    slow render or a background tab can't drift the actual end time. */
export default function TimerTool() {
  const [totalSeconds, setTotalSeconds] = useState(180);
  const [remainingSeconds, setRemainingSeconds] = useState(180);
  const [endsAt, setEndsAt] = useState(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left <= 0 && !doneRef.current) {
        doneRef.current = true;
        setEndsAt(null);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const running = !!endsAt;
  const done = doneRef.current && remainingSeconds <= 0;
  const urgent = remainingSeconds <= 10 && remainingSeconds > 0;

  const start = () => {
    if (remainingSeconds <= 0) return;
    doneRef.current = false;
    setEndsAt(Date.now() + remainingSeconds * 1000);
  };
  const pause = () => setEndsAt(null);
  const reset = () => {
    doneRef.current = false;
    setEndsAt(null);
    setRemainingSeconds(totalSeconds);
  };
  const choosePreset = seconds => {
    doneRef.current = false;
    setEndsAt(null);
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
  };

  const frac = totalSeconds ? Math.max(0, Math.min(1, remainingSeconds / totalSeconds)) : 0;
  const size = 200, stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r;

  return (
    <SidepanelCard title="Timer">
      <div className="panel-tabs">
        {PRESETS.map(seconds => (
          <button
            key={seconds}
            type="button"
            className={'panel-tab' + (totalSeconds === seconds ? ' active' : '')}
            disabled={running}
            onClick={() => choosePreset(seconds)}
          >
            {Math.round(seconds / 60)}m
          </button>
        ))}
      </div>
      <div className="toolkit-timerbox">
        <div className="clockwrap">
          <svg viewBox={`0 0 ${size} ${size}`} className={'ring-svg' + (urgent || done ? ' urgent' : '')}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke}
              strokeLinecap="round" strokeDasharray={c.toFixed(1)} strokeDashoffset={(c * (1 - frac)).toFixed(1)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
          <div className={'clock' + (urgent || done ? ' urgent' : '')}>{fmt(remainingSeconds)}</div>
        </div>
      </div>
      {done && <div className="sub urgent-text">Time's up.</div>}
      <div className="sidepanel-actions-row">
        {running ? (
          <button type="button" className="ghost" onClick={pause}><Icon name="hand" size={14} /> Pause</button>
        ) : (
          <button type="button" className="ghost" onClick={start} disabled={remainingSeconds <= 0}><Icon name="play" size={14} /> Start</button>
        )}
        <button type="button" className="ghost" onClick={reset}><Icon name="refresh" size={14} /> Reset</button>
      </div>
    </SidepanelCard>
  );
}
