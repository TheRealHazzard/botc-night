import ScriptRosterCard from '../ScriptRosterCard.jsx';

/** The right column while browsing — who's actually playable in the
    browsed script (the same team-grouped grid GameLeftPanel shows for
    the deployed script, reused unchanged here since it's already keyed
    off a plain characters array, not anything deploy-specific).

    Commit/back-out (Choose/Cancel) live in the header now, not here —
    that's what gives this panel a cleaner footprint: just the roster,
    nothing competing with it for attention. Still wrapped in its own
    scrollable region (same technique as the script list and center
    preview) since a 25-character script's grid can still run taller
    than the available column height on its own. */
export default function ScriptBrowseRoster({ meta }) {
  return (
    <div className="sidepanel sidepanel-fill">
      <div className="script-browse-roster">
        <ScriptRosterCard characters={meta.characters} />
      </div>
    </div>
  );
}
