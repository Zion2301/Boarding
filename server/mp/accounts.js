// Accounts + cloud saves. Username + password (no email — players are young), scrypt-hashed passwords,
// random session tokens (only their SHA-256 is stored), simple login rate limiting.
// Files: server/data/accounts.json, server/data/saves/<accountId>.json  (swap for Supabase tables later — same shape)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DATA_DIR || (process.env.DATA_FILE ? path.dirname(process.env.DATA_FILE) : path.join(here, '..', 'data'));
const FILE = path.join(DIR, 'accounts.json');
const SAVES = path.join(DIR, 'saves');
const TOKEN_DAYS = 60;

let db = { users: {}, byName: {}, tokens: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { /* fresh */ }
let timer = null;
const save = () => { clearTimeout(timer); timer = setTimeout(() => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); }, 200); };
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const attempts = new Map(); // ip → [timestamps]

export const Accounts = {
  validName(u) { return /^[a-z0-9_]{3,20}$/.test(u); },
  throttle(ip) {
    const now = Date.now();
    const list = (attempts.get(ip) || []).filter((t) => now - t < 60000);
    list.push(now); attempts.set(ip, list);
    return list.length > 12;
  },
  register(username, password) {
    const u = String(username || '').trim().toLowerCase();
    if (!Accounts.validName(u)) return { error: 'Username: 3–20 letters, numbers or _ (no spaces).' };
    if (String(password || '').length < 6) return { error: 'Password: at least 6 characters.' };
    if (db.byName[u]) return { error: 'That username is taken. Try another one.' };
    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    db.users[id] = { id, username: u, salt, hash: hashPw(String(password), salt), created: Date.now() };
    db.byName[u] = id;
    save();
    return Accounts.session(id);
  },
  login(username, password) {
    const id = db.byName[String(username || '').trim().toLowerCase()];
    const user = id && db.users[id];
    if (!user) return { error: 'Wrong username or password.' };
    const ok = crypto.timingSafeEqual(Buffer.from(hashPw(String(password || ''), user.salt), 'hex'), Buffer.from(user.hash, 'hex'));
    if (!ok) return { error: 'Wrong username or password.' };
    return Accounts.session(id);
  },
  session(id) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.tokens[sha(token)] = { id, exp: Date.now() + TOKEN_DAYS * 86400000 };
    // tidy expired tokens
    Object.entries(db.tokens).forEach(([k, v]) => { if (v.exp < Date.now()) delete db.tokens[k]; });
    save();
    const u = db.users[id];
    return { token, user: { id, username: u.username } };
  },
  logout(token) { delete db.tokens[sha(String(token || ''))]; save(); },
  /* token → user (or null) */
  verify(token) {
    if (!token) return null;
    const t = db.tokens[sha(String(token))];
    if (!t || t.exp < Date.now()) return null;
    const u = db.users[t.id];
    return u ? { id: u.id, username: u.username } : null;
  },
  fromRequest(req) { const h = req.headers.authorization || ''; return Accounts.verify(h.startsWith('Bearer ') ? h.slice(7) : null); },

  /* ---------- cloud saves ---------- */
  loadSave(id) {
    try { const f = path.join(SAVES, `${id}.json`); const st = fs.statSync(f); return { save: JSON.parse(fs.readFileSync(f, 'utf8')), updated: st.mtimeMs }; } catch { return { save: null }; }
  },
  writeSave(id, state) {
    fs.mkdirSync(SAVES, { recursive: true });
    const f = path.join(SAVES, `${id}.json`);
    fs.writeFileSync(f + '.tmp', JSON.stringify(state));
    fs.renameSync(f + '.tmp', f); // never leave a half-written save
    return true;
  },
};
