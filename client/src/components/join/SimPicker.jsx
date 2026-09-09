import Avatar from '../Avatar.jsx';

// A running simulation occupies the one live game, so a real join isn't
// possible anyway — offer to watch it instead of a confusing "already
// started" error.
export default function SimPicker({ seats, onPickSeat, onCheckAgain }) {
  return (
    <div className="card">
      <h2>A simulation is running</h2>
      <p className="dim small">
        Pick a seat to see exactly what that player's phone would show. Bots make every decision here —
        there's nothing for you to tap.
      </p>
      <div className="pickergrid">
        {seats.map(s => (
          <div
            className="playercard"
            key={s.token}
            style={s.alive ? undefined : { opacity: 0.55 }}
            onClick={() => onPickSeat(s.token)}
          >
            <Avatar name={s.name} />
            <div className="pname">{s.name}</div>
            <div className="pgames">{s.character || (s.alive ? 'not yet dealt' : 'dead')}</div>
          </div>
        ))}
      </div>
      <button type="button" className="linklike" onClick={onCheckAgain}>Check again for a real game</button>
    </div>
  );
}
