import { useEffect, useState } from 'react';
import { post } from '../../lib/api.js';

export default function ColorPicker({ name, onProceed }) {
  const [colors, setColors] = useState([]);
  const [picking, setPicking] = useState(false);

  const loadColors = () => {
    fetch('/api/colors?name=' + encodeURIComponent(name)).then(r => r.json()).then(setColors).catch(() => {});
  };
  useEffect(loadColors, [name]);

  const pick = c => {
    setPicking(true);
    post('/api/profile/color', { name, colorId: c.id }).then(r => {
      if (r.error) { setPicking(false); loadColors(); return; }
      onProceed(r.color);
    });
  };

  return (
    <div className="card">
      <h2>Choose a color, {name}.</h2>
      <p className="dim small">Yours alone — no two players share one. Change it later from your stats page.</p>
      <div className="colorgrid">
        {colors.map(c => (
          <div
            className={'swatch' + (c.takenBy ? ' taken' : '')}
            key={c.id}
            style={{ background: c.hex }}
            onClick={!c.takenBy && !picking ? () => pick(c) : undefined}
          >
            <span className="swatch-name">{c.takenBy ? `${c.name} — ${c.takenBy}'s` : c.name}</span>
          </div>
        ))}
      </div>
      <button type="button" className="linklike" onClick={() => onProceed(null)}>Skip for now</button>
    </div>
  );
}
