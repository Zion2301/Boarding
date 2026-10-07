/* Paths to success — many ways to "win" boarding school (content/world.json → paths):
   scholar (top of class), sports star, prefect/leader, hustler, popular icon, troublemaker legend.
   Points come from what you choose to do (events on the bus + handlers calling Paths.add);
   each path's score mixes those points with your stats, and earns titles at 10 / 30 / 60 / 100. */
(function (BH) {
  const U = BH.U;
  const C = () => BH.Content;
  const TIERS = [10, 30, 60, 100];

  const Paths = {
    onNewGame(s) { s.paths = { scholar: 0, sports: 0, leader: 0, hustle: 0, popular: 0, trouble: 0 }; },
    onLoad(s) { if (!s.paths) Paths.onNewGame(s); },
    defs() { return C().get('world').paths; },

    add(s, key, n) {
      if (!s.paths || s.paths[key] === undefined || !n) return;
      const before = Paths.tier(s, key);
      s.paths[key] = Math.max(0, s.paths[key] + n);
      const after = Paths.tier(s, key);
      if (after > before && after > 0) {
        const d = Paths.defs()[key];
        BH.UI && BH.UI.toast(`${d.emoji} New title: ${Paths.title(s, key)}!`, 'good', true);
        BH.log(s, `${d.emoji} Title earned: ${Paths.title(s, key)}`, 'good');
      }
    },

    /* score = what you did + how you stand */
    score(s, key) {
      const p = s.paths[key] || 0;
      const R = BH.Consequences;
      switch (key) {
        case 'scholar': return p + Math.max(0, BH.Academics.avgKnowledge(s) - 30) * 0.8;
        case 'sports': return p;
        case 'leader': return p + Math.max(0, R.group(s, 'teachers') - 50) * 0.6 + (s.senior && s.senior.prefect ? 40 : 0);
        case 'hustle': return p + (s.stats_history.earned || 0) / 300;
        case 'popular': return p + Math.max(0, s.reputation - 20) * 0.7;
        case 'trouble': return p + (s.discipline ? s.discipline.points : 0) * 1.5;
        default: return p;
      }
    },
    tier(s, key) { const v = Paths.score(s, key); return TIERS.filter((t) => v >= t).length; },
    title(s, key) {
      const d = Paths.defs()[key];
      const t = Paths.tier(s, key);
      return t ? U.fill(d.titles[t - 1], { crown: s.player.gender === 'f' ? 'Queen' : 'King' }) : '—';
    },
    /* Your strongest path right now */
    top(s) {
      const keys = Object.keys(Paths.defs());
      const best = keys.slice().sort((a, b) => Paths.score(s, b) - Paths.score(s, a))[0];
      return { key: best, score: Paths.score(s, best), tier: Paths.tier(s, best), title: Paths.title(s, best), def: Paths.defs()[best] };
    },
    summary(s) {
      return Object.entries(Paths.defs()).map(([key, d]) => ({ key, ...d, score: Math.round(Paths.score(s, key)), tier: Paths.tier(s, key), title: Paths.title(s, key), next: TIERS[Paths.tier(s, key)] || null }));
    },
    ending(s) {
      const t = Paths.top(s);
      if (!t.tier) return 'You no chase any one thing — you just survived. And that na achievement too.';
      return `${t.def.emoji} **${t.title}** — ${t.def.ending}`;
    },
  };

  // points from what you choose to do
  const on = (evt, fn) => BH.bus.on(evt, (p, s) => { if (s && s.paths) fn(s, p); });
  on('study', (s) => Paths.add(s, 'scholar', 0.6));
  on('attend', (s) => Paths.add(s, 'scholar', 0.3));
  on('quiz:done', (s, p) => Paths.add(s, 'scholar', p.correct === p.total ? 3 : p.correct / p.total));
  on('exam:done', (s, p) => Paths.add(s, 'scholar', (p.correct / p.total) * 4));
  on('hustle:sale', (s, p) => { s.stats_history.earned = (s.stats_history.earned || 0) + p.price; Paths.add(s, 'hustle', p.price / 150); });
  on('mission:completed', (s) => Paths.add(s, 'leader', 0.5));
  on('inspection', (s, p) => { if (p.passed) Paths.add(s, 'leader', 0.5); });
  on('snitch', (s) => Paths.add(s, 'leader', 1));
  on('action', (s, p) => { if (p.tag === 'dance') Paths.add(s, 'popular', 1); if (p.tag === 'kind') Paths.add(s, 'leader', 1); });
  on('npc:share', (s) => Paths.add(s, 'popular', 0.5));

  BH.registerSystem('Paths', Paths);
})(window.BH);
