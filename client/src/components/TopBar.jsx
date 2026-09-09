export default function TopBar({ onOpenScript }) {
  return (
    <div className="topbar">
      <h1>Blood On The Clocktower</h1>
      <button type="button" className="scriptbtn" onClick={onOpenScript}>
        The script
      </button>
    </div>
  );
}
