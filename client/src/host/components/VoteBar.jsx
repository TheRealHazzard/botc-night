export default function VoteBar({ yes, threshold }) {
  const met = yes >= threshold;
  const width = Math.min(100, (yes / threshold) * 100) + '%';
  return (
    <div className="votebar">
      <div className="votebar-track">
        <div className={'votebar-fill' + (met ? ' met' : '')} style={{ width }} />
      </div>
      <div className="votebar-label">{yes} / {threshold} needed to execute</div>
    </div>
  );
}
