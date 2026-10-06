import LbPanel from './LbPanel.jsx';

// Observer-only: what the LLM Storyteller was actually sent and actually
// sent back, in full — a simulation has no real secrets, so nothing here
// needs redacting the way a real player's own claim would. Newest first.
export default function SimLlmTrafficPanel({ entries }) {
  return (
    <LbPanel title="LLM Storyteller traffic">
      {!entries.length ? (
        <p className="sub">
          Nothing sent yet — fires on a Gossip/Artist/Savant visit (a real player only, bots can't) or a
          Mayor/Recluse/Spy/Pacifist judgment call (bots included), and only once the toggle in Settings is on.
        </p>
      ) : (
        <>
          <p className="sub">{entries.length} call{entries.length === 1 ? '' : 's'} this game — newest first.</p>
          {entries.slice().reverse().map((c, i) => (
            <div className="sim-llmcall" key={i}>
              <div className="sim-llmcall-head">
                <span className="sim-llmcall-kind">{c.kind}</span>
                <span>{c.provider} · {c.model}</span>
                <span className="sim-llmcall-spacer" />
                <span>{c.durationMs}ms</span>
                <span className={'sim-llmcall-badge' + (c.ok ? ' ok' : ' fail')}>{c.ok ? 'ok' : c.reason}</span>
              </div>
              <div className="sim-llmcall-block">
                <span className="sim-llmcall-label">sent</span>
                <pre>{`SYSTEM: ${c.system}\n\nPROMPT: ${c.prompt}`}</pre>
              </div>
              <div className="sim-llmcall-block">
                <span className="sim-llmcall-label">received</span>
                <pre className={c.ok ? undefined : 'fail'}>{c.ok ? JSON.stringify(c.data, null, 2) : `(${c.reason})`}</pre>
              </div>
            </div>
          ))}
        </>
      )}
    </LbPanel>
  );
}
