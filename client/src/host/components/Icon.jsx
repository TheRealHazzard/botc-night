import { ICON_PATHS } from '../lib/icons.js';

// One dict-driven icon component for all ~20 glyphs, rather than one
// component per icon (see ICON_PATHS's own comment for why). The path data
// is static, developer-authored markup (never user input) — same trust
// boundary the vanilla version's `svg.innerHTML = ICON_PATHS[name]` had.
export default function Icon({ name, size, className }) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <svg
      className={'icon' + (className ? ' ' + className : '')}
      viewBox="0 0 24 24"
      style={style}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || '' }}
    />
  );
}
