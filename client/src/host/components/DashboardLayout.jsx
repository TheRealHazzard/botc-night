// Down to one caller now — LobbyView's own script-browsing takeover
// (list left, big preview center, playable roster right), the one case
// left that genuinely needs three independent columns at once. Every
// other phase view moved to GameStage.jsx's ring+tabs layout instead
// (narration itself has no on-screen home at all any more — see that
// file's own comment); this one case was left exactly as it was rather
// than forced into that newer shape too. The side columns pin
// to the screen's edges at a comfortable reading width; the center's own
// 1fr track is what actually absorbs a wide TV's remaining space — same
// effect as flex's justify-content:space-between would give a 3-up row,
// but with a middle track that can grow.
//
// `fadeClass` wraps right only — left is deliberately never wrapped in
// it (same reasoning as the ring, which also never fades): it's the same
// script list reference material regardless of which row is browsed, so
// fading it out and back in on every browse would be pure flicker with
// nothing actually changing underneath. Right genuinely swaps to a new
// script's roster on every browse, so it keeps the fade. main isn't
// wrapped here either, since the ring lives inside it (a portal target,
// see App.jsx) and must NOT be inside anything that fades — a parent's
// opacity can't be countermanded by a child's own CSS.
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
