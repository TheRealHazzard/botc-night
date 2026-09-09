import GhostIcon from './GhostIcon.jsx';

// A "choose a player" button's border is that player's own assigned color,
// same identity cue as their ring dot everywhere else. A ghost icon marks a
// dead player — shown only where the ability's own target list actually
// includes them (Fortune Teller, Ravenkeeper, Professor), since every other
// ability's list already excludes the dead entirely.
export default function TargetButton({ target, selected, onClick, disabled }) {
  return (
    <button
      type="button"
      className={'target' + (selected ? ' on' : '')}
      style={target.color ? { borderColor: target.color.hex } : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      <span>{target.name}</span>
      {target.alive === false && <GhostIcon className="icon" />}
    </button>
  );
}
