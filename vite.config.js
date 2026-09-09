import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// rollupOptions.input resolves against the project root (where this file
// sits), not Vite's own `root: 'client'` option below — an easy mismatch,
// since every other path in this config is client-relative.
const hostEntry = fileURLToPath(new URL('client/host.html', import.meta.url));

// Two React screens share this one config/build: the player screen
// (default) and the host/Storyteller screen (`--mode host`). server.js
// keeps owning every /api/* route and both SSE streams exactly as it does
// for the vanilla pages; this config only ever turns JSX into plain JS,
// it never becomes a second server. Dev mode proxies API/SSE/static
// requests through to server.js (run separately, `npm start`) so the same
// fetch('/api/...')/EventSource(...) calls — and plain static assets like
// the vendored QR encoder or character token art — work unchanged against
// the Vite dev server's own origin.
export default defineConfig(({ command, mode }) => {
  const isHost = mode === 'host';
  return {
    root: 'client',
    plugins: [react()],
    // server.js has no idea either build exists — it just serves whatever's
    // under public/, generic-fallback style, at the same path it lives on
    // disk. Building at the site root would collide with everything else
    // public/ already serves at /assets, /manifest.json, etc.; nesting each
    // build's own asset references under its own /dist/<app>/ instead makes
    // the same generic fallback route them correctly with zero server.js
    // changes beyond one new route per app to its built index.html. Dev
    // mode keeps serving from the site root, matching how the proxy config
    // below already assumes both apps live at '/'.
    base: command === 'build' ? (isHost ? '/dist/host/' : '/dist/player/') : '/',
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3000',
        // SSE needs the connection kept open, not buffered — same proxy
        // target, just called out separately since that's the one place a
        // proxy's defaults (buffering, timeouts) can silently break it.
        '/events': { target: 'http://localhost:3000', ws: false },
        '/host-events': { target: 'http://localhost:3000', ws: false },
        // Plain static files server.js also serves from public/ — the host
        // screen needs the vendored QR encoder and character token art live
        // in dev, not just once built.
        '/qrcode.js': 'http://localhost:3000',
        '/tokens': 'http://localhost:3000',
        '/icons': 'http://localhost:3000',
        '/manifest.json': 'http://localhost:3000',
      },
    },
    build: {
      outDir: isHost ? '../public/dist/host' : '../public/dist/player',
      emptyOutDir: true,
      rollupOptions: isHost ? { input: hostEntry } : undefined,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.js'],
      globals: false,
    },
  };
});
