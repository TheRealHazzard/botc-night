// The side columns pin to the screen's edges at a comfortable reading
// width; the ring's own 1fr track is what actually absorbs a wide TV's
// remaining space — same effect as flex's justify-content:space-between
// would give a 3-up row, but with a middle track that can grow. Shared by
// every phase view (lobby/reveal/night/day/over).
//
// `fadeClass` wraps right only — left is deliberately never wrapped in
// it (same reasoning as the ring, which also never fades): across
// reveal/night/day it's the same GameLeftPanel reference material every
// time, so fading it out and back in on every phase change was pure
// flicker with nothing actually changing underneath. Right genuinely
// swaps to different content per phase (countdown, nominations, power
// log, ...), so it keeps the fade. main isn't wrapped here either, since
// the ring now lives inside each view's own `main` JSX (as a portal
// target, see App.jsx) and must NOT be inside anything that fades — a
// parent's opacity can't be countermanded by a child's own CSS. Each
// view wraps its own narration content in `fadeClass` internally,
// leaving the ring slot as a sibling.
export default function DashboardLayout({ left, main, right, fadeClass = '' }) {
  const cols = [];
  if (left) cols.push('minmax(300px,400px)');
  cols.push('1fr');
  if (right) cols.push('minmax(300px,400px)');

  return (
    <div className="dashboard" style={{ gridTemplateColumns: cols.join(' ') }}>
      {left}
      {main}
      {right && <div className={fadeClass}>{right}</div>}
    </div>
  );
}
