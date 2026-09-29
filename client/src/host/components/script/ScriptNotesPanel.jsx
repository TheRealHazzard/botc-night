/** "Before you play" — a heads-up about how THIS app runs a specific
    character differently from what a table used to the physical game
    would expect (server.js's own /api/scripts comment, game/characterNotes.js
    for what earns an entry and why). Not ability text — that's what
    FeaturedRoleCard is for — and almost always empty, so this renders
    nothing at all for the overwhelming majority of scripts. */
export default function ScriptNotesPanel({ notes }) {
  if (!notes || !notes.length) return null;

  return (
    <div className="detail-stat-panel">
      <div className="detail-stat-panel-title">Before you play</div>
      <div className="script-notes">
        {notes.map(n => (
          <p key={n.id} className="script-note">
            <strong>{n.name}: </strong>{n.note}
          </p>
        ))}
      </div>
    </div>
  );
}
