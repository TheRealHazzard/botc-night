import SidepanelCard from './SidepanelCard.jsx';

/** The quiet, persistent half of Showcase Theory — TheoryShowcaseOverlay
    is the brief arrival flash; this is where each theory actually stays
    visible for the rest of the day. Just the theorist and how many
    guesses they made — the guesses themselves are deliberately not shown
    here (this card would otherwise grow without bound as more players
    submit), full accuracy only ever appears post-game in
    TheoryResultsCard. Self-removing when nobody's shared one yet today,
    same convention SessionStatsCard/LeaderboardTeaserCard already use. */
export default function TheoriesCard({ theories, nightNumber }) {
  const today = (theories || []).filter(t => t.day === nightNumber);
  if (!today.length) return null;

  return (
    <SidepanelCard title="Theories">
      <div className="ledger">
        {today.map((t, i) => (
          <div className="ledger-row" key={`${t.playerId}-${i}`}>
            <span className="ledger-label">{t.playerName}</span>
            <span className="ledger-leader" />
            <span className="ledger-value">{t.guesses.length} guess{t.guesses.length === 1 ? '' : 'es'}</span>
          </div>
        ))}
      </div>
    </SidepanelCard>
  );
}
