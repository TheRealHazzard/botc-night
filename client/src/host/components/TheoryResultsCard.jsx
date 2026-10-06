import SidepanelCard from './SidepanelCard.jsx';

/** The post-game payoff of Showcase Theory — once revealed, how many of
    each theorist's guesses (across every theory they shared this game)
    actually matched the truth. S.theoryScores (game/engine.js's own
    theoryScores()) is reveal-gated the same way gameSummary/
    pivotalHighlights already are, so this renders nothing until then —
    and nothing at all if nobody shared a theory this game.

    An evil theorist's line is greyed out and labeled, never hidden —
    everything here is already public once revealed, so there's no
    privacy reason to remove it, only a fairness one: their theory was
    informed by things they already knew, not a real deduction (same
    reasoning the all-time leaderboard's own good-only filter in
    game/history.js uses), so it doesn't rank alongside the others. */
export default function TheoryResultsCard({ theoryScores }) {
  if (!theoryScores || !theoryScores.length) return null;

  const sorted = theoryScores.slice().sort((a, b) => {
    if (a.good !== b.good) return a.good ? -1 : 1;
    return b.correct - a.correct || (b.correct / b.total) - (a.correct / a.total);
  });

  return (
    <SidepanelCard title="Theories">
      <div className="ledger">
        {sorted.map(t => (
          <div className={'ledger-row' + (t.good ? '' : ' ledger-row-excluded')} key={t.playerId}>
            <span className="ledger-label">
              {t.playerName}
              {!t.good && <span className="ledger-row-note"> (evil — doesn't count)</span>}
            </span>
            <span className="ledger-leader" />
            <span className="ledger-value">{t.correct} / {t.total} correct</span>
          </div>
        ))}
      </div>
    </SidepanelCard>
  );
}
