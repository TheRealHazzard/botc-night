'use strict';
// Combines every script's active-character entries (see tb.js/bmr.js) into
// one lookup by id. This — plus the shared helpers in game/helpers.js — is
// everything game/engine.js needs to drive promptFor/resolveNight without
// a switch statement or the parallel CHOICE_CHARS/targetsByChar/text maps
// that used to require touching several places for one character.

const buildTb = require('./tb');
const buildBmr = require('./bmr');

function buildRegistry(h) {
  const entries = [...buildTb(h), ...buildBmr(h)];
  const byId = {};
  for (const entry of entries) {
    if (byId[entry.id]) throw new Error(`Duplicate character registry entry: ${entry.id}`);
    byId[entry.id] = entry;
  }
  return byId;
}

module.exports = { buildRegistry };
