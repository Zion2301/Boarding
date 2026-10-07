// Boarding House game server: serves the static game + the /api used for AI NPCs, grading, moderation and shared text.
//   npm start            (needs ANTHROPIC_API_KEY for real AI)
//   npm run dev          (AI_MOCK=1: fake model, no key needed)
// Env: PORT (8787), ANTHROPIC_API_KEY, AI_ENABLED, AI_MOCK, AI_RATE_PER_MIN, AI_DAILY_BUDGET, AI_GLOBAL_DAILY,
//      ADMIN_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATA_FILE
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { openStore } from './store.js';
import { createGuard, cacheKey } from './guard.js';
import { buildSystem, sheetFor, reloadContent } from './prompts.js';
import { npcChat, gradeAnswer, judgeDebate, moderateText, AIUnavailable, CHAT_MODEL, GRADE_MODEL } from './ai.js';
import { validate } from './effects.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
try { if (fs.existsSync(path.join(here, '.env'))) process.loadEnvFile(path.join(here, '.env')); } catch { /* optional */ }
const require = createRequire(import.meta.url);
const Mod = require('../shared/moderation.js');
const content = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));

const PORT = Number(process.env.PORT || 8787);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MOCK = process.env.AI_MOCK === '1';

const store = await openStore();
const guard = createGuard(store);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------------- helpers ---------------- */
const send = (res, code, body, headers = {}) => {
  res.writeHead(code, Object.assign({ 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-admin-token', 'cache-control': 'no-store' }, headers));
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > 16 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('bad json')); } });
});
const str = (v, max) => String(v ?? '').slice(0, max);
const pid = (b) => str(b.playerId, 64).replace(/[^a-zA-Z0-9-]/g, '') || 'anon';
const school = (b) => str(b.schoolId, 80).replace(/[^a-zA-Z0-9 ,.'-]/g, '') || 'default';
const isAdmin = (req) => ADMIN_TOKEN && req.headers['x-admin-token'] === ADMIN_TOKEN;

/* Anything other players will see goes through: local filter → AI moderation (when available) */
async function publishCheck(playerId, text, kind) {
  const local = Mod.moderate(text, { context: 'public', max: 400 });
  if (local.verdict === 'blocked') return { ok: false, status: 'blocked', reason: `Not allowed: ${Mod.explain(local.reasons)}.` };
  if (!(await guard.aiEnabled()) || guard.check(playerId, 1)) return { ok: true, status: 'visible', text: local.text, checkedBy: 'filter' };
  guard.attempt(playerId);
  try {
    const { data } = await moderateText({ text: local.text, kind });
    await guard.charge(playerId, 'moderate', 1);
    if (!data.allowed) return { ok: false, status: 'blocked', reason: `Not allowed: ${data.reason || data.categories.join(', ')}` };
    return { ok: true, status: 'visible', text: local.text, checkedBy: 'ai' };
  } catch (e) {
    log('moderation unavailable:', e.message);
    return { ok: true, status: 'visible', text: local.text, checkedBy: 'filter' };
  }
}
const SAFE_DISTRESS_REPLY = 'Let\'s step out of the game for a second. What you just wrote sounds really hard, and it matters. Please talk to a trusted adult today — a parent, relative, teacher or school counsellor. If you are in danger right now, contact local emergency services.';

/* ---------------- routes ---------------- */
const routes = {
  'GET /api/status': async (req, res, q) => send(res, 200, { ok: true, ai: await guard.aiEnabled(), mock: MOCK, models: { chat: CHAT_MODEL, grade: GRADE_MODEL }, remaining: guard.remaining(str(q.get('playerId'), 64)), store: store.kind }),

  /* NPC conversation → structured reply + validated effects */
  'POST /api/npc/chat': async (req, res, q, b) => {
    const playerId = pid(b);
    const text = str(b.text, 500);
    const npc = b.npc || {}; const player = b.player || {};
    const situation = str(b.situation, 30) || 'chat';
    const npcKey = str(npc.id || npc.contact || 'npc', 60);
    const local = Mod.moderate(text, { context: 'private', max: 500 });
    if (local.distress) return send(res, 200, { distress: true, reply: SAFE_DISTRESS_REPLY, action: 'none', effects: {} });
    if (local.verdict === 'blocked') return send(res, 200, { blocked: true, reasons: local.reasons, explain: Mod.explain(local.reasons) });
    if (!(await guard.aiEnabled())) return send(res, 200, { fallback: true, why: 'ai_off' });
    const limited = guard.check(playerId, 1);
    if (limited) return send(res, 200, { fallback: true, why: limited });
    guard.attempt(playerId);
    const sheetKey = sheetFor(npc);
    const history = (Array.isArray(b.history) ? b.history : []).slice(-14).map((m) => ({ role: m.role === 'npc' ? 'assistant' : 'user', content: str(m.text, 600) || '…' }));
    const memory = await store.memory(playerId, npcKey);
    const ck = !history.length && !memory.length ? cacheKey({ sheetKey, situation, text: local.text, rel: Number(npc.rel ?? 50), extra: `${str(b.vars && b.vars.offence, 60)}|${npc.subjectName || ''}` }) : null;
    let ai = ck ? guard.cacheGet(ck) : null;
    const cached = !!ai;
    if (!ai) {
      try {
        const system = buildSystem({ sheetKey, npc, player, situation, vars: b.vars || {}, memory });
        ({ data: ai } = await npcChat({ system, history, text: local.text }));
        if (ck && !ai.distress) guard.cacheSet(ck, ai);
      } catch (e) {
        if (!(e instanceof AIUnavailable)) log('chat error', e);
        else log('chat fallback:', e.message);
        return send(res, 200, { fallback: true, why: 'ai_unavailable' });
      }
    }
    await guard.charge(playerId, 'chat', 1, cached);
    const out = await validate({ store, playerId, npcKey, sheetKey, situation, ctx: b.ctx || {}, ai });
    if (out.distress) { out.reply = out.reply || SAFE_DISTRESS_REPLY; return send(res, 200, out); }
    // the NPC's own words are moderated too (belt and braces)
    const said = Mod.moderate(out.reply, { context: 'private', max: 600 });
    if (said.verdict === 'blocked') return send(res, 200, { fallback: true, why: 'unsafe_reply' });
    out.reply = said.text;
    if (ai.memory_note) await store.remember(playerId, npcKey, str(ai.memory_note, 160));
    out.cached = cached;
    send(res, 200, out);
  },

  /* Open-ended answer grading */
  'POST /api/grade': async (req, res, q, b) => {
    const playerId = pid(b);
    const Q = content('open_questions.json').questions.find((x) => x.id === str(b.questionId, 60));
    if (!Q) return send(res, 400, { error: 'unknown question' });
    const answer = str(b.answer, 1200);
    const local = Mod.moderate(answer, { context: 'private', max: 1200 });
    if (local.distress) return send(res, 200, { distress: true, reply: SAFE_DISTRESS_REPLY });
    if (!(await guard.aiEnabled())) return send(res, 200, { fallback: true, why: 'ai_off' });
    const limited = guard.check(playerId, 2);
    if (limited) return send(res, 200, { fallback: true, why: limited });
    guard.attempt(playerId);
    try {
      const { data } = await gradeAnswer({ subject: Q.subjectName, level: str(b.level, 10) || 'JSS', question: Q.q, rubric: Q.rubric, keyPoints: Q.keyPoints, outOf: Q.marks, answer: local.text });
      await guard.charge(playerId, 'grade', 2);
      send(res, 200, { score: Math.max(0, Math.min(Q.marks, data.score)), out_of: Q.marks, comment: str(data.comment, 240), strengths: data.strengths.slice(0, 2).map((s) => str(s, 100)), improvements: data.improvements.slice(0, 2).map((s) => str(s, 100)) });
    } catch (e) { log('grade fallback:', e.message); send(res, 200, { fallback: true, why: 'ai_unavailable' }); }
  },

  /* Debate judging */
  'POST /api/debate': async (req, res, q, b) => {
    const playerId = pid(b);
    const D = content('debates.json').motions.find((x) => x.id === str(b.motionId, 60));
    if (!D) return send(res, 400, { error: 'unknown motion' });
    const side = b.side === 'against' ? 'against' : 'for';
    const argument = str(b.argument, 1200);
    const local = Mod.moderate(argument, { context: 'private', max: 1200 });
    if (local.distress) return send(res, 200, { distress: true, reply: SAFE_DISTRESS_REPLY });
    if (!(await guard.aiEnabled())) return send(res, 200, { fallback: true, why: 'ai_off' });
    const limited = guard.check(playerId, 2);
    if (limited) return send(res, 200, { fallback: true, why: limited });
    guard.attempt(playerId);
    try {
      const { data } = await judgeDebate({ motion: D.motion, side, opponent: side === 'for' ? D.against : D.for, argument: local.text });
      await guard.charge(playerId, 'debate', 2);
      const p = Math.max(0, Math.min(30, data.player_score)), o = Math.max(0, Math.min(30, data.opponent_score));
      send(res, 200, { player_score: p, opponent_score: o, winner: p > o ? 'player' : p < o ? 'opponent' : 'tie', comment: str(data.comment, 240) });
    } catch (e) { log('debate fallback:', e.message); send(res, 200, { fallback: true, why: 'ai_unavailable' }); }
  },

  /* School noticeboard */
  'GET /api/board': async (req, res, q) => {
    const rows = await store.select('board_posts', { school_id: school({ schoolId: q.get('schoolId') }), status: 'visible' }, { limit: 40 });
    send(res, 200, { posts: rows.map((r) => ({ id: r.id, author: r.author, text: r.text, at: r.created_at })) });
  },
  'POST /api/board': async (req, res, q, b) => {
    const playerId = pid(b);
    const chk = await publishCheck(playerId, str(b.text, 280), 'noticeboard post');
    if (!chk.ok) return send(res, 200, chk);
    const row = await store.insert('board_posts', { school_id: school(b), player_id: playerId, author: str(b.author, 40), text: chk.text, status: chk.status, reports: 0 });
    send(res, 200, { ok: true, post: { id: row.id, author: row.author, text: row.text, at: row.created_at } });
  },

  /* Graffiti (desks & walls; persists across terms) */
  'GET /api/graffiti': async (req, res, q) => {
    const rows = await store.select('graffiti', { school_id: school({ schoolId: q.get('schoolId') }), map_id: str(q.get('mapId'), 30), status: 'visible' }, { limit: 60 });
    send(res, 200, { items: rows.map((r) => ({ id: r.id, spot: r.spot, author: r.author, text: r.text, at: r.created_at })) });
  },
  'POST /api/graffiti': async (req, res, q, b) => {
    const playerId = pid(b);
    const chk = await publishCheck(playerId, str(b.text, 80), 'graffiti on a desk/wall');
    if (!chk.ok) return send(res, 200, chk);
    const row = await store.insert('graffiti', { school_id: school(b), map_id: str(b.mapId, 30), spot: str(b.spot, 40), player_id: playerId, author: str(b.author, 40), text: chk.text, status: chk.status, reports: 0 });
    send(res, 200, { ok: true, item: { id: row.id, spot: row.spot, author: row.author, text: row.text } });
  },

  /* Slam books */
  'POST /api/slambook': async (req, res, q, b) => {
    const questions = content('slambook.json').questions.slice(0, 12);
    const row = await store.insert('slambooks', { owner_id: pid(b), owner_name: str(b.ownerName, 40), questions, entries: [] });
    send(res, 200, { ok: true, book: row });
  },
  'GET /api/slambook': async (req, res, q) => { const r = await store.get('slambooks', str(q.get('id'), 60)); r ? send(res, 200, { book: r }) : send(res, 404, { error: 'not found' }); },
  'POST /api/slambook/answer': async (req, res, q, b) => {
    const playerId = pid(b);
    const book = await store.get('slambooks', str(b.id, 60));
    if (!book) return send(res, 404, { error: 'not found' });
    if ((book.entries || []).length >= 40) return send(res, 200, { ok: false, reason: 'This slam book is full.' });
    const answers = {};
    for (const [i, a] of Object.entries(b.answers || {}).slice(0, 12)) {
      const chk = await publishCheck(playerId, str(a, 120), 'slam book answer');
      if (!chk.ok) return send(res, 200, { ok: false, reason: `Answer ${Number(i) + 1}: ${chk.reason}` });
      answers[i] = chk.text;
    }
    const nameChk = Mod.moderate(str(b.name, 30), { context: 'public' });
    if (nameChk.verdict === 'blocked') return send(res, 200, { ok: false, reason: 'Pick another name.' });
    const entries = [...(book.entries || []), { id: Date.now().toString(36), name: nameChk.text, npc: !!b.npc, answers, at: new Date().toISOString() }];
    const upd = await store.update('slambooks', book.id, { entries });
    send(res, 200, { ok: true, book: upd });
  },

  /* Sign-out day shirts */
  'POST /api/shirt': async (req, res, q, b) => {
    const row = await store.insert('shirts', { owner_id: pid(b), owner_name: str(b.ownerName, 40), school_id: school(b), signatures: [], status: 'open' });
    send(res, 200, { ok: true, shirt: row });
  },
  'GET /api/shirt': async (req, res, q) => { const r = await store.get('shirts', str(q.get('id'), 60)); r ? send(res, 200, { shirt: Object.assign({}, r, { signatures: (r.signatures || []).filter((s) => !s.hidden) }) }) : send(res, 404, { error: 'not found' }); },
  'POST /api/shirt/sign': async (req, res, q, b) => {
    const playerId = pid(b);
    const shirt = await store.get('shirts', str(b.id, 60));
    if (!shirt) return send(res, 404, { error: 'not found' });
    if ((shirt.signatures || []).length >= 60) return send(res, 200, { ok: false, reason: 'No space left on this shirt!' });
    const chk = await publishCheck(playerId, str(b.text, 80), 'message signed on a graduation shirt');
    if (!chk.ok) return send(res, 200, chk);
    const nameChk = Mod.moderate(str(b.name, 30), { context: 'public' });
    if (nameChk.verdict === 'blocked') return send(res, 200, { ok: false, reason: 'Pick another name.' });
    const sig = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: nameChk.text, text: chk.text, color: str(b.color, 9) || '#1b2a4a', x: Number(b.x) || Math.random(), y: Number(b.y) || Math.random(), rot: Number(b.rot) || 0, npc: !!b.npc, by: playerId };
    const upd = await store.update('shirts', shirt.id, { signatures: [...(shirt.signatures || []), sig] });
    send(res, 200, { ok: true, shirt: upd });
  },

  /* Reports (anything other players can see) */
  'POST /api/report': async (req, res, q, b) => {
    const type = ({ board: 'board_posts', graffiti: 'graffiti', shirt: 'shirts', slambook: 'slambooks' })[str(b.itemType, 20)];
    if (!type) return send(res, 400, { error: 'bad type' });
    const item = await store.get(type, str(b.itemId, 60));
    if (!item) return send(res, 404, { error: 'not found' });
    let original = item.text || '';
    if (type === 'shirts') { const s = (item.signatures || []).find((x) => x.id === b.subId); original = s ? `${s.name}: ${s.text}` : JSON.stringify(item.signatures); }
    if (type === 'slambooks') { const e = (item.entries || []).find((x) => x.id === b.subId); original = e ? `${e.name}: ${JSON.stringify(e.answers)}` : ''; }
    await store.insert('reports', { item_type: type, item_id: item.id, sub_id: str(b.subId, 40) || null, original_text: str(original, 2000), reporter_id: pid(b), reason: str(b.reason, 200), resolved: false });
    if (item.reports !== undefined) {
      const n = (item.reports || 0) + 1;
      await store.update(type, item.id, { reports: n, status: n >= 3 ? 'hidden' : item.status }); // 3 reports → hidden until reviewed
    }
    send(res, 200, { ok: true });
  },

  /* ---------- admin (header x-admin-token: ADMIN_TOKEN) ---------- */
  'GET /api/admin/overview': async (req, res) => {
    if (!isAdmin(req)) return send(res, 401, { error: 'admin token required' });
    const [reports, posts, graffiti] = await Promise.all([store.select('reports', { resolved: false }, { limit: 100 }), store.select('board_posts', {}, { limit: 50 }), store.select('graffiti', {}, { limit: 50 })]);
    send(res, 200, { ai: await guard.aiEnabled(), mock: MOCK, guard: guard.stats(), store: store.kind, reports, posts, graffiti });
  },
  'POST /api/admin/ai': async (req, res, q, b) => { if (!isAdmin(req)) return send(res, 401, { error: 'admin token required' }); await guard.setAiEnabled(!!b.enabled); log('AI switched', b.enabled ? 'ON' : 'OFF'); send(res, 200, { ok: true, ai: !!b.enabled }); },
  'POST /api/admin/item': async (req, res, q, b) => {
    if (!isAdmin(req)) return send(res, 401, { error: 'admin token required' });
    const type = ({ board_posts: 'board_posts', graffiti: 'graffiti', shirts: 'shirts', slambooks: 'slambooks' })[b.type];
    if (!type) return send(res, 400, { error: 'bad type' });
    if (type === 'shirts' || type === 'slambooks') {
      const item = await store.get(type, str(b.id, 60));
      const key = type === 'shirts' ? 'signatures' : 'entries';
      if (item) await store.update(type, item.id, { [key]: (item[key] || []).map((s) => (s.id === b.subId ? Object.assign({}, s, { hidden: b.status === 'hidden' }) : s)) });
    } else await store.update(type, str(b.id, 60), { status: b.status === 'hidden' ? 'hidden' : 'visible' });
    send(res, 200, { ok: true });
  },
  'POST /api/admin/report': async (req, res, q, b) => { if (!isAdmin(req)) return send(res, 401, { error: 'admin token required' }); await store.update('reports', str(b.id, 60), { resolved: true }); send(res, 200, { ok: true }); },
  'POST /api/admin/reload': async (req, res) => { if (!isAdmin(req)) return send(res, 401, { error: 'admin token required' }); reloadContent(); send(res, 200, { ok: true }); },
};

/* ---------------- static files ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8' };
function serveStatic(req, res, urlPath) {
  if (urlPath === '/admin.html') {
    res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
    return fs.createReadStream(path.join(here, 'admin.html')).pipe(res);
  }
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return send(res, 400, { error: 'bad path' }); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file);
  // never serve the server's own code, secrets or data
  if (rel.startsWith('..') || path.isAbsolute(rel) || /^(server|node_modules|\.git)([\\/]|$)/.test(rel) || path.basename(file).startsWith('.')) return send(res, 404, { error: 'not found' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return url.pathname.startsWith('/api/') ? send(res, 404, { error: 'no route' }) : serveStatic(req, res, url.pathname);
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    await route(req, res, url.searchParams, body);
  } catch (e) {
    log('error', req.method, url.pathname, e.message);
    if (!res.headersSent) send(res, e.message === 'too large' ? 413 : 400, { error: e.message });
  }
});
server.listen(PORT, () => {
  log(`Boarding House server on http://localhost:${PORT}  ·  store: ${store.kind}  ·  AI: ${process.env.AI_ENABLED === '0' ? 'OFF' : MOCK ? 'MOCK' : process.env.ANTHROPIC_API_KEY ? 'ON' : 'ON (no ANTHROPIC_API_KEY set — calls will fall back)'}${ADMIN_TOKEN ? '  ·  admin: /admin.html' : '  ·  set ADMIN_TOKEN to use /admin.html'}`);
});
