import Icon from './Icon.jsx';

// A lighter sibling to FatalFlashOverlay — a death that doesn't end the
// game still deserves a beat, just a much smaller one: translucent, brief,
// and pointer-events:none (see styles.css) so the day view underneath it
// keeps working, not frozen the way the fatal-blow flash deliberately
// holds the game on the way to a reveal.
export default function MinorBeatOverlay({ name }) {
  return (
    <div className="minor-beat">
      <Icon name="scroll" size={40} />
      <div className="minor-beat-text">{name} is executed.</div>
    </div>
  );
}
