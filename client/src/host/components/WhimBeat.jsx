import Icon from './Icon.jsx';

// A small, deliberately unshowy stage annotation — the opposite of
// FatalFlashOverlay's full-screen moment. The point is a felt aside, not a
// spoiler: never which whim, never which character, just that something
// unseen just happened. See useWhimBeat.js for when this mounts.
export default function WhimBeat() {
  return (
    <div className="whim-beat">
      <Icon name="dice" size={14} />
      <span>A quiet decision, unseen.</span>
    </div>
  );
}
