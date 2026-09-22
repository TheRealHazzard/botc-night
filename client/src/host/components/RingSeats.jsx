import RingSeat from './RingSeat.jsx';
import DayCountdownRing from './DayCountdownRing.jsx';

export default function RingSeats({ players, revealed = false, enteringIds = null, glow = null, countdown = null }) {
  return (
    <div className={'ring' + (players.length > 10 ? ' dense' : '') + (glow ? ` glow-${glow}` : '')}>
      {/* First, so seat avatars stack visually on top of the fill rather
          than under it. */}
      {countdown && <DayCountdownRing startedAt={countdown.startedAt} totalMs={countdown.totalMs} />}
      {players.map((p, i) => (
        <RingSeat
          key={p.id}
          player={p}
          index={i}
          total={players.length}
          revealed={revealed}
          entering={!!(enteringIds && enteringIds.has(p.id))}
        />
      ))}
    </div>
  );
}
