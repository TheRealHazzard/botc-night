// The plain, static-copy cards — no interaction beyond what's already
// handled elsewhere (RoleCard, the vote flow), except DaylightCard's own
// nominate trigger below. Grouped in one file since each is a couple of
// lines; split out again if any of them grows real logic of its own.

/** `lobby` (see privateState's own lobby field) is nothing more than
    who's already seated — never secret before roles are dealt, since
    everyone physically at the table already sees this. Shown here so a
    player waiting on their own phone gets real progress instead of a
    flat "waiting" with no sense of whether that's 1 player or 14. */
export function LobbyCard({ name, onChangeUser, lobby }) {
  const others = (lobby?.names || []).filter(n => n !== name);
  const count = lobby?.count ?? 0;
  const short = count < 5;

  return (
    <div className="card">
      <h2 className="seated-head">
        Seated as {name}
        <button type="button" className="changebtn" onClick={onChangeUser}>Change</button>
      </h2>
      {others.length ? (
        <p className="dim">
          {count} seated — {others.join(', ')}.
          {short ? ` Need ${5 - count} more to start.` : ' Waiting for the Storyteller to deal.'}
        </p>
      ) : (
        <p className="dim">Waiting for the table to fill.</p>
      )}
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
