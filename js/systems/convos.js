/* The conversation bank (content/convos.json): hundreds of hand-written mini-conversations, so people feel alive
   without AI. A conversation = the other person opens (`open`), you pick how to answer (2–3 `replies`), they answer
   back and something changes (bond, mood, money, memory…).
   · who:  'k_dami' (one key character) · 'arch:brilliant' (classmate type) · 'type:classmate|senior|junior|teacher|staff'
           · 'role:bully' (senior role) · 'staff:matron' (staff role) · 'student' (any student)
   · when: conditions — anything story arcs accept (rel:char>=50, arc:char=close, ledger:snitched_on:char, senior…) plus
           lvl:1-3, weather:rain|harmattan|heat, term:1, exam, visiting, nepa, block:<kind>, daytype:saturday, gender:f
   · Picks the most specific one you haven't heard; one real conversation per person per day (key characters: two).
   · Lines can use {me} {name} {nick} {mate} {sen} {teacher} {house} {school} {level}. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const N = () => BH.NPC;
  const list = () => (BH.Content.get('convos') || { convos: [] }).convos;
  const STUDENT = ['classmate', 'senior', 'junior'];
  const SPEC = { id: 5, arch: 3, role: 3, staff: 3, type: 2, student: 1 };

  const Convos = {
    onNewGame(s) { Convos.ensure(s); },
    onLoad(s) { Convos.ensure(s); },
    ensure(s) { s.convos = s.convos || { seen: {}, today: {} }; s.convos.seen = s.convos.seen || {}; s.convos.today = s.convos.today || {}; return s.convos; },
    onNewDay(s) { Convos.ensure(s).today = {}; },

    /* does this conversation fit this person? → specificity score (0 = no) */
    fits(c, n) {
      return [].concat(c.who).reduce((best, w) => {
        let sc = 0;
        if (w === n.id) sc = SPEC.id;
        else if (w.startsWith('arch:')) sc = n.type === 'classmate' && !n.key && n.arch === w.slice(5) ? SPEC.arch : 0;
        else if (w.startsWith('role:')) sc = n.type === 'senior' && n.role === w.slice(5) && !(n.key && w !== 'role:' + n.role) ? SPEC.role : 0;
        else if (w.startsWith('staff:')) sc = n.type === 'staff' && n.role === w.slice(6) ? SPEC.staff : 0;
        else if (w.startsWith('type:')) sc = n.type === w.slice(5) ? SPEC.type : 0;
        else if (w === 'student') sc = STUDENT.includes(n.type) ? SPEC.student : 0;
        return Math.max(best, sc);
      }, 0);
    },
    test(s, cond, n) {
      const neg = cond[0] === '!';
      const c = neg ? cond.slice(1) : cond;
      const [k, a] = c.split(':');
      let r;
      switch (k) {
        case 'lvl': { const [lo, hi] = a.split('-').map(Number); r = s.time.year >= lo && s.time.year <= (hi || lo); break; }
        case 'weather': r = a === 'rain' ? BH.WorldSim.raining(s) : BH.WorldSim.weather(s) === a; break;
        case 'term': r = s.time.term === Number(a); break;
        case 'exam': r = s.time.week >= 9; break;
        case 'test': r = s.time.week === 4 || s.time.week === 8; break;
        case 'visiting': r = s.time.dow === 5 && [3, 6, 9].includes(s.time.week); break;
        case 'nepa': r = !BH.WorldSim.power(s); break;
        case 'night': r = BH.Clock.isDark(s); break;
        case 'morning': r = BH.Clock.mod(s) < 12 * 60; break;
        case 'weekend': r = s.time.dow >= 5; break;
        case 'punished': r = (s.discipline.record || []).some((x) => x.day === s.time.dayCount || x.day === s.time.dayCount - 1); break;
        case 'broke': r = s.money < 300; break;
        case 'rich': r = s.money >= 3000; break;
        case 'hungry': r = s.stats.hunger < 35; break;
        case 'tired': r = s.stats.rest < 35; break;
        case 'dirty': r = s.stats.hygiene < 35; break;
        case 'sad': r = s.stats.morale < 35; break;
        case 'top': { const rp = (s.reports || [])[s.reports.length - 1]; r = !!rp && rp.position <= 5; break; }
        case 'flop': { const rp = (s.reports || [])[s.reports.length - 1]; r = !!rp && rp.position > rp.classSize * 0.6; break; }
        case 'prefect': r = !!(s.senior && s.senior.prefect); break;
        case 'dept': r = (s.academics.dept || '') === a; break;
        case 'rep': { const m = a.match(/^(\w+)(>=|<=)(\d+)$/); const v = m && s.rep ? (s.rep[m[1]] || 0) : 0; r = !!m && (m[2] === '>=' ? v >= +m[3] : v <= +m[3]); break; }
        case 'muslim': r = s.player.religion === 'muslim'; break;
        case 'christian': r = s.player.religion === 'christian'; break;
        default: r = BH.Arcs ? BH.Arcs.test(s, c, { char: n.id }) : true;
      }
      return neg ? !r : r;
    },
    ok(s, c, n) { return (c.when || []).every((x) => Convos.test(s, x, n)); },

    /* the best unheard conversation for this person right now */
    pick(s, n) {
      Convos.ensure(s);
      let best = [], top = 0;
      for (const c of list()) {
        const sc = Convos.fits(c, n);
        if (!sc) continue;
        const seenAt = s.convos.seen[c.id + (c.per === 'npc' ? '|' + n.id : '')];
        // personal conversations happen once; general ones can come back after ~two months
        if (seenAt !== undefined && (sc >= SPEC.id || s.time.dayCount - seenAt < 60)) continue;
        if (!Convos.ok(s, c, n)) continue;
        const w = sc + ((c.when || []).length ? 1.5 : 0); // situational ones first
        if (w > top) { top = w; best = [c]; } else if (w === top) best.push(c);
      }
      if (!best.length) return null;
      return best[U.hash(n.id + s.time.dayCount + (s.clock >> 4)) % best.length];
    },
    used(s, n) { const t = Convos.ensure(s).today[n.id] || 0; return t >= (n.key ? 2 : 1); },
    available(s, n) { return !!n && !Convos.used(s, n) && !!Convos.pick(s, n); },

    /* text */
    fill(s, text, n) {
      const mate = N().randomClassmate(s, n.id);
      const sen = N().errandSenior(s);
      const t = (s.npcs.teachers || [])[U.hash(n.id + s.time.dayCount) % Math.max(1, (s.npcs.teachers || []).length)];
      const base = BH.Arcs ? BH.Arcs.fill(s, text, { char: n.id }) : text;
      return base.replace(/\{(\w+)\}/g, (m, k) => {
        if (k === 'mate') return mate ? mate.first : 'Tunde';
        if (k === 'sen') return sen ? N().name(sen) : 'Senior Kunle';
        if (k === 'teacher') return t ? N().name(t) : 'Mr. Bassey';
        if (k === 'name') return n.first || N().name(n);
        return m;
      });
    },
    who(n) { return n.type === 'senior' || n.type === 'teacher' || n.type === 'staff' ? N().name(n) : n.first; },

    /* run one: returns { open, replies:[{label, run}] } for the dialogue UI */
    start(s, n) {
      const c = Convos.pick(s, n);
      if (!c) return null;
      return {
        c,
        open: Convos.fill(s, c.open, n),
        replies: c.replies.map((r, i) => ({ label: Convos.fill(s, r.say, n), sub: r.sub || '', run: () => Convos.answer(s, n, c, i) })),
      };
    },
    answer(s, n, c, i) {
      const r = c.replies[i];
      const g = Convos.ensure(s);
      g.seen[c.id + (c.per === 'npc' ? '|' + n.id : '')] = s.time.dayCount;
      g.today[n.id] = (g.today[n.id] || 0) + 1;
      s.today.talked[n.id] = true;
      const fx = Object.assign({}, r.fx || {});
      const notes = BH.Arcs ? BH.Arcs.apply(s, fx, { char: n.id }) : [];
      if (fx.rel === undefined && STUDENT.includes(n.type)) N().rel(s, n, 2); // a real conversation always helps a little
      BH.bus.emit('npc:interact', { id: n.id, kind: 'gist' });
      BH.bus.emit('convo', { id: c.id, npc: n.id, reply: i });
      // spoken answers get the speaker's name; narration ("They laugh…") stands on its own
      const said = r.npc ? Convos.fill(s, r.npc, n) : '';
      const lines = [said ? (/^["“]/.test(said.trim()) ? `${Convos.who(n)}: ${said}` : said) : '', ...notes];
      if (r.fx && r.fx.note && BH.Flow) { const rem = BH.Flow.remember([n].filter((x) => x.key || x.type === 'staff')); if (rem) lines.push(`_${rem}_`); }
      return lines.filter(Boolean).join('\n\n');
    },

    /* extra "💬 Talk" for people whose menu has no gist option (seniors as a senior, juniors, teachers, staff) */
    talkOptions(s, n) {
      if (!n || n.type === 'classmate') return [];
      if (n.type === 'senior' && s.time.year >= 4) return []; // they already have "💬 Gist"
      const c = !Convos.used(s, n) && Convos.pick(s, n);
      if (!c) return [];
      return [{ label: '💬 Talk', sub: 'Have a proper conversation', convo: true, run: () => BH.Dialogue && BH.Dialogue.convo ? (BH.Dialogue.convo(n.id), BH.Dialogue.SKIP) : '' }];
    },
  };

  BH.Convos = Convos;
  BH.registerSystem('Convos', Convos);
})(window.BH);
