/* MissionSystem — objectives with deadlines, never rails.
   Templates live in content/missions.json. An instance:
     { id, tpl, status, vars, step, progress, due, title, desc, emoji, type, hints }
   status: offered → active → completed | failed | expired     (or offered → refused | ignored)
   - The player decides how and when. Steps listen to bus events (give, talk, interact, study, attend…),
     so any route that produces the event works (buy the bread, beg for it, steal it, pay a junior).
   - Deadlines are absolute game minutes; when one passes the mission EXPIRES and its consequences apply.
   - Ignoring a call or refusing an offer has consequences too. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const C = () => BH.Content;
  const T = () => C().get('missions').templates;
  const Cons = () => BH.Consequences;

  const ACTIVE = ['active'];
  const LIVE = ['offered', 'active'];

  const Missions = {
    tpl(id) { return T()[id]; },

    onNewGame(s) { s.missions = []; s.arcs = {}; s.unlocked = {}; },
    onLoad(s) {
      s.missions = (s.missions || []).filter((m) => m.tpl && T()[m.tpl]); // drop pre-v5 missions
      s.arcs = s.arcs || {}; s.unlocked = s.unlocked || {};
    },

    /* ---------- creating ---------- */
    resolveVars(s, spec = {}, given = {}) {
      const vars = Object.assign({}, given);
      const N = BH.NPC;
      for (const [k, how] of Object.entries(spec)) {
        if (vars[k]) continue;
        if (how === 'keep') continue;
        let n = null;
        const [kind, arg] = how.split(':');
        if (kind === 'senior') {
          if (arg === 'errand') n = N.errandSenior(s);
          else n = U.pick(s.npcs.seniors);
        } else if (kind === 'role') n = N.senior(s, arg) || N.byRole(s, arg);
        else if (kind === 'arch') n = N.byArch(s, arg);
        else if (kind === 'staff') n = BH.Schedule.staff(s, arg);
        else if (kind === 'crush') n = N.crush(s);
        else if (kind === 'friend') {
          const pool = s.npcs.classmates.filter((c) => c.rel >= 50 && (arg !== 'same' || c.gender === s.player.gender));
          n = U.pick(pool);
        } else if (kind === 'classmate') {
          const pool = s.npcs.classmates.filter((c) => (arg === 'fine' ? c.arch === 'fine' && c.gender !== s.player.gender : arg === 'stranger' ? c.rel < 50 && c.arch !== 'bully' : true) && c.id !== vars.giver);
          n = U.pick(pool);
        } else if (kind === 'teacher') n = U.pick(s.npcs.teachers);
        else if (kind === 'junior') n = N.randomJunior(s);
        if (!n) return null;
        vars[k] = n.id;
      }
      return vars;
    },

    create(s, tplId, opts = {}) {
      const t = T()[tplId];
      if (!t) return null;
      const prev = opts.prev;
      const given = Object.assign({}, opts.vars || {}, prev ? prev.vars : {});
      const vars = Missions.resolveVars(s, t.vars, given);
      if (!vars) return null;
      const m = {
        id: U.uid(), tpl: tplId, status: 'offered', vars, step: 0, progress: 0, due: null,
        type: t.type, emoji: t.emoji, arc: t.arc || null, offeredAt: BH.Clock.abs(s),
        title: Cons().fill(s, t.title, vars), desc: Cons().fill(s, t.desc, vars), hints: t.hints || [],
      };
      s.missions.push(m);
      return m;
    },

    /* Assign straight away (chores, assignments, secrets, arc stages) */
    assign(s, tplId, opts = {}) {
      const m = Missions.create(s, tplId, opts);
      if (!m) return null;
      Missions.accept(s, m, { quiet: opts.quiet });
      return m;
    },

    /* A giver comes to find you; it's an offer until you accept, refuse or ignore it */
    offerCall(s, tplId) {
      const m = Missions.create(s, tplId);
      if (!m) return null;
      const giver = m.vars.giver;
      BH.WorldSim.call(s, { kind: 'mission', mid: m.id, npc: giver, text: `${BH.NPC.name(BH.NPC.get(s, giver))} dey call you!`, minutes: 45 });
      return m;
    },

    accept(s, m, opts = {}) {
      const t = T()[m.tpl];
      m.status = 'active';
      m.due = Missions.deadline(s, t.deadline);
      Cons().apply(s, t.onAccept, m.vars);
      Missions.plant(s, m);
      BH.log(s, `Mission: ${m.title}`, 'info');
      if (!opts.quiet) BH.UI && BH.UI.toast(`${m.emoji} New mission: ${m.title} ⏱ ${BH.Clock.timeLabel(m.due % 1440)}`, 'info');
      BH.bus.emit('mission:accepted', { id: m.id, tpl: m.tpl });
      BH.Store && BH.Store.changed();
    },
    refuse(s, m) { Missions.close(s, m, 'refused', 'refuse'); },
    ignore(s, m) { Missions.close(s, m, 'ignored', 'ignore'); },

    complete(s, m) {
      if (m.status !== 'active') return;
      const t = T()[m.tpl];
      Missions.close(s, m, 'completed', 'reward');
      s.stats_history.missionsDone++;
      if (t.reward && t.reward.assignment !== undefined) BH.Academics.submitAssignment(s, m.vars.subject, true);
      BH.UI && BH.UI.toast(`${m.emoji} Mission complete: ${m.title}`, 'good', true);
      if (t.next) Missions.assign(s, t.next, { prev: m });
    },
    fail(s, m, why = 'fail') {
      if (!LIVE.includes(m.status)) return;
      const t = T()[m.tpl];
      Missions.close(s, m, why === 'expire' ? 'expired' : 'failed', t.expire && why === 'expire' ? 'expire' : 'fail');
      if (t.fail && t.fail.assignment === false) BH.Academics.submitAssignment(s, m.vars.subject, false);
      BH.UI && BH.UI.toast(`${why === 'expire' ? '⌛ Time up' : '❌ Failed'}: ${m.title}`, 'bad');
    },
    close(s, m, status, consKey) {
      const t = T()[m.tpl];
      m.status = status;
      m.closedAt = BH.Clock.abs(s);
      BH.fx.begin();
      const notes = Cons().apply(s, t[consKey], m.vars);
      const fx = BH.fx.end();
      if (notes.length) BH.UI && BH.UI.toast(notes.join(' '), 'bad');
      if (fx.length && BH.UI) BH.UI.toast(fx.map((f) => `${f.amount > 0 ? '+' : ''}${Math.round(f.amount)}${f.icon}`).join('  '), 'info');
      BH.World && BH.WorldSim.dropCall(s, m.id);
      BH.log(s, `${m.title}: ${status}`, status === 'completed' ? 'good' : 'bad');
      BH.bus.emit('mission:' + status, { id: m.id, tpl: m.tpl });
      BH.Store && BH.Store.changed();
    },

    /* Secret missions found by exploring or overhearing */
    unlock(s, tplId) {
      s.unlocked = s.unlocked || {};
      if (s.unlocked[tplId] || !T()[tplId]) return;
      s.unlocked[tplId] = true;
      const m = Missions.create(s, tplId);
      if (!m) return;
      Missions.accept(s, m, { quiet: true });
      BH.UI && BH.UI.toast(`🤫 Secret mission discovered: ${m.title}`, 'good', true);
    },

    /* ---------- deadlines ---------- */
    deadline(s, d = {}) {
      const now = BH.Clock.abs(s);
      const base = s.time.dayCount * 1440;
      const at = (hhmm, dayOffset = 0) => base + dayOffset * 1440 + BH.Clock.toMin(hhmm);
      if (d.mins) return now + d.mins;
      if (d.before) { const w = BH.Clock.window(s, d.before); if (w && base + w.end > now) return base + w.end; return base + 23 * 60 + 30; }
      if (d.days) return at(d.at || '21:00', d.days);
      if (d.dow !== undefined) { let ahead = (d.dow - s.time.dow + 7) % 7; let t = at(d.at || '18:00', ahead); if (t <= now) t += 7 * 1440; return t; }
      if (d.at) { let t = at(d.at); while (t <= now) t += 1440; return t; }
      return base + 23 * 60 + 30;
    },
    left(s, m) { return m.due - BH.Clock.abs(s); },

    /* ---------- daily generation ---------- */
    onNewDay(s) {
      const now = BH.Clock.abs(s);
      s.missions = s.missions.filter((m) => LIVE.includes(m.status) || now - (m.closedAt || 0) < 1440);
      const kind = s.time.dayType;
      const cfg = C().get('missions').daily;
      const fits = (t) => (t.days || []).includes(kind) && (t.when ? BH.Interaction.test(s, t.when) : true);
      const pool = (filter) => Object.entries(T()).filter(([, t]) => t.offer === 'auto' && t.weight > 0 && fits(t) && filter(t));
      const has = (id) => s.missions.some((m) => m.tpl === id && LIVE.includes(m.status));
      // one chore (juniors), then a few dailies
      const chore = U.weighted(pool((t) => t.group === 'chore'), ([, t]) => t.weight);
      if (chore && cfg.chores) Missions.assign(s, chore[0], { quiet: true });
      let n = 0;
      U.shuffle(pool((t) => t.group !== 'chore')).sort((a, b) => b[1].weight - a[1].weight).forEach(([id]) => {
        if (n >= cfg.auto || has(id)) return;
        if (Missions.assign(s, id, { quiet: true })) n++;
      });
      // story arcs start when their conditions are met
      Object.entries(T()).forEach(([id, t]) => {
        if (t.arc && t.offer === 'auto' && t.when && !s.arcs[t.arc] && fits(t)) { s.arcs[t.arc] = 'started'; Missions.assign(s, id); }
      });
    },

    /* ---------- progress ---------- */
    active(s) { return (s.missions || []).filter((m) => ACTIVE.includes(m.status)); },
    live(s) { return (s.missions || []).filter((m) => LIVE.includes(m.status)); },
    step(m) { const t = T()[m.tpl]; return t && t.steps[m.step]; },
    stepLabel(s, m) { const st = Missions.step(m); return st ? Cons().fill(s, st.label, m.vars) : ''; },

    advance(s, m, by = 1) {
      const st = Missions.step(m);
      if (!st) return;
      m.progress += by;
      if (m.progress < (st.n || 1)) { BH.Store && BH.Store.changed(); return; }
      m.step++; m.progress = 0;
      if (m.step >= T()[m.tpl].steps.length) Missions.complete(s, m);
      else { Missions.plant(s, m); BH.UI && BH.UI.toast(`${m.emoji} Next: ${Missions.stepLabel(s, m)}`, 'info'); }
      BH.Store && BH.Store.changed();
    },

    matches(s, m, st, evt, p) {
      const ref = (r) => (r && r[0] === '$' ? m.vars[r.slice(1)] : r && r.startsWith && r.startsWith('staff:') ? (BH.Schedule.staff(s, r.slice(6)) || {}).id : r);
      switch (st.type) {
        case 'give': return evt === 'npc:give' && p.item === st.item && p.npc === ref(st.to) ? (p.n || 1) : 0;
        case 'talk': return evt === 'npc:talk' && p.npc === ref(st.to) ? 1 : 0;
        case 'interact': return evt === 'interact' && p.action === st.action && (!st.kind || p.kind === st.kind) ? 1 : 0;
        case 'earn': return evt === 'hustle:sale' ? p.price : 0;
        case 'find': return evt === 'found' && p.item === st.item ? 1 : 0;
        case 'event': {
          if (evt !== st.event) return 0;
          const ok = Object.entries(st.match || {}).every(([k, v]) => p[k] === (typeof v === 'string' && v[0] === '$' ? m.vars[v.slice(1)] : v));
          return ok ? 1 : 0;
        }
        case 'avoid': {
          if (evt !== st.event) return 0;
          return Object.entries(st.match || {}).every(([k, v]) => p[k] === (typeof v === 'string' && v[0] === '$' ? m.vars[v.slice(1)] : v)) ? -1 : 0;
        }
        default: return 0;
      }
    },

    onEvent(evt, p, s) {
      if (!s || !s.missions) return;
      Missions.active(s).forEach((m) => {
        const st = Missions.step(m);
        if (!st) return;
        const r = Missions.matches(s, m, st, evt, p);
        if (r < 0) Missions.fail(s, m);
        else if (r > 0) {
          if (st.type === 'give') { m.progress += r - 1; }
          if (st.type === 'earn') { m.progress += r; if (m.progress >= st.amount) { m.progress = (st.n || 1) - 1; Missions.advance(s, m); } else BH.Store && BH.Store.changed(); return; }
          Missions.advance(s, m);
        }
      });
    },

    /* deadlines + polled steps (visit, stat) every minute */
    onMinute(s) {
      const now = BH.Clock.abs(s);
      (s.missions || []).forEach((m) => {
        if (m.status !== 'active') return;
        const st = Missions.step(m);
        if (st && st.type === 'visit' && Missions.visiting(s, st)) Missions.advance(s, m);
        if (st && st.type === 'stat' && Missions.statOk(s, st)) Missions.advance(s, m);
        if (m.status === 'active' && now >= m.due) {
          if (st && st.type === 'avoid') Missions.advance(s, m);
          else Missions.fail(s, m, 'expire');
        }
      });
    },
    visiting(s, st) {
      if (st.window) {
        const m = BH.Clock.mod(s);
        if (m < BH.Clock.toMin(st.window[0]) || m > BH.Clock.toMin(st.window[1])) return false;
      }
      if (st.map && s.world.map !== st.map) return false;
      if (st.object) {
        const o = Missions.objectByTag(st.object);
        if (!o || s.world.map !== 'campus' || !s.pos) return false;
        return Math.hypot(o.x - s.pos.x, o.y - s.pos.y) < (o.r || 60) + 20;
      }
      return true;
    },
    objectByTag(tag) { return BH.Content.compile('campus').objects.find((o) => o.secret === tag); },
    statOk(s, st) {
      const [a, b] = st.path.split('.');
      const v = a === 'rep' ? BH.Consequences.group(s, b) : a === 'stats' ? s.stats[b] : s[a];
      return v >= st.min;
    },

    /* 'find' steps hide the item somewhere real (a bunk in a hostel…) */
    plant(s, m) {
      const st = Missions.step(m);
      if (!st || st.type !== 'find' || m.vars._plant) return;
      const thief = m.vars.thief && BH.NPC.get(s, m.vars.thief);
      let map = st.plant.map;
      if (map === '$hostel') map = BH.Schedule.myHostel(s);
      if (map === '$thiefHostel') map = thief ? BH.Schedule.hostelOf(thief.gender) : BH.Schedule.myHostel(s);
      const cm = BH.Content.compile(map);
      let objs = cm.objects.filter((o) => o.kind === st.plant.kind);
      if (st.plant.owner) {
        const owner = m.vars[st.plant.owner.slice(1)];
        const own = objs.filter((o) => (BH.Schedule.owner(s, map, o.id) || {}).id === owner);
        if (own.length) objs = own;
      }
      const o = U.pick(objs);
      if (o) m.vars._plant = { map, obj: o.id, item: st.item };
    },
    /* Searching an object: is a mission item planted here? */
    takePlanted(s, map, objId) {
      const m = Missions.active(s).find((x) => x.vars._plant && x.vars._plant.map === map && x.vars._plant.obj === objId && Missions.step(x) && Missions.step(x).type === 'find');
      if (!m) return null;
      const item = m.vars._plant.item;
      BH.Inv.add(s, item, 1);
      BH.bus.emit('found', { item, mission: m.id });
      return item;
    },

    /* For interactable conditions: is there an active mission whose current step is tagged so? */
    hasTag(s, tag) {
      return Missions.active(s).some((m) => { const st = Missions.step(m); return st && (st.tag === tag || st.action === tag); });
    },

    /* ---------- conversations ---------- */
    talkOptions(s, n) {
      const out = [];
      const t = T();
      // pay someone to fetch what a mission needs (a junior if you're a senior, or the class hustler)
      if ((n.type === 'junior' && s.time.year >= 4) || n.arch === 'hustler') {
        Missions.active(s).forEach((m) => {
          const st = Missions.step(m);
          if (!st || st.type !== 'give' || BH.Inv.has(s, st.item, st.n || 1) || !D.ITEMS[st.item].price) return;
          const it = D.ITEMS[st.item];
          const price = Math.round((it.price * (st.n || 1) * 1.5) / 10) * 10;
          out.push({
            label: `💸 Pay ${U.money(price)}: "Abeg get me ${it.name}"`, sub: `For: ${m.title}`, disabled: s.money < price ? 'Not enough money' : null,
            run: () => {
              BH.Stats.money(s, -price); BH.Inv.add(s, st.item, st.n || 1); BH.NPC.rel(s, n, 2);
              if (n.type === 'junior') BH.bus.emit('action', { tag: 'wicked' });
              return `${n.first} run go and come back with ${it.name}. ${n.type === 'junior' ? '"Senior, here!"' : '"Business is business." 😏'} 🏃`;
            },
          });
        });
      }
      // deliver items / finish talk steps / arc choices
      Missions.active(s).forEach((m) => {
        const st = Missions.step(m);
        const def = t[m.tpl];
        if (!st) return;
        if (st.type === 'give' && m.vars[st.to.slice(1)] === n.id) {
          const have = BH.Inv.count(s, st.item);
          out.push({
            label: `🎁 Give ${D.ITEMS[st.item].name}${(st.n || 1) > 1 ? ` ×${st.n}` : ''}`, sub: `Mission: ${m.title}`,
            disabled: have < (st.n || 1) ? `You need ${st.n || 1} ${D.ITEMS[st.item].name}` : null,
            run: () => {
              BH.Inv.take(s, st.item, st.n || 1);
              BH.bus.emit('npc:give', { npc: n.id, item: st.item, n: st.n || 1 });
              return U.pick([`${BH.NPC.name(n)} collect am: "Ehen. Good."`, `${BH.NPC.name(n)}: "You try. Next time, faster."`, `${BH.NPC.name(n)} nod. Mission sorted. ✅`]);
            },
          });
        }
        if (st.type === 'choice') {
          (def.talk || []).forEach((opt) => {
            const ref = opt.to[0] === '$' ? m.vars[opt.to.slice(1)] : opt.to.startsWith('staff:') ? (BH.Schedule.staff(s, opt.to.slice(6)) || {}).id : null;
            if (ref !== n.id) return;
            out.push({
              label: Cons().fill(s, opt.label, m.vars), sub: `Mission: ${m.title}`,
              disabled: opt.needs && !BH.Inv.has(s, opt.needs) ? `You need ${D.ITEMS[opt.needs].name}` : null,
              run: () => {
                const notes = Cons().apply(s, opt.cons, m.vars);
                if (opt.complete) Missions.advance(s, m); else if (opt.fail) Missions.fail(s, m);
                return [Cons().fill(s, (opt.cons && opt.cons.rumour) || 'Done.', m.vars), ...notes].join(' ');
              },
            });
          });
        }
      });
      // offers: a mission call from this NPC, or "any work?" from people who give talk-missions
      Missions.live(s).filter((m) => m.status === 'offered' && m.vars.giver === n.id).forEach((m) => out.push(Missions.offerOption(s, m)));
      Object.entries(t).forEach(([id, def]) => {
        if (def.offer !== 'talk' || !(def.days || []).includes(s.time.dayType)) return;
        if (s.today.flags['offer_' + id] || s.missions.some((m) => m.tpl === id && LIVE.includes(m.status))) return;
        if (!Missions.giverFits(s, def.vars && def.vars.giver, n)) return;
        if (def.when && !BH.Interaction.test(s, def.when.filter((w) => w !== 'friend'))) return;
        if ((def.when || []).includes('friend') && n.rel < 50) return;
        out.push({
          label: def.talkLabel || '🙋 "Anything I fit help with?"', sub: `${def.emoji} ${def.type} job`,
          keepOpen: true,
          run: () => {
            s.today.flags['offer_' + id] = true;
            const m = Missions.create(s, id, { vars: { giver: n.id } });
            if (!m) return `${BH.NPC.name(n)}: "Nothing for now."`;
            return { offer: m };
          },
        });
      });
      return out;
    },
    giverFits(s, spec, n) {
      if (!spec) return false;
      const [kind, arg] = spec.split(':');
      if (kind === 'staff') return n.type === 'staff' && n.role === arg;
      if (kind === 'arch') return n.arch === arg || (arg === 'brilliant' && n.persona === 'bookish');
      if (kind === 'friend') return n.type === 'classmate' && n.rel >= 50 && (arg !== 'same' || n.gender === s.player.gender);
      if (kind === 'role') return n.role === arg;
      if (kind === 'senior') return n.type === 'senior';
      return false;
    },
    /* The accept / refuse choice for an offered mission (shown inside the conversation) */
    offerOption(s, m) {
      return { label: `📜 ${m.title}`, sub: 'They want something from you', keepOpen: true, run: () => ({ offer: m }) };
    },

    /* ---------- HUD / waypoints ---------- */
    target(s, m) {
      const st = Missions.step(m);
      if (!st) return null;
      const npcRef = st.to || (st.type === 'choice' && (T()[m.tpl].talk || [])[0] && T()[m.tpl].talk[0].to);
      if (npcRef && npcRef !== 'self') {
        const n = Cons().npc(s, npcRef, m.vars);
        if (n) { const p = BH.Schedule.where(s, n); return { npc: n.id, map: p.map, key: p.key }; }
      }
      if (st.type === 'find' && m.vars._plant) return { map: m.vars._plant.map, obj: m.vars._plant.obj };
      if (st.type === 'visit' && st.object) return { map: 'campus', object: st.object };
      if (st.type === 'interact') {
        const kindMap = { sweep: BH.Schedule.myHostel(s), clean: BH.Schedule.myHostel(s), fill: BH.Schedule.myHostel(s), washPlates: 'tap', grass: 'field', train: 'field', compete: 'field', dance: 'assembly', assignment: 'library', steal: 'staff' };
        const k = kindMap[st.action];
        if (k) { const L = D.CAMPUS.LOCATIONS[k]; return { map: L && L.kind === 'b' ? k : 'campus', key: k }; }
      }
      if (st.type === 'event' && st.event === 'study') return { map: 'library', key: 'library' };
      if (st.type === 'event' && st.event === 'meal') return { map: 'dining', key: 'dining' };
      if (st.type === 'event' && st.event === 'inspection') return { map: 'campus', key: 'assembly' };
      if (st.type === 'event' && st.event === 'action') return { map: 'admin', key: 'admin' };
      if (st.type === 'event' && st.event === 'sleep') return { map: BH.Schedule.myHostel(s), key: BH.Schedule.myHostel(s) };
      if (st.type === 'earn') return { map: 'tuckshop', key: 'tuckshop' };
      return null;
    },
  };

  BH.bus.on('*', (evt, p, s) => Missions.onEvent(evt, p, s));

  BH.registerSystem('Missions', Missions);
})(window.BH);
