import { useTextScale } from '../hooks/useTextScale.js';

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
