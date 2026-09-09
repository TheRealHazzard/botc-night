// The side columns pin to the screen's edges at a comfortable reading
// width; the ring's own 1fr track is what actually absorbs a wide TV's
// remaining space — same effect as flex's justify-content:space-between
// would give a 3-up row, but with a middle track that can grow. Shared by
// every phase view (lobby/reveal/night/day/over).
export default function DashboardLayout({ left, main, right }) {
  const cols = [];
  if (left) cols.push('minmax(300px,400px)');
  cols.push('1fr');
  if (right) cols.push('minmax(300px,400px)');

  return (
    <div className="dashboard" style={{ gridTemplateColumns: cols.join(' ') }}>
      {left}
      {main}
      {right}
    </div>
  );
}
