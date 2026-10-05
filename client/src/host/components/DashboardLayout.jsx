import FadeWrap from './FadeWrap.jsx';

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
// FadeWrap wraps right only — left is deliberately never wrapped in
// it (same reasoning as the ring, which also never fades): it's the same
// script list reference material regardless of which row is browsed, so
// fading it out and back in on every browse would be pure flicker with
// nothing actually changing underneath. Right genuinely swaps to a new
// script's roster on every browse, so it keeps the fade. main isn't
// wrapped here either, since the ring lives inside it (a portal target,
// see App.jsx) and must NOT be inside anything that fades — a parent's
// opacity can't be countermanded by a child's own CSS.
export default function DashboardLayout({ left, main, right, fading, transClass }) {
  const cols = [];
  if (left) cols.push('minmax(300px,400px)');
  cols.push('1fr');
  // Wider cap than the left column's own 400px — this is the one other
  // caller of ScriptRosterCard's .roster-grid (fixed 84px tokens, see
  // that grid's own comment in styles.css), and 400px only ever fit 3
  // columns of those before a short row forced extra scrolling. 460px
  // matches the Characters tab's own already-tuned .game-stage-tabs
  // width, which reliably fits 4.
  if (right) cols.push('minmax(300px,460px)');

  return (
    <div className="dashboard" style={{ gridTemplateColumns: cols.join(' ') }}>
      {left}
      {main}
      {right && <FadeWrap fading={fading} transClass={transClass}>{right}</FadeWrap>}
    </div>
  );
}
