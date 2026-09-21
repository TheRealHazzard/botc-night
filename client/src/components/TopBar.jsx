import { useTextScale } from '../hooks/useTextScale.js';

export default function TopBar({ onOpenScript, onOpenLeaderControls, isLeader }) {
  const { scale, cycle } = useTextScale();

  return (
    <div className="topbar">
      <h1><img className="wordmark" src="/icons/botc-logo.png" alt="Blood On The Clocktower" /></h1>
      <button
        type="button"
        className="textscalebtn"
        onClick={cycle}
        aria-label={`Text size: ${Math.round(scale * 100)}%. Tap to change.`}
      >
        Aa
      </button>
      {/* No designated Storyteller means someone still has to start the
          game/nights/executions — the first person to join gets this, so
          they can do it from their own phone instead of walking up to the
          host screen. See LeaderControlsOverlay.jsx. */}
      {isLeader && (
        <button type="button" className="scriptbtn" onClick={onOpenLeaderControls}>
          Storyteller
        </button>
      )}
      <button type="button" className="scriptbtn" onClick={onOpenScript}>
        The script
      </button>
    </div>
  );
}
