import Icon from './Icon.jsx';

export default function SidepanelCard({ icon, title, children }) {
  return (
    <div className="sidepanel-card">
      <div className="sidepanel-title">
        <Icon name={icon} size={13} />
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}
