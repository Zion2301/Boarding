/* Stats: the six survival bars, money, reputation, senior favour, trait modifiers, decay */
(function (BH) {
  const U = BH.U;

  const ICONS = { hunger: '🍛', thirst: '💧', rest: '😴', hygiene: '🧼', health: '❤️', morale: '😎' };
  const LABELS = { hunger: 'Hunger', thirst: 'Thirst', rest: 'Rest', hygiene: 'Hygiene', health: 'Health', morale: 'Vibes' };
  // drain per hour awake
  const BASE_DECAY = { hunger: 4, thirst: 5, rest: 3.2, hygiene: 1.6, morale: 0.6 };
  const MULT_KEYS = ['study', 'hustle', 'favour', 'energy', 'morale', 'rel', 'rep'];

  const Stats = {
    ICONS, LABELS, KEYS: Object.keys(ICONS),

    /* Trait modifier: multiplicative keys default 1, additive keys default 0 */
    mod(s, key) {
      const isMult = MULT_KEYS.includes(key);
      let v = isMult ? 1 : 0;
      s.player.traits.forEach((t) => {
        const m = BH.data.TRAITS[t] && BH.data.TRAITS[t].mods[key];
        if (m === undefined) return;
        v = isMult ? v * m : v + m;
      });
      return v;
    },
    has(s, trait) { return s.player.traits.includes(trait); },
    school(s) { return BH.data.SCHOOLS[s.player.school]; },

    /* Apply stat deltas, e.g. change(s, {hunger: +20, rest: -5}) */
    change(s, delta) {
      Object.keys(delta).forEach((k) => {
        if (!(k in s.stats)) return;
        let d = delta[k];
        if (k === 'morale' && d > 0) d *= Stats.mod(s, 'morale');
        const before = s.stats[k];
        s.stats[k] = U.clamp(before + d);
        BH.fx.push(ICONS[k], s.stats[k] - before, LABELS[k]);
      });
    },
    money(s, n) {
      const before = s.money;
      s.money = Math.max(0, Math.round(s.money + n));
      BH.fx.push('₦', s.money - before, 'Money');
      return s.money - before;
    },
    rep(s, n) {
      if (n > 0) n *= Stats.mod(s, 'rep');
      const before = s.reputation;
      s.reputation = U.clamp(before + n);
      BH.fx.push('⭐', s.reputation - before, 'Clout');
    },
    favour(s, n) {
      if (n > 0) n *= Stats.mod(s, 'favour');
      const before = s.seniorFavour;
      s.seniorFavour = U.clamp(before + n);
      BH.fx.push('🎖️', s.seniorFavour - before, 'Senior favour');
    },

    /* One in-game minute for your body. Awake: normal drain (× weather). Asleep: rest comes back,
       hunger/thirst drain slowly. Called by the TimeSystem every minute. */
    minute(s) {
      const act = s.act;
      if (act && act.type === 'sleep') {
        const st = s.stats;
        const q = act.quality || 1;
        st.rest = U.clamp(st.rest + 0.21 * q);
        st.hunger = U.clamp(st.hunger - 12 / 420);
        st.thirst = U.clamp(st.thirst - 14 / 420);
        st.hygiene = U.clamp(st.hygiene - 4 / 420);
        if (act.health) st.health = U.clamp(st.health + act.health);
        return;
      }
      Stats.decay(s, { dur: 1 / 60 }, BH.WorldSim ? BH.WorldSim.decayMult(s) : null);
      if (s.stats.rest <= 0 && BH.Activities) BH.Activities.passOut(s);
    },

    /* Natural drain over `block.dur` hours. mult = per-stat multipliers (weather) */
    decay(s, block, mult) {
      const h = block.dur;
      const st = s.stats;
      const d = {};
      if (block.decay) {
        Object.assign(d, Object.fromEntries(Object.entries(block.decay).map(([k, v]) => [k, -v])));
      } else {
        Object.keys(BASE_DECAY).forEach((k) => { d[k] = -BASE_DECAY[k] * h * ((mult && mult[k]) || 1); });
        d.rest *= Stats.mod(s, 'energy');
        if (mult && mult.health) d.health = -0.4 * h * mult.health;
      }
      // health responds to how you're treating your body
      let hp = 0;
      if (st.hunger < 15) hp -= 2 * h;
      if (st.thirst < 15) hp -= 2.5 * h;
      if (st.hygiene < 15) hp -= 0.7 * h;
      if (st.rest < 10) hp -= 1 * h;
      if (st.hunger >= 45 && st.thirst >= 45 && st.rest >= 40 && st.hygiene >= 40) hp += 1.2 * h;
      d.health = (d.health || 0) + hp;
      // misery drags vibes down
      const low = ['hunger', 'thirst', 'rest', 'hygiene', 'health'].filter((k) => st[k] < 20).length;
      d.morale = (d.morale || 0) - low * 1.5 * Math.min(h, 3);
      Object.keys(d).forEach((k) => { st[k] = U.clamp(st[k] + d[k]); });
    },

    /* Called after every block; may queue forced events */
    checkConsequences(s) {
      const st = s.stats;
      const f = s.today.flags;
      if (st.health <= 0) {
        BH.Events.queue(s, 'hospital');
      } else if (st.health < 18 && !f.sickbay) {
        BH.Events.queue(s, 'sickbay');
      }
      if (st.hygiene < 15 && !f.rash && U.chance(0.35)) { f.rash = true; BH.Events.optional(s, 'rash'); }
      if (st.thirst < 10 && !f.dehydrated && U.chance(0.5)) { f.dehydrated = true; BH.Events.optional(s, 'dehydrated'); }
    },

    /* Short warnings for the HUD */
    warnings(s) {
      const st = s.stats, w = [];
      if (st.hunger < 20) w.push('Hunger dey wire you — you fit faint for assembly.');
      if (st.thirst < 20) w.push('Your throat dry like Sahara. Drink water!');
      if (st.rest < 20) w.push('Your eyes dey close by themselves. You go sleep for class.');
      if (st.hygiene < 25) w.push('You dey smell small. People dey shift when you sit.');
      if (st.health < 30) w.push('Your body no well. Sick bay dey call your name.');
      if (st.morale < 20) w.push('You dey miss home die. Morale don crash.');
      return w;
    },

    level(v) { return v >= 60 ? 'good' : v >= 30 ? 'mid' : v >= 15 ? 'low' : 'crit'; },
  };

  BH.registerSystem('Stats', Stats);
})(window.BH);
