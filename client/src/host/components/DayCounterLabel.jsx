import Icon from './Icon.jsx';

export default function DayCounterLabel({ text }) {
  return (
    <div className="daycounter">
      <Icon name={text.startsWith('Night') ? 'moon' : 'sun'} size={14} />
      <span>{text}</span>
    </div>
  );
}
