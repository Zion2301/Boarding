/* Activities — replaces the old "pick 1 of 4" block scenes. Everything happens in the world now:
   - Attendance: each block expects you somewhere (BLOCK_LOCATION). Being there = present/late; not = absent.
     At the end of the block absentees face roll call (teacher/prefect may notice), never a forced menu.
   - Lessons: sit at your desk during class → the lesson runs while you sit (focus / doze / whisper / novel).
     Test weeks and exam week open the quiz when you sit.
   - Prep & study: sit at a desk and pick a subject; library and lesson notes boost it.
   - Meals: collect your plate at the serving counter, eat at your table (late = smaller portion).
   - Assembly: be on the assembly ground when inspection starts.
   - Sleep anywhere (bed = proper rest), nap, hide, pass out if you push too far. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const S = () => BH.Stats;
  const A = () => BH.Academics;
  const Dsc = () => BH.Discipline;
  const N = () => BH.NPC;
  const toast = (t, k = 'info', c) => BH.UI && BH.UI.toast(t, k, c);
  const abs = (s) => BH.Clock.abs(s);
  const ROLLCALL = ['class', 'register', 'assembly', 'prep', 'labour', 'worship'];

  const Activities = {
    onNewGame(s) {
      s.act = null;
      s.world = s.world || {};
      s.world.map = 'campus';
      const g = D.CAMPUS.LOCATIONS.gate.door;
      s.pos = { x: g.x, y: g.y - 70 };
    },
    onLoad(s) {
      s.world.map = s.world.map || 'campus';
      if (s.act && ['busy'].includes(s.act.type)) s.act = null;
      if (s.act && s.act.type === 'sleep') s.act = null;
      s.today.att = s.today.att || {};
    },
    onNewDay(s) { s.today.att = {}; },

    /* ---------- where you should be ---------- */
    myClassroom(s) { const c = BH.School.myClass(s); return c ? c.map : null; },
    expected(s) {
      const b = BH.Time.block(s);
      if (b.kind === 'free') return null;
      // a new student settling in (resumption day or a late admission): the story objective replaces the timetable
      if (BH.Onboarding && BH.Onboarding.settling(s)) return null;
      // school blocks: your class arm (or your department / religion / language room for split periods)
      if (['class', 'register', 'prep'].includes(b.kind) && BH.School) return BH.School.placeFor(s, 'player');
      const key = BH.Clock.location(s);
      const L = D.CAMPUS.LOCATIONS[key];
      if (!L) return null;
      return { key, map: L.kind === 'b' ? (L.interior || key) : 'campus', name: L.name, emoji: L.emoji };
    },
    present(s) {
      const e = Activities.expected(s);
      if (!e) return true;
      const map = s.world.map || 'campus';
      if (e.map !== 'campus') return map === e.map;
      return map === 'campus' && s.world.area === e.key;
    },
    excused(s) { return !!(s.today.flags.excused && s.today.flags.excused >= abs(s)) || !!(BH.Onboarding && BH.Onboarding.settling(s)); },
    freePeriod(s) {
      const b = BH.Time.block(s);
      if (b.kind !== 'class') return false;
      const L = BH.School.lessonFor(s, 'player', s.time.dow, b.period);
      if (!L || !L.t) return true; // nobody could be timetabled for it — teacher "no come"
      return !!(s.world.teacherAbsent && s.world.teacherAbsent[L.t]);
    },
    inMyClass(s) { return BH.Time.block(s).kind === 'class' && Activities.present(s); },

    status(s) {
      const b = BH.Time.block(s);
      const id = BH.Time.blockId(s);
      const e = Activities.expected(s);
      if (s.act && s.act.type === 'sleep') return { kind: 'asleep', text: '😴 Asleep' };
      const ob = BH.Onboarding && BH.Onboarding.objective(s);
      if (ob && BH.Onboarding.settling(s)) return { kind: 'story', text: `⭐ ${ob.text}` };
      if (!e) return { kind: 'free', text: 'Free time — go anywhere' };
      if (Activities.excused(s)) return { kind: 'excused', text: s.today.flags.justArrived ? '🚌 Just arrived — settle in' : '🩺 Excused (sick bay)' };
      const att = s.today.att[id];
      if (Activities.present(s)) return att && att.late ? { kind: 'late', text: '⏰ Here (late)', e } : { kind: 'present', text: '✅ You\'re here', e };
      const late = s.clock - BH.Clock.blockStart(s);
      if (b.kind === 'sleep') return BH.Clock.mod(s) >= BH.Clock.LIGHTS_OUT || BH.Clock.mod(s) < 300 ? { kind: 'absent', text: '🔦 Out after lights out!', e } : { kind: 'due', text: `Be in hostel by 10:15 PM`, e };
      if (late <= BH.Clock.LATE) return { kind: 'due', text: `Go to ${e.name}`, e };
      return { kind: 'absent', text: ROLLCALL.includes(b.kind) ? `❗ Absent — ${e.name}` : `Missing ${b.title.toLowerCase()}`, e };
    },

    /* ---------- minute by minute ---------- */
    onMinute(s) {
      const id = BH.Time.blockId(s);
      const b = BH.Time.block(s);
      s.today.att = s.today.att || {};
      // attendance: first time you're where the block happens
      if (Activities.expected(s) && Activities.present(s) && !s.today.att[id]) Activities.arrive(s, id, b);
      let a = s.act;
      // you can't keep "sitting" somewhere you've left
      if (a && ['lesson', 'prep', 'seat', 'hide'].includes(a.type) && a.map && a.map !== (s.world.map || 'campus')) { s.act = null; a = null; }
      if (a && (a.type === 'lesson' || a.type === 'prep')) Activities.studyMinute(s, a, b);
      if (b.kind === 'assembly' && s.clock === BH.Clock.blockStart(s) + 8) Activities.inspect(s, false);
      // oversleeping after the rising bell
      if (id === 'rising' && a && a.type === 'sleep' && s.clock === BH.Clock.blockStart(s) + 20 && (s.world.map || '') === BH.Schedule.myHostel(s)) {
        Activities.wake(s, 'prefect');
        if (Dsc().caught(s, 0.5 + Dsc().strict(s) * 0.2)) toast('🛏️ House prefect pull your blanket comot! ' + Dsc().minor(s, 'Oversleeping after rising bell'), 'bad');
      }
      if (s.clock === 22 * 60 && b.kind === 'sleep' && (s.world.map || '') !== BH.Schedule.myHostel(s)) toast('🌙 Lights out! Get back to your hostel before 10:15 PM — prefects go start patrol.', 'bad');
    },

    arrive(s, id, b) {
      const late = s.clock - BH.Clock.blockStart(s);
      const isLate = late > BH.Clock.LATE && ROLLCALL.includes(b.kind);
      s.today.att[id] = { at: s.clock, late: isLate, seated: 0 };
      BH.bus.emit('arrive', { block: id, kind: b.kind, late: isLate });
      if (id === 'settling' && s.time.year <= 3 && BH.NPC.senior(s, 'bully') && s.time.dayCount === 0) BH.Events.optional(s, 'settlingBully');
      if (b.kind === 'meal' && late > 20) s.today.flags.lateFor = b.meal;
      if (isLate && !Activities.excused(s)) {
        A().markLate(s, b);
        if (Dsc().caught(s, 0.45 + Dsc().strict(s) * 0.2)) {
          const offence = `Late to ${b.title.toLowerCase()} (${late} min)`;
          const who = Activities.latenessWatcher(s, b);
          if (who && BH.Excuse && BH.Excuse.canTalk()) BH.Excuse.start(s, { npc: who, kind: 'late', offence, sev: 0, facts: `the ${b.title} started at ${BH.Clock.timeLabel(BH.Clock.blockStart(s))}; they arrived ${late} minutes late`, apply: (sev) => BH.Excuse.punishFor(s, offence, sev, who) });
          else toast(`⏰ You reach ${late} min late! ` + Dsc().minor(s, `Late to ${b.title}`), 'bad');
        } else toast(`⏰ You tiptoe in ${late} min late. Nobody notice. 😮‍💨`, 'info');
      }
    },

    /* Who stops latecomers: the Vice Principal at assembly, the teacher at the classroom door, a prefect at prep */
    latenessWatcher(s, b) {
      const here = (n) => n && BH.Schedule.where(s, n).map === (s.world.map || 'campus');
      if (b.kind === 'assembly') { const vp = BH.Schedule.staff(s, 'vp'); if (here(vp)) return vp; }
      if (b.kind === 'class') { const L = BH.School.lessonFor(s, 'player', s.time.dow, b.period); const t = L && L.t && N().get(s, L.t); if (here(t)) return t; }
      if (b.kind === 'register') { const c = BH.School.myClass(s); const t = c && c.form && N().get(s, c.form); if (here(t)) return t; }
      const vp = BH.Schedule.staff(s, 'vp');
      if (here(vp)) return vp;
      return [N().senior(s, 'headPrefect'), N().senior(s, 'houseCaptain')].find(here) || null;
    },

    onBlockStart(s, id) {
      const b = D.BLOCKS[id];
      const a = s.act;
      if (id === 'arrival' && s.time.dayCount > 0) {
        const g = D.CAMPUS.LOCATIONS.gate.door;
        s.world.map = 'campus'; s.pos = { x: g.x, y: g.y - 70 }; s.world.moved = true;
        BH.Events.optional(s, 'arrivalParent');
      }
      if (id === 'rising' && a && a.type === 'sleep') { BH.Clock.stopWait(s, 'rising'); }
      // carry on sitting from one period to the next
      if (a && a.type === 'lesson') {
        if (b.kind === 'class' && Activities.present(s)) { a.code = A().periodSubject(s, b.period); a.mode = 'focus'; a.acc = 0; Activities.maybeTest(s); }
        else s.act = null;
      }
      if (b.kind === 'class' && a && a.type === 'prep') s.act = null;
    },

    /* End of a block: roll call, lesson credit, assignments */
    onBlockEnd(s, id) {
      const b = D.BLOCKS[id];
      const att = s.today.att[id];
      if (b.kind === 'class') {
        const code = A().periodSubject(s, b.period);
        if (code) {
          if (att && att.seated >= 25) {
            A().attend(s, code);
            s.today.flags.lastLesson = code;
            BH.bus.emit('attend', { kind: 'class', code });
            if (!BH.Missions.active(s).some((m) => m.tpl === 'assignment') && U.chance(0.35) && !A().isExamWeek(s)) {
              const t = N().teacher(s, code);
              BH.Missions.assign(s, 'assignment', { vars: { subject: code, teacher: t && t.id } });
            }
          } else if (!att && !Activities.freePeriod(s)) Activities.missed(s, b, code);
        }
      } else if (ROLLCALL.includes(b.kind) && !att) Activities.missed(s, b);
      else if (b.kind === 'meal' && !s.today.meals[b.meal]) toast(`🍽️ You missed ${b.title.toLowerCase()}. Belle go suffer.`, 'info');
      if (b.kind === 'labour' && att && !s.today.flags.plots && !BH.Interaction.test(s, 'prefect:labour')) {
        if (Dsc().caught(s, 0.6)) toast('🪓 Labour Prefect check your plot: untouched! ' + Dsc().offence(s, 'Eye service at general labour', 1), 'bad');
      }
      if (b.kind === 'meal') s.today.flags.plate = null;
    },

    missed(s, b, code) {
      BH.log(s, `Missed: ${b.title}`, 'bad');
      if (Activities.excused(s)) return;
      if (BH.Inv.has(s, 'sickChit') && ['class', 'prep'].includes(b.kind)) { BH.Inv.take(s, 'sickChit', 1); toast('🧾 Your "sick bay chit" cover you for that absence. 😮‍💨', 'info'); return; }
      if (b.kind === 'class') {
        const name = A().name(s, code, true);
        A().markMissed(s, code);
        if (A().isExamWeek(s)) { A().recordExam(s, code, 0); toast(`📝 You missed the ${name} EXAM! Zero.`, 'bad'); return; }
        if (A().testDue(s, code)) { A().recordTest(s, code, 0); toast(`📝 You missed the ${name} test! Zero.`, 'bad'); }
        const t = N().teacher(s, code);
        const p = 0.35 + (t ? t.strict * 0.3 : 0.2) - (BH.Consequences.group(s, 'teachers') - 50) / 250;
        if (Dsc().caught(s, p)) { toast(`🚨 ${t ? N().name(t) : 'Teacher'} take roll call — you're absent from ${name}! ` + Dsc().offence(s, `Absent from ${name} class`, 1), 'bad'); if (t) N().rel(s, t, -4); BH.Consequences.repChange(s, 'teachers', -2); }
        else toast(`You skipped ${name}. Nobody notice… this time. 😬`, 'info');
        return;
      }
      const p = { assembly: 0.6, prep: 0.5, labour: 0.55, worship: 0.4 }[b.kind] || 0.4;
      if (!Dsc().caught(s, p)) return;
      const sev = b.kind === 'labour' ? 1 : 0;
      const text = sev ? Dsc().offence(s, `Dodging ${b.title.toLowerCase()}`, 1) : Dsc().minor(s, `Absent from ${b.title.toLowerCase()}`);
      toast(`🚨 Roll call: you no dey for ${b.title.toLowerCase()}! ${text}`, 'bad');
    },

    /* ---------- sitting, lessons, study ---------- */
    sit(s, obj) {
      const b = BH.Time.block(s);
      const map = s.world.map || 'campus';
      Activities.stand(s, true);
      const snap = obj && obj.seats && obj.seats[0] ? Activities.nearestSeat(s, obj) : null;
      if (snap && BH.World.snap) BH.World.snap(Object.assign({ h: -Math.PI / 2 }, snap)); // on the bench, facing the desk/table
      if (b.kind === 'class' && map === (Activities.expected(s) || {}).map) {
        const code = A().periodSubject(s, b.period);
        const ownerId = obj && obj.kind === 'desk' && !BH.School.isMyDesk(s, obj) ? BH.School.deskOwner(s, obj) : null;
        const owner = ownerId && ownerId !== 'player' ? N().get(s, ownerId) : null;
        s.act = { type: 'lesson', code, mode: 'focus', acc: 0, obj: obj && obj.id, map };
        if (!code || Activities.freePeriod(s)) return { text: 'Free period! Teacher no come. You fit sleep, read, or gist. 😎', noTime: true };
        const info = A().teacherInfo(s, code);
        Activities.maybeTest(s);
        return { text: `**${A().name(s, code)}** with ${info.tname}. Topic: _${info.topic}_.${owner ? ` (Na ${owner.first}'s seat — they go vex.)` : ''}`, good: true, noTime: true };
      }
      if (b.kind === 'register' && map === (Activities.expected(s) || {}).map) {
        s.act = { type: 'seat', obj: obj && obj.id, map };
        const c = BH.School.myClass(s);
        return { text: `You sit for register. ${c && c.form ? N().name(N().get(s, c.form)) : 'Your form teacher'} go soon call your name — answer "Present". 📋`, noTime: true };
      }
      if (b.kind === 'prep' || (obj && ['desk', 'myDesk', 'labBench'].includes(obj.kind))) {
        s.act = { type: 'prep', code: null, acc: 0, obj: obj && obj.id, map };
        BH.actions.pickSubject && BH.actions.pickSubject((code) => { if (s.act && s.act.type === 'prep') s.act.code = code; BH.Store.changed(); });
        return { text: b.kind === 'prep' ? 'Night prep. Open your book — the prefects dey waka with cane.' : 'You settle down to read. 📖', noTime: true };
      }
      s.act = { type: 'seat', obj: obj && obj.id, map };
      return { text: 'You sit down small. 🪑', noTime: true };
    },
    nearestSeat(s, obj) {
      const p = s.pos || { x: obj.x, y: obj.y };
      return obj.seats.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    },
    stand(s, quiet) {
      const a = s.act;
      if (!a) return { text: '', noTime: true };
      s.act = null;
      if (a.type === 'sleep' || a.type === 'busy') BH.Clock.stopWait(s, 'stood');
      BH.Store && BH.Store.changed();
      if (quiet) return null;
      return { text: a.type === 'hide' ? 'You comot from your hiding place. 👀' : a.type === 'sleep' ? 'You wake up and stretch. 🥱' : 'You stand up.', noTime: true };
    },

    maybeTest(s) {
      const a = s.act;
      if (!a || a.type !== 'lesson' || !a.code) return;
      const mode = A().isExamWeek(s) ? 'exam' : A().testDue(s, a.code) ? 'test' : null;
      if (!mode || (mode === 'exam' && s.today.flags['exam_' + a.code])) return;
      if (mode === 'exam') s.today.flags['exam_' + a.code] = true;
      const openQ = (BH.Content.get('openQuestions') || { subjectsWithOpenQuestions: [] }).subjectsWithOpenQuestions.includes(a.code);
      if (BH.Quiz && (A().hasQuiz(s, a.code) || openQ) && BH.UI) setTimeout(() => BH.bus.emit('test:start', { code: a.code, mode }), 300);
      else if (mode === 'exam') A().writtenExam(s, a.code, A().hints(s, a.code, 'exam') * 4);
      else A().recordTest(s, a.code, A().writtenScore(s, a.code, A().hints(s, a.code, 'test') * 4));
    },

    studyMinute(s, a, b) {
      const id = BH.Time.blockId(s);
      if (a.type === 'lesson') {
        if (b.kind !== 'class') { s.act = null; return; }
        s.today.att[id] = s.today.att[id] || { at: s.clock, late: false, seated: 0 };
        s.today.att[id].seated++;
        if (!a.code || Activities.freePeriod(s)) return;
        if (a.mode === 'focus') Activities.accrue(s, a, 4 / 70, { silent: true });
        if (a.mode === 'doze') S().change(s, { rest: 0.2 });
        if (a.mode === 'gist') { S().change(s, { morale: 0.08 }); const sm = N().byRole(s, 'seatmate'); if (sm && s.clock % 5 === 0) N().rel(s, sm, 0.3); }
        if (a.mode === 'novel') { S().change(s, { morale: 0.08 }); Activities.accrue(s, a, 1 / 70, { silent: true }); }
        // the teacher noticing sleepers/talkers happens in BH.Lessons.notice (each teacher's own lines)
        return;
      }
      if (a.type === 'prep' && a.code) {
        const rate = b.kind === 'prep' ? 7 / 150 : 5 / 60;
        Activities.accrue(s, a, rate, { silent: false });
        if (b.kind === 'prep') { s.today.att[id] = s.today.att[id] || { at: s.clock, late: false, seated: 0 }; s.today.att[id].seated++; }
      }
    },
    /* Fractional knowledge: accumulate, then bank whole points */
    accrue(s, a, rate, opts) {
      a.acc = (a.acc || 0) + rate * Activities.boost(s);
      if (a.acc >= 1) {
        const n = Math.floor(a.acc);
        a.acc -= n;
        A().study(s, a.code, n, true);
        if (!opts.silent) { a.sessions = (a.sessions || 0) + n; if (a.sessions >= 3) { a.sessions = 0; s.today.studies++; BH.bus.emit('study', { code: a.code, map: s.world.map || 'campus' }); } }
        S().change(s, { rest: -0.6 * n });
      }
    },
    /* Where and how you study matters */
    boost(s) {
      const cm = BH.Content.compile(s.world.map || 'campus');
      let m = (cm && cm.src && cm.src.studyBoost) || 1;
      if (BH.Inv.has(s, 'lessonNotes')) m *= 1.5;
      if (!BH.WorldSim.power(s) && BH.Clock.isDark(s) && !BH.Inv.has(s, 'torch')) m *= 0.45;
      const friends = BH.World.nearbyNpcs ? BH.World.nearbyNpcs(140).filter((n) => n.type === 'classmate' && n.rel >= 50).length : 0;
      if (friends) m *= 1.25; // studying with friends
      return m;
    },
    /* A one-off reading session (library shelf, desk "Study 30 min") */
    studyNow(s, code, amount, args = {}) {
      const g = A().study(s, code, Math.round(amount * Activities.boost(s)));
      S().change(s, { rest: -4 });
      return g;
    },

    /* ---------- meals ---------- */
    initCtx(s, id) {
      const b = D.BLOCKS[id];
      if (b.kind === 'meal') {
        const food = S().school(s).food;
        if (b.meal === 'lunch' && s.time.dow === 4) return { special: true };
        const menu = D.MENUS[b.meal];
        return { idx: U.weighted(menu.map((m, i) => i), (i) => 1 / Math.pow(1 + Math.abs(menu[i].q - food) * 1.5, 2)) };
      }
      if (id === 'prep') return { nepa: false };
      return {};
    },
    meal(s, ctx, mealKey) { return ctx.special ? D.MENUS.fridayLunch : D.MENUS[mealKey][ctx.idx || 0]; },
    collectFood(s) {
      const b = BH.Time.block(s);
      if (b.kind !== 'meal') return { text: 'Food never ready. Come back when the bell ring.', cancel: true };
      if (s.today.flags['plate_' + b.meal]) return { text: 'You don collect your own already. (Double-dipping na stealing o 👀)', cancel: true };
      const ctx = BH.Time.ctx(s);
      const m = Activities.meal(s, ctx, b.meal);
      s.today.flags['plate_' + b.meal] = true;
      s.today.flags.plate = { meal: b.meal, ctx };
      const late = s.today.flags.lateFor === b.meal;
      return { text: `The cook slap **${m.name}** on your plate${late ? ' — small, because you came late' : ''}. Go sit at your house table and eat. 🍛`, good: true };
    },
    eatPlate(s, args = {}, obj) {
      const p = s.today.flags.plate;
      if (!p) return { text: 'You no get food on your plate. Collect from the counter first.', cancel: true };
      // sit down on the bench at this table and eat (then stay seated until you walk off)
      const seat = obj && obj.seats && obj.seats.length ? Activities.nearestSeat(s, obj) : null;
      if (seat) { Activities.stand(s, true); BH.World.snap && BH.World.snap(Object.assign({ h: -Math.PI / 2 }, seat)); }
      const m = Activities.meal(s, p.ctx, p.meal);
      let mult = args.mult || 1;
      const junior = s.time.year <= 3;
      let note = '';
      if (junior && s.seniorFavour < 35) { mult *= 0.75; note = ' The table head "adjust" your portion. 😑'; }
      if (s.today.flags.lateFor === p.meal) mult *= 0.5;
      if (args.wicked) { BH.Seniority.adjust(s, 1); BH.bus.emit('action', { tag: 'wicked' }); note = ' You pack the meat for your own plate. The juniors watch with their eyes. 😈'; }
      if (args.kind) { BH.Seniority.adjust(s, -1); S().rep(s, 1); BH.bus.emit('action', { tag: 'kind' }); note = ' Everybody get equal portion. One JSS1 whisper "God bless you Senior." 🫶'; }
      const hunger = Math.round(m.hunger * (0.75 + S().school(s).food * 0.07) * mult);
      S().change(s, { hunger, thirst: m.thirst + 6, morale: (m.q - 2) * 2 + (m.special ? 6 : 0) });
      s.today.flags.plate = null;
      if (!s.today.meals[p.meal]) { s.today.meals[p.meal] = true; s.stats_history.meals++; BH.bus.emit('meal', { meal: p.meal }); }
      const lines = m.q <= 1 ? ['You chop am with closed eyes. Survival mode activated.', 'The food taste like punishment, but belle no get eye.'] : m.q >= 4 ? ['E sweet die! You lick the plate finish. 😋', 'Correct food! Today the cooks get anointing.'] : ['E no bad. E fill belle.', 'You chop am finish, drink water, belch small.'];
      if (!seat) return { text: U.pick(lines) + note, good: true, mins: 15 };
      const map = s.world.map || 'campus';
      Activities.busy(s, 15, '🍽️ Eating…', { pose: 'eat', seat: true, after: { type: 'seat', obj: obj.id, map } });
      return { text: U.pick(lines) + note, good: true };
    },

    /* ---------- assembly inspection ---------- */
    inspect(s, manual) {
      if (s.today.flags.inspected) return manual ? { text: 'Inspection don pass.', cancel: true } : null;
      if (!manual && !Activities.present(s)) return null;
      s.today.flags.inspected = true;
      if (BH.Interaction.test(s, 'prefect:head')) return null;
      if (s.stats.hunger < 15) {
        S().change(s, { health: -6, hunger: 18, morale: -6 }); S().rep(s, -3);
        BH.Gist.add(s, `${s.player.name.split(' ')[0]} faint for assembly! Hunger don win 😵`, { about: 'me', valence: -0.2 });
        toast('😵 The anthem start… everything turn black. You FAINT for assembly ground! Dem carry you go sick bay.', 'bad');
        s.today.flags.excused = abs(s) + 90;
        BH.World.escort && BH.World.escort('sickbay');
        return { text: 'You fainted.', noTime: true };
      }
      const hyg = s.stats.hygiene + (s.today.flags.laundry ? 10 : 0);
      const passed = hyg >= 45 && !(hyg < 70 && U.chance(0.15));
      BH.bus.emit('inspection', { passed });
      if (passed) { S().rep(s, 1); toast(U.pick(['🧐 Prefect check your nails, collar… nod. Inspection PASSED. ✅', '🧐 Your shoe shine pass mirror. Inspection: PASSED. ✅']), 'good'); return { text: 'Passed.', noTime: true }; }
      const p = U.pick(['"Your collar don brown like akara!" ', '"See your nails! You dey farm with hand?" ', '"Your hair don bush like Sambisa!" ']) + (s.stats.hygiene < 25 ? Dsc().offence(s, 'Reported to house master for dirtiness', 1) : Dsc().minor(s, 'Failed morning inspection'));
      toast('🧐 ' + p, 'bad');
      return { text: p, noTime: true };
    },

    /* ---------- sleep, naps, hiding, busy ---------- */
    sleep(s, where, obj) {
      const m = BH.Clock.mod(s);
      if (where === 'bed' && !(m >= 20 * 60 + 30 || m < 5 * 60)) return Activities.nap(s, { mins: 60, rest: 22, where: 'bed' }, obj);
      Activities.stand(s, true);
      const until = s.clock >= 300 ? s.time.dayCount * 1440 + 29 * 60 : s.time.dayCount * 1440 + 300;
      let quality = where === 'bed' ? 1 : 0.6;
      if (BH.Inv.has(s, 'mosquitoNet')) quality *= 1.15;
      if (BH.WorldSim.weather(s) === 'heat') quality *= 0.9;
      s.act = { type: 'sleep', where, quality, obj: obj && obj.id };
      BH.Clock.wait(s, until - abs(s), { reason: 'sleep', rate: 120, label: '😴 Sleeping… (move to wake up)' });
      BH.bus.emit('sleep', { where, nap: false });
      if (obj && BH.World.snap && obj.seats && obj.seats[0]) BH.World.snap(obj.seats[0]);
      return { text: where === 'bed' ? U.pick(['Your head touch pillow and you don travel. 🌙', 'Mosquito dey sing, but sleep win. 😴']) : 'You sleep right there. Hope nobody see you… 😬', noTime: true };
    },
    nap(s, args = {}, obj) {
      Activities.stand(s, true);
      const where = args.where || 'floor';
      const mins = args.mins || 45;
      const quality = (args.rest || 15) / (mins * 0.21);
      s.act = { type: 'sleep', where, quality, health: args.health ? args.health / mins : 0, obj: obj && obj.id };
      BH.Clock.wait(s, mins, { reason: 'nap', rate: 60, label: `💤 Napping (${mins} min)…` });
      BH.bus.emit('sleep', { where, nap: true });
      if (obj && BH.World.snap && obj.seats && obj.seats[0]) BH.World.snap(Activities.nearestSeat(s, obj));
      return { text: where === 'bed' ? 'You lie down for small nap. 💤' : `You doze off on the ${where}. 💤`, noTime: true };
    },
    wake(s, why) {
      if (!s.act || s.act.type !== 'sleep') return;
      s.act = null;
      if (why === 'rising') toast('🔔 KPOM! KPOM! Rising bell! House master voice: "EVERYBODY OUT!"', 'info');
      else if (why === 'time') toast('🥱 You wake up.', 'info');
      else if (why === 'event' || why === 'call') toast('😳 Something wake you up!', 'info');
    },
    waitEnded(s, reason, why) {
      if (reason === 'sleep' || reason === 'nap') Activities.wake(s, why);
      if (reason === 'busy' && s.act && s.act.type === 'busy') s.act = s.act.after || null;
    },
    passOut(s) {
      if (s.act && s.act.type === 'sleep') return;
      toast('😵 Your body don shut down — you collapse asleep where you stand!', 'bad');
      BH.Gist.add(s, `${s.player.name.split(' ')[0]} sleep off standing up 😂`, { about: 'me', valence: -0.1 });
      Activities.nap(s, { mins: 120, rest: 35, where: 'floor' });
    },
    hide(s, obj) {
      Activities.stand(s, true);
      s.act = { type: 'hide', obj: obj && obj.id, map: s.world.map || 'campus' };
      if (s.world.sus) s.world.sus.level = Math.max(0, s.world.sus.level - 0.3);
      if (obj && BH.World.snap) BH.World.snap({ x: obj.x, y: obj.y + (obj.solid ? 20 : 0) });
      return { text: '🫥 You hide. Nobody fit see you here. Move to come out.', noTime: true };
    },
    /* extra: { pose, seat, after } — e.g. eating seated at a table, then staying seated (after) when the time is up */
    busy(s, mins, label, extra) {
      if (!mins) return;
      const keep = s.act && ['lesson', 'prep'].includes(s.act.type) ? s.act : null;
      if (!keep) s.act = Object.assign({ type: 'busy', label }, extra || {});
      BH.Clock.wait(s, mins, { reason: keep ? 'wait' : 'busy', rate: 30, label });
    },
  };

  BH.registerSystem('Activities', Activities);
})(window.BH);
