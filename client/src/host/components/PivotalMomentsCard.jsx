import SidepanelCard from './SidepanelCard.jsx';
import Icon from './Icon.jsx';
import { buildRevealCards } from '../lib/describeReveal.js';

/** The persistent Summary-tab sibling of RevealCardOverlay's own
    transient, full-screen ceremony — same ordered cards (Play of the
    Game, the game-winning nomination, MVP), built the exact same way via
    buildRevealCards, but rendered as a quiet recap list that stays on
    screen rather than vanishing once the reveal sequence finishes. Lets
    anyone who stepped away during the reveal (or wants to read it again
    while the table's still talking) see it without replaying anything. */
export default function PivotalMomentsCard({ players, pivotalHighlights }) {
  const cards = buildRevealCards(pivotalHighlights, players);
  if (!cards.length) return null;

  return (
    <SidepanelCard icon="trophy" title="Pivotal moments">
      <div className="pivotal-list">
        {cards.map((c, i) => (
          <div className="pivotal-item" key={i}>
            <Icon name={c.icon} size={20} />
            <div className="pivotal-item-text">
              <div className="pivotal-item-title">{c.title}{c.subtitle ? ` — ${c.subtitle}` : ''}</div>
              <div className="pivotal-item-body">{c.body}</div>
            </div>
          </div>
        ))}
      </div>
    </SidepanelCard>
  );
}
