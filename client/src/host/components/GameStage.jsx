import { createPortal } from 'react-dom';
import TabPanel from './TabPanel.jsx';

/** The redesigned main stage for every phase view except LobbyView's
    script-browsing takeover (which still uses the older 3-column
    DashboardLayout unchanged — see that file's own comment on why that
    one case is left alone).

    Narration text no longer renders here — it's portaled into
    `narrationSlot`, a node the persistent SideHeader (App.jsx) owns, the
    same trick RingSeats itself already uses to survive phase-change
    remounts without visibly popping in and out. That's what frees this
    region to hold just the two things a host is actually looking at
    while running the table: the ring, and the script/characters/
    controls tab group beside it (`tabs`) — Controls being the former
    always-on action sidepanel (nominations, Night-falls, power log,
    ...), now tucked behind a tab since the table plays mostly off their
    own phones and that panel sat mostly idle. */
export default function GameStage({ narration, narrationSlot, ringSlotRef, ringHidden, tabs, defaultTab, fadeClass = '' }) {
  // Falls back to rendering narration right here (rather than nothing at
  // all) when no slot is registered yet — the brief window before
  // SideHeader's own ref callback fires, and every test that mounts a
  // view in isolation without the rest of App.jsx around it.
  return (
    <>
      {narrationSlot ? createPortal(narration, narrationSlot) : narration}
      <div className="game-stage">
        <div className="game-ring-zone">
          <div className={'ring-slot' + (ringHidden ? ' ring-slot-hidden' : '')} ref={ringSlotRef} />
        </div>
        <div className={'game-stage-tabs ' + fadeClass}>
          <TabPanel tabs={tabs} defaultTab={defaultTab} />
        </div>
      </div>
    </>
  );
}
