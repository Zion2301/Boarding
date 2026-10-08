/* Pacing & time control (GAME_DESIGN.md §3.1–3.2): you set the pace of your six years.
   · ⏸ pause, 1× / 2× / 4×, ⏭ next bell, ⏭⏭ next event (story beat / calendar event / meal / class)
   · Pacing per term:  Live = every day played (default for JSS1 Term 1)
                       Highlights = key days played; ordinary days pass as "day cards" shaped by your week plan
                       Montage = only milestones and exams are played
   · Week plan (study / sport / hustle / social / rest / balanced) decides how simulated days go. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast && BH.UI.toast(t, k);
  const PLANS = {
    balanced: { emoji: '⚖️', label: 'Balanced', desc: 'A bit of everything' },
    study: { emoji: '📚', label: 'Study', desc: 'Knowledge up, a little tired' },
    sport: { emoji: '⚽', label: 'Sport', desc: 'Clout, fitness, Kunle\'s respect' },
    hustle: { emoji: '💸', label: 'Hustle', desc: 'Money — and some risk' },
    social: { emoji: '🗣️', label: 'Social', desc: 'Friendships grow' },
    rest: { emoji: '😴', label: 'Rest', desc: 'Stats recover' },
  };
  const MODES = {
    live: { emoji: '🎬', label: 'Live', desc: 'Play every day' },
    highlights: { emoji: '✨', label: 'Highlights', desc: 'Play the key days, the rest pass as day cards' },
    montage: { emoji: '⏩', label: 'Montage', desc: 'Only milestones and exams are played' },
  };

  const Pacing = {
    PLANS, MODES, simulating: false,
    onNewGame(s) { s.pacing = { mode: 'live', plan: 'balanced', cards: [], auto: true }; },
    onLoad(s) { s.pacing = Object.assign({ mode: 'live', plan: 'balanced', cards: [], auto: true }, s.pacing || {}); },

    /* ---------- pause & speed ---------- */
    paused(s) { return !!(s && s.world && s.world.paused); },
    togglePause(s) { s.world.paused = !s.world.paused; BH.Store && BH.Store.changed(); return s.world.paused; },
    setSpeed(v) { BH.Prefs.set('timeScale', v); BH.Store && BH.Store.changed(); },

    /* ---------- skip ---------- */
    nextBell(s) { BH.Activities.stand(s, true); BH.Clock.waitUntilNextBell(s); },
    /* the next thing worth being awake for: a story beat, a calendar event, or the next meal / class / lights out */
    nextEventAt(s) {
      const cands = [];
      const times = BH.Clock.times(s), sched = BH.Time.schedule(s);
      for (let i = s.time.block + 1; i < sched.length; i++) { const b = D.BLOCKS[sched[i]]; if (['meal', 'class', 'assembly', 'sleep', 'free', 'worship'].includes(b.kind)) { cands.push({ at: times[i], why: b.title, emoji: b.emoji }); break; } }
      if (BH.Director) BH.Director.today(s).forEach((e) => { const t = BH.Clock.toMin(e.at); if (t > s.clock) cands.push({ at: t, why: e.title, emoji: e.emoji }); });
      if (BH.Arcs) { const a = BH.Arcs.nextToday(s); if (a) cands.push(a); }
      cands.sort((a, b) => a.at - b.at);
      return cands[0] || { at: BH.Clock.nextStart(s), why: 'the next bell', emoji: '🔔' };
    },
    nextEvent(s) {
      const e = Pacing.nextEventAt(s);
      BH.Activities.stand(s, true);
      BH.Clock.wait(s, Math.max(1, e.at - s.clock), { label: `⏭ Skipping to ${e.emoji} ${e.why}…`, rate: 90 });
      toast(`⏭ Skipping to ${e.emoji} ${e.why} (${BH.Clock.timeLabel(e.at)})`, 'info');
    },

    /* ---------- which days are played in Highlights / Montage ---------- */
    isKeyDay(s) {
      const mode = s.pacing.mode;
      if (mode === 'live' || s.time.dayType === 'resumption') return true;
      if (BH.Arcs && BH.Arcs.dueToday(s)) return true;                         // a story beat is waiting
      if (BH.Milestones && BH.Milestones.dueToday(s)) return true;             // send-forth, sign-out…
      const exam = s.time.week === D.CONFIG.TERM_WEEKS && s.time.dayType === 'weekday';
      if (exam) return true;
      if (mode === 'montage') return false;
      const testDay = BH.Academics.TEST_WEEKS.includes(s.time.week) && s.time.dow <= 1;
      const big = BH.Director && BH.Director.today(s).some((e) => ['visitingDay', 'sportsDay', 'election', 'interHouse'].includes(e.id));
      return testDay || big || (s.time.dow === 0 && s.time.week === 1);
    },

    /* After each new day starts: in Highlights/Montage, ordinary days pass as day cards (max a week at a time) */
    afterNewDay(s) {
      if (Pacing.simulating || s.pacing.mode === 'live' || s.gameOver) return;
      const cards = [];
      Pacing.simulating = true;
      try {
        for (let i = 0; i < 7 && !Pacing.isKeyDay(s) && !s.queue.length && !s.gameOver; i++) {
          cards.push(Pacing.simulateDay(s));
          BH.Time.skipToEndOfDay(s);
          BH.Time.nextDay(s);
        }
      } finally { Pacing.simulating = false; }
      if (cards.length) {
        s.pacing.cards = cards.concat(s.pacing.cards).slice(0, 40);
        s.act = null;
        BH.Save.save(s);
        if (BH.UI && BH.UI.screen === 'game') setTimeout(() => Pacing.showCards(cards), 300);
      }
    },
    /* one ordinary school day, lived through your week plan */
    simulateDay(s) {
      const plan = s.pacing.plan;
      const A = BH.Academics, St = BH.Stats;
      const lines = [];
      const date = `${D.DAYS[s.time.dow]} · Week ${s.time.week}`;
      // you went to class (the register knows) and ate (mostly)
      if (s.time.dayType === 'weekday') {
        const codes = [...new Set(Array.from({ length: 8 }, (_, p) => A.periodSubject(s, p)).filter(Boolean))];
        codes.forEach((c) => { if (s.academics.subjects[c]) s.academics.subjects[c].attended++; });
        const pick = U.sample(codes, plan === 'study' ? 3 : 1);
        pick.forEach((c) => A.study(s, c, plan === 'study' ? 4 : 2, true));
        if (pick.length) lines.push(`📚 ${pick.map((c) => A.name(s, c, true)).join(', ')}${plan === 'study' ? ' — you studied hard' : ''}`);
      }
      const close = BH.NPC.students(s).slice().sort((a, b) => b.rel - a.rel);
      const friend = (BH.Story && s.story.bestie && BH.NPC.get(s, s.story.bestie)) || close[0];
      if (plan === 'sport') { St.rep(s, 1); St.change(s, { morale: 4, rest: -6 }); const k = BH.NPC.get(s, 'k_kunle'); if (k) BH.NPC.rel(s, k, 1); lines.push('⚽ Football after classes — your legs are getting faster'); }
      if (plan === 'hustle') {
        const earn = U.randInt(80, 260); St.money(s, earn); lines.push(`💸 Hustle: +${U.money(earn)}${BH.NPC.get(s, 'k_osas') ? ' (Osas took his cut)' : ''}`);
        if (U.chance(0.12)) lines.push('🚨 ' + BH.Discipline.minor(s, 'Selling in the hostel'));
      }
      if (plan === 'social') { close.slice(0, 3).forEach((n) => BH.NPC.rel(s, n, 2)); lines.push(`🗣️ Gist with ${close.slice(0, 3).map((n) => n.first).join(', ')}`); }
      if (plan === 'rest') { St.change(s, { rest: 20, morale: 5, health: 4 }); lines.push('😴 Early nights, long siestas'); }
      if (plan === 'balanced') { if (friend) BH.NPC.rel(s, friend, 1); St.change(s, { morale: 2 }); }
      // ordinary days still have life in them
      const gist = BH.Gist && BH.Gist.filler ? BH.Gist.filler(s).replace(/^"|"$/g, '') : '';
      if (gist && U.chance(0.6)) lines.push(`🗞️ ${gist}`);
      if (friend && U.chance(0.5)) lines.push(`🤝 ${friend.first} ${U.pick(['saved you a seat at dinner', 'shared their Milo', 'beat you at Whot (again)', 'told you the gist about the house master', 'walked back from prep with you'])}`);
      // meals and sleep happened; you're fine-ish
      Object.assign(s.stats, { hunger: Math.max(s.stats.hunger, 60), thirst: Math.max(s.stats.thirst, 60), rest: Math.max(s.stats.rest, 55), hygiene: Math.max(s.stats.hygiene, 55) });
      return { date, term: `${D.LEVELS[s.time.year - 1]} T${s.time.term}`, plan, lines };
    },
    showCards(cards) {
      BH.Panels.open(() => `<h2>📅 ${cards.length} day${cards.length === 1 ? '' : 's'} passed</h2>
        <p class="muted">${MODES[BH.Game.s.pacing.mode].emoji} ${MODES[BH.Game.s.pacing.mode].label} · Week plan: ${PLANS[BH.Game.s.pacing.plan].emoji} ${PLANS[BH.Game.s.pacing.plan].label}</p>
        ${cards.map((c) => `<div class="day-card"><b>${U.esc(c.date)}</b>${c.lines.map((l) => `<p>${U.esc(l)}</p>`).join('') || '<p class="muted">A quiet day.</p>'}</div>`).join('')}
        <div class="grid-btns"><button class="chunky primary" data-act="closePanel">▶ Carry on</button><button class="chunky" data-act="openPacing">📅 Change plan / pace</button></div>`, { cls: 'sheet', kind: 'daycards' });
    },

    /* ---------- the planner ---------- */
    openPanel() {
      BH.Panels.open(() => {
        const s = BH.Game.s;
        return `<h2>📅 Your pace</h2>
          <div class="setting"><b>How do you want to live this term?</b>
            <div class="pace-modes">${Object.entries(MODES).map(([k, m]) => `<button class="chunky ${s.pacing.mode === k ? 'primary' : ''}" data-act="setPaceMode" data-arg="${k}">${m.emoji} ${m.label}<small>${m.desc}</small></button>`).join('')}</div></div>
          <div class="setting"><b>This week's plan</b><small>Shapes the days you don't play live</small>
            <div class="pace-plans">${Object.entries(PLANS).map(([k, p]) => `<button class="chunky small ${s.pacing.plan === k ? 'primary' : ''}" data-act="setPlan" data-arg="${k}">${p.emoji} ${p.label}<small>${p.desc}</small></button>`).join('')}</div></div>
          <p class="muted tiny">Story moments, exams, Visiting Days and sports always play live. Time never moves while a menu or conversation is open.</p>`;
      }, { cls: 'pop', kind: 'pacing' });
    },

    /* the first term of JSS1 is lived in detail; from term 2 the game suggests Highlights */
    onTermEnd(s) {
      if (s.pacing.auto && s.time.year === 1 && s.time.term === 1 && s.pacing.mode === 'live') {
        s.pacing.mode = 'highlights';
        toast('✨ From now on, ordinary days pass as day cards (Highlights). Change it any time: 📅 on the time bar.', 'info');
      }
    },
  };

  /* ---------- the time bar on the HUD ---------- */
  const TimeBar = {
    mount() {
      const tr = document.querySelector('.hud .hud-tr');
      if (!tr || document.getElementById('hud-time')) return;
      const el = document.createElement('div');
      el.id = 'hud-time'; el.className = 'hud-time hud-card';
      tr.insertBefore(el, tr.children[1] || null);
      TimeBar.v = '';
    },
    update() {
      const s = BH.Game.s;
      if (!s) return;
      if (!document.getElementById('hud-time')) TimeBar.mount();
      const el = document.getElementById('hud-time');
      if (!el) return;
      const p = Pacing.paused(s), r = BH.Clock.RATE, ff = BH.Clock.fastForwarding(s);
      const key = `${p}|${r}|${ff}|${s.pacing.mode}`;
      if (key === TimeBar.v) return;
      TimeBar.v = key;
      el.innerHTML = `<button data-act="timePause" class="${p ? 'on' : ''}" title="Pause (P)">${p ? '▶' : '⏸'}</button>
        ${[1, 2, 4].map((v) => `<button data-act="timeSpeed" data-arg="${v}" class="${!p && r === v && !ff ? 'on' : ''}">${v}×</button>`).join('')}
        <button data-act="timeBell" title="Skip to next bell">⏭</button><button data-act="timeEvent" title="Skip to next event">⏭⏭</button>
        <button data-act="openPacing" title="Pace & week plan">${MODES[s.pacing.mode].emoji}</button>`;
    },
  };

  Object.assign(BH.actions, {
    timePause() { Pacing.togglePause(BH.Game.s); TimeBar.update(); },
    timeSpeed(v) { const s = BH.Game.s; s.world.paused = false; if (s.world.ff) BH.Clock.stopWait(s, 'speed'); Pacing.setSpeed(Number(v)); TimeBar.update(); },
    timeBell() { const s = BH.Game.s; s.world.paused = false; Pacing.nextBell(s); },
    timeEvent() { const s = BH.Game.s; s.world.paused = false; Pacing.nextEvent(s); },
    openPacing() { BH.Panels.closeKind('daycards', true); Pacing.openPanel(); },
    setPaceMode(m) { const s = BH.Game.s; s.pacing.mode = m; s.pacing.auto = false; BH.Panels.refresh(); toast(`${MODES[m].emoji} ${MODES[m].label}: ${MODES[m].desc}.`, 'info'); },
    setPlan(p) { BH.Game.s.pacing.plan = p; BH.Panels.refresh(); },
  });
  if (typeof addEventListener === 'function') addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if ((e.key === 'p' || e.key === 'P') && BH.UI && BH.UI.screen === 'game' && !(BH.Panels && BH.Panels.isOpen())) BH.actions.timePause();
  });

  BH.Pacing = Pacing;
  BH.TimeBar = TimeBar;
  BH.registerSystem('Pacing', Pacing);
})(window.BH);
