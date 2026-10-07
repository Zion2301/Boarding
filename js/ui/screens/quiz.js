/* Classwork quiz mini-game */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const UI = () => BH.UI;

  const Quiz = {
    st: null,
    timer: null,

    open(s, { code, mode }, pre, preFx, onDone) {
      const info = BH.Academics.teacherInfo(s, code);
      const exam = mode === 'exam' || mode === 'cheat';
      const qs = BH.Academics.hasQuiz(s, code) ? BH.Academics.pickQuestions(s, code, exam ? D.CONFIG.EXAM_QUESTIONS : mode === 'test' ? 4 : D.CONFIG.QUIZ_QUESTIONS) : [];
      const openQ = ['test', 'exam'].includes(mode) ? Quiz.openQuestionFor(s, code) : null;
      const know = s.academics.subjects[code].knowledge;
      // preparation → hints: each hint strikes out one wrong option on a question
      const hintCount = ['test', 'exam'].includes(mode) ? BH.Academics.hints(s, code, mode) : 0;
      const hinted = U.sample(qs.map((q, i) => i), Math.min(qs.length, hintCount));
      Quiz.st = {
        code, mode, exam, pre, preFx, onDone, info, qs, idx: 0, correct: 0, answered: null, openQ, openPct: null,
        seconds: exam ? D.CONFIG.EXAM_SECONDS : mode === 'distracted' ? Math.round(D.CONFIG.QUIZ_SECONDS * 0.55) : D.CONFIG.QUIZ_SECONDS,
        // knowledge → chance to recall and strike out a wrong option (the "microchip" always helps)
        hints: qs.map((q, qi) => {
          if (['test', 'exam'].includes(mode) ? !hinted.includes(qi) : mode !== 'cheat' && Math.random() >= know / 140) return null;
          const wrong = [0, 1, 2, 3].filter((i) => i !== q.a);
          return U.pick(wrong);
        }),
      };
      UI().modal('', { locked: true, cls: 'quiz', kind: 'quiz' });
      if (qs.length) Quiz.show(); else Quiz.showOpen();
    },

    /* ---------- the open-ended (typed) question, graded by AI against a rubric ---------- */
    openQuestionFor(s, code) {
      const all = (BH.Content.get('openQuestions') || { questions: [] }).questions.filter((x) => x.subject === code && s.time.year >= x.levels[0] && s.time.year <= x.levels[1]);
      if (!all.length) return null;
      const sub = s.academics.subjects[code];
      sub.openSeen = sub.openSeen || [];
      const fresh = all.filter((x) => !sub.openSeen.includes(x.id));
      const q = U.pick(fresh.length ? fresh : all);
      sub.openSeen = [...sub.openSeen.filter((id) => id !== q.id), q.id].slice(-6);
      return q;
    },
    showOpen() {
      const q = Quiz.st;
      clearInterval(Quiz.timer);
      UI().updateModal(`
        <div class="quiz-head"><span>${BH.Academics.emoji(q.code)} <b>${U.esc(BH.Academics.name(BH.Game.s, q.code))}</b> · ${U.esc(q.info.tname)}</span><span class="muted">${q.qs.length ? 'Section B' : 'Written'} · ${q.openQ.marks} marks</span></div>
        <div class="exam-tag">✍️ ${q.exam ? 'EXAMINATION' : 'CLASS TEST'} — answer in your own words</div>
        <h3 class="q-text">${U.esc(q.openQ.q)}</h3>
        <textarea id="open-answer" class="write" maxlength="800" placeholder="Write your answer…"></textarea>
        <div class="counter"><span id="open-count">0</span>/800</div>
        <div id="q-feedback"></div>
        <button class="btn primary big" data-act="quizOpenSubmit">Submit answer ✍️</button>
        <button class="btn ghost" data-act="quizOpenSkip">Leave it blank</button>`);
      const ta = document.getElementById('open-answer');
      if (ta) { ta.addEventListener('input', () => { document.getElementById('open-count').textContent = ta.value.length; }); ta.addEventListener('keydown', (e) => e.stopPropagation()); }
    },
    async submitOpen(skip) {
      const q = Quiz.st;
      if (!q || q.grading) return;
      const ans = skip ? '' : (document.getElementById('open-answer') || {}).value || '';
      if (!skip && ans.trim().split(/\s+/).length < 3) { document.getElementById('q-feedback').innerHTML = '<div class="feedback bad">Write at least a sentence, or leave it blank.</div>'; return; }
      q.grading = true;
      document.getElementById('q-feedback').innerHTML = '<div class="feedback">🖊️ The teacher is marking your answer…</div>';
      const res = skip ? { score: 0, out_of: q.openQ.marks, comment: 'Blank. No marks.', strengths: [], improvements: [] } : await BH.AI.grade(q.openQ, ans);
      if (Quiz.st !== q) return;
      if (res.distress) { BH.Chat.help(); }
      const r = res.distress ? { score: 0, out_of: q.openQ.marks, comment: 'We\'ve paused marking — take care of yourself first.', strengths: [], improvements: [] } : res;
      q.openPct = (r.score / r.out_of) * 100;
      q.openResult = r;
      BH.bus.emit('open:graded', { code: q.code, score: r.score, outOf: r.out_of, source: r.source });
      document.getElementById('q-feedback').innerHTML = `<div class="feedback ${q.openPct >= 50 ? 'good' : 'bad'}"><b>✍️ ${r.score}/${r.out_of}</b> ${U.esc(r.comment)}
        ${r.strengths && r.strengths.length ? `<div class="explain">👍 ${r.strengths.map(U.esc).join(' · ')}</div>` : ''}
        ${r.improvements && r.improvements.length ? `<div class="explain">📌 ${r.improvements.map(U.esc).join(' · ')}</div>` : ''}
        <small class="muted">${r.source === 'ai' ? '✨ Marked by AI against the rubric' : '📜 Marked offline (key points)'}</small></div>
        <button class="btn primary big" data-act="quizOpenDone">${q.exam ? 'Submit exam paper ✍️' : 'Submit test ✍️'}</button>`;
      document.querySelectorAll('[data-act=quizOpenSubmit],[data-act=quizOpenSkip]').forEach((b) => b.remove());
    },
    /* combined score: multiple choice 70% + open answer 30% (open answer only: written estimate 60% + answer 40%) */
    combined(s, q, total) {
      const mcq = total ? (q.correct / total) * 100 : BH.Academics.writtenScore(s, q.code, BH.Academics.hints(s, q.code, q.mode) * 4);
      if (q.openPct === null) return mcq;
      return total ? mcq * 0.7 + q.openPct * 0.3 : mcq * 0.6 + q.openPct * 0.4;
    },

    show() {
      const q = Quiz.st;
      const item = q.qs[q.idx];
      const hint = q.hints[q.idx];
      q.answered = null;
      q.left = q.seconds;
      const opts = item.o.map((o, i) => `<button class="opt" data-act="quizAns" data-arg="${i}" ${hint === i ? 'disabled' : ''}>
        <span class="opt-l">${'ABCD'[i]}</span><span>${U.esc(o)}</span>${hint === i ? '<span class="struck">✗ you remember say na lie</span>' : ''}</button>`).join('');
      UI().updateModal(`
        <div class="quiz-head">
          <span>${BH.Academics.emoji(q.code)} <b>${U.esc(BH.Academics.name(BH.Game.s, q.code))}</b> · ${U.esc(q.info.tname)}</span>
          <span class="muted">Q${q.idx + 1}/${q.qs.length} · ✅ ${q.correct}</span>
        </div>
        ${q.mode === 'distracted' ? '<div class="warn">😬 You dey gist before — less time to think!</div>' : ''}
        ${q.exam ? `<div class="exam-tag">📝 EXAMINATION${q.mode === 'cheat' ? ' · 📜 microchip for your sleeve' : ''}</div>` : q.mode === 'test' ? '<div class="exam-tag">📝 CLASS TEST · counts for your CA</div>' : ''}
        <div class="timer"><i id="q-timer" style="width:100%"></i></div>
        <h3 class="q-text">${U.esc(item.q)}</h3>
        ${hint !== null ? `<div class="hint">${q.mode === 'cheat' ? '📜 Your microchip cancel one option!' : '💡 Something from prep don click — one option don cancel!'}</div>` : ''}
        <div class="opts">${opts}</div>
        <div id="q-feedback"></div>`);
      clearInterval(Quiz.timer);
      Quiz.timer = setInterval(() => {
        q.left -= 0.1;
        const bar = document.getElementById('q-timer');
        if (bar) { bar.style.width = Math.max(0, (q.left / q.seconds) * 100) + '%'; bar.classList.toggle('hurry', q.left < 5); }
        if (q.left <= 0) Quiz.answer(-1);
      }, 100);
    },

    answer(i) {
      const q = Quiz.st;
      if (!q || q.answered !== null) return;
      clearInterval(Quiz.timer);
      const item = q.qs[q.idx];
      q.answered = i;
      const right = i === item.a;
      if (right) q.correct++;
      document.querySelectorAll('.opt').forEach((b, j) => {
        b.disabled = true;
        if (j === item.a) b.classList.add('right');
        else if (j === i) b.classList.add('wrong');
      });
      const reaction = right ? U.pick(q.info.right) : i === -1 ? '"Time up! You dey dream?"' : U.pick(q.info.wrong);
      const last = q.idx >= q.qs.length - 1;
      document.getElementById('q-feedback').innerHTML = `
        <div class="feedback ${right ? 'good' : 'bad'}">
          <b>${right ? '✅ Correct!' : i === -1 ? '⏰ Time up!' : '❌ Wrong!'}</b> ${U.esc(reaction)}
          <div class="explain">📘 ${U.esc(item.e)}</div>
        </div>
        <button class="btn primary big" data-act="quizNext">${last ? (q.exam ? 'Submit exam paper ✍️' : 'Submit classwork ✍️') : 'Next question ➜'}</button>`;
    },

    finishExam(s, q, total) {
      BH.fx.begin();
      const pct = Quiz.combined(s, q, total);
      BH.Academics.recordExam(s, q.code, pct);
      BH.Stats.change(s, { rest: -6, morale: pct >= 80 ? 6 : pct < 40 ? -5 : 0 });
      s.stats_history.quizzes++;
      s.stats_history.correct += q.correct;
      BH.bus.emit('exam:done', { code: q.code, correct: q.correct, total });
      const fx = (q.preFx || []).concat(BH.fx.end());
      const verdict = pct >= 80 ? 'You submit with confidence. Distinction dey come! 🔥' : pct >= 60 ? 'You submit am. E go be.' : pct >= 40 ? 'You submit am and pray. 🙏' : 'You submit am and start to plan how to explain to Daddy. 😭';
      BH.log(s, `📝 ${BH.Academics.name(s, q.code, true)} exam: ${q.correct}/${total}`, pct >= 60 ? 'good' : 'bad');
      UI().closeModal(true);
      if (total && q.correct === total) UI().burst(['💯', '🎓', '🎉']);
      q.onDone && q.onDone({ text: `${q.pre ? q.pre + '\n\n' : ''}📝 **${BH.Academics.name(s, q.code)} exam: ${Math.round(pct)}%**${total ? ` (objectives ${q.correct}/${total})` : ''}${q.openResult ? `\n✍️ Essay: ${q.openResult.score}/${q.openResult.out_of} — _${q.openResult.comment}_` : ''}\n\n${verdict}`, fx });
    },

    next() {
      const q = Quiz.st;
      if (q.idx < q.qs.length - 1) { q.idx++; Quiz.show(); return; }
      if (q.openQ && q.openPct === null) { Quiz.showOpen(); return; }
      Quiz.finish();
    },

    finish() {
      const s = BH.Game.s;
      const q = Quiz.st;
      Quiz.st = null;
      const total = q.qs.length;
      const A = BH.Academics;
      if (q.exam) return Quiz.finishExam(s, q, total);
      BH.fx.begin();
      const pct = Quiz.combined(s, q, total);
      if (q.mode === 'test') A.recordTest(s, q.code, pct);
      else A.recordScore(s, q.code, pct);
      A.study(s, q.code, q.correct * 2 + 1, true);
      BH.Stats.change(s, { rest: q.mode === 'focus' ? -5 : -2, morale: total && q.correct === total ? 6 : q.correct === 0 ? -4 : 0 });
      BH.NPC.rel(s, q.info.t, total && q.correct === total ? 4 : q.correct === 0 ? -3 : 1);
      s.stats_history.quizzes++;
      s.stats_history.correct += q.correct;
      BH.bus.emit('quiz:done', { code: q.code, correct: q.correct, total });

      let verdict;
      if (total && q.correct === total) verdict = `${q.info.tname}: "Full marks! Everybody clap for ${s.player.name}!" 👏👏`;
      else if (q.correct === 0) verdict = q.info.strict >= 0.6 ? `${q.info.tname}: "Zero?! Kneel down for back of the class till the period end." 😩` : `${q.info.tname} sigh: "See me after class."`;
      else verdict = q.correct / total >= 0.6 ? `${q.info.tname}: "Not bad. You fit do better."` : `${q.info.tname}: "Can do better. Much better."`;
      if (q.correct === 0 && q.info.strict >= 0.6) BH.Stats.change(s, { rest: -4 });

      const fx = (q.preFx || []).concat(BH.fx.end());
      BH.log(s, `📝 ${A.name(s, q.code, true)} classwork: ${q.correct}/${total}`, q.correct === total ? 'good' : q.correct === 0 ? 'bad' : 'info');
      UI().closeModal(true);
      if (total && q.correct === total) UI().burst(['💯', '⭐', '🎉']);
      q.onDone && q.onDone({ text: `${q.pre ? q.pre + '\n\n' : ''}📝 **${q.mode === 'test' ? 'Test' : 'Classwork'} score: ${Math.round(pct)}%**${total ? ` (objectives ${q.correct}/${total})` : ''}${q.openResult ? `\n✍️ Written answer: ${q.openResult.score}/${q.openResult.out_of} — _${q.openResult.comment}_` : ''}\n\n${verdict}`, fx });
    },
  };

  Object.assign(BH.actions, {
    quizAns(i) { Quiz.answer(Number(i)); },
    quizNext() { Quiz.next(); },
    quizOpenSubmit() { Quiz.submitOpen(false); },
    quizOpenSkip() { Quiz.submitOpen(true); },
    quizOpenDone() { const q = Quiz.st; if (!q) return; Quiz.finish(); },
  });

  BH.Quiz = Quiz;
})(window.BH);
