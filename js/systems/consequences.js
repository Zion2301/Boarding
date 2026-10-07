/* ConsequenceSystem — one place that turns "what happened" into effects.
   - apply(s, cons, vars): data-driven consequence blocks (missions, dialogue, secrets, world events use these)
   - caught(s, ruleId, watcherId): you got caught breaking a rule (from detection)
   - reputation groups: Teachers, Seniors (= senior favour), Juniors, Coursemates and every House
   Consequence block keys:
     money, favour, clout, groups{teachers,seniors,juniors,coursemates,house}, rel{npcRef:n}, stats{},
     items{id:n} (negative takes), punish{reason, sev, by}, punishNpc, rumour, path{}, knowledge,
     flag, unlock, arcDone, phone, chance{p, …another block} */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const C = () => BH.Content;

  const GROUPS = { teachers: '👩🏾‍🏫 Teachers', seniors: '🎖️ Seniors', juniors: '🧒🏾 Juniors', coursemates: '🤝 Coursemates' };

  const Consequences = {
    GROUPS,

    onNewGame(s) { Consequences.ensure(s); },
    onLoad(s) { Consequences.ensure(s); },
    ensure(s) {
      s.rep = s.rep || { teachers: 50, juniors: 50, coursemates: 50, houses: {} };
      D.HOUSES.forEach((h) => { if (s.rep.houses[h.tag] === undefined) s.rep.houses[h.tag] = 50; });
    },

    /* ---------- reputation ---------- */
    group(s, g) {
      if (g === 'seniors') return s.seniorFavour;
      if (g === 'house') return s.rep.houses[s.player.house.tag];
      return s.rep[g];
    },
    repChange(s, g, n) {
      if (!n) return;
      if (g === 'seniors') { BH.Stats.favour(s, n); return; }
      if (g === 'house') { const t = s.player.house.tag; s.rep.houses[t] = U.clamp(s.rep.houses[t] + n); BH.fx.push('🏠', n, 'House'); return; }
      if (s.rep[g] === undefined) return;
      const before = s.rep[g];
      s.rep[g] = U.clamp(before + n);
      BH.fx.push({ teachers: '👩🏾‍🏫', juniors: '🧒🏾', coursemates: '🤝' }[g] || '⭐', s.rep[g] - before, GROUPS[g]);
    },
    repLabel(v) { return v >= 80 ? 'Adored' : v >= 65 ? 'Liked' : v >= 45 ? 'Neutral' : v >= 30 ? 'Wary' : 'Hated'; },

    /* Resolve "$giver", "role:labourPrefect", "staff:houseMaster", an npc id… to an NPC */
    npc(s, ref, vars = {}) {
      if (!ref) return null;
      if (ref[0] === '$') return BH.NPC.get(s, vars[ref.slice(1)]);
      if (ref.startsWith('role:')) return BH.NPC.senior(s, ref.slice(5)) || BH.NPC.byRole(s, ref.slice(5));
      if (ref.startsWith('staff:')) return BH.Schedule.staff(s, ref.slice(6));
      return BH.NPC.get(s, ref);
    },
    fill(s, text, vars = {}) {
      if (!text) return '';
      return String(text).replace(/\{(\w+)\}/g, (m, k) => {
        if (k === 'name') return s.player.name.split(' ')[0];
        const v = vars[k];
        if (v === undefined) return m;
        if (k === 'subject') return BH.Academics.name(s, v, true);
        const n = BH.NPC.get(s, v);
        return n ? BH.NPC.name(n) : v;
      });
    },

    /* ---------- apply a consequence block ---------- */
    apply(s, cons, vars = {}, opts = {}) {
      if (!cons) return [];
      const notes = [];
      if (cons.chance) { if (Math.random() < cons.chance.p) notes.push(...Consequences.apply(s, Object.assign({}, cons.chance, { p: undefined }), vars)); }
      if (cons.money) BH.Stats.money(s, cons.money);
      if (cons.favour) BH.Stats.favour(s, cons.favour);
      if (cons.clout) BH.Stats.rep(s, cons.clout);
      if (cons.stats) BH.Stats.change(s, cons.stats);
      Object.entries(cons.groups || {}).forEach(([g, n]) => Consequences.repChange(s, g, n));
      Object.entries(cons.rel || {}).forEach(([ref, n]) => BH.NPC.rel(s, Consequences.npc(s, ref, vars), n));
      Object.entries(cons.items || {}).forEach(([id, n]) => { if (n > 0) BH.Inv.add(s, id, n); else BH.Inv.take(s, id, -n); });
      Object.entries(cons.path || {}).forEach(([k, n]) => BH.Paths && BH.Paths.add(s, k, n));
      if (cons.knowledge) {
        const codes = BH.Academics.codes(s);
        U.sample(codes, Math.min(2, codes.length)).forEach((c) => BH.Academics.study(s, c, cons.knowledge, true));
      }
      if (cons.flag) s.flags[cons.flag] = true;
      if (cons.unlock) BH.Missions.unlock(s, cons.unlock);
      if (cons.arcDone) { s.arcs = s.arcs || {}; s.arcs[cons.arcDone] = 'done'; }
      if (cons.phone) BH.Phone.give(s, 70);
      if (cons.rumour) BH.Gist.add(s, Consequences.fill(s, cons.rumour, vars), { about: 'me', valence: cons.valence || 0 });
      if (cons.punishNpc) {
        const t = Consequences.npc(s, cons.punishNpc, vars);
        if (t) { BH.NPC.rel(s, t, -10); notes.push(`${BH.NPC.name(t)} dey kneel for house master office. 😬`); }
      }
      if (cons.excuse && BH.Excuse) {
        const by = Consequences.npc(s, cons.excuse.by, vars);
        BH.Excuse.later(s, { npc: by, offence: Consequences.fill(s, cons.excuse.offence, vars), sev: cons.excuse.sev || 0, kind: cons.excuse.kind || 'assignment' });
      }
      if (cons.punish) {
        const by = Consequences.npc(s, cons.punish.by, vars);
        const reason = Consequences.fill(s, cons.punish.reason, vars);
        const text = cons.punish.sev ? BH.Discipline.offence(s, reason, cons.punish.sev) : BH.Discipline.minor(s, reason);
        notes.push(`${by ? BH.NPC.name(by) + ': ' : ''}"${reason}!" ${text}`);
      }
      return notes;
    },

    /* ---------- getting caught ----------
       Immediate effects (stolen item taken back, contraband seized, waking up) happen now; the punishment waits for
       the excuse conversation (BH.Excuse) when one is possible, otherwise it applies straight away. */
    caught(s, ruleId, watcherId) {
      const r = BH.Rules.def(ruleId);
      if (!r) return;
      const w = BH.NPC.get(s, watcherId);
      const who = w ? BH.NPC.name(w) : 'A prefect';
      const crime = s.world.crime;
      s.world.crime = null;
      s.world.grace = BH.Clock.abs(s) + 20; // nobody catches you twice while you're being marched off
      BH.fx.begin();
      const lenient = r.sev <= 1 && Consequences.group(s, 'teachers') >= 70 && Math.random() < 0.4;
      let seized = '';
      if (crime && crime.item) BH.Inv.take(s, crime.item, crime.n || 1);
      if (r.seize === 'phone' && s.phone && s.phone.has && !s.phone.confiscated) { s.phone.confiscated = true; s.phone.seized++; BH.bus.emit('phone:seized', {}); seized = ' Your phone don enter the confiscation box. 📵'; }
      if (r.seize === 'heater' && BH.Inv.has(s, 'heater')) { BH.Inv.take(s, 'heater', 1); seized = ' Heater: seized. 🔌'; }
      if (s.act && ['sleep', 'lesson', 'hide'].includes(s.act.type)) { BH.Activities.wake(s, 'caught'); }
      BH.Clock.stopWait(s, 'caught');
      BH.bus.emit('caught', { rule: ruleId, npc: watcherId, escort: r.escort || null, lenient });
      BH.log(s, `Caught: ${r.label}`, 'bad');
      const fx0 = BH.fx.end();
      const finish = () => { if (r.escort && BH.World && BH.World.escort) BH.World.escort(r.escort); BH.Save.save(s); };
      if (lenient) {
        Consequences.repChange(s, 'teachers', -1);
        BH.UI && BH.UI.toast(`${who}: "You again? Because you be good student, na warning I go give you. Go!" 😮‍💨${seized}`, 'info');
        return finish();
      }
      const punish = (sev, how) => {
        sev = Math.max(0, Math.min(3, sev === undefined ? r.sev : sev));
        const p = sev ? BH.Discipline.offence(s, r.label, sev) : BH.Discipline.minor(s, r.label);
        Object.entries(r.rep || {}).forEach(([g, n]) => Consequences.repChange(s, g, n));
        if (r.rumour) BH.Gist.add(s, Consequences.fill(s, r.rumour), { about: 'me', valence: -0.3, tags: ['caught', ruleId] });
        if (how === 'principal') BH.Gist.add(s, `${s.player.name.split(' ')[0]} don reach the Principal's office 😬`, { about: 'me', valence: -0.4, tags: ['caught'] });
        BH.Paths && BH.Paths.add(s, 'trouble', sev + 1);
        BH.UI && BH.UI.toast(`🚨 ${who}: ${r.label.toLowerCase()}! ${p}${seized}`, 'bad');
      };
      if (w && BH.Excuse && BH.Excuse.canTalk() && r.sev <= 2) {
        if (seized) BH.UI.toast(seized.trim(), 'bad');
        BH.Excuse.start(s, { npc: w, kind: 'caught', offence: r.label, sev: r.sev, apply: punish, done: finish });
        return;
      }
      punish(r.sev);
      if (fx0.length && BH.UI) BH.UI.toast(fx0.map((f) => `${f.amount > 0 ? '+' : ''}${Math.round(f.amount)}${f.icon}`).join('  '), 'info');
      finish();
    },

    /* Snitching: teachers love it, students hate it */
    snitch(s, target, what) {
      Consequences.repChange(s, 'teachers', 5);
      Consequences.repChange(s, 'coursemates', -6);
      BH.NPC.rel(s, target, -20);
      BH.Paths && BH.Paths.add(s, 'leader', 2);
      BH.Gist.add(s, `${s.player.name.split(' ')[0]} snitch ${BH.NPC.name(target)} for ${what}. Snitch! 🐀`, { about: 'me', valence: -0.6, tags: ['snitch'] });
      BH.bus.emit('snitch', { npc: target.id, what });
    },
  };

  // reputation reacts to things that happen
  BH.bus.on('npc:share', (p, s) => { const n = BH.NPC.get(s, p.id); if (n && n.type === 'junior') Consequences.repChange(s, 'juniors', 1); else if (n && n.type === 'classmate') Consequences.repChange(s, 'coursemates', 1); });
  BH.bus.on('action', (p, s) => { if (p.tag === 'wicked') Consequences.repChange(s, 'juniors', -2); if (p.tag === 'kind') Consequences.repChange(s, 'juniors', 2); });

  BH.registerSystem('Consequences', Consequences);
})(window.BH);
