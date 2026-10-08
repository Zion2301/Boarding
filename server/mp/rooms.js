// Multiplayer rooms (Colyseus). Message-based (no Schema state) so the browser client stays a plain script.
//   campus   — one per school: presence (who's where), the shared school clock, proximity chat, emotes, calls,
//              friends / best friend / gangs, invites, resumption-day cohorts, lesson answers relayed to the room.
//   whot     — a Whot! table (2–4 seats, bots fill empty seats). Rules: shared/whot.js
//   football — the match on the school field (bots balance the teams). Physics: shared/football.js
import { createRequire } from 'node:module';
import { Room } from 'colyseus';
import { Social } from './social.js';
import { Accounts } from './accounts.js';
import { SchoolClock } from './schoolclock.js';

const require = createRequire(import.meta.url);
const Mod = require('../../shared/moderation.js');
const Whot = require('../../shared/whot.js');
const Football = require('../../shared/football.js');
const Boards = require('../../shared/boards.js');

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const idOf = (v) => str(v, 64).replace(/[^a-zA-Z0-9-]/g, '') || null;
const EMOTES = ['wave', 'beckon', 'cheer', 'dance', 'talk', 'kneel', 'clap', 'laugh'];
const SAFE_DISTRESS = 'What you just wrote sounds really hard, and it matters. Please talk to a trusted adult today — a parent, relative, teacher or school counsellor. If you are in danger right now, contact local emergency services.';

/* who is online right now (for the lobby / invite links): pid → public profile */
export const Online = new Map();
const touch = (p) => { if (p && p.pid) Online.set(p.pid, { pid: p.pid, name: p.name, gender: p.gender, level: p.level, arm: p.arm, house: p.house, map: p.map, gang: p.gang, since: (Online.get(p.pid) || {}).since || Date.now() }); };

/* open game tables, shared by every room in this process (shown in the campus "Games" list) */
export const Tables = new Map();
let tablesV = 0;
const setTable = (id, info) => { if (info) Tables.set(id, Object.assign(Tables.get(id) || {}, info)); else Tables.delete(id); tablesV++; };

/* Logged-in players only (ALLOW_GUESTS=1 lets anonymous players in for quick local tests). client.auth = the account */
function authenticate(options = {}) {
  const user = Accounts.verify(options.token);
  if (user) return user;
  if (process.env.ALLOW_GUESTS === '1') return { id: idOf(options.pid) || null, username: 'guest', guest: true };
  throw new Error('login required');
}
const pidOf = (client, o = {}) => (client.auth && client.auth.id) || idOf(o.pid) || client.sessionId;

/* ================= campus ================= */
export class CampusRoom extends Room {
  maxClients = 80;

  onAuth(client, options) { return authenticate(options); }

