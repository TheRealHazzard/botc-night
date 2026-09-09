'use strict';

/* One command instead of two terminals: starts server.js, opens a
   Cloudflare quick tunnel pointed at it, and prints the public URL as soon
   as it's assigned. Requires `cloudflared` to already be installed (see
   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) —
   nothing here installs it.

   Tried switching this to Tailscale Funnel for a stable (non-rotating)
   URL — Funnel reported itself "on" and locally reachable, but the public
   `*.ts.net` DNS record never actually published (confirmed by querying
   Google's and Cloudflare's DNS-over-HTTPS resolvers directly, well past
   Tailscale's own documented ~10-minute propagation window, including
   after a full `tailscale funnel reset` + re-enable). Matches a known
   category of open issue against Tailscale's own tracker ("funnel status
   reports on, public edge never resolves") — not something fixable from
   this end. Back on the quick tunnel until that's sorted upstream; the
   only real cost is a fresh URL every time this restarts. */

const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

if (!process.env.TABLE_CODE && !process.env.HOST_CODE) {
  console.log('');
  console.log('  ⚠  TABLE_CODE and HOST_CODE are both unset — this table will be open to');
  console.log('     anyone with the link, with no code required. Set at least TABLE_CODE');
  console.log('     (and HOST_CODE, for a separate one on /host) before running this if');
  console.log('     that\'s not what you want.');
}

const server = spawn(process.execPath, ['server.js'], { stdio: 'inherit' });

const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
  stdio: ['inherit', 'pipe', 'pipe'],
});

let announced = false;
function watchForUrl(chunk) {
  const text = chunk.toString();
  process.stderr.write(text); // still show cloudflared's own log, nothing hidden
  if (announced) return;
  const match = text.match(TUNNEL_URL_RE);
  if (match) {
    announced = true;
    console.log('');
    console.log('  The table is public:');
    console.log('');
    console.log(`    ${match[0]}`);
    console.log('');
    console.log('  Open that on the host\'s own screen for /host, or share it for players to join.');
    console.log('');
  }
}
tunnel.stdout.on('data', watchForUrl);
tunnel.stderr.on('data', watchForUrl); // cloudflared logs its status to stderr, URL included

// Either process dying takes the other down with it — a tunnel with no
// server behind it, or a server no one can reach, are both useless alone.
function shutdown(code) {
  server.kill();
  tunnel.kill();
  process.exit(code);
}
server.on('exit', code => shutdown(code || 0));
tunnel.on('exit', code => shutdown(code || 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
