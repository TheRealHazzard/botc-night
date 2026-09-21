import Icon from './Icon.jsx';

const COPY = {
  quiet: { icon: 'clock', text: "The room's gone quiet — might be worth checking in." },
  pressure: { icon: 'bolt', text: 'Still quiet after a while — maybe time to add some pressure.' },
};

/** The Read's visible half — see useRoomPacing.js for the actual pacing
    logic. A nudge, not a timer: no countdown, no urgency chrome beyond the
    icon swap, easy to ignore entirely (which is the point — this suggests,
    it never forces anything). */
export default function RoomPacingNudge({ level }) {
  if (!level) return null;
  const { icon, text } = COPY[level];
  return (
    <div className={'room-pacing' + (level === 'pressure' ? ' pressure' : '')}>
      <Icon name={icon} size={14} />
      <span>{text}</span>
    </div>
  );
}