  onCreate(opts = {}) {
    this.seed = num(opts.seed, 1, 2 ** 31, 0) || ((Math.random() * 2 ** 31) | 0);
    // the first player's school becomes everyone's school (name, uniform type, timetable seed)
    this.schoolName = str(opts.schoolName, 80) || 'Federal Government College';
    this.schoolType = str(opts.schoolType, 20) || null;
    if (opts.seed) this.seed = num(opts.seed, 1, 2 ** 31, this.seed);
    this.P = new Map();            // sessionId → player
    this.rate = 1;                  // school clock speed (SchoolClock keeps the time itself, saved on disk)
    this.ff = new Map();           // sessionId → { until, rate } (everyone must agree to fast-forward)
    this.cohorts = [];             // resumption-day groups
    this.timeAcc = 0; this.locAcc = 0; this.tablesSeen = -1;
    this.dirty = new Set();

    this.onMessage('ready', (c) => this.welcome(c));
    this.onMessage('p', (c, m) => {
      const p = this.P.get(c.sessionId); if (!p || !Array.isArray(m)) return;
      p.map = str(m[0], 24); p.x = num(m[1], -500, 6000); p.y = num(m[2], -500, 6000); p.h = num(m[3], -10, 10); p.a = str(m[4], 12); p.sp = num(m[5], 0, 400);
      this.dirty.add(c.sessionId);
      const o = Online.get(p.pid); if (o) o.map = p.map;
    });
    this.onMessage('prof', (c, m = {}) => {
      const p = this.P.get(c.sessionId); if (!p) return;
      Object.assign(p, this.cleanProfile(m, p));
      touch(p); Social.remember(p.pid, { level: p.level, arm: p.arm, house: p.house });
      this.broadcast('prof', this.pub(p), { except: c });
    });
    this.onMessage('say', (c, m = {}) => this.say(c, m.text, !!m.shout));
    this.onMessage('emote', (c, m = {}) => { if (EMOTES.includes(m.a)) this.broadcast('emote', { sid: c.sessionId, a: m.a }); });
    this.onMessage('call', (c, m = {}) => { const p = this.P.get(c.sessionId); const t = this.byPid(m.to); if (p && t) t.client.send('call', { from: p.pid, name: p.name, map: p.map, x: p.x, y: p.y, shout: !!m.shout }); });
    this.onMessage('follow', (c, m = {}) => { const p = this.P.get(c.sessionId); const t = this.byPid(m.to); if (p && t) t.client.send('follow', { from: p.pid, name: p.name, on: !!m.on }); });
    this.onMessage('share', (c, m = {}) => {
      const p = this.P.get(c.sessionId); const t = this.byPid(m.to); if (!p || !t) return;
      t.client.send('gift', { from: p.pid, name: p.name, item: str(m.item, 30), n: num(m.n, 1, 5, 1) });
    });
    this.onMessage('sitWith', (c, m = {}) => { const p = this.P.get(c.sessionId); const t = this.byPid(m.to); if (p && t) t.client.send('sitWith', { from: p.pid, name: p.name }); });
    this.onMessage('cover', (c, m = {}) => { const p = this.P.get(c.sessionId); const t = this.byPid(m.to); if (p && t && Social.areFriends(p.pid, t.pid)) t.client.send('cover', { from: p.pid, name: p.name, what: str(m.what, 80) }); });
    this.onMessage('invite', (c, m = {}) => {
      const p = this.P.get(c.sessionId); const t = this.byPid(m.to); if (!p || !t) return;
      t.client.send('invite', { from: p.pid, name: p.name, kind: str(m.kind, 16), roomId: str(m.roomId, 40), title: str(m.title, 60) });
    });
    this.onMessage('lesson', (c, m = {}) => {
      const p = this.P.get(c.sessionId); if (!p) return;
      const mod = Mod.moderate(str(m.text, 140), { context: 'public', max: 140 });
      if (mod.verdict === 'blocked') return c.send('blocked', { reason: Mod.explain(mod.reasons) });
      this.P.forEach((q) => { if (q.sid !== p.sid && q.map === p.map) q.client.send('lesson', { sid: p.sid, pid: p.pid, name: p.name, room: str(m.room, 24), text: mod.text }); });
    });
    // ---- social graph ----
    this.onMessage('friend', (c, m = {}) => {
      const p = this.P.get(c.sessionId); const to = idOf(m.to); if (!p || !to) return;
      if (m.remove) { Social.unfriend(p.pid, to); this.pushSocial(p.pid); this.pushSocial(to); return; }
      const r = Social.request(p.pid, to);
      if (r === 'requested') { const t = this.byPid(to); if (t) t.client.send('friendReq', { from: p.pid, name: p.name }); }
      this.pushSocial(p.pid); this.pushSocial(to);
      c.send('friendResult', { to, r });
    });
    this.onMessage('bestie', (c, m = {}) => { const p = this.P.get(c.sessionId); if (!p) return; Social.setBestie(p.pid, idOf(m.pid)); this.pushSocial(p.pid); if (m.pid) this.pushSocial(idOf(m.pid)); });
    this.onMessage('gang', (c, m = {}) => {
      const p = this.P.get(c.sessionId); if (!p) return;
      if (m.op === 'create') {
        const name = Mod.moderate(str(m.name, 28), { context: 'public', max: 28 }); const tag = Mod.moderate(str(m.tag, 5).toUpperCase(), { context: 'public', max: 5 });
        if (name.verdict === 'blocked' || tag.verdict === 'blocked' || !name.text.trim() || !tag.text.trim()) return c.send('blocked', { reason: 'Pick another gang name or tag.' });
        Social.createGang(p.pid, name.text.trim(), tag.text.trim());
      } else if (m.op === 'invite') { const g = Social.inviteGang(p.pid, idOf(m.to)); const t = this.byPid(m.to); if (g && t) t.client.send('gangInvite', { from: p.pid, name: p.name, gang: { id: g.id, name: g.name, tag: g.tag } }); this.pushSocial(idOf(m.to)); }
      else if (m.op === 'join') Social.joinGang(p.pid, str(m.id, 12));
      else if (m.op === 'leave') Social.leaveGang(p.pid);
      const g = Social.gangOf(p.pid);
      (g ? g.members : [p.pid]).forEach((pid) => this.pushSocial(pid));
      p.gang = g ? g.tag : null;
      this.broadcast('prof', this.pub(p));
    });
    // ---- shared clock: everyone sleeping/waiting → fast-forward ----
    this.onMessage('ff', (c, m = {}) => {
      if (m.cancel) this.ff.delete(c.sessionId);
      else this.ff.set(c.sessionId, { until: SchoolClock.abs + num(m.minutes, 1, 1440, 30), rate: num(m.rate, 2, 120, 40), label: str(m.label, 40) });
      this.sendTime(true);
    });

    this.setSimulationInterval((dt) => this.tick(dt), 100);
  }

