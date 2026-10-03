import TabPanel from './TabPanel.jsx';
import DayCounterLabel from './DayCounterLabel.jsx';

/** The main stage for every phase view except LobbyView's script-browsing
    takeover (which still uses the older 3-column DashboardLayout
    unchanged — see that file's own comment on why that one case is left
    alone).

    Narration text has no visible home here at all — the table hears it
    (speech.js's speak(), wired up via each view's own useSpeak call), and
    a host who missed it can glance at NarratorLogCard on the Controls
    tab instead. That's what frees this region to be just the ring (now
    with the full stage width to itself, see styles.css's `.ring` sizing)
    and the script/characters/controls tab group beside it (`tabs`). */
export default function GameStage({ phaseHeading, ringSlotRef, ringHidden, tabs, defaultTab, fadeClass = '' }) {
  return (
    <div className="game-stage">
      <div className="game-ring-zone">
        {phaseHeading && <DayCounterLabel text={phaseHeading} />}
        <div className={'ring-slot' + (ringHidden ? ' ring-slot-hidden' : '')} ref={ringSlotRef} />
      </div>
      <div className={'game-stage-tabs ' + fadeClass}>
        <TabPanel tabs={tabs} defaultTab={defaultTab} />
      </div>
    </div>
  );
}
