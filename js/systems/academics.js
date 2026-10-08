/* Academics: subjects, knowledge, CA + exams, SS1 departments, timetables, question picking, teacher flavour */
(function (BH) {
  const U = BH.U;
  const D = BH.data;

  const newSub = (knowledge) => ({ knowledge, ca: [], exam: [], seen: [], attended: 0, missed: 0, late: 0, tests: {}, assignments: 0 });
  const TEST_WEEKS = [4, 8];

  const Academics = {
    onNewGame(s) {
      const base = BH.Stats.has(s, 'bookworm') ? 36 : 24;
      const subjects = {};
      D.CURRICULUM.JSS.forEach((code) => { subjects[code] = newSub(base + U.randInt(0, 10)); });
      s.academics = { stage: 'JSS', dept: null, timetable: null, subjects };
    },

    /* New school year: harder syllabus, so knowledge slips a bit and seen-questions reset */
    onNewYear(s) {
      Object.values(s.academics.subjects).forEach((sub) => {
        sub.knowledge = Math.round(sub.knowledge * 0.85);
        sub.seen = [];
        sub.tests = {};
      });
    },

    /* Forgetting curve: knowledge you don't use slowly fades */
    onDayEnd(s) {
      Object.values(s.academics.subjects).forEach((sub) => {
        if (sub.knowledge > 25) sub.knowledge = Math.max(25, sub.knowledge - 0.3);
      });
    },

    onNewDay(s) {
      if (s.time.dayType !== 'weekday' || s.time.dow !== 0) return;
      if (s.time.week === D.CONFIG.TERM_WEEKS - 1) BH.log(s, '📢 Exams start NEXT WEEK. Read your books o!', 'bad');
      if (s.time.week === D.CONFIG.TERM_WEEKS) BH.log(s, '📝 EXAM WEEK! Every period na exam paper.', 'bad');
      if (TEST_WEEKS.includes(s.time.week)) { BH.log(s, '📝 Test week! Sit in class to write each subject\'s test.', 'bad'); BH.UI && BH.UI.toast('📝 TEST WEEK — every class you attend this week starts with a test.', 'bad'); }
    },

    levelNum(s) { return s.time.year; },          // 1 = JSS1 … 6 = SS3
    levelName(s) { return D.LEVELS[s.time.year - 1]; },
    stage(s) { return s.time.year <= 3 ? 'JSS' : 'SS'; },
    codes(s) { return Object.keys(s.academics.subjects); },
    isExamWeek(s) { return s.time.week === D.CONFIG.TERM_WEEKS && s.time.dayType === 'weekday'; },

    /* ---------- other routes to knowledge, offered in conversations ---------- */
    talkOptions(s, n) {
      const out = [];
      const inClass = BH.Time.block(s).kind === 'class';
      if (n.type === 'classmate' && !inClass) {
        if (!s.today.talked['study' + n.id] && n.rel >= 45) out.push({
          label: '📚 "Make we read together"', sub: '30 min · knowledge + friendship',
          run() {
            s.today.talked['study' + n.id] = true;
            const code = U.pick(Academics.quizzable(s).length ? Academics.quizzable(s) : Academics.codes(s));
            const smart = n.arch === 'brilliant' || n.persona === 'bookish' || (n.ability || 50) >= 65;
            const g = Academics.study(s, code, smart ? 8 : 5);
            BH.NPC.rel(s, n, 4); BH.Stats.change(s, { rest: -3 });
            BH.Activities.busy(s, 30, `📚 Reading with ${n.first}…`);
            return `You and ${n.first} read ${Academics.name(s, code, true)} together.${smart ? ` ${n.first} explain am so simple!` : ''} (+${g} knowledge) 📚`;
          },
        });
        if ((n.arch === 'brilliant' || n.persona === 'bookish') && !BH.Inv.has(s, 'lessonNotes') && !s.today.talked['notes' + n.id]) out.push({
          label: '📓 Ask for their lesson notes', sub: n.rel >= 55 ? 'They like you' : 'Need a better friendship',
          run() {
            s.today.talked['notes' + n.id] = true;
            if (n.rel >= 55) { BH.Inv.add(s, 'lessonNotes', 1); BH.NPC.rel(s, n, 2); return `${n.first} hand you their notes — neat like typewriter: "No tear am o." 📓 (+50% when you study)`; }
            BH.NPC.rel(s, n, -1);
            return `${n.first}: "My notes? Hmm. Make we know each other well first." 🙅`;
          },
        });
      }
      if (n.type === 'teacher' && !inClass && s.academics.subjects[BH.NPC.subjectFor(s, n)]) out.push({
        label: `💸 Special lesson in ${Academics.name(s, BH.NPC.subjectFor(s, n), true)} (₦500)`, sub: '45 min · big knowledge boost',
        disabled: s.money < 500 ? 'You need ₦500' : s.today.talked['lesson' + n.id] ? 'Done today' : null,
        run() {
          s.today.talked['lesson' + n.id] = true;
          BH.Stats.money(s, -500);
          const g = Academics.study(s, BH.NPC.subjectFor(s, n), 12);
          BH.NPC.rel(s, n, 5); BH.Consequences.repChange(s, 'teachers', 1);
          BH.Activities.busy(s, 45, `👩🏾‍🏫 Special lesson…`);
          BH.Paths.add(s, 'scholar', 2);
          return `${BH.NPC.name(n)} take you through ${Academics.name(s, BH.NPC.subjectFor(s, n), true)} one-on-one in the staff room. (+${g} knowledge) "Don't tell the others." 🤫`;
        },
      });
      return out;
    },

    /* ---------- tests, attendance & assignments (classes are optional but tracked) ---------- */
    TEST_WEEKS,
    isTestWeek(s) { return TEST_WEEKS.includes(s.time.week) && s.time.dayType === 'weekday'; },
    testKey(s) { return `${s.time.year}-${s.time.term}-${s.time.week}`; },
    testDue(s, code) {
      const sub = s.academics.subjects[code];
      return !!sub && Academics.isTestWeek(s) && sub.tests[Academics.testKey(s)] === undefined;
    },
    recordTest(s, code, pct) {
      const sub = s.academics.subjects[code];
      if (!sub) return;
      sub.tests[Academics.testKey(s)] = Math.round(pct);
      sub.ca.push(Math.round(pct));
      s.flags.testHint = 0;
      BH.bus.emit('test:done', { code, pct });
    },
    /* Preparation → hints in tests/exams: knowledge, past questions, a peek at the mark book, leaked papers */
    hints(s, code, mode) {
      const k = s.academics.subjects[code] ? s.academics.subjects[code].knowledge : 0;
      let h = k >= 80 ? 2 : k >= 55 ? 1 : 0;
      if (BH.Inv.has(s, 'pastQuestions')) h++;
      if (s.flags.testHint && mode === 'test') h++;
      if (BH.Inv.has(s, 'examPaper') && mode === 'exam') h += 2;
      return Math.min(5, h);
    },
    /* Score for subjects without a question bank */
    writtenScore(s, code, bonus = 0) {
      const sub = s.academics.subjects[code];
      const tired = s.stats.rest < 25 ? -8 : 0;
      return U.clamp(Math.round(sub.knowledge * 0.75 + 18 + U.randInt(-8, 8) + tired + bonus));
    },
    attend(s, code) { const sub = s.academics.subjects[code]; if (sub) sub.attended++; const t = BH.NPC.teacher(s, code); if (t) BH.NPC.rel(s, t, 1); },
    markMissed(s, code) { const sub = s.academics.subjects[code]; if (sub) sub.missed++; },
    markLate(s, b) { const code = b.kind === 'class' ? Academics.periodSubject(s, b.period) : null; if (code && s.academics.subjects[code]) s.academics.subjects[code].late++; },
    attendanceRate(s, code) { const sub = s.academics.subjects[code]; const tot = sub.attended + sub.missed; return tot ? sub.attended / tot : 1; },
    /* Assignment handed in (or not) → goes into continuous assessment */
    submitAssignment(s, code, ok) {
      const sub = s.academics.subjects[code];
      if (!sub) return;
      const m = (s.missions || []).find((x) => x.tpl === 'assignment' && x.vars.subject === code);
      const bonus = (m && m.vars.quality) || 0;
      sub.ca.push(ok ? U.clamp(Math.round(sub.knowledge * 0.6 + 35 + bonus + U.randInt(-5, 5))) : 0);
      if (ok) sub.assignments++;
    },

    name(s, code, short) {
      if (code === 'RS') return D.RELIGIONS[s.player.religion].rs;
      if (code === 'NLG') return D.LANGUAGES[s.player.lang] || 'Yoruba';
      const sub = D.SUBJECTS[code];
      return short ? sub.short : sub.name;
    },
    emoji(code) { return D.SUBJECTS[code].emoji; },

    /* ---------- timetables ---------- */
    /* what YOU have this period (your class arm's timetable, resolved for your department / religion / language) */
    periodSubject(s, period) {
      const L = BH.School.lessonFor(s, 'player', s.time.dow, period);
      return L ? L.code : null;
    },
    /* ---------- SS1 department ---------- */
    recommend(s) {
      const k = (c) => (s.academics.subjects[c] ? s.academics.subjects[c].knowledge : 0);
      const score = {};
      Object.entries(D.DEPARTMENTS).forEach(([key, d]) => { score[key] = d.from.reduce((a, c) => a + k(c), 0) / d.from.length; });
      return Object.keys(score).sort((a, b) => score[b] - score[a])[0];
    },
    setDepartment(s, dept) {
      const codes = [...D.SS_CORE, ...D.DEPARTMENTS[dept].subjects];
      const old = s.academics.subjects;
      const subjects = {};
      codes.forEach((c) => {
        if (old[c]) { subjects[c] = newSub(old[c].knowledge); return; }
        const feed = old[D.SS_FEEDS[c]];
        subjects[c] = newSub(feed ? Math.round(feed.knowledge * 0.6 + 6) : 18);
      });
      s.academics.subjects = subjects;
      s.academics.dept = dept;
      s.academics.stage = 'SS';
      s.academics.timetable = null; // your department decides which room you go to in SS "line" periods (BH.School)
      BH.School.setDept(s, 'player', dept);
      BH.log(s, `${D.DEPARTMENTS[dept].emoji} You joined the ${D.DEPARTMENTS[dept].label} class`, 'good');
    },

    /* ---------- questions ---------- */
    /* Use the closest level at or below yours that has enough questions */
    bank(s, code) {
      const all = BH.Q[code] || [];
      for (let lvl = Academics.levelNum(s); lvl >= 1; lvl--) {
        const exact = all.filter((q) => q.lvl === lvl);
        if (exact.length >= 6) return exact;
      }
      return all.filter((q) => q.lvl <= Academics.levelNum(s));
    },
    hasQuiz(s, code) { return Academics.bank(s, code).length >= 3; },
    quizzable(s) { return Academics.codes(s).filter((c) => Academics.hasQuiz(s, c)); },

    /* Pick n unseen questions; shuffle options so the answer position varies */
    pickQuestions(s, code, n) {
      const bank = Academics.bank(s, code);
      const sub = s.academics.subjects[code];
      let pool = bank.map((q, i) => i).filter((i) => !sub.seen.includes(i));
      if (pool.length < n) { sub.seen = []; pool = bank.map((q, i) => i); }
      const chosen = U.sample(pool, Math.min(n, pool.length));
      sub.seen.push(...chosen);
      return chosen.map((i) => {
        const q = bank[i];
        const order = U.shuffle([0, 1, 2, 3]);
        return { q: q.q, o: order.map((j) => q.o[j]), a: order.indexOf(q.a), e: q.e };
      });
    },

    /* Knowledge gain. Tiredness makes reading less effective. */
    study(s, code, amount, silent) {
      const sub = s.academics.subjects[code];
      if (!sub) return 0;
      const restFactor = s.stats.rest < 20 ? 0.5 : s.stats.rest < 40 ? 0.8 : 1;
      // diminishing returns: the more you know, the harder the next mark
      const curve = Math.max(0.2, 1.15 - sub.knowledge / 110);
      const gain = Math.max(1, Math.round(amount * BH.Stats.mod(s, 'study') * restFactor * curve));
      sub.knowledge = U.clamp(sub.knowledge + gain);
      BH.fx.push(D.SUBJECTS[code].emoji, gain, Academics.name(s, code, true));
      if (!silent) { s.today.studies++; BH.bus.emit('study', { code, map: (s.world && s.world.map) || 'campus' }); }
      return gain;
    },

    recordScore(s, code, pct) {
      const sub = s.academics.subjects[code];
      sub.ca.push(Math.round(pct));
      sub.attended++;
    },
    recordExam(s, code, pct) {
      const sub = s.academics.subjects[code];
      (sub.exam = sub.exam || []).push(Math.round(pct));
    },
    /* Exam paper for subjects without a question bank: depends on what you know */
    writtenExam(s, code, bonus = 0) {
      const sub = s.academics.subjects[code];
      const tired = s.stats.rest < 25 ? -8 : 0;
      const pct = U.clamp(Math.round(sub.knowledge * 0.75 + 18 + U.randInt(-8, 8) + tired + bonus));
      Academics.recordExam(s, code, pct);
      return pct;
    },
    average(s, code) {
      const ca = s.academics.subjects[code].ca;
      return ca.length ? Math.round(ca.reduce((a, b) => a + b, 0) / ca.length) : null;
    },
    grade(pct) {
      if (pct === null || pct === undefined) return '–';
      return pct >= 75 ? 'A' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 45 ? 'D' : pct >= 40 ? 'E' : 'F';
    },
    avgKnowledge(s) {
      const v = Object.values(s.academics.subjects).map((x) => x.knowledge);
      return v.reduce((a, b) => a + b, 0) / v.length;
    },

    /* Teacher flavour lines — every teacher has their own voice in content/staff.json */
    teacherInfo(s, code) {
      const t = BH.NPC.teacher(s, code);
      const def = (t && BH.School.staffDef(t.id)) || { lines: {} };
      const L = def.lines || {};
      const topic = U.seedPick(D.TOPICS[code] || ['Revision'], s.time.dayCount + code);
      const tname = t ? BH.NPC.name(t) : 'The teacher';
      const fill = (x) => U.fill(x, { topic, t: tname, n: s.player.name.split(' ')[0] });
      return {
        t, tname, topic, strict: t ? t.strict : 0.5, def,
        enter: fill(U.seedPick(L.enter || ['{t} begins the lesson on {topic}.'], s.time.dayCount + code)),
        right: (L.right || ['"Correct!"']).map(fill), wrong: (L.wrong || ['"No. Pay attention."']).map(fill),
        punish: fill(L.punish || '{t} sends you out of class.'),
      };
    },
  };

  /* SS1 department choice — queued at the start of SS1 */
  BH.Events.EVENTS.department = {
    forced: true, emoji: '🧭', title: 'SS1: Choose Your Department',
    text(s) {
      const rec = D.DEPARTMENTS[Academics.recommend(s)];
      const bece = s.certificates && s.certificates.bece;
      return `Welcome to Senior Secondary! The Vice Principal (Academics) dey share forms: **Science, Arts or Commercial?** This choice go follow you reach WAEC and JAMB.\n\n${bece ? `Your BECE: ${bece.summary}.\n\n` : ''}Your form teacher look your results: "Based on your strengths, I recommend **${rec.label}**."\n\nDaddy don already tell everybody for church say you go be doctor. 🩺`;
    },
    choices: () => Object.entries(D.DEPARTMENTS).map(([key, d]) => ({
      label: `${d.emoji} ${d.label}`,
      sub: d.subjects.map((c) => D.SUBJECTS[c].short).join(' · '),
      run(s) {
        Academics.setDepartment(s, key);
        const lines = {
          science: 'Daddy: "My son/daughter the DOCTOR!" 🩺 Physics teacher welcome you with formula wey nobody understand.',
          arts: 'Mrs. Ekwueme the Literature teacher hug you: "Welcome, my poet." Daddy say "Lawyer is also okay… I guess." ⚖️',
          commercial: 'The Accounting teacher say: "Debit the receiver, credit the giver." You don dey count money for your head already. 💼',
        };
        return `${d.desc}\n\n${lines[key]}`;
      },
    })),
  };

  BH.registerSystem('Academics', Academics);
})(window.BH);
