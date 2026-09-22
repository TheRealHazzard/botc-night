import DashboardLayout from '../components/DashboardLayout.jsx';
import TriviaLine from '../components/TriviaLine.jsx';
import ScriptViewPanel from '../components/script/ScriptViewPanel.jsx';
import ScriptSelectorList from '../components/script/ScriptSelectorList.jsx';
import ScriptBrowsePreview from '../components/script/ScriptBrowsePreview.jsx';
import ScriptBrowseRoster from '../components/script/ScriptBrowseRoster.jsx';
import SidepanelCard from '../components/SidepanelCard.jsx';
import QRCode from '../components/QRCode.jsx';
import Icon from '../components/Icon.jsx';
import { useJoinAddress } from '../hooks/useJoinAddress.js';

/** Browsing scripts takes over all three dashboard columns, not just the
    left one — the list stays put as the index (left), the browsed
    script gets a big preview in place of the ring (center), and its
    playable roster shows on the right in place of the QR/actions. The
    actual commit/back-out (Choose/Cancel) live in the header now, not
    down here — see App.jsx, which owns the browsing state this view is
    controlled by. Start Game/Clear the lobby/Game history moved to the
    header too (same App.jsx), for the same reason: a taskbar full of
    icon buttons reads as one coherent toolbar, not a pile of buttons
    competing with the QR code for the same narrow column. */
export default function LobbyView({ players, script, scripts, setupRatio, browsing, browseIndex, browsedMeta, onBrowse, onEnterBrowse, onBuildScript, ringSlotRef, fadeClass = '' }) {
  const joinAddr = useJoinAddress();

  const activeMeta = scripts && (scripts.find(m => m.id === script) || scripts[0]);
  const hasQrEncoder = typeof window !== 'undefined' && !!window.QRCodeGen;

  const left = (
    <div className={'sidepanel' + (browsing ? ' sidepanel-fill' : '')}>
      {browsing ? (
        <>
          <div className="sidepanel-title"><Icon name="scroll" size={13} /><span>Choose a script</span></div>
          <ScriptSelectorList scripts={scripts} browseIndex={browseIndex} currentScriptId={script} onBrowse={onBrowse} />
        </>
      ) : activeMeta ? (
        <ScriptViewPanel meta={activeMeta} onChangeScript={onEnterBrowse} onBuildScript={onBuildScript} />
      ) : (
        <div className="sub">Loading scripts…</div>
      )}
    </div>
  );

  const main = (
    <div className="stage-main">
      <div className={`fade-wrap stage-narration ${fadeClass}`}>
        {browsedMeta ? (
          <ScriptBrowsePreview meta={browsedMeta} />
        ) : (
          <>
            <div className="narration">{players.length ? 'The town gathers.' : 'The town is still empty.'}</div>
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
          </>
        )}
      </div>
      {/* Same condition RingSeats used to render under, before the ring
          moved into App.jsx's portal — no seats to show while browsing
          scripts (the preview takes over main) or before anyone's seated. */}
      {!browsedMeta && players.length > 0 && <div className="ring-slot" ref={ringSlotRef} />}
    </div>
  );

  const right = browsedMeta ? (
    <ScriptBrowseRoster meta={browsedMeta} />
  ) : (
    <div className="sidepanel">
      <SidepanelCard icon="users" title="Join Here">
        <div className="joinwrap">
          {joinAddr && hasQrEncoder ? (
            <div className="joinqr"><QRCode text={joinAddr} /></div>
          ) : (
            <div className="sub">{joinAddr || 'finding the address…'}</div>
          )}
          <TriviaLine scriptId={script} compact />
        </div>
      </SidepanelCard>
    </div>
  );

  return <DashboardLayout left={left} main={main} right={right} fadeClass={`fade-wrap ${fadeClass}`} />;
}
