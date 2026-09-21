import DashboardLayout from '../components/DashboardLayout.jsx';
import RingSeats from '../components/RingSeats.jsx';
import GameLeftPanel from '../components/GameLeftPanel.jsx';
import ControlPanelRow from '../components/ControlPanelRow.jsx';
import ControlsDrawer from '../components/ControlsDrawer.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import Icon from '../components/Icon.jsx';
import { useSpeak } from '../hooks/useSpeak.js';
import { post } from '../../lib/api.js';

export default function RevealView({ players, scriptChars, activeScriptMeta, muted }) {
  useSpeak('Look at your hands. Learn what you are.', { dread: true, muted });

  const main = (
    <div className="stage-main">
      <div className="narration dread">Look at your hands.</div>
      <div className="sub">Each of you now knows only yourself. No one in this room knows the rest.</div>
      <RingSeats players={players} />
    </div>
  );

  const left = <GameLeftPanel scriptChars={scriptChars} activeScriptMeta={activeScriptMeta} />;

  const controls = (
    <>
      <ControlPanelRow />
      <div className="sidepanel-actions">
        <button type="button" className="primary" onClick={() => post('/api/table/night')}>
          <Icon name="moon" size={15} /> Night falls
        </button>
      </div>
    </>
  );

  // Same controls appear twice on purpose: once plainly on the right, once
  // in the collapsed drawer below (for a phone driving this same screen via
  // the leader overlay, the drawer stays the reachable copy at arm's length
  // from the table's own view of the ring).
  const right = (
    <div className="sidepanel">
      <SidepanelCard icon="gear" title="Storyteller controls">{controls}</SidepanelCard>
    </div>
  );

  return (
    <>
      <DashboardLayout left={left} main={main} right={right} />
      <ControlsDrawer>{controls}</ControlsDrawer>
    </>
  );
}
