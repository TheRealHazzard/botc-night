import SidepanelCard from './SidepanelCard.jsx';
import { buildRevealCards } from '../lib/describeReveal.js';

/** The persistent Summary-tab sibling of RevealCardOverlay's own
    transient, full-screen ceremony — same ordered cards (Play of the
    Game, the game-winning nomination, MVP), built the exact same way via
    buildRevealCards, but rendered as a quiet recap list that stays on
    screen rather than vanishing once the reveal sequence finishes. Lets
    anyone who stepped away during the reveal (or wants to read it again
    while the table's still talking) see it without replaying anything.

    No more per-card icon (c.icon goes unused here) — a drop-cap on the
    title's own first letter carries that weight instead, matching the
    Illuminated Ledger heading above it. */
export default function PivotalMomentsCard({ players, pivotalHighlights }) {
  const cards = buildRevealCards(pivotalHighlights, players);
  if (!cards.length) return null;

  return (
    <SidepanelCard title="Pivotal moments">
      <div className="pivotal-list">
        {cards.map((c, i) => (
          <div className="pivotal-item" key={i}>
            <div className="pivotal-item-title">{c.title}{c.subtitle ? ` — ${c.subtitle}` : ''}</div>
            <div className="pivotal-item-body">{c.body}</div>
          </div>
        ))}
      </div>
    </SidepanelCard>
  );
}
