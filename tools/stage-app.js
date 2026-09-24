'use strict';

/* Stages the desktop app as a plain, double-click-able folder — no
   terminal, no npm, no Node install needed on the host machine. This is
   the actual shipped form of the Tauri work for now: `tauri build`'s own
   installer step (NSIS) hits a hardcoded download timeout unrelated to
   real network speed on this connection (confirmed: the same file
   downloads fine via a plain curl in ~20s; tauri-bundler's own fetch
   fails identically every time). The app itself — Rust shell, sidecar
   spawn, window, shutdown — is fully built and working; only the
   installer-wrapping step is deferred. See ROADMAP.md.

   Run after `npm run tauri:build` (or directly after a `cargo build
   --release` in src-tauri/, which `tauri build` already does before its
   own installer step fails) — this only copies what's already built,
   never builds anything itself. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'src-tauri', 'target', 'release');
const OUT_DIR = path.join(ROOT, 'dist-app');

const FILES = [
  { from: 'app.exe', to: 'BotC Night.exe' },
  // Tauri's own build already strips the platform-triple suffix off the
  // sidecar when it copies it next to app.exe for an unbundled run —
  // same file `externalBin`/pkg produced, just renamed for this exact
  // adjacent-to-the-main-exe case.
  { from: 'botc-night-server.exe', to: 'botc-night-server.exe' },
];

function main() {
  for (const { from } of FILES) {
    const src = path.join(RELEASE_DIR, from);
    if (!fs.existsSync(src)) {
      console.error(`Missing ${src} — run \`npm run tauri:build\` first (its installer step may fail; the release binaries it produces before that are what this script needs).`);
      process.exitCode = 1;
      return;
    }
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const { from, to } of FILES) {
    fs.copyFileSync(path.join(RELEASE_DIR, from), path.join(OUT_DIR, to));
  }

  console.log(`\n  Staged at ${OUT_DIR}\n`);
  console.log('  Copy this whole folder anywhere and double-click "BotC Night.exe" —');
  console.log('  both files have to stay together in the same folder.\n');
}

main();
