// Cost & safety controls in front of every AI call:
//   global AI switch (env AI_ENABLED + admin toggle) · per-player rate limit · per-player and global daily budgets ·
//   response cache for common, memory-less situations.
const env = (k, d) => (process.env[k] !== undefined ? process.env[k] : d);
const RATE_PER_MIN = Number(env('AI_RATE_PER_MIN', 8));
const DAILY_BUDGET = Number(env('AI_DAILY_BUDGET', 120));
const GLOBAL_DAILY = Number(env('AI_GLOBAL_DAILY', 20000));

export const today = () => new Date().toISOString().slice(0, 10);

export function createGuard(store) {
  const recent = new Map();   // playerId -> [timestamps]
  const daily = new Map();    // `${day}|${playerId}` -> cost
  let globalDay = today(), globalCount = 0;
  let aiSwitch = null;        // cached admin toggle

  const cache = new Map();    // key -> { value, at }
  const CACHE_MAX = 1000, CACHE_TTL = 6 * 3600 * 1000;

  return {
    async aiEnabled() {
      if (env('AI_ENABLED', '1') === '0') return false;
      if (aiSwitch === null) aiSwitch = await store.setting('ai_enabled', true);
      return aiSwitch !== false;
    },
    async setAiEnabled(on) { aiSwitch = !!on; await store.setSetting('ai_enabled', !!on); },

    /* Returns null if allowed, or a reason string */
    check(playerId, cost = 1) {
      const t = Date.now();
      const list = (recent.get(playerId) || []).filter((x) => t - x < 60_000);
      if (list.length >= RATE_PER_MIN) return 'rate_limited';
      const day = today();
      if (day !== globalDay) { globalDay = day; globalCount = 0; daily.clear(); }
      const used = daily.get(`${day}|${playerId}`) || 0;
      if (used + cost > DAILY_BUDGET) return 'daily_budget';
      if (globalCount + cost > GLOBAL_DAILY) return 'global_budget';
      return null;
    },
    /* every AI attempt counts toward the per-minute limit (even failed ones) */
    attempt(playerId) {
      const t = Date.now();
      const list = (recent.get(playerId) || []).filter((x) => t - x < 60_000);
      list.push(t); recent.set(playerId, list);
    },
    /* successful calls count toward the daily budgets */
    async charge(playerId, kind, cost = 1, cached = false) {
      if (cached) return;
      const day = today();
      daily.set(`${day}|${playerId}`, (daily.get(`${day}|${playerId}`) || 0) + cost);
      globalCount += cost;
      store.insert('usage', { player_id: playerId, day, kind, cost, cached }).catch(() => {});
    },
    remaining(playerId) { return Math.max(0, DAILY_BUDGET - (daily.get(`${today()}|${playerId}`) || 0)); },
    stats() { return { day: globalDay, globalCount, players: daily.size, cacheSize: cache.size, limits: { RATE_PER_MIN, DAILY_BUDGET, GLOBAL_DAILY } }; },

    cacheGet(key) {
      const e = cache.get(key);
      if (!e) return null;
      if (Date.now() - e.at > CACHE_TTL) { cache.delete(key); return null; }
      cache.delete(key); cache.set(key, e); // LRU bump
      return e.value;
    },
    cacheSet(key, value) {
      cache.set(key, { value, at: Date.now() });
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    },
  };
}

/* Cache key for situations common enough to share answers: no history, no memory, short player text */
export function cacheKey({ sheetKey, situation, text, rel, extra = '' }) {
  const norm = String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  if (norm.length > 80) return null;
  const band = rel >= 70 ? 'hi' : rel >= 40 ? 'mid' : 'lo';
  return `${sheetKey}|${situation}|${band}|${extra}|${norm}`;
}
