// The player app's own "Illuminated Ledger" card shell — grain-textured,
// flanked-rule heading in place of a plain <h2> — same visual language as
// the host app's SidepanelCard and the storyteller console's StSection,
// each app's own component since the three are separate Vite entries, not
// one shared import across app trees. `title` is optional: ResultCard/
// ResultHistoryCard have no heading of their own (their own internal
// .result title already does that job) and just want the shell.
// `action` is an optional element rendered after the heading's own rule
// (LobbyCard's "Change" button sits here, not inside the rule-flanked
// title itself).
export default function Card({ title, action, children }) {
  return (
    <div className="card">
      {title && (
        <>
          <div className="card-heading">
            <span className="card-rule" />
            <span className="card-title">{title}</span>
            <span className="card-rule end" />
            {action}
          </div>
          <div className="card-rule-brass" />
          <div className="card-rule-soft" />
        </>
      )}
      {children}
    </div>
  );
}
