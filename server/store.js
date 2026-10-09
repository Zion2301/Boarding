// Storage adapter. Supabase (Postgres) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
// otherwise a local JSON file (server/data/db.json) — fine for development and a single small server.
// Tables / collections (see supabase.sql): npc_memory, ledger, usage, board_posts, graffiti, shirts,
// slambooks, reports, settings, analytics_devices, analytics_daily, analytics_choices, payments.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

/* ---------------- JSON file store ---------------- */
function fileStore(file) {
  let db = { npc_memory: [], ledger: [], usage: [], board_posts: [], graffiti: [], shirts: [], slambooks: [], reports: [], settings: [], analytics_devices: [], analytics_daily: [], analytics_choices: [], payments: [] };
  try { db = Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { /* fresh */ }
  let timer = null;
  const save = () => { clearTimeout(timer); timer = setTimeout(() => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); }, 200); };
  const t = (name) => db[name];
  return {
    kind: 'file',
    async select(name, where = {}, { limit = 200, order = 'created_at', desc = true } = {}) {
      let rows = t(name).filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      rows = rows.slice().sort((a, b) => (a[order] < b[order] ? -1 : 1) * (desc ? -1 : 1));
      return rows.slice(0, limit);
    },
    async insert(name, row) { const r = Object.assign({ id: newId(), created_at: now() }, row); t(name).push(r); save(); return r; },
    async update(name, id, patch) { const r = t(name).find((x) => x.id === id); if (r) { Object.assign(r, patch); save(); } return r || null; },
    async remove(name, where) { const before = t(name).length; db[name] = t(name).filter((r) => !Object.entries(where).every(([k, v]) => r[k] === v)); save(); return before - db[name].length; },
    async get(name, id) { return t(name).find((x) => x.id === id) || null; },
  };
}

/* ---------------- Supabase store ---------------- */
async function supabaseStore(url, key) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const check = ({ data, error }) => { if (error) throw new Error(`supabase: ${error.message}`); return data; };
  return {
    kind: 'supabase',
    async select(name, where = {}, { limit = 200, order = 'created_at', desc = true } = {}) {
      let q = sb.from(name).select('*');
      Object.entries(where).forEach(([k, v]) => { q = q.eq(k, v); });
      return check(await q.order(order, { ascending: !desc }).limit(limit));
    },
    async insert(name, row) { return check(await sb.from(name).insert(Object.assign({ id: newId(), created_at: now() }, row)).select().single()); },
    async update(name, id, patch) { return check(await sb.from(name).update(patch).eq('id', id).select().maybeSingle()); },
    async remove(name, where) { let q = sb.from(name).delete(); Object.entries(where).forEach(([k, v]) => { q = q.eq(k, v); }); check(await q); return 1; },
    async get(name, id) { return check(await sb.from(name).select('*').eq('id', id).maybeSingle()); },
  };
}

export async function openStore() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATA_FILE } = process.env;
  const base = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) ? await supabaseStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : fileStore(DATA_FILE || path.join(here, 'data', 'db.json'));

  /* Domain helpers on top of the raw table API */
  return Object.assign(base, {
    // NPC memory: short notes per (player, npc)
    async memory(playerId, npcKey) {
      const rows = await base.select('npc_memory', { player_id: playerId, npc_key: npcKey }, { limit: 10 });
      return rows.reverse().map((r) => r.note);
    },
    async remember(playerId, npcKey, note) {
      if (!note) return;
      await base.insert('npc_memory', { player_id: playerId, npc_key: npcKey, note: String(note).slice(0, 160) });
      const rows = await base.select('npc_memory', { player_id: playerId, npc_key: npcKey }, { limit: 100 });
      for (const r of rows.slice(20)) await base.remove('npc_memory', { id: r.id }); // keep the newest 20
    },
    // ledger of what the AI granted today (money / items / relationship) for caps
    async ledgerTotal(playerId, day, kind) {
      const rows = await base.select('ledger', { player_id: playerId, day, kind }, { limit: 500 });
      return rows.reduce((a, r) => a + (r.amount || 0), 0);
    },
    async ledgerAdd(playerId, day, kind, amount, npcKey) { if (amount) await base.insert('ledger', { player_id: playerId, day, kind, amount, npc_key: npcKey || null }); },
    // settings (global AI switch)
    async setting(key, fallback) { const r = (await base.select('settings', { key }, { limit: 1 }))[0]; return r ? r.value : fallback; },
    async setSetting(key, value) {
      const r = (await base.select('settings', { key }, { limit: 1 }))[0];
      if (r) return base.update('settings', r.id, { value });
      return base.insert('settings', { key, value });
    },
  });
}
