// Inline SVG path data for every icon glyph the host screen uses, keyed by
// name. Rendered via the <Icon name="moon"/> component (see ../components/
// Icon.jsx) rather than one component per icon — with ~20 of these sharing
// this one dict shape already, that's a better match than the one-off
// per-icon component pattern used for the player app's single custom icon.
export const ICON_PATHS = {
  moon: '<path d="M20 14.7A8.5 8.5 0 1 1 9.3 4a7 7 0 0 0 10.7 10.7Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  skull:
    '<path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 3.9 2 4.8V18h2v-1.6h2V18h2v-1.6h2V18h2v-3.2c.8-.9 2-2.3 2-4.8a7 7 0 0 0-7-7Z"/><circle cx="9.4" cy="10" r="1.05" fill="currentColor" stroke="none"/><circle cx="14.6" cy="10" r="1.05" fill="currentColor" stroke="none"/><path d="M11 21h2"/>',
  ghost:
    '<path d="M6 20V11a6 6 0 0 1 12 0v9l-2.2-1.6L14 20l-2-1.6L10 20l-1.8-1.6L6 20Z"/><circle cx="9.6" cy="10.6" r=".9" fill="currentColor" stroke="none"/><circle cx="14.4" cy="10.6" r=".9" fill="currentColor" stroke="none"/>',
  users:
    '<circle cx="8.6" cy="8" r="3"/><path d="M2.6 19c0-3.3 2.6-5.4 6-5.4s6 2.1 6 5.4"/><circle cx="16.6" cy="9" r="2.3"/><path d="M15 13.7c2.5.3 4.4 2.3 4.4 5.3"/>',
  // Spans close to the full 24x24 box (y:5-18, x:4-20) rather than hugging
  // the vertical center the way a smaller checkmark naturally draws —
  // next to scroll/trophy/bolt's own near-full-height paths (ReferenceOverlay's
  // picker menu, all four sharing one row shape), the old, smaller mark
  // read as noticeably lighter/smaller than its siblings despite sharing
  // the exact same 20px icon box.
  check: '<path d="M4 13l5 5L20 5"/>',
  play: '<path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none"/>',
  refresh:
    '<path d="M4 12a8 8 0 0 1 13.6-5.7M20 12a8 8 0 0 1-13.6 5.7"/><path d="M17.2 2.8v4h-4M6.8 21.2v-4h4"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  trend: '<path d="M3 17l5-5 4 4 8.5-9.5"/><path d="M14.5 6h6v6"/>',
  mug: '<path d="M5.5 8h11v7a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4V8Z"/><path d="M16.5 9.5H18a2.3 2.3 0 0 1 0 4.6h-1.5"/><path d="M8.3 5.6c0-.9.7-1.3.7-2.2M11.7 5.6c0-.9.7-1.3.7-2.2"/>',
  cloud:
    '<path d="M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 9a4.2 4.2 0 0 1-.6 9H7Z"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
  scroll:
    '<path d="M6 4h11a2 2 0 0 1 2 2v13a1.5 1.5 0 0 1-3 0V6H8"/><path d="M6 4a2 2 0 0 0-2 2v11a2.5 2.5 0 0 0 2.5 2.5H16"/><path d="M8 8h6M8 11.5h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.3 2"/>',
  hand: '<path d="M4 22c0-5 2.6-8 5.5-8h5c2.9 0 5.5 3 5.5 8"/><circle cx="12" cy="7" r="4.5"/>',
  arrows:
    '<path d="M8 3v13M8 16l-3.5-3.5M8 16l3.5-3.5"/><path d="M16 21V8M16 8l-3.5 3.5M16 8l3.5 3.5"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>',
  crosshair:
    '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><path d="M12 1.5v3.2M12 19.3v3.2M1.5 12h3.2M19.3 12h3.2"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  collapse: '<path d="M9 3v5H4M15 3v5h5M9 21v-5H4M15 21v-5h5"/>',
  // The brand mark — one hand, fixed at a dramatic hour rather than the
  // ordinary two-handed 'clock' used elsewhere, same idea as the generated
  // app icon. Static on purpose: the phase pill already spells out night
  // vs. day in full, so this doesn't need to duplicate that.
  brandmark:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><path d="M12 12 16.6 16.3"/>',
  speaker:
    '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19.3 6a8.5 8.5 0 0 1 0 12"/>',
  speakerOff:
    '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 13.09H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none"/>',
  trophy:
    '<path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4.5A2.5 2.5 0 0 0 7 9.7M17 5h2.5A2.5 2.5 0 0 1 17 9.7"/><path d="M12 13v4"/><path d="M8.5 21h7"/><path d="M10 21c0-1.8.8-2.6 2-4 1.2 1.4 2 2.2 2 4"/>',
  display:
    '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
};
