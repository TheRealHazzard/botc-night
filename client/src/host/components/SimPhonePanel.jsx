import { useTokens } from '../../hooks/useTokens.js';

function isEvilTeam(team) { return team === 'minion' || team === 'demon'; }

function secondsLeft(windowEndsAt) {
  return windowEndsAt ? Math.max(0, Math.ceil((windowEndsAt - Date.now()) / 1000)) : 0;
}

// The believed-state view of one focused seat — what that bot's own phone
// would actually show them, not what's true. The "aside" panel alongside
// it is the observer's own privilege: what's being hidden from them right
// now (a Drunk's real identity, a poison warning, a decoy prompt) — a
// real player's phone never shows this half.
export default function SimPhonePanel({ s, table }) {
  const tokens = useTokens();
  const c = s.you.character;
  const evil = c && isEvilTeam(c.team);

  const notes = [];
  if (c && s.trueCharacter && c.name !== s.trueCharacter) {
    notes.push(['lie', `They are really the ${s.trueCharacter}. They will never be told.`]);
  }
  if (s.statuses.includes('poisoned')) {
    notes.push(['lie', 'Poisoned — anything they learn tonight may be false.']);
  }
  if (s.prompt) {
    notes.push(s.prompt.decoy
      ? ['lie', 'This is a decoy. Their answer does nothing.']
      : ['truth', 'This is a real ability. Their answer matters.']);
  }
  if (!notes.length) notes.push(['', 'Nothing hidden from them right now.']);

  return (
    <div className="sim-phonewrap">
      <div className="sim-phone">
        <div className="sim-phone-heading">
          <span className="sim-phone-rule" />
          <span className="sim-phone-title">Blood On The Clocktower</span>
          <span className="sim-phone-rule end" />
        </div>
        <div className="sim-phone-rule-brass" />
        <div className="sim-phone-rule-soft" />

        {!s.you.alive && (
          <div className={'sim-pdead' + (s.you.ghostVoteUsed ? '' : ' hasvote')}>
            {s.you.ghostVoteUsed
              ? 'You are dead and your vote is spent. You may still speak.'
              : 'You are dead. You still have a voice, and one vote left.'}
          </div>
        )}

        <div className="sim-pcard">
          {c ? (
            <div className="sim-prole">
              {tokens[c.id] && <img className="sim-ptoken" src={tokens[c.id]} alt="" />}
              <div className="sim-pname">{c.name}</div>
              <div className={'sim-pteam ' + (evil ? 'evil' : 'good')}>{c.team}</div>
              <div className="sim-pability">{c.ability}</div>
            </div>
          ) : (
            <div className="sub">Roles have not been dealt.</div>
          )}
        </div>

        {table.phase === 'night' && s.prompt && (
          <div className="sim-pcard">
            <div className="sim-pclock">{secondsLeft(s.windowEndsAt)}</div>
            {s.submitted ? (
              <>
                <div className="sim-pask">Answered.</div>
                <div className="sub">Put the phone down. Keep your face still.</div>
                <div className="sim-ptargets">
                  {(s.prompt.targets || []).map(t => (
                    <div
                      key={t.name}
                      className={'sim-ptarget' + ((s.choice || []).includes(t.name) ? ' on' : '')}
                      style={t.color ? { borderColor: t.color.hex } : undefined}
                    >
                      {t.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="sim-pask">{s.prompt.text}</div>
                {s.prompt.count > 1 && <div className="sub">Choose {s.prompt.count}.</div>}
                <div className="sim-ptargets">
                  {(s.prompt.targets || []).map(t => (
                    <div key={t.name} className="sim-ptarget" style={t.color ? { borderColor: t.color.hex } : undefined}>
                      {t.name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {table.phase === 'night' && !s.prompt && s.you.alive && (
          <div className="sim-pcard">
            <div className="sim-pask">Eyes closed.</div>
            <div className="sub">Wait.</div>
          </div>
        )}

        {s.result && (
          <div className="sim-pcard">
            <div className="sim-presult-title">{s.result.title}</div>
            <div>{s.result.body}</div>
            {(s.result.names || []).length > 0 && (
              <ul>{s.result.names.map((n, i) => <li key={i}>{n}</li>)}</ul>
            )}
            {s.result.grimoire && (
              <ul>
                {s.result.grimoire.map((g, i) => (
                  <li key={i}>
                    {g.name} — {g.character}
                    {g.believedCharacter ? ` (believes: ${g.believedCharacter})` : ''}
                    {g.alive ? '' : ' (dead)'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {table.phase === 'day' && (
          <div className="sim-pcard">
            <div className="sim-pask">Daylight</div>
            <div className="sub">Talk. Accuse. Decide. The phone has nothing more for you.</div>
          </div>
        )}
      </div>

      <div className="sim-aside">
        {notes.map(([cls, text], i) => (
          <div key={i} className={'sim-aside-note' + (cls ? ' ' + cls : '')}>{text}</div>
        ))}
      </div>
    </div>
  );
}
