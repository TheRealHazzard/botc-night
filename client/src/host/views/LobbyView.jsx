import DashboardLayout from '../components/DashboardLayout.jsx';
import GameStage from '../components/GameStage.jsx';
import FadeWrap from '../components/FadeWrap.jsx';
import TriviaLine from '../components/TriviaLine.jsx';
import ScriptViewPanel from '../components/script/ScriptViewPanel.jsx';
import ScriptSelectorList from '../components/script/ScriptSelectorList.jsx';
import ScriptBrowsePreview from '../components/script/ScriptBrowsePreview.jsx';
import ScriptBrowseRoster from '../components/script/ScriptBrowseRoster.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import QRCode from '../components/QRCode.jsx';
import Icon from '../components/Icon.jsx';
import AddBotsCard from '../components/AddBotsCard.jsx';
import { useJoinAddress } from '../hooks/useJoinAddress.js';

/** Browsing scripts still takes over all three of the OLD dashboard
    columns via the original DashboardLayout, unchanged — the list stays
    put as the index (left), the browsed script gets a big preview in
    place of the ring (center), and its playable roster shows on the
    right in place of the QR/actions. That's a deliberate, self-contained
    full takeover of the stage distinct from the normal idle lobby below
    (which uses the newer GameStage/tabs layout instead), so it's left
    exactly as it was rather than forced into the new shape too. The
    actual commit/back-out (Choose/Cancel) live in the header now, not
    down here — see App.jsx, which owns the browsing state this view is
    controlled by. */
export default function LobbyView({ players, script, scripts, setupRatio, browsing, browseIndex, browsedMeta, onBrowse, onEnterBrowse, onBuildScript, ringSlotRef, fading, transClass }) {
  const joinAddr = useJoinAddress();

  const activeMeta = scripts && (scripts.find(m => m.id === script) || scripts[0]);
  const hasQrEncoder = typeof window !== 'undefined' && !!window.QRCodeGen;
  // Teensyville editions cap lower than everything else — see server.js's
  // own SCRIPT_MAX_PLAYERS for the matching server-side clamp.
  const room = Math.max(0, (activeMeta?.maxPlayers || 15) - players.length);

  if (browsing) {
    const left = (
      <div className="sidepanel sidepanel-fill">
        <div className="sidepanel-title"><Icon name="scroll" size={13} /><span>Choose a script</span></div>
        <ScriptSelectorList scripts={scripts} browseIndex={browseIndex} currentScriptId={script} onBrowse={onBrowse} />
      </div>
    );
    const main = (
      <div className="stage-main">
        <FadeWrap className="stage-narration" fading={fading} transClass={transClass}>
          {browsedMeta && <ScriptBrowsePreview meta={browsedMeta} />}
        </FadeWrap>
        {/* Always mounted — unmounting here would drop the ring's portal
            target (it lives permanently in App.jsx) — just visually
            hidden while this preview panel takes over the column. */}
        <div className="ring-zone">
          <div className="ring-slot ring-slot-hidden" ref={ringSlotRef} />
        </div>
      </div>
    );
    const right = browsedMeta && <ScriptBrowseRoster meta={browsedMeta} />;
    return <DashboardLayout left={left} main={main} right={right} fading={fading} transClass={transClass} />;
  }

  const tabs = [
    {
      id: 'script',
      label: 'Script',
      content: activeMeta
        ? <ScriptViewPanel meta={activeMeta} onChangeScript={onEnterBrowse} onBuildScript={onBuildScript} />
        : <div className="sub">Loading scripts…</div>,
    },
    {
      id: 'controls',
      label: 'Controls',
      content: (
        <>
          <SidepanelCard icon="users" title="Join Here">
            <div className="joinwrap">
              {joinAddr && hasQrEncoder ? (
                <div className="joinqr"><QRCode text={joinAddr} /></div>
              ) : (
                <div className="sub">{joinAddr || 'finding the address…'}</div>
              )}
              {/* The seated count/ratio used to be the center column's own
                  narration text — moved here, alongside the other "where
                  does the lobby actually stand" info, now that the ring
                  has that space back. */}
              {players.length > 0 ? (
                <div className="sub">
                  {players.length} seated
                  {setupRatio && (
                    <span className="setup-ratio">
                      {' '}· {setupRatio.townsfolk} Townsfolk · {setupRatio.outsider} Outsider{setupRatio.outsider === 1 ? '' : 's'} ·{' '}
                      {setupRatio.minion} Minion{setupRatio.minion === 1 ? '' : 's'} · {setupRatio.demon} Demon{setupRatio.demon === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              ) : (
                <div className="sub">Open that address on your phone to take a seat.</div>
              )}
              <TriviaLine scriptId={script} />
            </div>
          </SidepanelCard>
          <AddBotsCard room={room} />
        </>
      ),
    },
  ];

  return (
    <GameStage
      ringSlotRef={ringSlotRef}
      tabs={tabs}
      fading={fading}
      transClass={transClass}
    />
  );
}
