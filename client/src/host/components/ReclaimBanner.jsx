import Icon from './Icon.jsx';
import { post } from '../../lib/api.js';

// Always rendered from S.pendingReclaims, independent of whatever phase
// view is showing underneath — a reconnect request can land mid-night and
// someone needs to see it immediately, not after the next phase change.
export default function ReclaimBanner({ pendingReclaims }) {
  if (!pendingReclaims || !pendingReclaims.length) return null;

  return (
    <div id="reclaimBanner">
      {pendingReclaims.map(r => (
        <div className="reclaim" key={r.requestId}>
          <span className="ask">
            <Icon name="users" size={15} />
            <span>A new device wants to reconnect as {r.name}.</span>
          </span>
          <div className="btns">
            <button type="button" className="primary" onClick={() => post('/api/table/reclaim/approve', { requestId: r.requestId })}>
              <Icon name="check" size={15} /> Approve
            </button>
            <button type="button" onClick={() => post('/api/table/reclaim/deny', { requestId: r.requestId })}>
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
