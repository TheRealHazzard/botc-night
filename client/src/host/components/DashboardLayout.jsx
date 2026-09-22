// The side columns pin to the screen's edges at a comfortable reading
// width; the ring's own 1fr track is what actually absorbs a wide TV's
// remaining space — same effect as flex's justify-content:space-between
// would give a 3-up row, but with a middle track that can grow. Shared by
// every phase view (lobby/reveal/night/day/over).
//
// `fadeClass` wraps left/right only — main isn't wrapped here, since the
// ring now lives inside each view's own `main` JSX (as a portal target,
// see App.jsx) and must NOT be inside anything that fades: a parent's
// opacity can't be countermanded by a child's own CSS, so the ring has
// to sit outside whatever gets this class entirely. Each view wraps its
// own narration content in `fadeClass` internally, leaving the ring
// slot as a sibling.
export default function DashboardLayout({ left, main, right, fadeClass = '' }) {
  const cols = [];
  if (left) cols.push('minmax(300px,400px)');
  cols.push('1fr');
  if (right) cols.push('minmax(300px,400px)');

  return (
    <div className="dashboard" style={{ gridTemplateColumns: cols.join(' ') }}>
      {left && <div className={fadeClass}>{left}</div>}
      {main}
      {right && <div className={fadeClass}>{right}</div>}
    </div>
  );
}
