import RingSeat from './RingSeat.jsx';
import VoiceVisualizer from './VoiceVisualizer.jsx';

export default function RingSeats({ players, revealed = false, enteringIds = null, glow = null, pace = null }) {
  return (
    <div
      className={
        'ring' +
        (players.length > 10 ? ' dense' : '') +
        (glow ? ` glow-${glow}` : '') +
        (pace ? ` pace-${pace}` : '')
      }
    >
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
      {/* Lives here, not in each view's own narration, now that narration
          has no on-screen home at all — RingSeats is the one thing
          permanently mounted across every phase (see App.jsx's portal),
          so this is the only place that doesn't need re-wiring per view.
          Below the center art (.ring::after), inside the circle itself. */}
      <VoiceVisualizer />
    </div>
  );
}