  cleanProfile(m, old = {}) {
    const out = {};
    if (m.name !== undefined) out.name = str(m.name, 32) || old.name || 'Student';
    ['gender', 'level', 'arm', 'house', 'dept', 'religion', 'lang', 'outfit', 'status'].forEach((k) => { if (m[k] !== undefined) out[k] = str(m[k], 24); });
    if (m.look && typeof m.look === 'object') { const j = JSON.stringify(m.look); if (j.length < 2000) out.look = m.look; }
    if (m.seat !== undefined) out.seat = m.seat ? str(m.seat, 40) : null;
    return out;
  }
  pub(p) { return { sid: p.sid, pid: p.pid, name: p.name, gender: p.gender, level: p.level, arm: p.arm, house: p.house, dept: p.dept, religion: p.religion, lang: p.lang, look: p.look, gang: p.gang, map: p.map, x: p.x, y: p.y, h: p.h, a: p.a, seat: p.seat, status: p.status }; }
  byPid(pid) { pid = idOf(pid); for (const p of this.P.values()) if (p.pid === pid) return p; return null; }
  pushSocial(pid) { const p = this.byPid(pid); if (p) p.client.send('social', Social.view(pid)); }

  say(c, text, shout) {
    const p = this.P.get(c.sessionId); if (!p) return;
    const now = Date.now();
    if (now - (p.lastSay || 0) < 700) return;
    p.lastSay = now;
    const mod = Mod.moderate(str(text, 140), { context: 'public', max: 140 });
    if (mod.distress) return c.send('safety', { text: SAFE_DISTRESS });
    if (mod.verdict === 'blocked') return c.send('blocked', { reason: Mod.explain(mod.reasons) });
    this.broadcast('said', { sid: p.sid, pid: p.pid, text: mod.text, shout });
  }

