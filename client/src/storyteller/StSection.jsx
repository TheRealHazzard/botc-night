// Every <section className="st-section"> used to hand-write its own
// plain uppercase <h3> — this is the one place that heading shape lives
// now, the storyteller console's own equivalent of the host app's
// SidepanelCard (same flanked-rule-heading/double-rule "Illuminated
// Ledger" language, just under this app's own .st-section class rather
// than importing a component from a different Vite entry/app tree).
export default function StSection({ title, children }) {
  return (
    <section className="st-section">
      <div className="st-section-heading">
        <span className="st-section-rule" />
        <span className="st-section-title">{title}</span>
        <span className="st-section-rule end" />
      </div>
      <div className="st-rule-brass" />
      <div className="st-rule-soft" />
      {children}
    </section>
  );
}
