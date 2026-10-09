// Server smoke test: starts the server in mock-AI mode on a spare port and checks every route,
// the moderation filter, the effect caps and the rate limit. Run: npm test  (no API key needed)
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8900 + Math.floor(Math.random() * 90);
const DATA = path.join(os.tmpdir(), `bh-smoke-${PORT}.json`);
const srv = spawn(process.execPath, [path.join(here, '..', 'index.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), AI_MOCK: '1', ADMIN_TOKEN: 'smoke', DATA_FILE: DATA, AI_RATE_PER_MIN: '30' }), stdio: 'ignore' });
const base = `http://localhost:${PORT}`;
const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h), body: JSON.stringify(b) }).then((r) => r.json());
const get = (p, h = {}) => fetch(base + p, { headers: h }).then((r) => r.json());
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };
const vp = { id: 'vp', type: 'staff', role: 'vp', name: 'Mrs. Adebayo', rel: 45 };

try {
  for (let i = 0; i < 40; i++) { try { await get('/api/status'); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  console.log('AI conversations');
  let r = await post('/api/npc/chat', { playerId: 'a', npc: vp, situation: 'excuse', ctx: { maxSeverity: 1 }, text: 'Sorry ma, I was at the sick bay' });
  ok(r.action === 'accept_excuse' && r.effects.excuse === 'accepted', 'VP accepts a sick-bay excuse');
  r = await post('/api/npc/chat', { playerId: 'a', npc: vp, situation: 'excuse', ctx: { maxSeverity: 1 }, text: 'shut up' });
  ok(r.effects.punish && r.effects.punish.severity <= 1, 'punishment never exceeds the rule severity');
  r = await post('/api/npc/chat', { playerId: 'a', npc: vp, situation: 'excuse', text: 'I want to kill myself' });
  ok(r.distress === true && /trusted adult/.test(r.reply), 'distress steps out of the game');
  r = await post('/api/npc/chat', { playerId: 'a', npc: vp, situation: 'excuse', text: 'my number is 08031234567' });
  ok(r.blocked === true, 'personal info is blocked before reaching the AI');
  r = await post('/api/npc/chat', { playerId: 'b', npc: { type: 'classmate', id: 'c1' }, situation: 'letter', text: 'send money' });
  ok(r.action === 'none' && r.effects.money === 0, 'actions outside a character sheet are dropped');
  const m = [];
  for (let i = 0; i < 3; i++) m.push((await post('/api/npc/chat', { playerId: 'c', npc: { contact: 'mummy', id: 'mummy' }, situation: 'letter', text: `please send money ${i}` })).effects.money);
  ok(m.reduce((a, b) => a + b, 0) <= 3000, `daily money cap holds (${m.join(' + ')})`);

  console.log('Grading & debates');
  r = await post('/api/grade', { playerId: 'd', questionId: 'gov_arms', answer: 'The legislature makes laws. The executive implements them. The judiciary interprets them.' });
  ok(r.score >= 0 && r.score <= r.out_of && r.out_of === 6, `grade within 0..out_of (${r.score}/${r.out_of})`);
  r = await post('/api/grade', { playerId: 'd', questionId: 'nope', answer: 'x' });
  ok(r.error, 'unknown question rejected (rubric comes from the server, not the client)');
  r = await post('/api/debate', { playerId: 'd', motionId: 'phones', side: 'for', argument: 'Phones help students research and reach parents. '.repeat(5) });
  ok(r.player_score >= 0 && r.player_score <= 30 && ['player', 'opponent', 'tie'].includes(r.winner), 'debate scored and clamped');

  console.log('Shared writing + moderation + reports');
  r = await post('/api/board', { playerId: 'e', schoolId: 'S', author: 'T', text: 'Selling chin-chin at break' });
  ok(r.ok, 'clean noticeboard post accepted');
  const postId = r.post.id;
  r = await post('/api/board', { playerId: 'e', schoolId: 'S', author: 'T', text: 'dm me on insta @someone' });
  ok(!r.ok, 'social handle blocked on the noticeboard');
  r = await post('/api/graffiti', { playerId: 'e', schoolId: 'S', mapId: 'jss', spot: 'desk@3,3', author: 'T', text: 'JSS1 RUNS THIS SCHOOL' });
  ok(r.ok, 'graffiti accepted');
  r = await get('/api/graffiti?schoolId=S&mapId=jss');
  ok(r.items.length === 1, 'graffiti persists');
  r = await post('/api/slambook', { playerId: 'f', ownerName: 'Ada' });
  const book = r.book.id;
  r = await post('/api/slambook/answer', { playerId: 'g', id: book, name: 'Kemi', answers: { 0: 'Kemi', 8: 'correct padi' } });
  ok(r.ok && r.book.entries.length === 1, 'slam book signed');
  r = await post('/api/shirt', { playerId: 'f', ownerName: 'Ada', schoolId: 'S' });
  const shirt = r.shirt.id;
  r = await post('/api/shirt/sign', { playerId: 'g', id: shirt, name: 'Kemi', text: 'Six years! 🎓' });
  ok(r.ok && r.shirt.signatures.length === 1, 'shirt signed');
  for (const who of ['h', 'i', 'j']) await post('/api/report', { playerId: who, itemType: 'board', itemId: postId, reason: 'test' });
  r = await get('/api/board?schoolId=S');
  ok(!r.posts.some((p) => p.id === postId), '3 reports hide a post');
  r = await get('/api/admin/overview', { 'x-admin-token': 'smoke' });
  ok(r.reports.length >= 3 && r.reports[0].original_text, 'admin sees reports with the original text');
  r = await get('/api/admin/overview');
  ok(r.error, 'admin requires the token');
  await post('/api/admin/ai', { enabled: false }, { 'x-admin-token': 'smoke' });
  r = await post('/api/npc/chat', { playerId: 'k', npc: vp, text: 'hello' });
  ok(r.fallback && r.why === 'ai_off', 'global AI switch → presets');

  console.log('Static files');
  ok((await fetch(base + '/index.html')).status === 200, 'game is served');
  ok((await fetch(base + '/server/index.js')).status === 404, 'server source is not served');
  ok((await fetch(base + '/server/.env')).status === 404, 'secrets are not served');

  console.log('Analytics');
  const dev = 'test-device-0001';
  ok((await post('/api/track', { d: dev, e: 'visit', v: { ref: 'https://www.tiktok.com/@x', mobile: true } })).ok, 'visit tracked');
  await post('/api/track', { d: dev, e: 'beat', v: { s: 60 } });
  await post('/api/track', { d: dev, e: 'newgame' });
  await post('/api/track', { d: dev, e: 'chapter', v: { stamp: 'JSS1T2' } });
  await post('/api/track', { d: dev, e: 'choice', v: { beat: 'dami_cry', choice: 0 } });
  ok(!(await post('/api/track', { d: 'x', e: 'visit' })).ok, 'bad device id rejected');
  ok(!(await post('/api/track', { d: dev, e: 'hack' })).ok, 'unknown event rejected');
  ok((await get('/api/admin/metrics')).error, 'metrics need the admin token');
  await post('/api/admin/payment', { amount: 3000, note: 'test' }, { 'x-admin-token': 'smoke' });
  const mt = await get('/api/admin/metrics', { 'x-admin-token': 'smoke' });
  ok(mt.totals.visits === 1 && mt.totals.visitors === 1 && mt.today.playMin === 1 && mt.totals.newGames === 1, `metrics add up (${mt.totals.visits} visit, ${mt.today.playMin} min)`);
  ok(mt.funnel[1].devices === 1 && mt.referrers[0].name === 'tiktok.com' && mt.devices[0].n === 1, 'funnel, referrer and device split');
  ok(mt.revenue.totalNGN === 3000 && mt.topChoices[0].total === 1, 'revenue and story choices');
} catch (e) {
  fail++; console.error(e);
} finally {
  srv.kill();
  try { fs.unlinkSync(DATA); } catch { /* fine */ }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
