// A player's own color as a light tint (blended toward white) for an
// avatar's fill, keeping the full-strength hex for the border and the
// text — border and letter read as "their color," the fill just gives it
// somewhere to sit without turning the whole badge into a solid block.
export function lightenHex(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const light = c => Math.round(c + (255 - c) * amount);
  return `rgb(${light(r)}, ${light(g)}, ${light(b)})`;
}
