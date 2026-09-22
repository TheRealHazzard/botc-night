import RingSeat from './RingSeat.jsx';

export default function RingSeats({ players, revealed = false, enteringIds = null, glow = null }) {
  return (
    <div className={'ring' + (players.length > 10 ? ' dense' : '') + (glow ? ` glow-${glow}` : '')}>
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