  onJoin(client, o = {}) {
    const pid = pidOf(client, o);
    // one session per player: a second tab replaces the first
    const dup = this.byPid(pid); if (dup) dup.client.leave(4000, 'opened elsewhere');
    const p = Object.assign({ sid: client.sessionId, pid, client, map: str(o.map, 24) || 'campus', x: num(o.x, -500, 6000, 1200), y: num(o.y, -500, 6000, 1660), h: 0, a: 'idle' }, this.cleanProfile(o));
    Social.profile(pid, p.name);
    p.gang = (Social.gangOf(pid) || {}).tag || null;
    // the first player starts the school clock from their own time of day
    let cohort = null;
    if (o.newPlayer) cohort = this.joinCohort(p, o, idOf(o.invite));
    p.cohort = cohort;
    this.P.set(client.sessionId, p);
    touch(p);
    Social.remember(pid, { level: p.level, arm: p.arm, house: p.house, gender: p.gender, school: this.schoolName });
    this.broadcast('join', this.pub(p), { except: client });
  }
  /* sent once the client has its message handlers bound (so nothing is dropped) */
  welcome(client) {
    const p = this.P.get(client.sessionId); if (!p) return;
    client.send('welcome', {
      sid: client.sessionId, school: { name: this.schoolName, seed: this.seed, type: this.schoolType }, time: this.timeMsg(),
      players: [...this.P.values()].filter((q) => q !== p).map((q) => this.pub(q)),
      cohort: p.cohort, social: Social.view(p.pid), tables: [...Tables.values()],
    });
  }

  /* Resumption day: new players who arrive close together share it — same class arm, same house; same-gender
     pairs become bunkmates. */
  joinCohort(p, o, invitedBy) {
    const now = Date.now();
    // invited: join the inviter's arrival group if there is one, else a group in the inviter's class arm + house
    const inv = invitedBy && Social.profile(invitedBy);
    let c = inv ? this.cohorts.find((x) => x.members.some((m) => m.pid === invitedBy)) : null;
    if (!c && inv && inv.arm) {
      const hi = ['Blue', 'Green', 'Red', 'Yellow', 'Purple', 'Orange'].indexOf(inv.house);
      c = { id: `c${now.toString(36)}i`, created: now, arm: inv.arm, house: hi >= 0 ? hi : 0, members: [{ pid: invitedBy, name: inv.name, gender: inv.gender, bunkmate: null }] };
      this.cohorts.push(c);
    }
    if (!c) c = this.cohorts.find((x) => now - x.created < 20 * 60 * 1000 && x.members.length < 30);
    if (!c) {
      const n = this.cohorts.length;
      c = { id: `c${now.toString(36)}`, created: now, arm: ['A', 'B', 'C'][n % 3], house: n % 6, members: [] };
      this.cohorts.push(c);
    }
    const g = str(o.gender, 2);
    const mate = c.members.find((m) => m.gender === g && !m.bunkmate && this.byPid(m.pid));
    const me = { pid: p.pid, name: p.name, gender: g, bunkmate: mate ? mate.pid : null };
    if (mate) { mate.bunkmate = p.pid; const t = this.byPid(mate.pid); if (t) t.client.send('bunkmate', { pid: p.pid, name: p.name }); }
    c.members.push(me);
    return { id: c.id, arm: c.arm, house: c.house, bunkmate: mate ? { pid: mate.pid, name: mate.name } : null, members: c.members.map((m) => ({ pid: m.pid, name: m.name })) };
  }

  onLeave(client) {
    const p = this.P.get(client.sessionId);
    this.P.delete(client.sessionId);
    this.ff.delete(client.sessionId);
    this.dirty.delete(client.sessionId);
    if (p) { this.broadcast('leave', { sid: client.sessionId, pid: p.pid }); Online.delete(p.pid); }
    if (!this.P.size) SchoolClock.persist(); // empty school: time pauses here and carries on when someone comes back
  }

  timeMsg() { const t = SchoolClock.now(); return { abs: t.abs, day: t.day, min: t.min, rate: this.rate, ff: this.ff.size, n: this.P.size }; }
  sendTime(now) { if (now || this.timeAcc >= 1000) { this.timeAcc = 0; this.broadcast('time', this.timeMsg()); } }

