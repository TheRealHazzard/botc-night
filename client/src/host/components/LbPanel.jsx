// The shared shell every .lb-panel card uses — Hall of Fame, Game History,
// and the Dry Run simulator's own start form/stage/event-log/LLM-traffic
// panels all go through this one component now, instead of each hand-
// writing its own <div className="lb-panel"><h3>. Same flanked-rule
// heading/grain-textured shell as SidepanelCard elsewhere in this app.
// `title` is optional (GameHistoryOverlay's victory-summary panel has no
// heading of its own) and `action` is an optional element next to the
// title (GameHistoryOverlay's "Show bot-test games" toggle sits here).
export default function LbPanel({ title, action, className, children }) {
  return (
    <div className={'lb-panel' + (className ? ' ' + className : '')}>
      {title && (
        <>
          <div className="lb-panel-heading">
            <span className="lb-panel-rule" />
            <span className="lb-panel-title">{title}</span>
            <span className="lb-panel-rule end" />
            {action}
          </div>
          <div className="lb-rule-brass" />
          <div className="lb-rule-soft" />
        </>
      )}
      {children}
    </div>
  );
}
