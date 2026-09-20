import DashboardLayout from '../components/DashboardLayout.jsx';
import RingSeats from '../components/RingSeats.jsx';
import GameLeftPanel from '../components/GameLeftPanel.jsx';
import ControlPanelRow from '../components/ControlPanelRow.jsx';
import ControlsDrawer from '../components/ControlsDrawer.jsx';
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

  // Nothing presentational belongs on the right here — every control this
  // screen has (Reveal/New game, Night falls) is the Storyteller's own,
  // so there's no sidepanel at all now, just more room for the ring.
  return (
    <>
      <DashboardLayout left={left} main={main} />
      <ControlsDrawer>
        <ControlPanelRow />
        <div className="sidepanel-actions">
          <button type="button" className="primary" onClick={() => post('/api/table/night')}>
            <Icon name="moon" size={15} /> Night falls
          </button>
        </div>
      </ControlsDrawer>
    </>
  );
}
