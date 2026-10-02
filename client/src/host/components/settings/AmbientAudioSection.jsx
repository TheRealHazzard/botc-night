export default function AmbientAudioSection({ config, patch }) {
  return (
    <div className="settings-section">
      <h3>Ambient audio</h3>
      <div className="settings-row">
        <div className="lbl">
          <b>Use licensed tracks instead of the synthesized bed</b>
          <span>The default ambient bed is generated live, with no audio files shipped. This swaps it for
            two real instrumental tracks instead — one for night, one for day.</span>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={!!config.licensedAmbientMusic}
            onChange={e => patch({ licensedAmbientMusic: e.target.checked })}
          />
          <span className="track" />
        </label>
      </div>
      <p className="sub">
        "Stay the Course" and "Envision" by Kevin MacLeod (incompetech.com), licensed under{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          Creative Commons Attribution 4.0
        </a>. Full credits in MUSIC-CREDITS.md.
      </p>
    </div>
  );
}
