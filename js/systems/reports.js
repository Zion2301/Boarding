/* Report cards (CA 40% + Exam 60%, class position, teacher comments),
   BECE (end of JSS3), WAEC / NECO / JAMB (end of SS3) and your graduation legacy. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const A = () => BH.Academics;

  const avg = (arr) => (arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const remark = (t) => (t >= 75 ? 'Excellent' : t >= 65 ? 'Very good' : t >= 55 ? 'Good' : t >= 45 ? 'Fair' : t >= 40 ? 'Pass' : 'Poor');
  const SUBJECT_COMMENTS = {
    hi: ['Excellent! Keep it up.', 'A brilliant performance.', 'Outstanding. Well done.'],
    mid: ['Good. Can do better.', 'Shows promise.', 'A good effort.'],
    lo: ['Can do better.', 'Needs to sit up.', 'More effort required.'],
    bad: ['Poor. Wake up!', 'Very unserious.', 'See me.'],
  };
  const subjectComment = (t) => U.pick(SUBJECT_COMMENTS[t >= 70 ? 'hi' : t >= 55 ? 'mid' : t >= 40 ? 'lo' : 'bad']);

  const WAEC_GRADES = [[75, 'A1'], [70, 'B2'], [65, 'B3'], [60, 'C4'], [55, 'C5'], [50, 'C6'], [45, 'D7'], [40, 'E8'], [0, 'F9']];
  const waecGrade = (x) => WAEC_GRADES.find(([min]) => x >= min)[1];
  const isCredit = (g) => /^(A1|B2|B3|C4|C5|C6)$/.test(g);

  const Reports = {
    ordinal, waecGrade, isCredit,

    onNewGame(s) { s.reports = []; s.certificates = {}; },

    caScore(s, code) {
      const sub = s.academics.subjects[code];
      const ca = avg(sub.ca);
      const att = BH.Academics.attendanceRate(s, code);
      if (ca !== null) return U.clamp(Math.round(ca * 0.85 + att * 15 - (sub.late || 0)));
      // no classwork quizzes for this subject: teacher estimates from knowledge & behaviour
      return U.clamp(Math.round(sub.knowledge * 0.6 + 25 - Math.min(10, s.discipline.points / 2)));
    },
    examScore(s, code) {
      const sub = s.academics.subjects[code];
      const ex = avg(sub.exam);
      return ex !== null ? Math.round(ex) : A().writtenExam(s, code);
    },

    /* Called at the end of every term, before scores reset */
    generate(s) {
      const rows = A().codes(s).map((code) => {
        const ca = Reports.caScore(s, code);
        const exam = Reports.examScore(s, code);
        const total = Math.round(ca * 0.4 + exam * 0.6);
        return { code, name: A().name(s, code), ca, exam, total, grade: A().grade(total), remark: remark(total), comment: subjectComment(total) };
      });
      const average = Math.round(rows.reduce((a, r) => a + r.total, 0) / rows.length);
      // coursemates' averages for class position
      const others = s.npcs.classmates.map((c) => U.clamp((c.ability || 50) + U.randInt(-9, 9)));
      const position = 1 + others.filter((x) => x > average).length;
      const classSize = others.length + 1;
      const pts = s.discipline.points;
      let form;
      if (pts >= 15) form = average >= 60 ? 'Brilliant, but too playful. Discipline must improve.' : 'Too playful and unserious. Must sit up immediately.';
      else if (average >= 70) form = pts <= 3 ? 'A disciplined and brilliant student. Keep it up!' : 'Very brilliant. Keep it up.';
      else if (average >= 55) form = pts <= 3 ? 'A disciplined student. Can do better.' : 'A good student. Can do better.';
      else if (average >= 45) form = 'Can do better. Must work harder.';
      else form = 'Poor performance. Needs serious improvement.';
      if (s.reputation >= 65) form += ' Very popular among peers — use it well.';
      const lastTerm = s.time.term === D.CONFIG.TERMS_PER_YEAR;
      const lvl = D.LEVELS[s.time.year - 1];
      const next = D.LEVELS[s.time.year];
      let principal;
      if (lastTerm) principal = !next ? 'Completed secondary education.' : average >= 40 ? `Promoted to ${next}.` : `Promoted to ${next} on trial. Parents should see the Principal.`;
      else principal = average >= 50 ? 'A good result. Next term begins soon.' : 'Below expectation. Parents should take note.';
      const report = {
        level: lvl, term: s.time.term, rows, average, position, classSize, form, principal,
        conduct: pts <= 3 ? 'Excellent' : pts <= 8 ? 'Good' : pts <= 15 ? 'Fair' : 'Poor',
        attendance: rows.reduce((a, r) => a + (s.academics.subjects[r.code].attended || 0), 0),
      };
      s.reports.push(report);
      return report;
    },

    /* Parents react when they see the report at home */
    parentsReact(s, r) {
      const bonus = { struggling: 500, middle: 2000, bigman: 10000 }[s.player.background];
      if (r.position <= 3) { BH.Stats.money(s, bonus * 2); BH.Stats.change(s, { morale: 15 }); s.family.daddy = U.clamp(s.family.daddy + 10); return `Daddy carry the report go show everybody for church: "My ${BH.gendered(s, 'son', 'daughter')} came ${ordinal(r.position)}!" He dash you ${U.money(bonus * 2)}. 🏆`; }
      if (r.average >= 60) { BH.Stats.money(s, bonus); BH.Stats.change(s, { morale: 8 }); s.family.daddy = U.clamp(s.family.daddy + 4); return `Daddy nod: "Good. But who are the people ahead of you? Do they have two heads?" He add ${U.money(bonus)} to your pocket money.`; }
      if (r.average >= 45) { BH.Stats.change(s, { morale: -3 }); return 'Daddy look the report for long time. "Hmm." That "hmm" pain you pass koboko.'; }
      BH.Stats.change(s, { morale: -12 }); s.family.daddy = U.clamp(s.family.daddy - 8);
      return 'Daddy seize your holiday "enjoyment": no TV, no visiting friends, extra lesson every day. 😩';
    },

    /* ---------- BECE (end of JSS3) ---------- */
    bece(s) {
      const subjects = A().codes(s).map((code) => {
        const k = s.academics.subjects[code].knowledge;
        const score = U.clamp(Math.round(k * 0.72 + 12 + U.randInt(-8, 8)));
        const grade = score >= 70 ? 'Distinction' : score >= 55 ? 'Credit' : score >= 40 ? 'Pass' : 'Fail';
        return { code, name: A().name(s, code), score, grade };
      });
      const dist = subjects.filter((x) => x.grade === 'Distinction').length;
      const credits = subjects.filter((x) => x.grade === 'Distinction' || x.grade === 'Credit').length;
      const passed = subjects.filter((x) => x.grade !== 'Fail').length;
      s.certificates.bece = { subjects, summary: `${dist} distinction${dist === 1 ? '' : 's'}, ${credits} credits & above, ${passed}/${subjects.length} passed` };
      BH.log(s, `📜 BECE results: ${s.certificates.bece.summary}`, 'good');
      return s.certificates.bece;
    },

    /* ---------- WAEC / NECO / JAMB (end of SS3) ---------- */
    finals(s) {
      const codes = A().codes(s);
      const sit = (noise) => codes.map((code) => {
        const k = s.academics.subjects[code].knowledge;
        const score = U.clamp(Math.round(k * 0.75 + 12 + U.randInt(-noise, noise)));
        return { code, name: A().name(s, code), grade: waecGrade(score) };
      });
      const waec = sit(10), neco = sit(12);
      const credits = (res) => res.filter((x) => isCredit(x.grade)).length;
      const hasCore = (res) => ['ENG', 'MTH'].every((c) => { const r = res.find((x) => x.code === c); return r && isCredit(r.grade); });
      const dept = D.DEPARTMENTS[s.academics.dept || 'science'];
      const jambSubs = ['ENG', ...dept.jamb];
      const jamb = jambSubs.map((code) => {
        const sub = s.academics.subjects[code];
        return { code, name: A().name(s, code), score: U.clamp(Math.round((sub ? sub.knowledge : 30) * 0.72 + 4 + U.randInt(-12, 12))) };
      });
      const jambTotal = jamb.reduce((a, x) => a + x.score, 0);
      s.certificates.waec = { results: waec, credits: credits(waec), core: hasCore(waec) };
      s.certificates.neco = { results: neco, credits: credits(neco), core: hasCore(neco) };
      s.certificates.jamb = { results: jamb, total: jambTotal };
      return s.certificates;
    },

    admission(s) {
      const c = s.certificates;
      const okOLevel = (c.waec.core && c.waec.credits >= 5) || (c.neco.core && c.neco.credits >= 5);
      const j = c.jamb.total;
      const dept = s.academics.dept || 'science';
      const courses = {
        science: [[260, 'Medicine & Surgery'], [230, 'Engineering'], [200, 'Computer Science'], [180, 'Microbiology']],
        arts: [[260, 'Law'], [230, 'Mass Communication'], [200, 'English & Literary Studies'], [180, 'History & International Studies']],
        commercial: [[250, 'Accounting'], [225, 'Economics'], [200, 'Business Administration'], [180, 'Banking & Finance']],
      }[dept];
      const unis = j >= 250 ? ['University of Lagos', 'University of Ibadan', 'Obafemi Awolowo University'] : j >= 210 ? ['University of Nigeria, Nsukka', 'Ahmadu Bello University', 'University of Benin'] : ['a good state university', 'a federal polytechnic'];
      if (!okOLevel) return 'Your O\'Level no get five credits with English and Maths, so admission go wait. You go rewrite WAEC/NECO next year — no shame, plenty great people do am. 💪';
      const course = courses.find(([min]) => j >= min);
      if (!course) return `JAMB score ${j} no reach the cut-off for admission this year. You go rewrite JAMB — next year na your year. 💪`;
      return `With ${j} in JAMB, you gain admission to study **${course[1]}** at **${U.pick(unis)}**! 🎓`;
    },

    legacy(s) {
      const c = s.certificates;
      const friends = s.npcs.classmates.slice().sort((a, b) => b.rel - a.rel).slice(0, 2);
      const crush = BH.NPC.crush(s);
      const post = BH.Seniority.postLabel(s);
      const style = BH.Seniority.label(s);
      const lines = [
        `You don graduate from ${s.player.schoolName}! Six years of garri, wahala, friendship and growth.`,
        `🏆 Your legacy: ${BH.Paths.ending(s)}`,
        `📜 WAEC: ${c.waec.credits} credits${c.waec.core ? ' (with English & Maths)' : ''} · NECO: ${c.neco.credits} credits · JAMB: ${c.jamb.total}/400`,
        Reports.admission(s),
        post ? `You served as **${post}**${s.senior.stripped ? ' (until you were stripped of the post 😬)' : ''}.` : (s.senior.stripped ? 'You were made a prefect… and lost the post. Gist for reunion.' : 'You no hold any prefect post, but you survived SS3.'),
        style ? `Juniors remember you as: ${style}.` : '',
        friends.length ? `Your ride-or-dies: ${friends.map((f) => `${f.first} ${f.last}`).join(' & ')}. Una go dey talk till old age.` : '',
        crush && crush.rel >= 75 ? `And ${crush.first}? Una still dey talk till today. 💞` : '',
      ];
      return lines.filter(Boolean).join('\n\n');
    },
  };

  BH.registerSystem('Reports', Reports);
})(window.BH);
