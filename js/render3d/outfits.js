/* Outfits — turns "who is this and what time is it" into clothing pieces for the character builder.
   Rules live in content/outfits.json (school colours, junior/senior cuts, house/Sunday/night/casual styles,
   adult outfits for teachers & staff, prefect badge).
   outfit request: { kind: 'student'|'adult', school, level, gender, house, style, prefect, role, hijab, seed } */
(function (BH) {
  const U = BH.U;
  const D = BH.data;

  const Outfits = {
    data() { return BH.Content.get('outfits'); },

    /* which style the world is in right now (uniform during classes, night wear after lights out…) */
    styleNow(s) {
      const w = Outfits.data().when;
      const id = BH.Time.blockId(s);
      return w.blocks[id] || w.kinds[BH.Time.block(s).kind] || 'uniform';
    },

    resolve(req) {
      const O = Outfits.data();
      const g = req.gender === 'f' ? 'f' : 'm';
      const house = req.house || '#c0392b';
      const pick = (v, salt) => (Array.isArray(v) ? v[U.hash(String(req.seed || '') + salt) % v.length] : v);
      const fill = (v) => (v === '{house}' ? house : v);
      let o;
      if (req.kind === 'adult') {
        const base = (req.role && O.staff[req.role]) || O.adults[U.hash(String(req.seed || 'x')) % O.adults.length];
        o = Object.assign({}, base, base[g] || {});
      } else {
        const sc = O.schools[req.school] || O.schools.fgc;
        const cut = O.cuts[`${(req.level || 1) <= 3 ? 'junior' : 'senior'}_${g}`];
        o = { top: sc.top, bottomColor: sc.bottom, socks: sc.socks, shoes: sc.shoes, tie: sc.tie, pinafore: cut.pinafore ? sc.pinafore : null };
        Object.assign(o, cut);
        if (cut.pinafore) o.pinafore = sc.pinafore;
        if (req.style && req.style !== 'uniform' && O.styles[req.style]) {
          const st = O.styles[req.style];
          Object.assign(o, st, st[g] || {});
          if (st.pinafore === false) o.pinafore = null;
        }
        if (req.prefect) o.badge = O.prefectBadge;
      }
      Object.keys(o).forEach((k) => { o[k] = fill(pick(o[k], k)); });
      if (req.hijab) o.hijab = req.hijabColor || (req.kind === 'adult' ? '#4a148c' : (o.top === '#ffffff' ? '#ffffff' : o.bottomColor));
      delete o.f; delete o.m; delete o.label;
      return o;
    },

    /* the outfit request for a character in the current game */
    forPlayer(s, style) {
      return { kind: 'student', school: s.player.school, level: s.time.year, gender: s.player.gender, house: s.player.house.color, style: style || Outfits.styleNow(s), prefect: !!(s.senior && s.senior.prefect), hijab: s.player.avatar && s.player.avatar.hair === 'hijab', seed: 'player' };
    },
    forNpc(s, n, style) {
      if (n.type === 'teacher' || n.type === 'staff') return { kind: 'adult', gender: n.gender, role: n.type === 'staff' ? n.role : null, seed: n.id, hijab: n.tribe === 'Hausa' && n.gender === 'f' };
      const level = n.type === 'senior' ? Number(String(n.level).replace('SS', '')) + 3 : n.type === 'junior' ? n.level : s.time.year;
      const look = BH.Sprites.npcLook(s, n);
      return { kind: 'student', school: s.player.school, level, gender: n.gender, house: look.outfit.house, style: style || Outfits.styleNow(s), prefect: !!(n.prefect || ['labourPrefect', 'diningPrefect', 'headPrefect', 'houseCaptain'].includes(n.role)), hijab: look.av.hair === 'hijab', seed: n.id };
    },
  };

  BH.Outfits = Outfits;
})(window.BH);
