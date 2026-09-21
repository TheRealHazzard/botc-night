import { useTextScale } from '../hooks/useTextScale.js';

// The Storyteller-controls entry point used to live here as a third
// button, and on a narrow phone that's one more than a row with the
// wordmark can hold without overflowing (see PlayerApp.jsx's leader-banner
// instead — full-width, so it isn't fighting Aa/The script for the same
// tight horizontal space).
export default function TopBar({ onOpenScript }) {
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
      <button type="button" className="scriptbtn" onClick={onOpenScript}>
        The script
      </button>
    </div>
  );
}
