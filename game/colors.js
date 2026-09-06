'use strict';

/* Twenty-five named colors, in keeping with the table's own vocabulary —
   wax seals, mourning jewelry, poisons, tarnish — rather than a generic
   swatch grid. Deliberately distinct from the app's own semantic colors
   (the oxblood of evil, the brass of emphasis, the dusk-blue of good) so a
   player's personal pick is never mistaken for a team indicator. */

const COLOR_PALETTE = [
  { id: 'widows-violet', name: "Widow's Violet", hex: '#5b3866' },
  { id: 'verdigris', name: 'Verdigris', hex: '#3f6b57' },
  { id: 'candlewax', name: 'Candlewax', hex: '#c9a13b' },
  { id: 'raven', name: 'Raven', hex: '#34323e' },
  { id: 'marigold', name: 'Marigold', hex: '#c97a2b' },
  { id: 'plague-doctor', name: 'Plague Doctor', hex: '#4a5d4e' },
  { id: 'absinthe', name: 'Absinthe', hex: '#6b8e4e' },
  { id: 'mourning-pearl', name: 'Mourning Pearl', hex: '#8a8375' },
  { id: 'opium-den', name: 'Opium Den', hex: '#7a4a8e' },
  { id: 'rust', name: 'Rust', hex: '#a1522c' },
  { id: 'slate', name: 'Slate', hex: '#4d5b66' },
  { id: 'amaranth', name: 'Amaranth', hex: '#a13158' },
  { id: 'copper-patina', name: 'Copper Patina', hex: '#4e7d72' },
  { id: 'midnight-plum', name: 'Midnight Plum', hex: '#3d2748' },
  { id: 'saffron', name: 'Saffron', hex: '#d1912e' },
  { id: 'wine-stain', name: 'Wine Stain', hex: '#6e1f3a' },
  { id: 'fog', name: 'Fog', hex: '#6f7a72' },
  { id: 'bruise', name: 'Bruise', hex: '#5a4a6e' },
  { id: 'teal-ink', name: 'Teal Ink', hex: '#2d6b6b' },
  { id: 'iron', name: 'Iron', hex: '#5c5f66' },
  { id: 'chartreuse-poison', name: 'Chartreuse Poison', hex: '#8a9c3e' },
  { id: 'dusty-rose', name: 'Dusty Rose', hex: '#a4677a' },
  { id: 'deep-ocean', name: 'Deep Ocean', hex: '#1f4a5c' },
  { id: 'tarnished-gold', name: 'Tarnished Gold', hex: '#9c7a2e' },
  { id: 'charcoal-violet', name: 'Charcoal Violet', hex: '#453a4d' },
];

const byId = id => COLOR_PALETTE.find(c => c.id === id) || null;

module.exports = { COLOR_PALETTE, byId };
