/* Arcs — optional story threads (content/arcs.json), triggered by your choices, relationships and stats, never a
   fixed path (GAME_DESIGN.md §6). A beat waits for its window (year/term/week/blocks) and conditions, then either
   comes to find you (how: "call" — the character walks up; ignore it and that is remembered too) or plays as a
   scene (how: "scene"). Choices change bonds, write the ledger, move arc states, decide endings and exits.
   At most one big beat a day. Lines can call back to the past: {when:snitched_on} → "in JSS2 (term 1)". */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const N = () => BH.NPC;
  const St = () => BH.Story;
  const beats = () => (BH.Content.get('arcs') || { beats: [] }).beats;
  const inRange = (v, r) => r === undefined || (Array.isArray(r) ? v >= r[0] && v <= r[1] : v === r);

  const Arcs = {
    onNewGame(s) { Arcs.ensure(s); },
    onLoad(s) { Arcs.ensure(s); },
    ensure(s) {
      St().ensure(s); s.story.done = s.story.done || {};
      // every beat is a regular event, so a pending story call survives saving and loading
      if (!Arcs.registered) { beats().forEach((b) => { BH.Events.EVENTS['arc_' + b.id] = Arcs.toEvent(b); }); Arcs.registered = true; }
    },
    state(s, id) { return (s.story.arcs[id] || {}).state || null; },
    setState(s, id, state) { s.story.arcs[id] = Object.assign(s.story.arcs[id] || {}, { state, at: St().stamp(s) }); },

    /* ---------- conditions ---------- */
    test(s, cond, b) {
      if (!cond) return true;
      if (cond[0] === '!') return !Arcs.test(s, cond.slice(1), b);
      const m = cond.match(/^(rel|trust|rivalry|respect|crush):(\w+)(>=|<=|>|<)(\d+)$/);
      if (m) {
        const n = N().get(s, m[2] === 'char' ? b.char : m[2]);
        if (!n) return false;
        const v = m[1] === 'rel' ? n.rel : (n[m[1]] || 0), x = Number(m[4]);
        return m[3] === '>=' ? v >= x : m[3] === '<=' ? v <= x : m[3] === '>' ? v > x : v < x;
      }
      const [k, a, c] = cond.split(':');
      const who = (x) => (x === 'char' ? b.char : x);
      switch (k) {
        case 'ledger': return St().has(s, a, c ? who(c) : undefined);
        case 'arc': { const [id, st] = a.split('='); return st === undefined ? !!Arcs.state(s, who(id)) : Arcs.state(s, who(id)) === st; }
        case 'done': return !!s.story.done[a];
        case 'present': return !!N().get(s, who(a));
        case 'bestie': return St().isBestie(s, who(a));
        case 'gender': return s.player.gender === a;
        case 'religion': return s.player.religion === a;
        case 'stat': { const mm = a.match(/^(\w+)(<|>)(\d+)$/); return mm ? (mm[2] === '<' ? s.stats[mm[1]] < +mm[3] : s.stats[mm[1]] > +mm[3]) : false; }
        case 'money': return s.money >= Number(a);
        case 'pos': { const r = (s.reports || [])[s.reports.length - 1]; return !!r && r.position <= Number(a); }
        case 'dept': return (s.academics.dept || '') === a;
        case 'senior': return s.time.year >= 4;
        default: return BH.Interaction.test(s, cond);
      }
    },
    /* is this beat's window open today (ignoring the time of day)? */
    windowOpen(s, b) {
      if (s.story.done[b.id]) return false;
      if (b.char && !N().get(s, b.char)) return false;
      if (!inRange(s.time.year, b.year) || !inRange(s.time.term, b.term) || !inRange(s.time.week, b.week)) return false;
      if (b.dayType && ![].concat(b.dayType).includes(s.time.dayType)) return false;
      if (b.dow !== undefined && ![].concat(b.dow).includes(s.time.dow)) return false;
      if (!(b.when || []).every((c) => Arcs.test(s, c, b))) return false;
      if (b.chance !== undefined && (U.hash(b.id + s.time.dayCount) % 100) / 100 >= b.chance) return false;
      return true;
    },
    ready(s, b) {
      if (!Arcs.windowOpen(s, b)) return false;
      const bl = BH.Time.block(s), id = BH.Time.blockId(s);
      const blocks = b.blocks || ['free', 'hostel', 'meal'];
      return blocks.includes(bl.kind) || blocks.includes(id);
    },
    dueToday(s) { Arcs.ensure(s); return s.story.beatDay !== s.time.dayCount && beats().some((b) => Arcs.windowOpen(s, b)); },
    nextToday(s) {
      if (!Arcs.dueToday(s)) return null;
      const times = BH.Clock.times(s), sched = BH.Time.schedule(s);
      for (let i = s.time.block + 1; i < sched.length; i++) if (['free', 'hostel', 'meal'].includes(D.BLOCKS[sched[i]].kind)) return { at: times[i], why: 'something is about to happen', emoji: '✨' };
      return null;
    },

    /* ---------- running ---------- */
    onBlockStart(s) { Arcs.check(s); },
    onMinute(s) { if (s.clock % 15 === 0) Arcs.check(s); },
    check(s) {
      Arcs.ensure(s);
      if (BH.Pacing && BH.Pacing.simulating) return;
      if (s.queue.length || (s.world.calls || []).some((c) => String(c.id).startsWith('arc_'))) return;
      if (BH.Onboarding && BH.Onboarding.active(s)) return;
      const todays = s.story.beatDay === s.time.dayCount;
      const due = beats().filter((b) => (!todays || b.small) && Arcs.ready(s, b)).sort((a, b) => (b.priority || 5) - (a.priority || 5));
      if (due.length) Arcs.start(s, due[0]);
    },
    start(s, b) {
      const id = 'arc_' + b.id;
      BH.Events.EVENTS[id] = Arcs.toEvent(b);
      s.story.done[b.id] = 'started';
      if (b.milestone && BH.Milestones) BH.Milestones.trigger(s, b.milestone);
      if (!b.small) s.story.beatDay = s.time.dayCount;
      if (b.how === 'scene' || !b.char) { s.queue.push({ id, ctx: { npc: b.char } }); BH.Clock.stopWait(s, 'event'); }
      else BH.WorldSim.call(s, { kind: 'event', id, ctx: { npc: b.char }, npc: b.char, text: `${b.emoji || '✨'} ${b.title}`, minutes: b.minutes || 90 });
    },
    /* build a regular event (dialogue card) from a beat */
    toEvent(b) {
      return {
        forced: b.how === 'scene', emoji: b.emoji || '✨', title: b.title,
        text: (s) => Arcs.fill(s, b.text, b),
        choices: (s) => (b.choices || [{ label: 'OK' }]).filter((c) => !c.when || c.when.every((x) => Arcs.test(s, x, b))).map((c) => ({
          label: Arcs.fill(s, c.label, b), sub: c.sub ? Arcs.fill(s, c.sub, b) : '',
          run: (st) => Arcs.choose(st, b, c),
        })),
        onIgnore: (s) => Arcs.ignore(s, b),
      };
    },
    choose(s, b, c) {
      s.story.done[b.id] = c.id || c.label;
      s.story.choices = (s.story.choices || 0) + 1;
      (s.story.beatLog = s.story.beatLog || []).push({ id: b.id, at: St().stamp(s), emoji: b.emoji || '✨', title: Arcs.fill(s, b.title, b) });
      const notes = Arcs.apply(s, c.fx || {}, b);
      BH.bus.emit('arc:choice', { beat: b.id, choice: c.id || c.label });
      return [Arcs.fill(s, c.reply || '', b), ...notes].filter(Boolean).join('\n\n');
    },
    ignore(s, b) {
      s.story.done[b.id] = 'ignored';
      const ig = b.ignore || { fx: { rel: -3, note: ['ignored'] }, text: '{name} waited for you, then left. They noticed.' };
      Arcs.apply(s, ig.fx || {}, b);
      return Arcs.fill(s, ig.text || '', b);
    },

    /* a choice that starts a game with the character (Whot under the bunk, a race on the field) */
    play(s, game, b) {
      const n = N().get(s, b.char);
      if (game === 'whot' && BH.Games && BH.Games.whot) BH.Games.whot.startOffline(2, n ? [n] : []);
      else if (BH.Games && BH.Games[game] && BH.Games[game].start) BH.Games[game].start();
    },

    /* ---------- outcomes ---------- */
    apply(s, fx, b) {
      const out = [];
      const target = (k) => N().get(s, k === 'char' || !k ? b.char : k);
      const bonds = {};
      ['rel', 'trust', 'rivalry', 'respect', 'crush'].forEach((dim) => {
        const v = fx[dim];
        if (v === undefined) return;
        (typeof v === 'number' ? [[b.char, v]] : Object.entries(v)).forEach(([id, d]) => { const n = target(id); if (n) { (bonds[n.id] = bonds[n.id] || {})[dim] = d; } });
      });
      Object.entries(bonds).forEach(([id, d]) => St().bond(s, N().get(s, id), d));
      if (fx.stats) BH.Stats.change(s, fx.stats);
      if (fx.money) BH.Stats.money(s, fx.money);
      if (fx.clout) BH.Stats.rep(s, fx.clout);
      if (fx.favour) BH.Stats.favour(s, fx.favour);
      if (fx.rep) Object.entries(fx.rep).forEach(([g, v]) => BH.Consequences.repChange(s, g, v));
      if (fx.items) Object.entries(fx.items).forEach(([id, n]) => BH.Inv.add(s, id, n));
      if (fx.take) Object.entries(fx.take).forEach(([id, n]) => BH.Inv.take(s, id, n));
      if (fx.knowledge) Object.entries(fx.knowledge).forEach(([code, n]) => BH.Academics.study(s, code === 'any' ? U.pick(BH.Academics.codes(s)) : code, n, true));
      if (fx.path) Object.entries(fx.path).forEach(([p, n]) => BH.Paths && BH.Paths.add(s, p, n));
      (fx.note || []).forEach((k) => (typeof k === 'string' ? St().note(s, k, b.char) : St().note(s, k.k, k.who === 'char' ? b.char : k.who || null)));
      if (fx.arc) (typeof fx.arc === 'string' ? [[b.char, fx.arc]] : Object.entries(fx.arc)).forEach(([id, st]) => Arcs.setState(s, id === 'char' ? b.char : id, st));
      if (fx.end) (typeof fx.end === 'string' ? [[b.char, fx.end]] : Object.entries(fx.end)).forEach(([id, e]) => { const k = id === 'char' ? b.char : id; s.story.arcs[k] = Object.assign(s.story.arcs[k] || {}, { end: e }); });
      if (fx.flag) [].concat(fx.flag).forEach((f) => { s.flags[f] = true; });
      if (fx.bestie && b.char) s.story.bestie = b.char;
      if (fx.discipline) out.push(BH.Discipline.minor(s, fx.discipline));
      if (fx.offence) out.push(BH.Discipline.offence(s, fx.offence.what, fx.offence.sev || 1));
      if (fx.leave) (typeof fx.leave === 'string' ? [[b.char, fx.leave]] : Object.entries(fx.leave)).forEach(([id, why]) => { const k = id === 'char' ? b.char : id; const n = N().get(s, k); if (n) { N().leave(s, k, why); out.push(`📦 ${n.first} ${why}.`); } });
      if (fx.prefect) Object.entries(fx.prefect).forEach(([id, role]) => { const n = target(id); if (!n) return; s.npcs.classmates.forEach((c) => { if (c.prefect === role) delete c.prefect; }); n.prefect = role; });
      if (fx.mission && BH.Missions) BH.Missions.assign(s, fx.mission);
      if (fx.milestone && BH.Milestones) BH.Milestones.trigger(s, fx.milestone);
      if (fx.game) setTimeout(() => Arcs.play(s, fx.game, b), 600);
      return out;
    },

    /* ---------- text ---------- */
    fill(s, text, b) {
      const n = b && b.char ? N().get(s, b.char) : null;
      return String(text || '').replace(/\{(\w+)(?::(\w+))?(?::(\w+))?\}/g, (m, k, a, c) => {
        if (k === 'name') return n ? n.first : '';
        if (k === 'nick') return n ? (n.nick || n.first).replace(/^.*"(.*)"$/, '$1') : '';
        if (k === 'me') return s.player.name.split(' ')[0];
        if (k === 'full') return n ? N().fullName(n) : '';
        if (k === 'who') { const o = N().get(s, a); return o ? (o.type === 'senior' ? N().name(o) : o.first) : ''; }
        if (k === 'when') return St().when(s, St().first(s, a, c || (b && b.char))) || 'before';
        if (k === 'level') return D.LEVELS[s.time.year - 1];
        if (k === 'house') return s.player.house.name;
        if (k === 'school') return s.player.schoolName;
        if (k === 'mum') return BH.gendered(s, 'Mummy', 'Mummy');
        return m;
      });
    },
  };

  BH.Arcs = Arcs;
  BH.registerSystem('Arcs', Arcs);
})(window.BH);
