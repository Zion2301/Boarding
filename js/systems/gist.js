/* Gist / rumour system. NPCs talk about what you (and everybody else) do, and rumours spread over time.
   s.rumours = [{ id, text, about: 'me' | npcId | null, valence -1..1, born, spread 0..1, tags, unlock, heard }]
   - spread grows every hour (faster when your clout is high); once a rumour about you is widely known,
     your reputation shifts (legend → clout up; snitch → coursemates down; thief → everybody down)
   - NPCs repeat rumours when you ask for gist, and you can overhear two NPCs gisting (the scene calls overhear())
   - some rumours unlock secret missions when you hear them */
(function (BH) {
  const U = BH.U;

  const FILLER = [
    '{a} and {b} dey write each other letters. Na so e dey start.',
    '{a} cry for house master office because Senior collect their Milo.',
    'They say {a} papa na Senator. I no believe.',
    '{a} see ghost for toilet last night. Na wetin dem dey talk o.',
    'The Maths teacher and the Agric teacher dey fight over one parking space.',
    'Dem say the dining hall go serve chicken on Sunday. Lie or truth?',
    'Mama Tuck-shop don increase Gala price again. Wickedness.',
    '{a} dey hide heater for inside their bucket. I swear.',
  ];

  const Gist = {
    onNewGame(s) { s.rumours = []; },
    onLoad(s) { s.rumours = s.rumours || []; },

    add(s, text, opts = {}) {
      if (!text) return null;
      s.rumours = s.rumours || [];
      if (s.rumours.some((r) => r.text === text)) return null;
      const r = { id: U.uid(), text, about: opts.about || null, valence: opts.valence || 0, born: BH.Clock.abs(s), spread: opts.spread || 0.05, tags: opts.tags || [], unlock: opts.unlock || null, heard: opts.about === 'me' || !!opts.heard, applied: false };
      s.rumours.unshift(r);
      if (s.rumours.length > 40) s.rumours.length = 40;
      return r;
    },

    /* Every hour, rumours travel */
    onMinute(s) {
      if (s.clock % 60 !== 0 || !s.rumours) return;
      const now = BH.Clock.abs(s);
      const boost = 0.06 + s.reputation / 1000;
      s.rumours.forEach((r) => {
        r.spread = Math.min(1, r.spread + boost * (BH.Clock.isNight(s) ? 0.4 : 1));
        if (r.about === 'me' && !r.applied && r.spread >= 0.5) { r.applied = true; Gist.effect(s, r); }
      });
      s.rumours = s.rumours.filter((r) => now - r.born < 7 * 1440);
    },
    /* A rumour about you finally reaches everybody */
    effect(s, r) {
      if (r.tags.includes('snitch')) BH.Consequences.repChange(s, 'coursemates', -3);
      else if (r.tags.includes('stealing')) { BH.Consequences.repChange(s, 'coursemates', -3); BH.Stats.rep(s, -2); }
      else if (r.valence > 0) BH.Stats.rep(s, 3);
      else if (r.valence < 0) BH.Stats.rep(s, r.tags.includes('caught') ? 1 : -1); // getting caught is half shame, half clout
      else BH.Stats.rep(s, 1);
    },

    /* What an NPC tells you when you ask "Any gist?" */
    line(s, n) {
      const pool = (s.rumours || []).filter((r) => r.spread >= 0.1 && r.about !== n.id);
      const fresh = pool.filter((r) => !r.heard);
      const r = U.pick(fresh.length ? fresh : pool);
      if (r && (fresh.length || Math.random() < 0.5)) return Gist.hear(s, r);
      return Gist.filler(s);
    },
    hear(s, r) {
      if (!r.heard) { r.heard = true; if (r.unlock) BH.Missions.unlock(s, r.unlock); }
      return r.about === 'me' ? `"Na true say… ${r.text}" 👀` : `"${r.text}"`;
    },
    filler(s) {
      const a = BH.NPC.randomClassmate(s), b = BH.NPC.randomClassmate(s, a.id);
      return `"${U.fill(U.pick(FILLER), { a: a.first, b: b.first })}"`;
    },

    /* Two NPCs gisting near you — returns a line to show in a speech bubble (or null) */
    overhear(s, a, b) {
      const key = 'oh_' + [a.id, b.id].sort().join('_');
      if (s.today.flags[key]) return null;
      s.today.flags[key] = true;
      const pool = (s.rumours || []).filter((r) => !r.heard && r.spread >= 0.05);
      const r = U.pick(pool);
      const text = r ? Gist.hear(s, r) : Gist.filler(s);
      BH.bus.emit('overheard', { a: a.id, b: b.id, rumour: r ? r.id : null });
      return text;
    },

    /* The noticeboard / phone gist list */
    known(s) { return (s.rumours || []).filter((r) => r.heard || r.spread >= 0.4).slice(0, 8); },
    aboutMe(s) { return (s.rumours || []).filter((r) => r.about === 'me').slice(0, 6); },
  };

  BH.registerSystem('Gist', Gist);
})(window.BH);
