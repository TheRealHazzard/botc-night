import { useState } from 'react';
import Icon from './Icon.jsx';
import GameHistoryOverlay from './GameHistoryOverlay.jsx';
import HallOfFameOverlay from './HallOfFameOverlay.jsx';
import CharactersOverlay from './CharactersOverlay.jsx';
import JinxesOverlay from './JinxesOverlay.jsx';

// What used to be 4 separate header buttons (History/Hall of
// Fame/Characters/Jinxes — one more added for each of several sessions in
// a row) collapsed into one "Reference" button and a picker menu, same
// GameList/GameDetail back-button shape GameHistoryOverlay.jsx already
// uses one level down. Each existing overlay is reused completely
// unmodified — only its own "Close" now means "back to this menu" instead
// of "exit reference mode entirely," via the onClose it's handed here.
// Adding a 5th reference tool later is one more row below, never another
// header button.
const ITEMS = [
  { id: 'history', icon: 'scroll', label: 'Game history', blurb: 'Past games, voting accuracy, character win rates' },
  { id: 'hallOfFame', icon: 'trophy', label: 'Hall of Fame', blurb: 'Win streaks and other leaderboards' },
  { id: 'characters', icon: 'check', label: 'Character checklist', blurb: 'Which characters have actually been dealt at this table' },
  { id: 'jinxes', icon: 'bolt', label: 'Jinxes', blurb: "Official rulings for this script's current roster" },
];

export default function ReferenceOverlay({ onClose }) {
  const [view, setView] = useState('menu');

  // Each reused overlay's own "Close" now exits the whole Reference drawer
  // (onClose), not just this picker menu — there's no separate "back to
  // the menu" affordance once inside one, so Close genuinely means close.
  // Picking a different reference tool means reopening Reference from the
  // header, same as picking a different one used to mean a fresh click on
  // its own header button before these four were bundled into one picker.
  let content;
  if (view === 'history') content = <GameHistoryOverlay onClose={onClose} />;
  else if (view === 'hallOfFame') content = <HallOfFameOverlay onClose={onClose} />;
  else if (view === 'characters') content = <CharactersOverlay onClose={onClose} />;
  else if (view === 'jinxes') content = <JinxesOverlay onClose={onClose} />;
  else {
    content = (
      <div className="settings-overlay">
        <div className="settings-header">
          <h2>Reference</h2>
          <button type="button" className="ghostbtn" onClick={onClose}><Icon name="close" size={15} /> Close</button>
        </div>
        <div className="powerlog-body">
          <div className="reference-menu">
            {ITEMS.map(item => (
              <button type="button" className="reference-menu-item" key={item.id} onClick={() => setView(item.id)}>
                <Icon name={item.icon} size={20} />
                <div className="reference-menu-text">
                  <b>{item.label}</b>
                  <span className="sub">{item.blurb}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // A slide-in panel, not another full-screen takeover like Settings —
  // reference lookups are the one overlay family a host genuinely wants
  // open WHILE still watching the live game (did we already catch this
  // jinx mid-game?), unlike Settings or the script builder, which both
  // want the host's full attention anyway. The 4 reused overlays each
  // still render their own full-size .settings-overlay internally
  // unmodified (so they stay drop-in reusable standalone too); nesting
  // one inside .slide-panel is what turns it from a fixed, full-viewport
  // box into this panel's own normal content area — see that CSS rule's
  // own comment.
  return (
    <>
      <div className="slide-scrim" onClick={onClose} />
      <div className="slide-panel">{content}</div>
    </>
  );
}
