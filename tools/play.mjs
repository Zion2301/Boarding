#!/usr/bin/env node
// One command to play with friends.
//   npm run play          → starts the game server on your Wi-Fi/hotspot and prints the link (+ QR code) for friends
//   npm run tunnel        → same, plus a public https link through a free Cloudflare Tunnel (friends anywhere)
// AI conversations use the real model when server/.env has ANTHROPIC_API_KEY, otherwise the free mock model.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server');
const TUNNEL = process.argv.includes('--tunnel');
const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, c: (s) => `\x1b[36m${s}\x1b[0m` };
const say = (...a) => console.log(...a);
let tunnel = null;

// 1) packages (first run only): the launcher's own helpers (QR code, tunnel) and the game server
if (!fs.existsSync(path.join(ROOT, 'node_modules', 'qrcode-terminal')) || !fs.existsSync(path.join(ROOT, 'node_modules', 'cloudflared'))) {
  say(c.y('📦 First run: installing helpers…'));
  spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
}
if (!fs.existsSync(path.join(SERVER, 'node_modules', 'colyseus'))) {
  say(c.y('📦 First run: installing the game server (one time, ~1 minute)…'));
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], { cwd: SERVER, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { say('Could not install the server packages. Check your internet connection and try again.'); process.exit(1); }
}

// 2) a free port (8787 unless something else is using it)
const free = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '0.0.0.0'); });
let PORT = Number(process.env.PORT || 8787);
while (!(await free(PORT))) PORT++;

// 3) start the server (real AI if a key is configured, mock otherwise)
const envFile = path.join(SERVER, '.env');
const hasKey = !!process.env.ANTHROPIC_API_KEY || (fs.existsSync(envFile) && /ANTHROPIC_API_KEY\s*=\s*\S+/.test(fs.readFileSync(envFile, 'utf8')));
const pubFile = path.join(SERVER, 'data', 'public-url.txt');
try { fs.unlinkSync(pubFile); } catch { /* none */ }
const env = Object.assign({}, process.env, { PORT: String(PORT), HOST: '0.0.0.0', QUIET_BANNER: '1' });
if (!hasKey && !process.env.AI_MOCK) env.AI_MOCK = '1';
const srv = spawn(process.execPath, ['index.js'], { cwd: SERVER, env, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = '';
srv.stdout.on('data', (d) => { srvLog += d; if (process.env.VERBOSE) process.stdout.write(d); });
srv.stderr.on('data', (d) => { srvLog += d; process.stderr.write(c.d(String(d))); });
srv.on('exit', (code) => { say(code ? `\nThe server stopped (code ${code}).\n${srvLog.slice(-800)}` : '\nServer stopped.'); process.exit(code || 0); });
const stop = () => { srv.kill(); if (tunnel) tunnel.kill(); setTimeout(() => process.exit(0), 300); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

// wait until it answers
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/status`); if (r.ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 250));
}

// 4) the links
const lan = Object.entries(os.networkInterfaces()).flatMap(([name, list]) => (list || []).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => ({ name, ip: i.address })))
  // Wi-Fi / hotspot first, virtual adapters (VPN, Docker) last
  .sort((a, b) => (/^(en0|wlan|wl|Wi-?Fi)/i.test(b.name) ? 1 : 0) - (/^(en0|wlan|wl|Wi-?Fi)/i.test(a.name) ? 1 : 0) || (/^(utun|docker|veth|vbox|vmnet|br-)/i.test(a.name) ? 1 : 0) - (/^(utun|docker|veth|vbox|vmnet|br-)/i.test(b.name) ? 1 : 0));
const qr = (url) => { try { require('qrcode-terminal').generate(url, { small: true }, (q) => say(q)); } catch { /* optional */ } };
const banner = (title, url, note) => {
  say(`\n${c.b(title)}`);
  say(`   ${c.g(c.b(url))}`);
  if (note) say(c.d(`   ${note}`));
  qr(url);
};

say(`\n🏫 ${c.b('BOARDING HOUSE')} is running ${hasKey ? c.g('(real AI)') : c.d('(AI: free mock mode — add ANTHROPIC_API_KEY to server/.env for real AI)')}`);
say(`\n🖥️  You: open ${c.c(`http://localhost:${PORT}`)}`);
if (lan.length) {
  banner('📱 Your friend (same Wi-Fi or your phone hotspot) opens:', `http://${lan[0].ip}:${PORT}`, 'Scan the QR code with a phone camera, or type the link exactly.');
  lan.slice(1).forEach((l) => say(c.d(`   (if that one doesn't work, try http://${l.ip}:${PORT} — ${l.name})`)));
} else say(c.y('\n⚠️  No Wi-Fi network found. Connect to Wi-Fi (or turn on your phone hotspot and join it), or use: npm run tunnel'));

// 5) optional public link (Cloudflare quick tunnel — free, no account)
if (TUNNEL) {
  say(c.d('\n🌍 Opening a public link through Cloudflare (first time downloads a small tool)…'));
  try {
    const { bin, install } = await import('cloudflared');
    if (!fs.existsSync(bin)) await install(bin);
    tunnel = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let shown = false;
    const watch = (d) => {
      const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !shown) {
        shown = true;
        fs.mkdirSync(path.dirname(pubFile), { recursive: true });
        fs.writeFileSync(pubFile, m[0]);
        banner('🌍 Friends ANYWHERE open this link (send it on WhatsApp):', m[0], 'It changes every time you run this. It can take ~20 seconds to start working.');
        say(c.d('\nKeep this window open while you play. Press Ctrl+C to stop.\n'));
      }
    };
    tunnel.stdout.on('data', watch); tunnel.stderr.on('data', watch);
    tunnel.on('exit', () => { if (!shown) say(c.y('Could not open the Cloudflare tunnel. Check your internet, or see PLAY_WITH_FRIENDS.md (ngrok option).')); });
  } catch (e) { say(c.y(`Could not start the tunnel: ${e.message}`)); }
} else {
  say(c.d('\nFriend somewhere else? Stop this (Ctrl+C) and run: npm run tunnel'));
  say(c.d('Keep this window open while you play. Press Ctrl+C to stop.\n'));
}
