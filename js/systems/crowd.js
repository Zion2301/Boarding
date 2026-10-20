/* The rest of the school (tier C, GAME_DESIGN.md §4): every student who isn't in your set, generated from the save's
   seed when needed — nothing per-student is stored except a relationship you changed (s.npcs.crowdRel).
   Each crowd "set" is a cohort k years ahead (k > 0, seniors) or behind (k < 0, juniors) of yours, so the same faces
   stay older/younger than you, move up every year, graduate after SS3, and new JSS1s appear every September.
   They go through the normal schedules (class arm rooms, dining, field, hostels), so the school feels full. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const PER_ARM = 28;
  let cache = { key: null, list: [], byId: new Map(), entries: [] };

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const TRIBE_W = { Yoruba: 6, Igbo: 6, Hausa: 5, Edo: 2, 'Efik/Ibibio': 2, Ijaw: 2, Tiv: 1.5, Urhobo: 2, Idoma: 1.5 };

  const Crowd = {
    build(s) {
      const key = `${s.school ? s.school.seed : 0}|${s.time.year}|${s.player.gender}`;
      if (cache.key === key) return cache;
      const list = [], byId = new Map();
      const seed = (s.school && s.school.seed) || 1;
      const tribes = Object.keys(D.TRIBES);
      for (let k = -5; k <= 5; k++) {
        if (k === 0) continue;
        const lvl = s.time.year + k;
        if (lvl < 1 || lvl > 6) continue;
        ['A', 'B', 'C'].forEach((arm) => {
          for (let i = 0; i < PER_ARM; i++) {
            const id = `x${k + 5}${arm}${i}`; // stable for this cohort across the years
            const r = rng(U.hash(id) ^ seed);
            const gender = r() < 0.5 ? 'm' : 'f';
            let tribe = tribes[0], roll = r() * tribes.reduce((a, t) => a + (TRIBE_W[t] || 1), 0);
            for (const t of tribes) { roll -= TRIBE_W[t] || 1; if (roll <= 0) { tribe = t; break; } }
            const T = D.TRIBES[tribe];
            const n = {
              id, crowd: true, first: T[gender][Math.floor(r() * T[gender].length)], last: T.last[Math.floor(r() * T.last.length)], gender, tribe,
              arm, lvl, persona: D.PERSONAS[Math.floor(r() * D.PERSONAS.length)].key, arch: 'regular',
              religion: tribe === 'Hausa' || r() < 0.18 ? 'muslim' : 'christian', lang: { Yoruba: 'yoruba', Igbo: 'igbo', Hausa: 'hausa' }[tribe] || ['yoruba', 'igbo', 'hausa'][Math.floor(r() * 3)],
              dept: lvl >= 4 ? ['science', 'arts', 'commercial'][Math.floor(r() * 3)] : null,
              rel: (s.npcs.crowdRel && s.npcs.crowdRel[id]) || 30 + Math.floor(r() * 25),
            };
            if (k > 0) Object.assign(n, { type: 'senior', role: 'regular', level: D.LEVELS[lvl - 1] });
            else Object.assign(n, { type: 'junior', level: lvl });
            if (BH.Traits && !(s.npcs.crowdRel && s.npcs.crowdRel[id])) n.rel = BH.Traits.startRel(n, n.rel);
            list.push(n); byId.set(id, n);
          }
        });
      }
      cache = { key, list, byId, entries: null };
      return cache;
    },
    all(s) { return Crowd.build(s).list; },
    get(s, id) { return Crowd.build(s).byId.get(id) || null; },
    entry(s, n) { return { id: n.id, kind: 'bot', npc: n.id, crowd: true, name: `${n.first} ${n.last}`, gender: n.gender, level: n.lvl, arm: n.arm, dept: n.dept, religion: n.religion, lang: n.lang, house: D.HOUSES[U.hash(n.id) % D.HOUSES.length].tag }; },
    entries(s) { const c = Crowd.build(s); if (!c.entries) c.entries = c.list.map((n) => Crowd.entry(s, n)); return c.entries; },
    reset() { cache.key = null; },
  };

  BH.Crowd = Crowd;
})(window.BH);
