export default function TopBar({ onOpenScript }) {
  return (
    <div className="topbar">
      <h1><img className="wordmark" src="/icons/botc-logo.png" alt="Blood On The Clocktower" /></h1>
      <button type="button" className="scriptbtn" onClick={onOpenScript}>
        The script
      </button>
    </div>
  );
}
