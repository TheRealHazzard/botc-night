export default function LlmSection({ config, llmConfigured, patch }) {
  return (
    <div className="settings-section">
      <h3>LLM Storyteller (experimental)</h3>
      <div className="settings-row">
        <div className="lbl">
          <b>Connect an LLM Storyteller</b>
          <span>Lets Gossip/Artist take a free-text claim or question, gives Savant richer phrasing, and
            replaces the Mayor redirect / Recluse-Spy registration / Pacifist save's flat dice roll with a
            real judgment call weighing which side is behind.</span>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={!!config.llmStorytellerEnabled}
            onChange={e => patch({ llmStorytellerEnabled: e.target.checked })}
          />
          <span className="track" />
        </label>
      </div>
      <p className={'llm-status ' + (llmConfigured ? 'ok' : 'off')}>
        {llmConfigured
          ? 'Connected — ANTHROPIC_API_KEY is set on the server.'
          : 'Not configured — set ANTHROPIC_API_KEY on the server to actually use this.'}
      </p>
    </div>
  );
}
