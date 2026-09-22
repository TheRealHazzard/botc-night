// Reuses OverView.jsx's own .log styling — reverse-chronological, secret
// lines styled distinctly (nothing here needs redacting the way a real
// player's own view would; a simulation has no real secrets to protect).
export default function SimEventLog({ log }) {
  return (
    <div className="lb-panel">
      <h3>What actually happened</h3>
      <div className="log">
        {log.slice().reverse().map((l, i) => (
          <p key={i} className={l.secret ? 'secret' : undefined}>Night {l.night} — {l.text}</p>
        ))}
      </div>
    </div>
  );
}
