// A flanked-rule heading (brass gradient hairlines either side of the
// title, a brass-then-soft double rule underneath) in place of the old
// plain uppercase label + inline icon — "the Illuminated Ledger
// direction," picked over two icon-driven alternatives after a Design
// canvas comparison. No icon any more: the ornament carries the card's
// identity now, so `icon` is no longer part of this component's props
// at all (every call site had its own icon string stripped alongside
// this change, not left as a silently-ignored prop).
export default function SidepanelCard({ title, children }) {
  return (
    <div className="sidepanel-card">
      <div className="sidepanel-heading">
        <span className="sidepanel-heading-rule" />
        <span className="sidepanel-title">{title}</span>
        <span className="sidepanel-heading-rule end" />
      </div>
      <div className="sidepanel-rule-brass" />
      <div className="sidepanel-rule-soft" />
      {children}
    </div>
  );
}
