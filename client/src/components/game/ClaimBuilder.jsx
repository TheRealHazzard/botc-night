import { useState } from 'react';
import TargetButton from '../TargetButton.jsx';
import { post } from '../../lib/api.js';

/** Shared by GossipClaim and ArtistQuestion — both let a player build one
    of four claim shapes (a player's team, a player's exact character, a
    count among several players, or free text) against the same
    targets/characterOptions data, then POST one of three body shapes to
    an endpoint. Only copy and endpoint differ between the two callers. */
export default function ClaimBuilder({
  title,
  description,
  freeformKindLabel,
  freeformHelperText,
  freeformPlaceholder,
  submitLabel,
  submittingLabel,
  endpoint,
  token,
  targets,
  characterOptions,
  llmEnabled,
}) {
  const [claimType, setClaimType] = useState(null);
  const [target, setTarget] = useState(null);
  const [claimValue, setClaimValue] = useState(null);
  const [multiTargets, setMultiTargets] = useState([]);
  const [threshold, setThreshold] = useState(null);
  const [freeText, setFreeText] = useState('');
  const [busy, setBusy] = useState(false);

  const pickKind = kind => {
    setClaimType(kind);
    setTarget(null);
    setClaimValue(null);
    setMultiTargets([]);
    setThreshold(null);
    setFreeText('');
  };

  const toggleMultiTarget = id => {
    setMultiTargets(cur => {
      const on = cur.includes(id);
      const next = on ? cur.filter(x => x !== id) : [...cur, id];
      if (threshold > next.length) setThreshold(null);
      return next;
    });
  };

  const ready =
    (claimType === 'team' && target && claimValue) ||
    (claimType === 'character' && target && claimValue) ||
    (claimType === 'atleast' && multiTargets.length >= 2 && threshold && claimValue) ||
    (claimType === 'freeform' && freeText.trim().length > 0);

  const isFreeform = claimType === 'freeform';

  const submit = () => {
    setBusy(true);
    const claimBody = claimType === 'atleast'
      ? { token, claimType: 'atleast', targetIds: multiTargets, threshold, claimValue }
      : isFreeform
        ? { token, claimType: 'freeform', claimText: freeText.trim() }
        : { token, targetId: target, claimType, claimValue };
    post(endpoint, claimBody).then(r => {
      if (r.error) { alert(r.error); setBusy(false); return; }
      pickKind(null);
      setBusy(false);
    });
  };

  const targetName = target && (targets.find(t => t.id === target) || {}).name;

  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="dim small">{description}</p>

      <div className="targets">
        <button type="button" className={'target' + (claimType === 'team' ? ' on' : '')} onClick={() => pickKind('team')}>
          A player&rsquo;s team
        </button>
        <button type="button" className={'target' + (claimType === 'character' ? ' on' : '')} onClick={() => pickKind('character')}>
          A player&rsquo;s exact character
        </button>
        <button type="button" className={'target' + (claimType === 'atleast' ? ' on' : '')} onClick={() => pickKind('atleast')}>
          A count among several players
        </button>
        {llmEnabled && (
          <button type="button" className={'target' + (claimType === 'freeform' ? ' on' : '')} onClick={() => pickKind('freeform')}>
            {freeformKindLabel}
          </button>
        )}
      </div>

      {isFreeform && (
        <>
          <p className="dim small">{freeformHelperText}</p>
          <textarea
            className="freetext"
            maxLength={400}
            placeholder={freeformPlaceholder}
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
          />
        </>
      )}

      {(claimType === 'team' || claimType === 'character') && (
        <>
          <p className="dim small">Choose a player.</p>
          <div className="targets">
            {targets.map(t => (
              <TargetButton key={t.id} target={t} selected={target === t.id} onClick={() => { setTarget(t.id); setClaimValue(null); }} />
            ))}
          </div>
        </>
      )}

      {claimType === 'team' && target && (
        <div className="targets">
          <button type="button" className={'target' + (claimValue === 'good' ? ' on' : '')} onClick={() => setClaimValue('good')}>
            {targetName} is good
          </button>
          <button type="button" className={'target' + (claimValue === 'evil' ? ' on' : '')} onClick={() => setClaimValue('evil')}>
            {targetName} is evil
          </button>
        </div>
      )}

      {claimType === 'character' && target && (
        <>
          <p className="dim small">Which character?</p>
          <div className="targets">
            {characterOptions.map(opt => (
              <TargetButton key={opt.id} target={opt} selected={claimValue === opt.id} onClick={() => setClaimValue(opt.id)} />
            ))}
          </div>
        </>
      )}

      {claimType === 'atleast' && (
        <>
          <p className="dim small">Choose at least two players.</p>
          <div className="targets">
            {targets.map(t => (
              <TargetButton key={t.id} target={t} selected={multiTargets.includes(t.id)} onClick={() => toggleMultiTarget(t.id)} />
            ))}
          </div>

          {multiTargets.length >= 2 && (
            <>
              <p className="dim small">At least how many of these {multiTargets.length}?</p>
              <div className="targets">
                {Array.from({ length: multiTargets.length }, (_, i) => i + 1).map(n => (
                  <button key={n} type="button" className={'target' + (threshold === n ? ' on' : '')} onClick={() => setThreshold(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          {multiTargets.length >= 2 && threshold && (
            <div className="targets">
              <button type="button" className={'target' + (claimValue === 'good' ? ' on' : '')} onClick={() => setClaimValue('good')}>are good</button>
              <button type="button" className={'target' + (claimValue === 'evil' ? ' on' : '')} onClick={() => setClaimValue('evil')}>are evil</button>
            </div>
          )}
        </>
      )}

      <button type="button" className="primary" disabled={!ready || busy} onClick={submit}>
        {isFreeform && busy ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}
