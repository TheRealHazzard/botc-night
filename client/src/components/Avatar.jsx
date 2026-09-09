import { avatarColor } from '../lib/avatar.js';

export default function Avatar({ name, color }) {
  return (
    <div className="avatar" style={{ background: color ? color.hex : avatarColor(name) }}>
      {(name[0] || '?').toUpperCase()}
    </div>
  );
}
