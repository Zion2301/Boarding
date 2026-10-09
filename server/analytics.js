// Anonymous play analytics for the admin dashboard.
// Privacy: players are counted by a random device id the game makes up (localStorage). No names, no IP addresses,
// no account links, nothing typed. Players can switch it off in ⚙️ (the game then sends nothing).
// Tables (file store or Supabase): analytics_devices (one row per device), analytics_daily (one row per day),
// analytics_choices (one row per story beat: how many picked each choice), payments (money received).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORDER = ['JSS1T1', 'JSS1T2', 'JSS1T3', 'JSS2T1', 'JSS2T2', 'JSS2T3', 'JSS3T1', 'JSS3T2', 'JSS3T3', 'SS1T1', 'SS1T2', 'SS1T3', 'SS2T1', 'SS2T2', 'SS2T3', 'SS3T1', 'SS3T2', 'SS3T3'];
const EVENTS = new Set(['visit', 'beat', 'newgame', 'chapter', 'grad', 'choice', 'mp', 'convo']);
const DEVICE = /^[a-zA-Z0-9-]{8,64}$/;
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const host = (r) => { try { return new URL(String(r)).hostname.replace(/^www\./, '').slice(0, 60); } catch { return ''; } };

export function createAnalytics(store) {
  const online = new Map(); // device → last heartbeat (ms)
  const rate = new Map();   // device → [timestamps]
  let arcs = null;
  const beatTitles = () => {
    if (arcs) return arcs;
    try { arcs = JSON.parse(fs.readFileSync(path.join(here, '..', 'content', 'arcs.json'), 'utf8')).beats; } catch { arcs = []; }
    return arcs;
  };

  async function dayRow(d) {
    return (await store.get('analytics_daily', d)) || (await store.insert('analytics_daily', { id: d, visits: 0, uniques: 0, newDevices: 0, returning: 0, playSeconds: 0, newGames: 0, graduations: 0, mpJoins: 0, convos: 0 }));
  }
  const bump = async (d, patch) => { const r = await dayRow(d); const next = {}; Object.entries(patch).forEach(([k, v]) => { next[k] = (r[k] || 0) + v; }); await store.update('analytics_daily', d, next); };

  return {
    /* POST /api/track  { d: deviceId, e: event, v: {…} } */
    async track(b = {}) {
      const id = String(b.d || '');
      const e = String(b.e || '');
      if (!DEVICE.test(id) || !EVENTS.has(e)) return { ok: false };
      const now = Date.now();
      const recent = (rate.get(id) || []).filter((t) => now - t < 60000);
      if (recent.length >= 40) return { ok: false, rate: true };
      recent.push(now); rate.set(id, recent);
      const v = b.v && typeof b.v === 'object' ? b.v : {};
      const today = day(now);
      let dev = await store.get('analytics_devices', id);
      if (!dev) dev = await store.insert('analytics_devices', { id, first: today, last: today, days: 0, visits: 0, play: 0, games: 0, furthest: -1, mobile: !!v.mobile, ref: host(v.ref), mode: 'story', graduated: false });
      const patch = {};
      if (e === 'visit') {
        const firstToday = dev.lastVisitDay !== today;
        const isNew = dev.first === today && !dev.visits;
        patch.visits = (dev.visits || 0) + 1; patch.lastVisitDay = today; patch.mobile = !!v.mobile;
        if (!dev.ref && v.ref) patch.ref = host(v.ref);
        if (firstToday) patch.days = (dev.days || 0) + 1;
        await bump(today, { visits: 1, uniques: firstToday ? 1 : 0, newDevices: isNew ? 1 : 0, returning: firstToday && !isNew ? 1 : 0 });
      } else if (e === 'beat') {
        const secs = clampInt(v.s, 0, 120);
        online.set(id, now);
        patch.play = (dev.play || 0) + secs;
        await bump(today, { playSeconds: secs });
      } else if (e === 'newgame') { patch.games = (dev.games || 0) + 1; await bump(today, { newGames: 1 }); }
      else if (e === 'chapter') { const i = ORDER.indexOf(String(v.stamp || '')); if (i > (dev.furthest ?? -1)) patch.furthest = i; }
      else if (e === 'grad') { patch.graduated = true; await bump(today, { graduations: 1 }); }
      else if (e === 'mp') { patch.mode = 'private'; await bump(today, { mpJoins: 1 }); }
      else if (e === 'convo') await bump(today, { convos: 1 });
      else if (e === 'choice') {
        const beat = String(v.beat || '').replace(/[^a-z0-9_]/gi, '').slice(0, 40);
        const c = clampInt(v.choice, -1, 6);
        if (beat) {
          const row = (await store.get('analytics_choices', beat)) || (await store.insert('analytics_choices', { id: beat, counts: {} }));
          const counts = Object.assign({}, row.counts || {}); counts[c] = (counts[c] || 0) + 1;
          await store.update('analytics_choices', beat, { counts });
        }
      }
      patch.last = today;
      await store.update('analytics_devices', id, patch);
      return { ok: true };
    },

    async recordPayment({ amount, currency = 'NGN', ref = '', note = '' }) {
      const a = Math.round(Number(amount) || 0);
      if (a <= 0) return { error: 'amount must be positive' };
      return store.insert('payments', { amount: a, currency: String(currency).slice(0, 3).toUpperCase(), ref: String(ref).slice(0, 80), note: String(note).slice(0, 120) });
    },

    /* GET /api/admin/metrics */
    async metrics({ accounts = 0, ai = null } = {}) {
      const devices = await store.select('analytics_devices', {}, { limit: 100000, order: 'first', desc: false });
      const daily = await store.select('analytics_daily', {}, { limit: 400, order: 'id', desc: true });
      const choices = await store.select('analytics_choices', {}, { limit: 500, order: 'id' });
      const payments = await store.select('payments', {}, { limit: 1000 });
      const today = day();
      const t = daily.find((d) => d.id === today) || {};
      const sum = (k) => daily.reduce((a, d) => a + (d[k] || 0), 0);
      const now = Date.now();
      const onlineNow = [...online.values()].filter((x) => now - x < 150000).length;
      const totalPlay = devices.reduce((a, d) => a + (d.play || 0), 0);
      const players = devices.filter((d) => (d.play || 0) >= 60);
      const cameBack = devices.filter((d) => (d.days || 0) >= 2).length;
      const series = [];
      for (let i = 29; i >= 0; i--) { const id = day(now - i * 86400000); const r = daily.find((d) => d.id === id) || {}; series.push({ day: id, visits: r.visits || 0, uniques: r.uniques || 0, playMin: Math.round((r.playSeconds || 0) / 60), newGames: r.newGames || 0 }); }
      const funnel = ORDER.map((stamp, i) => ({ stamp, devices: devices.filter((d) => (d.furthest ?? -1) >= i).length }));
      funnel.push({ stamp: 'Graduated', devices: devices.filter((d) => d.graduated).length });
      const tally = (key) => { const m = {}; devices.forEach((d) => { const k = key(d) || '(direct / unknown)'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => ({ name, n })); };
      const month = today.slice(0, 7);
      const ngn = payments.filter((p) => p.currency === 'NGN');
      const beats = beatTitles();
      const topChoices = choices.map((c) => {
        const b = beats.find((x) => x.id === c.id);
        const total = Object.values(c.counts || {}).reduce((a, n) => a + n, 0);
        const opts = (b ? b.choices : []).map((ch, i) => ({ label: ch.label, n: (c.counts || {})[i] || 0 }));
        if ((c.counts || {})[-1]) opts.push({ label: '🙈 Ignored', n: c.counts[-1] });
        return { id: c.id, title: b ? b.title : c.id, total, opts };
      }).sort((a, b) => b.total - a.total).slice(0, 12);
      return {
        generated: new Date().toISOString(),
        totals: {
          visits: sum('visits'), visitors: devices.length, players: players.length, onlineNow,
          playHours: Math.round(totalPlay / 360) / 10, avgPlayMin: players.length ? Math.round(totalPlay / players.length / 60) : 0,
          newGames: sum('newGames'), graduations: sum('graduations'), convos: sum('convos'), mpJoins: sum('mpJoins'),
          returningPct: devices.length ? Math.round((cameBack / devices.length) * 100) : 0, accounts,
        },
        today: { visits: t.visits || 0, visitors: t.uniques || 0, newVisitors: t.newDevices || 0, returning: t.returning || 0, playMin: Math.round((t.playSeconds || 0) / 60), newGames: t.newGames || 0 },
        revenue: { totalNGN: ngn.reduce((a, p) => a + p.amount, 0), monthNGN: ngn.filter((p) => String(p.created_at).startsWith(month)).reduce((a, p) => a + p.amount, 0), payments: payments.length, latest: payments.slice(0, 10) },
        series, funnel,
        referrers: tally((d) => d.ref),
        devices: [{ name: '📱 Phone / tablet', n: devices.filter((d) => d.mobile).length }, { name: '💻 Computer', n: devices.filter((d) => !d.mobile).length }],
        modes: [{ name: '📖 Story mode', n: devices.filter((d) => d.mode !== 'private').length }, { name: '🌐 Private school', n: devices.filter((d) => d.mode === 'private').length }],
        topChoices, ai,
      };
    },
  };
}
