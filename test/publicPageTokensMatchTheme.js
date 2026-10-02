'use strict';

/* public/clocktower-dark.css is a manually-kept-in-sync mirror of
   client/src/theme.css's color tokens, for the plain static HTML pages
   under public/ that never go through the Vite build and so can't just
   `@import` theme.css directly. This is the one guard against it quietly
   drifting the next time someone edits theme.css and forgets the mirror
   exists — same silent-drift problem that had already happened once
   (several public/*.html pages had their own stale hardcoded copies of
   these exact hex values before this file existed, some already
   partway diverged). */

const fs = require('fs');
const path = require('path');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

/** Pulls every `--name: value;` declaration out of a CSS file's text —
    good enough for these two specific, simple :root blocks (no nested
    rules, no var() chains inside the values themselves), not a real CSS
    parser. */
function extractTokens(css) {
  const tokens = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(css))) tokens[m[1]] = m[2].trim();
  return tokens;
}

const themePath = path.join(__dirname, '..', 'client', 'src', 'theme.css');
const mirrorPath = path.join(__dirname, '..', 'public', 'clocktower-dark.css');

const themeTokens = extractTokens(fs.readFileSync(themePath, 'utf8'));
const mirrorTokens = extractTokens(fs.readFileSync(mirrorPath, 'utf8'));

check('clocktower-dark.css actually defines at least one token (sanity check this parsed at all)',
  Object.keys(mirrorTokens).length > 0);

for (const [name, value] of Object.entries(mirrorTokens)) {
  check(`--${name} matches theme.css's own value`,
    themeTokens[name] === value,
    `mirror has "${value}", theme.css has "${themeTokens[name]}"`);
}

console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
process.exitCode = failures ? 1 : 0;
