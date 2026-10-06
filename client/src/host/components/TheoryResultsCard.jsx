import SidepanelCard from './SidepanelCard.jsx';

/** The post-game payoff of Showcase Theory — once revealed, how many of
    each theorist's guesses (across every theory they shared this game)
    actually matched the truth. S.theoryScores (game/engine.js's own
    theoryScores()) is reveal-gated the same way gameSummary/
    pivotalHighlights already are, so this renders nothing until then —
    and nothing at all if nobody shared a theory this game. */
export default function TheoryResultsCard({ theoryScores }) {
  if (!theoryScores || !theoryScores.length) return null;

  const sorted = theoryScores.slice().sort((a, b) => b.correct - a.correct || b.correct / b.total - a.correct / a.total);

  return (
    <SidepanelCard title="Theories">
      <div className="ledger">
        {sorted.map(t => (
          <div className="ledger-row" key={t.playerId}>
            <span className="ledger-label">{t.playerName}</span>
            <span className="ledger-leader" />
            <span className="ledger-value">{t.correct} / {t.total} correct</span>
          </div>
        ))}
      </div>
    </SidepanelCard>
  );
}