  tick(dt) {
    if (this.P.size) {
      // fast-forward only when every player asked for it (sleeping / waiting)
      const votes = [...this.ff.values()];
      const all = votes.length && votes.length >= this.P.size;
      const until = all ? Math.min(...votes.map((v) => v.until)) : 0;
      const rate = all && until > SchoolClock.abs ? Math.min(...votes.map((v) => v.rate)) : 1;
      if (rate !== this.rate) { this.rate = rate; this.sendTime(true); }
      SchoolClock.advance((dt / 1000) * this.rate);
      if (all && SchoolClock.abs >= until) { this.ff.clear(); this.rate = 1; this.broadcast('ffDone', {}); this.sendTime(true); }
      this.timeAcc += dt; this.sendTime(false);
    }
    // positions (10 Hz)
    if (this.dirty.size) {
      const ps = {};
      this.dirty.forEach((sid) => { const p = this.P.get(sid); if (p) ps[sid] = [p.map, Math.round(p.x), Math.round(p.y), +p.h.toFixed(2), p.a, Math.round(p.sp || 0)]; });
      this.dirty.clear();
      this.broadcast('ps', ps);
    }
    // best friends see where you are (every 2 s)
    this.locAcc += dt;
    if (this.locAcc >= 2000) {
      this.locAcc = 0;
      this.P.forEach((p) => { const b = Social.bestieOf(p.pid); const t = b && this.byPid(b); if (t) t.client.send('bestieLoc', { pid: p.pid, name: p.name, map: p.map, x: p.x, y: p.y }); });
    }
    if (this.tablesSeen !== tablesV) { this.tablesSeen = tablesV; this.broadcast('tables', [...Tables.values()]); }
  }
}

/* ================= Whot! table ================= */
export class WhotRoom extends Room {
  maxClients = 4;

  onCreate(opts = {}) {
    this.seats = num(opts.seats, 2, 4, 4);
    this.maxClients = this.seats;
    this.title = str(opts.title, 40) || 'Whot! table';
    this.where = str(opts.map, 24) || 'campus';
    this.humans = new Map(); // sid → { pid, name }
    this.game = null;
    this.botTimer = null;
    this.publish();
    this.onMessage('start', (c) => { if (!this.game && this.humans.size) this.start(); });
    this.onMessage('ready', (c) => this.sendViews());
    this.onMessage('move', (c, m = {}) => {
      const h = this.humans.get(c.sessionId); if (!this.game || !h) return;
      const r = Whot.move(this.game, h.pid, { type: str(m.type, 10), index: num(m.index, 0, 60, -1), want: str(m.want, 10) });
      if (!r.ok) return c.send('err', { why: r.why });
      this.afterMove();
    });
    this.onMessage('chat', (c, m = {}) => {
      const h = this.humans.get(c.sessionId); if (!h) return;
      const mod = Mod.moderate(str(m.text, 100), { context: 'public', max: 100 });
      if (mod.verdict !== 'blocked') this.broadcast('chat', { name: h.name, text: mod.text });
    });
  }
  publish() {
    setTable(this.roomId, { id: this.roomId, kind: 'whot', title: this.title, map: this.where, players: [...this.humans.values()].map((h) => h.name), seats: this.seats, playing: !!(this.game && !this.game.winner) });
  }
  onAuth(client, options) { return authenticate(options); }
  onJoin(client, o = {}) {
    this.humans.set(client.sessionId, { pid: pidOf(client, o), name: str(o.name, 24) || 'Player' });
    this.publish();
    this.sendViews();
  }
  onLeave(client) {
    const h = this.humans.get(client.sessionId);
    this.humans.delete(client.sessionId);
    // a player who leaves mid-game is replaced by a bot
    if (this.game && h) { const pl = this.game.players.find((p) => p.id === h.pid); if (pl) { pl.bot = true; pl.name += ' (bot)'; } this.afterMove(); }
    this.publish();
    this.sendViews();
  }
  onDispose() { clearTimeout(this.botTimer); setTable(this.roomId, null); }

