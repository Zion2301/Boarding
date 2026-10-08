/* Lessons — live class periods, one per room per period (s.school.lessons[room], transient).
   The teacher enters in their own voice, writes notes on the board, asks questions that ANYONE present can answer by
   typing (letter or answer), calls on students by name, notices sleepers and talkers, then wraps up with homework /
   test news. Register time: the form teacher calls the register in the form class.
   Multiplayer-ready: player input arrives as intents ({type:'lesson:answer', actor, room, text}) and everything is
   derived from the clock + seeded picks, so a server can run the same lesson for everyone in the room. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const C = () => BH.Content;
  const A = () => BH.Academics;
  const N = () => BH.NPC;
  const Sc = () => BH.School;
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast && BH.UI.toast(t, k);
  const LETTERS = ['A', 'B', 'C', 'D'];
  const ASK_AT = [19, 25, 31];

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pickN = (arr, n, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

  const Lessons = {
    v: 0, // bumps whenever any lesson changes (UI redraw)
    onNewGame(s) { s.school.lessons = {}; },
    onLoad(s) { s.school.lessons = {}; },
    onBlockStart(s) { s.school.lessons = {}; Lessons.changed(); },
    changed() { Lessons.v++; BH.bus && BH.bus.emit('lesson:update', {}); },

    /* the lesson happening in a room right now (created on first look) */
    get(s, room) {
      if (!s.school || !room) return null;
      const L = s.school.lessons[room];
      if (L) return L;
      const b = BH.Time.block(s);
      if (!b || s.time.dayType !== 'weekday') return null;
      if (b.kind === 'class') return Lessons.create(s, room, b);
      if (b.kind === 'register') return Lessons.createRegister(s, room);
      return null;
    },
    here(s) { return Lessons.get(s, s.world && s.world.map); },
    isMine(s, L) { const pl = Sc().placeFor(s, 'player'); return !!L && pl.map === L.room; },

    /* ---------- lesson material: notes for the board + questions ---------- */
    material(s, code, key, seed) {
      const r = rng(seed);
      const bank = A().bank(s, code);
      const extra = (C().get('lessons') || { subjects: {} }).subjects;
      const src = extra[key] || extra[code];
      let notes = [], qs = [];
      if (bank && bank.length >= 3) {
        const picked = pickN(bank, 3, r);
        qs = picked;
        notes = pickN(bank.filter((q) => q.e && !picked.includes(q)), 4, r).map((q) => q.e);
        if (src) notes = pickN(src.notes, 2, r).concat(notes).slice(0, 5);
      } else if (src) {
        notes = pickN(src.notes, 5, r);
        qs = pickN(src.questions, 3, r);
      }
      qs = qs.map((q) => { const order = pickN([0, 1, 2, 3], 4, r); return { q: q.q, o: order.map((j) => q.o[j]), a: order.indexOf(q.a), e: q.e || '' }; });
      return { notes, qs };
    },

    create(s, room, b) {
      const slot = Sc().roomSlot(s, room, s.time.dow, b.period);
      if (!slot) return null;
      const part = slot.part;
      const t = part.t ? N().get(s, part.t) : null;
      const absent = !t || !!(s.world.teacherAbsent && s.world.teacherAbsent[t.id]);
      const def = t ? Sc().staffDef(t.id) : null;
      const key = part.by ? `${part.code}:${part.group}` : part.code;
      const mat = Lessons.material(s, part.code, key, U.hash(`${room}|${s.time.dayCount}|${b.period}`));
      const L = {
        kind: 'lesson', room, code: part.code, group: part.group || null, key, t: t ? t.id : null, classes: slot.classes,
        free: absent, topic: U.seedPick(D.TOPICS[part.code] || ['Revision'], s.time.dayCount + part.code),
        start: BH.Clock.blockStart(s), enterAt: def && def.flags && def.flags.late ? 7 : 1,
        board: [], notes: mat.notes, qs: mat.qs, q: null, feed: [], done: {},
      };
      s.school.lessons[room] = L;
      return L;
    },
    createRegister(s, room) {
      const cid = Sc().classIdOfMap(room);
      if (!cid) return null;
      const c = s.school.classes[cid];
      const L = { kind: 'register', room, cid, t: c.form, start: BH.Clock.blockStart(s), enterAt: 1, board: [], feed: [], done: {}, called: [], q: null };
      s.school.lessons[room] = L;
      return L;
    },

    /* who is in the room for this lesson (players here + bots scheduled here) */
    present(s, L) {
      const out = [];
      if ((s.world.map || 'campus') === L.room) out.push('player');
      N().students(s).forEach((n) => { if (BH.Schedule.where(s, n).map === L.room) out.push(n.id); });
      return out;
    },
    nameOf(s, sid) { if (sid === 'player') return s.player.name.split(' ')[0]; const n = N().get(s, sid); return n ? n.first : 'Someone'; },
    teacher(s, L) { return L.t ? N().get(s, L.t) : null; },
    lines(L) { const d = L.t ? Sc().staffDef(L.t) : null; return (d && d.lines) || {}; },
    flags(L) { const d = L.t ? Sc().staffDef(L.t) : null; return (d && d.flags) || {}; },
    sirMa(s, L) { const t = Lessons.teacher(s, L); return t && t.gender === 'f' ? 'Ma' : 'Sir'; },

    say(s, L, who, text, kind = 'say') {
      const m = s.clock - L.start;
      L.feed.push({ who, name: who === 'teacher' ? N().name(Lessons.teacher(s, L)) : who === 'class' ? 'Class' : who === 'sys' ? '' : Lessons.nameOf(s, who), text, kind, m });
      if (L.feed.length > 40) L.feed.shift();
      // speech bubble over the speaker in the 3D world
      const speaker = kind === 'narr' ? 'teacher' : who;
      const said = kind === 'narr' ? (text.match(/"[^"]+"/) || [''])[0] : text;
      const actor = BH.Actors && (speaker === 'teacher' && L.t ? BH.Actors.get('npc:' + L.t) : !['player', 'class', 'sys'].includes(speaker) ? BH.Actors.get('npc:' + speaker) : null);
      if (actor && BH.SimNPC && said && kind !== 'options') BH.SimNPC.say(actor, said.length > 90 ? said.slice(0, 88) + '…' : said, 4500);
      Lessons.changed();
    },

    /* ---------- every game minute ---------- */
    onMinute(s) {
      if (!s.school) return;
      const L = Lessons.here(s);
      if (!L) return;
      if (L.kind === 'register') Lessons.tickRegister(s, L); else Lessons.tick(s, L);
    },

    tick(s, L) {
      const m = s.clock - L.start;
      const T = Lessons.lines(L);
      const F = Lessons.flags(L);
      const fill = (x, n) => U.fill(x, { topic: L.topic, n: n || '' });
      if (L.free) {
        if (!L.done.free && m >= 1) { L.done.free = true; Lessons.say(s, L, 'sys', `No teacher for ${A().name(s, L.code, true)}. FREE PERIOD! 🎉 (Read, gist… just no noise.)`, 'sys'); }
        return;
      }
      if (m >= L.enterAt && !L.done.enter) {
        L.done.enter = true;
        const enter = fill(U.seedPick(T.enter || ['"Good day class. Today: {topic}."'], s.time.dayCount + L.code));
        // narration ("Mr. Bassey enters with Koboko…") shows as a stage direction; speech shows under the teacher's name
        Lessons.say(s, L, enter.startsWith('"') ? 'teacher' : 'sys', enter, enter.startsWith('"') ? 'say' : 'narr');
        Lessons.say(s, L, 'class', `Good ${BH.Clock.mod(s) < 12 * 60 ? 'morning' : 'afternoon'}, ${Lessons.sirMa(s, L)}! 🙌🏾`, 'class');
        L.board.push(`${BH.Time.dayName(s)} · ${A().name(s, L.code)}`, `TOPIC: ${L.topic}`);
      }
      if (!L.done.enter) return;
      // notes on the board (the fast talker writes two at a time and rubs the board before you finish copying)
      const step = F.fast ? 2 : 3;
      L.notes.forEach((line, i) => {
        const at = L.enterAt + 3 + i * step;
        if (m >= at && m <= 18 && !L.done['n' + i]) {
          L.done['n' + i] = true;
          L.board.push(line);
          if (F.fast && L.board.length > 4) L.board.splice(2, 1);
          if (i === 0) Lessons.say(s, L, 'teacher', F.fast ? '"Copythisdownquicklyquicklywehavenotime!"' : '"Copy this into your notes."');
          Lessons.changed();
        }
      });
      // questions
      ASK_AT.forEach((at, i) => { if (m >= at && !L.done['q' + i] && L.qs[i] && !(L.q && !L.q.closed)) { L.done['q' + i] = true; Lessons.ask(s, L, i); } });
      if (L.q && !L.q.closed) {
        const age = m - L.q.at;
        if (L.q.called && L.q.called !== 'player' && age >= 1 && !L.q.botTried) { L.q.botTried = true; Lessons.botAnswer(s, L, L.q.called); }
        if (!L.q.called && age >= 2 && !L.q.botTried) { L.q.botTried = true; const bots = Lessons.present(s, L).filter((x) => x !== 'player'); if (bots.length && U.hash(L.room + m) % 10 < 7) Lessons.botAnswer(s, L, bots[U.hash(L.room + L.q.i) % bots.length]); }
        if (age >= 4) Lessons.timeout(s, L);
      }
      // the teacher looks up every few minutes
      if (m >= L.enterAt + 2 && m <= 36 && m % 4 === 2 && !L.done['look' + m]) { L.done['look' + m] = true; Lessons.notice(s, L); }
      if (m >= 34 && !L.done.wrap) {
        L.done.wrap = true;
        const test = A().TEST_WEEKS.includes(s.time.week + 1) && s.time.dow >= 3;
        Lessons.say(s, L, 'teacher', test ? '"Read everything we did. TEST next week!"' : F.farm ? '"Copy your notes. Anybody wey no copy go see the farm."' : '"Copy your notes. We continue next class."');
      }
      if (m >= 38 && !L.done.bye) {
        L.done.bye = true;
        Lessons.say(s, L, 'teacher', '"Class, stand up!"');
        Lessons.say(s, L, 'class', `Thank you, ${Lessons.sirMa(s, L)}! 🙌🏾`, 'class');
      }
    },

    /* ---------- questions ---------- */
    ask(s, L, i) {
      const q = L.qs[i];
      const here = Lessons.present(s, L);
      const r = U.hash(`${L.room}|${s.time.dayCount}|${i}`);
      let called = null;
      if (here.length && r % 10 < 5) called = here.includes('player') && r % 10 < 3 ? 'player' : here[r % here.length];
      L.q = { i, q: q.q, o: q.o, a: q.a, e: q.e, at: s.clock - L.start, called, tries: [], closed: false };
      const opts = q.o.map((o, k) => `${LETTERS[k]}) ${o}`).join('   ');
      Lessons.say(s, L, 'teacher', called ? `"${Lessons.nameOf(s, called)}! ${q.q}"` : `"Who can tell me — ${q.q}"`);
      Lessons.say(s, L, 'sys', opts, 'options');
      if (called === 'player') { toast(`🙋🏾 ${N().name(Lessons.teacher(s, L))} is asking YOU! Type your answer.`, 'bad'); BH.Sound && BH.Sound.play && BH.Sound.play('alert'); }
    },
    /* typed text → option index (letter, "option b", or the answer itself) */
    match(q, text) {
      const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9/+\-.À-ɏ ]/g, ' ').replace(/\s+/g, ' ').trim();
      const t = norm(text);
      const m = t.match(/^(?:option |answer |na |it s |its |is )?\(?([abcd])\)?\.?$/);
      if (m) return LETTERS.indexOf(m[1].toUpperCase());
      const o = q.o.map(norm);
      const exact = o.indexOf(t);
      if (exact >= 0) return exact;
      if (t.length >= 3) {
        const hits = o.map((x, k) => (x.includes(t) || (x.length >= 3 && t.includes(x)) ? k : -1)).filter((k) => k >= 0);
        if (hits.length === 1) return hits[0];
      }
      return -1;
    },
    /* a student answers (players via intents, bots directly) */
    answer(s, sid, text) {
      const L = Lessons.here(s);
      if (!L) return { ok: false };
      text = String(text || '').trim().slice(0, 140);
      if (!text) return { ok: false };
      if (L.kind === 'register') return Lessons.registerReply(s, L, sid, text);
      if (!L.q || L.q.closed) return Lessons.chatter(s, L, sid, text);
      const q = L.q;
      Lessons.say(s, L, sid, text, 'answer');
      const k = Lessons.match(q, text);
      const T = Lessons.lines(L);
      const t = Lessons.teacher(s, L);
      const name = Lessons.nameOf(s, sid);
      if (k === q.a) {
        q.closed = true;
        Lessons.say(s, L, 'teacher', U.fill(U.pick(T.right || ['"Correct!"']), { n: name }));
        if (q.e) Lessons.say(s, L, 'sys', `✔ ${LETTERS[q.a]}) ${q.o[q.a]} — ${q.e}`, 'explain');
        if (sid === 'player') {
          const g = A().study(s, L.code, q.called === 'player' ? 4 : 3, true);
          if (t) { N().rel(s, t, 2); N().remember(s, t, `answered a ${A().name(s, L.code, true)} question correctly in class`); }
          BH.Consequences.repChange(s, 'teachers', 1);
          BH.Stats.change(s, { morale: 2 });
          BH.Paths && BH.Paths.add(s, 'scholar', 1);
          toast(`✅ Correct! (+${g} ${A().name(s, L.code, true)})`, 'good');
        }
        BH.bus.emit('lesson:answer', { sid, correct: true, code: L.code });
        return { ok: true, correct: true };
      }
      q.tries.push(sid);
      Lessons.say(s, L, 'teacher', k < 0 ? `"${name}, ehn? Answer A, B, C or D."` : U.fill(U.pick(T.wrong || ['"No."']), { n: name }));
      if (sid === 'player') BH.Stats.change(s, { morale: -1 });
      BH.bus.emit('lesson:answer', { sid, correct: false, code: L.code });
      return { ok: true, correct: false };
    },
    botAnswer(s, L, sid) {
      const n = N().get(s, sid);
      if (!n || !L.q) return;
      const skill = (n.ability || 50) / 100;
      const right = U.hash(sid + L.q.q) % 100 < skill * 100;
      const k = right ? L.q.a : (L.q.a + 1 + (U.hash(sid) % 3)) % 4;
      Lessons.answer(s, sid, U.hash(sid) % 2 ? LETTERS[k] : L.q.o[k]);
    },
    timeout(s, L) {
      const q = L.q;
      q.closed = true;
      const t = Lessons.teacher(s, L);
      const T = Lessons.lines(L);
      if (q.called && !q.tries.includes(q.called)) {
        Lessons.say(s, L, 'teacher', U.fill(U.pick(T.noAnswer || ['"{n}? Nothing? Next."']), { n: Lessons.nameOf(s, q.called) }));
        if (q.called === 'player') {
          if (t) { N().rel(s, t, -2); N().remember(s, t, 'stayed silent when called on in class'); }
          BH.Stats.change(s, { morale: -2 });
          const F = Lessons.flags(L);
          if (F.cane || F.farm) toast(`😬 ${F.farm ? 'Mr. Ogunleye: "After class — the farm. Two ridges."' : `${N().name(t)} points Koboko at you.`} ${BH.Discipline.minor(s, 'No answer when called in class')}`, 'bad');
        }
      } else Lessons.say(s, L, 'teacher', '"Nobody? Hmm."');
      Lessons.say(s, L, 'sys', `The answer: ${LETTERS[q.a]}) ${q.o[q.a]}${q.e ? ' — ' + q.e : ''}`, 'explain');
    },
    /* typing when no question is open = talking in class */
    chatter(s, L, sid, text) {
      Lessons.say(s, L, sid, text, 'whisper');
      const t = Lessons.teacher(s, L);
      if (!t || L.free || sid !== 'player') return { ok: true, whisper: true };
      if (U.chance(0.25 + t.strict * 0.35)) Lessons.catchPlayer(s, L, 'talk');
      return { ok: true, whisper: true };
    },

    /* ---------- noticing sleepers and talkers ---------- */
    notice(s, L) {
      const t = Lessons.teacher(s, L);
      if (!t || L.free) return;
      const a = s.act;
      if ((s.world.map || '') === L.room && a && a.type === 'lesson' && a.mode !== 'focus') {
        const p = ({ doze: 0.35, gist: 0.22, novel: 0.25 }[a.mode] || 0.2) * t.strict * 1.6;
        if (Math.random() < p) return Lessons.catchPlayer(s, L, a.mode === 'doze' ? 'sleep' : 'talk', a.mode);
      }
      // bot students doze and gist too
      const bots = Lessons.present(s, L).filter((x) => x !== 'player');
      const h = U.hash(L.room + s.clock);
      if (bots.length && h % 100 < 28) {
        const who = bots[h % bots.length];
        const n = N().get(s, who);
        const naughty = n && ['bully', 'comedian', 'sporty', 'hustler', 'thief'].includes(n.arch);
        if (!naughty && h % 3) return;
        const kind = h % 2 ? 'sleep' : 'talk';
        Lessons.say(s, L, 'teacher', U.fill(U.pick(Lessons.lines(L)[kind] || ['"{n}!"']), { n: Lessons.nameOf(s, who) }));
        const actor = BH.Actors && BH.Actors.get('npc:' + who);
        if (actor) actor.emote = { anim: kind === 'sleep' ? 'sleep_sit' : 'talk', until: performance.now() + 1500 };
      }
    },
    catchPlayer(s, L, kind, mode) {
      const t = Lessons.teacher(s, L);
      const name = A().name(s, L.code, true);
      Lessons.say(s, L, 'teacher', U.fill(U.pick(Lessons.lines(L)[kind] || ['"{n}!"']), { n: Lessons.nameOf(s, 'player') }));
      const what = mode === 'novel' ? `Reading a novel in ${name} class` : kind === 'sleep' ? `Sleeping in ${name} class` : `Talking in ${name} class`;
      if (mode === 'novel') BH.Inv.take(s, 'novel', 1);
      N().rel(s, t, -3);
      N().remember(s, t, kind === 'sleep' ? 'caught them sleeping in class' : 'caught them talking in class');
      BH.Consequences.repChange(s, 'teachers', -1);
      toast(`🚨 ${N().name(t)} catch you! ${BH.Discipline.minor(s, what)}${mode === 'novel' ? ' Novel: seized. 📕' : ''}`, 'bad');
      if (s.act && s.act.type === 'lesson') s.act.mode = 'focus';
    },

    /* ---------- register (form class, before period 1) ---------- */
    tickRegister(s, L) {
      const m = s.clock - L.start;
      const t = Lessons.teacher(s, L);
      if (!t) return;
      if (m >= 1 && !L.done.enter) {
        L.done.enter = true;
        Lessons.say(s, L, 'teacher', `"Good morning ${L.cid}. Register! Answer 'Present' when I call your name."`);
        L.order = Sc().members(s, L.cid).map((x) => x.id).sort((a, b) => Lessons.nameOf(s, a).localeCompare(Lessons.nameOf(s, b)));
      }
      if (!L.order) return;
      // two names a minute; anyone not in the room is marked absent (the class captain helps)
      const due = Math.min(L.order.length, Math.max(0, (m - 2) * 2));
      while (L.called.length < due) {
        const sid = L.order[L.called.length];
        L.called.push(sid);
        const full = sid === 'player' ? s.player.name : Sc().nameOf(s, sid);
        L.q = { sid, at: m };
        Lessons.say(s, L, 'teacher', `"${full}?"`);
        if (sid !== 'player') {
          const here = BH.Schedule.where(s, N().get(s, sid) || {}).map === L.room;
          Lessons.say(s, L, here ? sid : 'class', here ? `Present, ${Lessons.sirMa(s, L)}!` : `(silence…) "${Lessons.nameOf(s, sid)} no come, ${Lessons.sirMa(s, L)}."`, here ? 'answer' : 'class');
        } else if ((s.world.map || '') !== L.room) Lessons.say(s, L, 'class', `(silence…) "${Lessons.nameOf(s, 'player')} no dey, ${Lessons.sirMa(s, L)}."`, 'class');
        else toast(`📋 ${N().name(t)} calls your name — type "Present"!`, 'info');
      }
    },
    registerReply(s, L, sid, text) {
      Lessons.say(s, L, sid, text, 'answer');
      if (sid === 'player' && /pres|yes|here|dey/i.test(text) && L.q && L.q.sid === 'player') { L.q = null; s.today.flags.saidPresent = true; }
      return { ok: true };
    },

    /* ---------- input ---------- */
    /* UI → intent (later sent to the server unchanged) */
    submit(s, text) {
      const room = s.world.map;
      if (BH.Intents && BH.Intents.send && BH.Actors && BH.Actors.player()) BH.Intents.send('player', { type: 'lesson:answer', room, text });
      else Lessons.answer(s, 'player', text);
    },
    intent(it) {
      const s = BH.Game.s;
      if (!s || it.type !== 'lesson:answer' || it.room !== s.world.map) return;
      Lessons.answer(s, it.actor === 'player' ? 'player' : it.actor, it.text);
    },
  };

  BH.registerSystem('Lessons', Lessons);
})(window.BH);
