// Vendored qrcode.js loads as a plain <script> tag (see client/host.html) —
// exposes window.QRCodeGen, stays completely unbundled/unchanged. Absent
// entirely only if that request failed, which the join address text next
// to it already covers on its own — an oversized tunnel hostname can also
// exceed the encoder's max version and throw, same fallback-to-text-only
// behavior as the vanilla.
export default function QRCode({ text }) {
  if (typeof window === 'undefined' || typeof window.QRCodeGen === 'undefined') return null;

  let size, modules;
  try {
    ({ size, modules } = window.QRCodeGen.encode(text, { level: 'M' }));
  } catch {
    return null;
  }

  let d = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) d += `M${c} ${r}h1v1h-1z`;
    }
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
      <rect width={size} height={size} style={{ fill: 'var(--bone)' }} />
      <path d={d} style={{ fill: 'var(--void)' }} />
    </svg>
  );
}