  start() {
    const players = [...this.humans.values()].map((h) => ({ id: h.pid, name: h.name }));
    const BOTS = ['Chioma (bot)', 'Musa (bot)', 'Tunde (bot)'];
    for (let i = 0; players.length < Math.max(2, this.seats); i++) players.push({ id: `bot${i}`, name: BOTS[i], bot: true });
    this.game = Whot.create(players, Date.now());
    this.lock();
    this.publish();
    this.afterMove();
  }
  afterMove() {
    this.sendViews();
    if (!this.game) return;
    if (this.game.winner) {
      const w = this.game.players.find((p) => p.id === this.game.winner);
      this.broadcast('end', { winner: this.game.winner, name: w ? w.name : '', counts: Object.fromEntries(Object.entries(this.game.hands).map(([k, v]) => [k, v.length])) });
      this.game = null;
      this.unlock();
      this.publish();
      return;
    }
    clearTimeout(this.botTimer);
    const cur = this.game.players[this.game.turn];
    if (cur.bot || ![...this.humans.values()].some((h) => h.pid === cur.id)) {
      this.botTimer = setTimeout(() => { if (!this.game) return; Whot.move(this.game, cur.id, Whot.botMove(this.game, cur.id)); this.afterMove(); }, 900 + Math.random() * 700);
    }
  }
  sendViews() {
    this.clients.forEach((c) => {
      const h = this.humans.get(c.sessionId);
      c.send('table', { title: this.title, seats: this.seats, humans: [...this.humans.values()].map((x) => x.name), game: this.game && h ? Whot.view(this.game, h.pid) : null, you: h && h.pid });
    });
  }
}

/* ================= football ================= */
export class FootballRoom extends Room {
  maxClients = 12;

  onCreate(opts = {}) {
    const f = opts.field || { x: 1880, y: 1060, w: 440, h: 300 };
    this.field = { x: num(f.x, 0, 6000), y: num(f.y, 0, 6000), w: num(f.w, 100, 2000), h: num(f.h, 100, 2000) };
    this.st = Football.create(this.field, { length: 180 });
    this.restartIn = 0;
    this.sendAcc = 0;
    this.onMessage('p', (c, m = {}) => Football.setPlayer(this.st, c.sessionId, { x: num(m.x, 0, 6000), y: num(m.y, 0, 6000), h: num(m.h, -10, 10) }));
    this.onMessage('kick', (c, m = {}) => Football.kick(this.st, c.sessionId, { dx: num(m.dx, -1, 1), dy: num(m.dy, -1, 1), power: num(m.power, 0, 1, 0.7) }));
    this.setSimulationInterval((dt) => this.tick(dt), 50);
    setTable('football', { id: 'football', kind: 'football', title: 'Football on the field', map: 'campus', players: [], seats: 12, playing: true });
  }
  onAuth(client, options) { return authenticate(options); }
  onJoin(client, o = {}) {
    const p = Football.addPlayer(this.st, client.sessionId, { name: str(o.name, 24) || 'Player', x: num(o.x, 0, 6000, null), y: num(o.y, 0, 6000, null) });
    p.pid = pidOf(client, o);
    Football.balance(this.st, 2);
    client.send('team', { team: p.team, field: this.field, goalW: this.st.goalW });
    this.publish();
  }
  onLeave(client) { Football.removePlayer(this.st, client.sessionId); Football.balance(this.st, 2); this.publish(); }
  onDispose() { setTable('football', null); }
  publish() { setTable('football', { players: Object.values(this.st.players).filter((p) => !p.bot).map((p) => p.name), score: this.st.score }); }
  tick(dt) {
    const s = dt / 1000;
    if (this.st.phase === 'over') {
      this.restartIn -= s;
      if (this.restartIn <= 0 && this.clients.length) { const old = this.st.players; this.st = Football.create(this.field, { length: 180 }); Object.values(old).filter((p) => !p.bot).forEach((p) => Football.addPlayer(this.st, p.id, p)); Football.balance(this.st, 2); this.broadcast('newMatch', {}); }
    } else {
      Football.step(this.st, s);
      this.st.events.forEach((e) => {
        if (e.k === 'goal') this.broadcast('goal', e);
        if (e.k === 'over') { this.broadcast('over', { score: this.st.score, players: Object.values(this.st.players).map((p) => ({ id: p.id, name: p.name, team: p.team, goals: p.goals, bot: p.bot })) }); this.restartIn = 12; this.publish(); }
      });
    }
    this.sendAcc += dt;
    if (this.sendAcc >= 66) { this.sendAcc = 0; this.broadcast('fb', Football.snap(this.st)); }
  }
}

