/* Detection & overhearing on actors (ported from the 2D scene). Produces BH.Sim.cones for the renderer:
   [{ x, y, h, range, half, hot }] — yellow when someone is watching, red when they can see you breaking a rule. */
(function (BH) {
  const U = BH.U;
  const A = () => BH.Actors;
  const angDiff = (a, b) => Math.abs(BH.SimUtil.angDiff(a, b));

  const Detect = {
    ruleT: 0, broken: [], spotted: {}, overT: 0,

    detect(dt) {
      const s = BH.Game.s;
      const Sim = BH.Sim;
      const v = BH.Rules.vision();
      Detect.ruleT -= dt;
      if (Detect.ruleT <= 0) { Detect.ruleT = 0.25; Detect.broken = BH.Rules.active(s); if (s.act && s.act.type === 'lesson') Detect.broken = Detect.broken.filter((r) => r !== 'sleepingInClass'); }
      const pl = A().player();
      const hidden = BH.Rules.hidden(s);
      const dark = Sim.cm.outdoor && BH.Clock.isDark(s);
      const range = dark ? (BH.Inv.has(s, 'torch') ? v.nightRange + 40 : v.nightRange) : v.range;
      const half = (v.angle * Math.PI) / 180 / 2;
      const showCones = Detect.broken.length > 0 || dark;
      const nowAbs = BH.Clock.abs(s);
      let seer = null;
      const cones = [];
      A().list.forEach((a) => {
        if (a.kind !== 'npc' || !a.auth || a.leaving) return;
        const dx = pl.x - a.x, dy = pl.y - a.y, d = Math.hypot(dx, dy);
        if (d > range * 1.8) return;
        const inCone = d < range && angDiff(Math.atan2(dy, dx), a.h) < half && !BH.Nav.losBlocked(Sim.mapId, a, pl);
        if (showCones && d < 700) cones.push({ x: a.x, y: a.y, h: a.h, range, half, hot: inCone && Detect.broken.length > 0 });
        if (!inCone || hidden) return;
        if (!Detect.spotted[a.npcId] || Detect.spotted[a.npcId] < nowAbs) {
          Detect.spotted[a.npcId] = nowAbs + 15;
          const n = BH.NPC.get(s, a.npcId);
          BH.bus.emit('spotted', { npc: a.npcId, role: (n && (n.role || n.type)) || '' });
        }
        const rule = BH.Rules.caresAbout(s, a.auth.kind, Detect.broken);
        if (rule && (!seer || d < seer.dist)) seer = { id: a.npcId, dist: d, rule, strict: a.auth.strict, a };
      });
      Sim.cones = cones;
      const before = (s.world.sus && s.world.sus.level) || 0;
      const r = BH.Rules.watch(s, dt, seer);
      if (seer && before < 0.05 && s.world.sus.level > 0) BH.SimNPC.say(seer.a, U.pick(['"Hmm? Who be that?"', '"Wait… you there!"', '"Ehen?"']), 1800);
      if (r === 'caught' && seer) BH.SimNPC.say(seer.a, '"Ehen! I don catch you!"', 2500);
      // fellow students who see you stealing gossip about it
      const crime = s.world.crime;
      if (crime && crime.rule === 'stealing' && !crime.witnessed && !hidden) {
        for (const a of A().list.values()) {
          if (a.kind !== 'npc' || a.auth) continue;
          const n = BH.NPC.get(s, a.npcId);
          if (!n || !['classmate', 'junior', 'senior'].includes(n.type)) continue;
          if (Math.hypot(pl.x - a.x, pl.y - a.y) < 150 && !BH.Nav.losBlocked(Sim.mapId, a, pl)) {
            crime.witnessed = true;
            BH.SimNPC.say(a, '"I see you o! 👀"');
            BH.Gist.add(s, `${n.first} see ${s.player.name.split(' ')[0]} dey thief 👀`, { about: 'me', valence: -0.5, tags: ['stealing'] });
            BH.NPC.rel(s, n, -4);
            break;
          }
        }
      }
    },

    /* two idle students gisting near you → you overhear */
    overhear(dt) {
      Detect.overT -= dt;
      if (Detect.overT > 0) return;
      Detect.overT = 1.5;
      const s = BH.Game.s;
      const pl = A().player();
      const idle = [...A().list.values()].filter((a) => a.kind === 'npc' && !a.path.length && !a.leaving && !a.auth && !a.hidden);
      for (let i = 0; i < idle.length; i++) {
        for (let j = i + 1; j < idle.length; j++) {
          const a = idle[i], b = idle[j];
          if (Math.hypot(a.x - b.x, a.y - b.y) > 90) continue;
          if (Math.hypot(pl.x - (a.x + b.x) / 2, pl.y - (a.y + b.y) / 2) > 130) continue;
          const na = BH.NPC.get(s, a.npcId), nb = BH.NPC.get(s, b.npcId);
          if (!na || !nb || !['classmate', 'senior', 'junior'].includes(na.type)) continue;
          const line = BH.Gist.overhear(s, na, nb);
          if (line) { BH.SimNPC.say(a, `🗣️ ${line}`, 5000); a.emote = { anim: 'talk', until: performance.now() + 4000 }; return; }
        }
      }
    },
  };

  BH.SimDetect = Detect;
})(window.BH);
