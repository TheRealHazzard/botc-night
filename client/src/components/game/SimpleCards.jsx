// The plain, static-copy cards — no interaction beyond what's already
// handled elsewhere (RoleCard, the vote flow), except DaylightCard's own
// nominate trigger below. Grouped in one file since each is a couple of
// lines; split out again if any of them grows real logic of its own.

export function LobbyCard({ name }) {
  return (
    <div className="card">
      <h2>Seated as {name}</h2>
      <p className="dim">Waiting for the table to fill.</p>
    </div>
  );
}

export function RevealCard() {
  return (
    <div className="card">
      <h2>Learn yourself</h2>
      <p className="dim">Hold the panel above. Show no one.</p>
    </div>
  );
}

export function NightWaitingCard() {
  return (
    <div className="card">
      <h2>Eyes closed.</h2>
      <p className="dim">Wait.</p>
    </div>
  );
}

export function DaylightCard({ canNominate, onNominate }) {
  return (
    <div className="card">
      <h2>Daylight</h2>
      <p className="dim">
        {canNominate
          ? 'Talk. Accuse. Decide.'
          : 'Talk. Accuse. Decide. The phone has nothing more for you.'}
      </p>
      {canNominate && (
        <button type="button" className="primary" onClick={onNominate}>I Nominate</button>
      )}
    </div>
  );
}
