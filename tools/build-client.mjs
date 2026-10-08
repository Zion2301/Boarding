#!/usr/bin/env node
// Builds the browser game into dist/ for a static host (Netlify / Vercel) that talks to a game server elsewhere.
//   GAME_SERVER_URL=https://boarding-house-xyz.fly.dev node tools/build-client.mjs
// Only client files are copied (never server/ code, .env or data).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const url = (process.env.GAME_SERVER_URL || '').replace(/\/$/, '');
if (!url) console.warn('⚠️  GAME_SERVER_URL is not set — the hosted game will play offline only.');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
['index.html', 'sw.js', 'icon.svg', 'manifest.webmanifest'].forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f)));
['css', 'js', 'vendor', 'content', 'shared'].forEach((d) => fs.cpSync(path.join(ROOT, d), path.join(OUT, d), { recursive: true }));
fs.writeFileSync(path.join(OUT, 'js/net/server-url.js'), `/* written by tools/build-client.mjs */\nwindow.BH_SERVER_URL = ${JSON.stringify(url)};\n`);
console.log(`✓ dist/ ready${url ? ` (game server: ${url})` : ''}`);
