'use strict';

/* Unit tests for game/characterNotes.js — a small, deliberately-sparse
   lookup (see its own comment on why an entry is rare), so what actually
   needs checking is the shape every caller (server.js's /api/scripts)
   relies on: null for the common case, the real string for a flagged
   character, and every character.json id resolving to SOMETHING (never
   throwing on an unknown id). */

const { CHARACTER_NOTES, noteFor } = require('../game/characterNotes');
const { characters: CHARACTERS } = require('../game/characters.json');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

console.log('noteFor');
{
  check('a character with no flagged note returns null, not undefined', noteFor('chef') === null);
  check('an unknown id returns null rather than throwing', noteFor('not-a-real-character') === null);
  check('every character.json id resolves without throwing', (() => {
    try {
      CHARACTERS.forEach(c => noteFor(c.id));
      return true;
    } catch (e) {
      return false;
    }
  })());

  // The Barber: the one entry this file ships with — see its own comment
  // for the real report behind it (the same investigation that moved the
  // Ravenkeeper's reveal off wave 2).
  check('the Barber has a real note, not just an entry with empty text',
    typeof CHARACTER_NOTES.barber === 'string' && CHARACTER_NOTES.barber.length > 0);
  check('noteFor(\'barber\') returns that exact string', noteFor('barber') === CHARACTER_NOTES.barber);

  check('CHARACTER_NOTES only ever keys real, known character ids', Object.keys(CHARACTER_NOTES).every(
    id => CHARACTERS.some(c => c.id === id)), Object.keys(CHARACTER_NOTES).filter(id => !CHARACTERS.some(c => c.id === id)).join(', '));
}

console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
process.exit(failures ? 1 : 0);
