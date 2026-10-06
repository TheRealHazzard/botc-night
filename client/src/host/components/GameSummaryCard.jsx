import SidepanelCard from './SidepanelCard.jsx';

// How the whole game actually went, not just today — built from the
// gameSummary the server only ever sends once revealed. Was DayReport's
// own boxed-tile layout (.dayreport/.stat); moved onto SidepanelCard's
// ledger-row shape instead once this became one of the cards the
// Illuminated Ledger redesign covered — DayReport/SessionShareCard
// weren't part of that redesign, so they kept the tile layout.
export default function GameSummaryCard({ gs }) {
  const survivor = gs.longestSurvivingEvil;
  const survivorText = survivor
    ? `${survivor.name}${survivor.survived ? ' — made it' : ' — fell N' + survivor.night}`
    : '—';

  const first = gs.firstToDie;
  const firstText = first ? `${first.name} — ${first.phase === 'day' ? 'Day' : 'Night'} ${first.night}` : '—';

  const nominated = gs.mostNominated;
  const nominatedText = nominated ? `${nominated.name} (${nominated.count})` : '—';

  const stats = [
    ['Nominations', String(gs.nominations)],
    ['Town accuracy', gs.voteAccuracy == null ? '—' : Math.round(gs.voteAccuracy * 100) + '%'],
    ['Ghost votes used', `${gs.ghostVotesUsed} / ${gs.ghostVotesEligible}`],
    ['Longest-lived evil', survivorText],
    ['First to die', firstText],
    ['Most nominated', nominatedText],
  ];

  return (
    <SidepanelCard title="This game">
      <div className="ledger">
        {stats.map(([lbl, val]) => (
          <div className="ledger-row" key={lbl}>
            <span className="ledger-label">{lbl}</span>
            <span className="ledger-leader" />
            <span className="ledger-value">{val}</span>
          </div>
        ))}
      </div>
    </SidepanelCard>
  );
}
