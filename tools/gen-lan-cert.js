'use strict';

/* One-shot setup for the LAN HTTPS listener in server.js — see
   `certs/` in .gitignore and HTTPS_PORT in server.js. Run this once (and
   again later only if the LAN IP actually changes); server.js picks the
   result up automatically on its next start. Needs mkcert
   (https://github.com/FiloSottile/mkcert) on PATH — this script checks
   for it and prints the install command rather than trying to install it
   itself, since `mkcert -install` and winget installs can need an
   interactive UAC approval that silently fails when run non-interactively
   from inside a script (same lesson learned installing Tailscale earlier
   in this project). */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CERT_DIR = path.join(__dirname, '..', 'certs');

// Same detection logic as lanAddress()/lanCandidates() in server.js,
// duplicated rather than required from it — server.js calls
// server.listen() itself at load time with no require.main guard, so
// require()-ing it here would start a second live server as a side effect.
const VIRTUAL_ADAPTER = /vethernet|virtual|vmware|hyper-v|docker|wsl|tailscale|zerotier|tap-|tun\d|utun|npcap|ppp|loopback/i;
function lanAddress() {
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push({ name, address: net.address });
    }
  }
  if (!candidates.length) return 'localhost';
  const real = candidates.find(c => !VIRTUAL_ADAPTER.test(c.name));
  return (real || candidates[0]).address;
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  return result.status === 0;
}

const hasMkcert = spawnSync('mkcert', ['-version'], { stdio: 'ignore' }).error === undefined;
if (!hasMkcert) {
  console.log('');
  console.log('  mkcert isn\'t installed. Install it first, then run this again:');
  console.log('');
  console.log('    winget install -e --id FiloSottile.mkcert');
  console.log('');
  process.exit(1);
}

console.log('Installing/verifying the local certificate authority (may prompt for approval)...');
if (!run('mkcert', ['-install'])) {
  console.error('mkcert -install failed — see the output above.');
  process.exit(1);
}

const ip = lanAddress();
fs.mkdirSync(CERT_DIR, { recursive: true });

console.log(`Generating a certificate for localhost, 127.0.0.1, ::1, and ${ip}...`);
const ok = run('mkcert', [
  '-key-file', path.join(CERT_DIR, 'lan-key.pem'),
  '-cert-file', path.join(CERT_DIR, 'lan-cert.pem'),
  'localhost', '127.0.0.1', '::1', ip,
]);
if (!ok) {
  console.error('mkcert failed to generate the certificate — see the output above.');
  process.exit(1);
}

const caroot = spawnSync('mkcert', ['-CAROOT'], { encoding: 'utf8' }).stdout.trim();
fs.copyFileSync(path.join(caroot, 'rootCA.pem'), path.join(CERT_DIR, 'rootCA.pem'));

console.log('');
console.log('  Done. Restart the server (npm start) and it\'ll pick this up automatically.');
console.log('');
console.log(`  On this machine, https://${ip}:${process.env.HTTPS_PORT || 3443} already works —`);
console.log('  mkcert just installed the CA into your own browser\'s trust store.');
console.log('');
console.log('  On each PLAYER\'S PHONE, once:');
console.log(`    1. Visit http://${ip}:3000/ca.pem and open/install the downloaded file.`);
console.log('       Android: Settings > Security > Encryption & credentials > Install a certificate > CA certificate.');
console.log('       iPhone: it installs as a profile — Settings > General > VPN & Device Management, install it,');
console.log('       then Settings > General > About > Certificate Trust Settings, enable full trust for it.');
console.log(`    2. Then use https://${ip}:${process.env.HTTPS_PORT || 3443} to play — that\'s the installable one.`);
console.log('');
console.log('  If the LAN IP ever changes, just re-run this script — phones already trusting the CA');
console.log('  won\'t need to trust anything again, only the leaf certificate changes.');
console.log('');
