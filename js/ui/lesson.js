/* Lesson panel: the live class you're sitting in (BH.Lessons). Chalkboard notes, the teacher's question with A–D,
   the class feed (teacher, class, students' answers) and a text box — anyone in the room can answer by typing.
   Typing when no question is open = whispering (the teacher fit hear). T focuses the box on desktop.
   The text box is never re-rendered, so typing isn't interrupted by updates. */
(function (BH) {
  const U = BH.U;
  const LETTERS = ['A', 'B', 'C', 'D'];

  const LessonUI = {
    v: -1, open: true, mounted: false,

    mount() {
      const hud = document.querySelector('.hud');
      if (!hud || document.getElementById('hud-lesson')) return;
      const el = document.createElement('div');
      el.id = 'hud-lesson';
      el.className = 'hud-lesson';
      el.hidden = true;
      el.innerHTML = `<div class="ls-head" data-act="lessonToggle"></div>
        <div class="ls-body"><div class="ls-board"></div><div class="ls-q"></div><div class="ls-feed"></div></div>
        <form class="ls-input" autocomplete="off"><input type="text" maxlength="140" enterkeyhint="send" aria-label="Answer or whisper"><button type="submit" class="chunky small">Send</button></form>`;
      hud.appendChild(el);
      const form = el.querySelector('form');
      const inp = form.querySelector('input');
      form.addEventListener('submit', (e) => { e.preventDefault(); LessonUI.send(inp.value); inp.value = ''; });
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') inp.blur(); });
      addEventListener('keydown', (e) => {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if ((e.key === 't' || e.key === 'T') && !el.hidden && !(BH.Panels && BH.Panels.isOpen())) { e.preventDefault(); LessonUI.open = true; el.classList.remove('closed'); inp.focus(); }
      });
      LessonUI.el = el;
      LessonUI.v = -1;
      LessonUI.mounted = true;
    },

    send(text) {
      const s = BH.Game.s;
      text = String(text || '').trim();
      if (!s || !text) return;
      const mod = window.BHModeration ? window.BHModeration.moderate(text, { context: "public", max: 140 }) : { verdict: "ok", text };
      if (mod.verdict === 'blocked') { BH.UI.toast('🚫 The teacher no go gree hear that one. Try another way.', 'bad'); return; }
      BH.Lessons.submit(s, mod.text || text);
      LessonUI.v = -1;
    },

    update() {
      const s = BH.Game.s;
      if (!s || !s.school) return;
      if (!LessonUI.mounted || !document.getElementById('hud-lesson')) { LessonUI.mounted = false; LessonUI.mount(); if (!LessonUI.mounted) return; }
      const el = LessonUI.el;
      const L = BH.Lessons.here(s);
      if (!L) { if (!el.hidden) { el.hidden = true; document.body.classList.remove('in-lesson'); } return; }
      if (el.hidden) { el.hidden = false; document.body.classList.add('in-lesson'); LessonUI.v = -1; }
      const key = `${BH.Lessons.v}|${s.clock}|${LessonUI.open}`;
      if (key === LessonUI.v) return;
      LessonUI.v = key;
      el.classList.toggle('closed', !LessonUI.open);
      const t = L.t ? BH.NPC.get(s, L.t) : null;
      const m = s.clock - L.start;
      const A = BH.Academics;
      const subj = L.kind === 'register' ? '📋 Register' : `${A.emoji(L.code)} ${U.esc(A.name(s, L.code, true))}`;
      const phase = L.kind === 'register' ? 'Answer "Present" when called' : L.free ? 'Free period' : !L.done.enter ? 'Waiting for teacher…' : L.q && !L.q.closed ? '❓ Question' : m < 19 ? '✍🏾 Notes' : m >= 34 ? 'Wrapping up' : 'Lesson';
      el.querySelector('.ls-head').innerHTML = `<b>${subj}</b> <span>${t ? U.esc(BH.NPC.name(t)) : ''}</span> <small>${U.esc(L.room)} · ${phase}</small><i>${LessonUI.open ? '▾' : '▸'}</i>`;
      const qOpen = L.q && !L.q.closed && L.kind === 'lesson';
      el.querySelector('.ls-board').innerHTML = L.board.length ? L.board.slice(qOpen ? -2 : -4).map((x, i, arr) => `<p class="${i === arr.length - 1 ? 'new' : ''}">${U.esc(x)}</p>`).join('') : '<p class="dim">(empty board)</p>';
      const q = L.q && !L.q.closed && L.kind === 'lesson' ? L.q : null;
      el.querySelector('.ls-q').innerHTML = q ? `<div class="ls-question ${q.called === 'player' ? 'me' : ''}">${q.called ? `<span class="called">🙋🏾 ${U.esc(q.called === 'player' ? 'YOU' : BH.Lessons.nameOf(s, q.called))}</span>` : '<span class="called open">✋🏾 Anyone</span>'} ${U.esc(q.q)}</div>
        <div class="ls-opts">${q.o.map((o, i) => `<button class="ls-opt" data-act="lessonPick" data-arg="${LETTERS[i]}"><b>${LETTERS[i]}</b> ${U.esc(o)}</button>`).join('')}</div>` : '';
      el.querySelector('.ls-feed').innerHTML = L.feed.filter((f) => f.kind !== 'options').slice(-4).map((f) => `<p class="f-${f.kind} ${f.who === 'player' ? 'me' : ''}">${f.name ? `<b>${U.esc(f.name)}:</b> ` : ''}${U.esc(f.text)}</p>`).join('');
      const inp = el.querySelector('input');
      inp.placeholder = L.kind === 'register' ? 'Type "Present" when your name is called' : q ? 'Type your answer — A, B, C, D or the answer…' : L.free ? 'Gist with the class…' : 'Whisper… (the teacher fit hear 👀)';
    },
  };

  Object.assign(BH.actions, {
    lessonToggle() { LessonUI.open = !LessonUI.open; LessonUI.v = -1; LessonUI.update(); },
    lessonPick(letter) { LessonUI.send(letter); },
  });
  BH.bus.on('lesson:update', () => { LessonUI.v = -1; });
  BH.LessonUI = LessonUI;
})(window.BH);