/* ================= board games: Ayo, Draughts, Ludo (rules: shared/boards.js) ================= */
export class BoardRoom extends Room {
  onCreate(opts = {}) {
    this.kind = Boards.ENGINES[opts.game] ? opts.game : 'ayo';
    this.E = Boards.ENGINES[this.kind];
    this.seats = num(opts.seats, this.E.seats[0], this.E.seats[1], this.E.seats[1]);
    this.maxClients = this.seats;
    this.title = str(opts.title, 40) || this.E.title;
    this.where = str(opts.map, 24) || 'campus';
    this.humans = new Map();
    this.game = null; this.botTimer = null;
    this.publish();
    this.onMessage('ready', () => this.sendViews());
    this.onMessage('start', () => { if (!this.game && this.humans.size) this.start(); });
    this.onMessage('move', (c, m = {}) => {
      const h = this.humans.get(c.sessionId); if (!this.game || !h) return;
      const mv = { pit: num(m.pit, 0, 11, -1), token: num(m.token, 0, 3, -1), type: str(m.type, 8), from: Array.isArray(m.from) ? m.from.map((v) => num(v, 0, 7)) : null, to: Array.isArray(m.to) ? m.to.map((v) => num(v, 0, 7)) : null };
      const r = this.E.move(this.game, h.pid, mv);
      if (!r.ok) return c.send('err', { why: r.why });
      this.afterMove();
    });
  }
  publish() { setTable(this.roomId, { id: this.roomId, kind: this.kind, title: this.title, map: this.where, players: [...this.humans.values()].map((h) => h.name), seats: this.seats, playing: !!(this.game && !this.game.winner) }); }
  onAuth(client, options) { return authenticate(options); }
  onJoin(client, o = {}) { this.humans.set(client.sessionId, { pid: pidOf(client, o), name: str(o.name, 24) || 'Player' }); this.publish(); this.sendViews(); }
  onLeave(client) {
    const h = this.humans.get(client.sessionId); this.humans.delete(client.sessionId);
    if (this.game && h) { const pl = this.game.players.find((p) => p.id === h.pid); if (pl) { pl.bot = true; pl.name += ' (bot)'; } this.afterMove(); }
    this.publish(); this.sendViews();
  }
  onDispose() { clearTimeout(this.botTimer); setTable(this.roomId, null); }
  start() {
    const players = [...this.humans.values()].map((h) => ({ id: h.pid, name: h.name }));
    const BOTS = ['Kola (bot)', 'Amina (bot)', 'Uche (bot)'];
    const want = players.length < 2 ? (this.kind === 'ludo' ? this.seats : 2) : players.length;
    for (let i = 0; players.length < want; i++) players.push({ id: `bot${i}`, name: BOTS[i], bot: true });
    this.game = this.E.create(players, Date.now());
    this.lock(); this.publish(); this.afterMove();
  }
  afterMove() {
    this.sendViews();
    if (!this.game) return;
    if (this.game.winner) {
      const w = this.game.players.find((p) => p.id === this.game.winner);
      this.broadcast('end', { winner: this.game.winner, name: w ? w.name : 'Nobody' });
      this.game = null; this.unlock(); this.publish(); return;
    }
    clearTimeout(this.botTimer);
    const cur = this.game.players[this.game.turn];
    if (cur.bot || ![...this.humans.values()].some((h) => h.pid === cur.id)) {
      this.botTimer = setTimeout(() => { if (!this.game) return; this.E.move(this.game, cur.id, this.E.botMove(this.game, cur.id)); this.afterMove(); }, 700 + Math.random() * 500);
    }
  }
  sendViews() { this.clients.forEach((c) => { const h = this.humans.get(c.sessionId); c.send('table', { kind: this.kind, title: this.title, seats: this.seats, humans: [...this.humans.values()].map((x) => x.name), game: this.game && h ? this.E.view(this.game, h.pid) : null, you: h && h.pid }); }); }
}
