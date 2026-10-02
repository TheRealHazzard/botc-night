import ScriptBadge from './ScriptBadge.jsx';
import ScriptDifficultyPanel from './ScriptDifficultyPanel.jsx';
import ScriptGamesPanel from './ScriptGamesPanel.jsx';
import FeaturedRoleCard from './FeaturedRoleCard.jsx';
import ScriptNotesPanel from './ScriptNotesPanel.jsx';

/** The center column while browsing scripts — a big preview of whichever
    row is currently browsed, replacing the seating ring for the moment
    (you're choosing a script right now, not looking at seated players).
    Reads top to bottom as: what it is (badge/name/difficulty), what it's
    about (description), anything worth knowing before committing to it
    (ScriptNotesPanel — almost always empty, see its own comment), a taste
    of actually playing it (the featured role), then its record at this
    table — description sets the tone, the notes (when there are any) set
    expectations, the featured role makes it concrete, the record closes
    with how it's actually gone so far. The full cast grid lives in the
    right column instead (ScriptBrowseRoster) rather than competing with
    this column for space. */
export default function ScriptBrowsePreview({ meta }) {
  const locked = meta.playable === false;

  return (
    <div className="script-preview">
      <ScriptBadge meta={meta} />
      <h2 className="script-preview-name">{meta.name}</h2>
      {locked && <span className="badge-soon">Soon</span>}
      <ScriptDifficultyPanel meta={meta} />
      {meta.characterCount != null && <div className="sub">{meta.characterCount} characters</div>}
      {meta.maxPlayers != null && <div className="sub">Best for up to {meta.maxPlayers} players</div>}
      <div className="desc">{meta.description || ''}</div>
      <ScriptNotesPanel notes={meta.notes} />
      {meta.featuredCharacter && <FeaturedRoleCard character={meta.featuredCharacter} />}
      <ScriptGamesPanel meta={meta} />
    </div>
  );
}
