/* Milestones, chapters and the ending (GAME_DESIGN.md §7–8).
   · Milestones are the big once-in-a-school-life moments: resumption, first punishment, first visiting day, first
     report card, BECE, becoming a senior, your department, your school child, prefect appointment, WAEC, send-forth,
     sign-out day and graduation. Each plays as a cinematic card (letterboxed dialogue), is remembered with a stamp
     and autosaves.
   · Every term that ends becomes a chapter (s.story.chapters): title, report position, friends, the moments that
     happened in it. The ⚙️ menu → 📖 Chapters shows your story so far.
   · Graduation (or expulsion) ends the story with "where are they now" for every key character you met and a
     yearbook page. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const St = () => BH.Story;
  const N = () => BH.NPC;
  const cast = () => ((BH.Content.get('cast') || {}).cast || []);

  /* chapter names, by school stamp */
  const CHAPTERS = {
    JSS1T1: 'The New Student', JSS1T2: 'Finding My People', JSS1T3: 'Survivor',
    JSS2T1: 'No Longer the Smallest', JSS2T2: 'Loyalties', JSS2T3: 'Goodbye, Seniors',
    JSS3T1: 'Growing Pains', JSS3T2: 'Secrets', JSS3T3: 'BECE',
    SS1T1: 'Senior at Last', SS1T2: 'Choosing a Path', SS1T3: 'Power',
    SS2T1: 'The Ones Who Stay', SS2T2: 'Temptation', SS2T3: 'Almost There',
    SS3T1: 'The Last Year', SS3T2: 'Legacy', SS3T3: 'Send-forth',
  };

  /* the big moments; `day(s)` = it happens on this school day (so Pacing stops for it) */
  const DEFS = {
    resumption: { emoji: '🚌', title: 'Chapter One', text: (s) => `Your first day at ${s.player.schoolName} is over. A bunk, a bucket, a few names you'll remember for the rest of your life.\n\n_This is where your story starts._` },
    firstPunishment: { emoji: '😖', title: 'First Punishment', text: () => 'Your knees still remember the gravel. Everybody gets punished in boarding school — what matters is what you do next.' },
    firstVisiting: { emoji: '🧺', title: 'First Visiting Day', text: () => 'Coolers of jollof under the mango trees, your mum fussing over how thin you look, your dad pretending not to be proud.\n\nWhen the cars leave, the hostel is very quiet.' },
    firstReport: { emoji: '📜', title: 'First Report Card', text: (s) => { const r = (s.reports || [])[0]; return r ? `Your first report card: **${BH.Reports.ordinal(r.position)} out of ${r.classSize}**.\n\n_"${r.form}"_` : 'Your first report card.'; } },
    bece: { emoji: '📝', title: 'BECE', day: (s) => s.time.year === 3 && s.time.term === 3 && s.time.week === 7 && s.time.dow === 0, text: () => 'Junior WAEC. The hall is silent, the invigilator walks slowly, and somebody\'s biro is leaking.\n\nThree years of JSS come down to this week.' },
    senior: { emoji: '🎖️', title: 'Senior at Last', text: (s) => `You walk into ${D.LEVELS[3]}. The JSS1s step aside on the corridor and say "Good morning, Senior."\n\nYou remember being them. Who are you going to be?` },
    department: { emoji: '🧪', title: 'Your Department', text: (s) => `You are now in ${(D.DEPARTMENTS[s.academics.dept] || { name: 'your department' }).name}. Some of your set are in different classes now. The paths start to split.` },
    schoolChild: { emoji: '🐣', title: 'Your School Child', text: () => 'Someone small now calls you "my school parent". Five years ago, that was you.' },
    prefect: { emoji: '🏅', title: 'Prefect Selection', text: (s) => { const p = BH.Seniority.postLabel(s); return p ? `The list goes up. Your name is on it: **${p}**.\n\nThe juniors are watching how you use it.` : 'The prefect list goes up. Your name isn\'t on it — but your friends know who you are.'; } },
    waec: { emoji: '✏️', title: 'WAEC', day: (s) => s.time.year === 6 && s.time.term === 3 && s.time.week === 6 && s.time.dow === 0, text: () => 'Senior WAEC begins. HB pencils, a calculator borrowed from your bunkmate, and a prayer at the door.\n\nSix years, one hall.' },
    sendForth: { emoji: '🪩', title: 'Send-forth Night', day: (s) => s.time.year === 6 && s.time.term === 3 && s.time.week === 9 && s.time.dow === 5,
      text: () => 'The assembly hall has fairy lights. The juniors decorated it. The DJ plays the songs you sang in JSS1, and for one night nobody is a senior or a junior.',
      choices: (s) => {
        const sq = St().inSquad ? N().all(s).filter((n) => St().inSquad(s, n.id)) : [];
        const best = s.story.bestie && N().get(s, s.story.bestie);
        return [
          best ? { label: `💃🏾 Dance with ${best.first}`, run: (st) => { St().bond(st, best, { rel: 6 }); St().note(st, 'danced', best.id); BH.Stats.change(st, { morale: 12 }); return `You and ${best.first} dance until the DJ begs you to stop.`; } } : null,
          sq.length ? { label: '🏴 Dance with your squad', run: (st) => { sq.forEach((n) => St().bond(st, n, { rel: 4 })); BH.Stats.change(st, { morale: 12 }); return 'The whole squad in a circle. Somebody films it on a phone they definitely shouldn\'t have.'; } } : null,
          { label: '🎤 Give a speech', run: (st) => { BH.Stats.rep(st, 6); return 'You thank the cooks, the gatemen, the teachers — and your set. Somebody at the back starts crying first.'; } },
          { label: '🍗 Just enjoy the food', run: (st) => { BH.Stats.change(st, { hunger: 40, morale: 8 }); return 'Fried rice, chicken, and Chapman. Six years of garri, repaid in one plate.'; } },
        ].filter(Boolean);
      } },
    signOut: { emoji: '✍️', title: 'Sign-out Day', day: (s) => s.time.year === 6 && s.time.term === 3 && s.time.week === 10 && s.time.dow === 2,
      text: () => 'White shirts and markers. By noon nobody\'s shirt is white any more.',
      choices: (s) => {
        const top = Milestones.closest(s, 3);
        return [
          { label: `✍️ Sign with ${top.map((n) => n.first).join(', ') || 'everyone'}`, run: (st) => { top.forEach((n) => { St().note(st, 'signed_shirt', n.id); St().bond(st, n, { rel: 4 }); }); return top.length ? `${top.map((n) => n.first).join(', ')} — their names are on your back now, in marker, forever.` : 'Your shirt is covered in names.'; } },
          { label: '🧒🏾 Let the juniors sign too', run: (st) => { BH.Consequences.repChange(st, 'juniors', 5); return 'The JSS1s queue up to sign. One of them writes "Senior, you were kind." You keep that shirt for twenty years.'; } },
        ];
      } },
    graduation: { emoji: '🎓', title: 'Graduation', text: () => 'Caps in the air.' },
  };

  const Milestones = {
    DEFS, CHAPTERS,
    onNewGame(s) { Milestones.ensure(s); },
    onLoad(s) { Milestones.ensure(s); },
    ensure(s) { St().ensure(s); s.story.milestones = s.story.milestones || {}; s.story.chapters = s.story.chapters || []; s.story.beatLog = s.story.beatLog || []; },
    done(s, id) { Milestones.ensure(s); return !!s.story.milestones[id]; },

    trigger(s, id) {
      Milestones.ensure(s);
      const d = DEFS[id];
      if (!d || s.story.milestones[id]) return false;
      s.story.milestones[id] = { at: St().stamp(s), day: s.time.dayCount };
      BH.log(s, `${d.emoji} Milestone: ${d.title}`, 'good');
      BH.bus.emit('milestone', { id });
      if (BH.Pacing && BH.Pacing.simulating) return true; // highlights: remembered, not shown
      if (id !== 'graduation') s.queue.push({ id: 'milestone', ctx: { m: id } });
      if (BH.Clock && BH.Clock.stopWait) BH.Clock.stopWait(s, 'event');
      if (BH.Save && s.slot) BH.Save.save(s); // autosave at every milestone
      return true;
    },
    dueToday(s) { Milestones.ensure(s); return Object.entries(DEFS).some(([id, d]) => d.day && !s.story.milestones[id] && d.day(s)); },
    closest(s, k) { return N().students(s).filter((n) => n.key || n.type === 'classmate').sort((a, b) => b.rel - a.rel).slice(0, k); },

    /* ---------- triggers ---------- */
    onNewDay(s) {
      Milestones.ensure(s);
      if (s.flags.onboarded && s.time.dayCount > 1) Milestones.trigger(s, 'resumption');
      Object.entries(DEFS).forEach(([id, d]) => { if (d.day && d.day(s)) Milestones.trigger(s, id); });
      if (s.time.year >= 4) Milestones.trigger(s, 'senior');
      if (s.time.year >= 4 && s.academics.dept) Milestones.trigger(s, 'department');
      if (s.time.year === 6 && s.senior && s.senior.appointed) Milestones.trigger(s, 'prefect');
    },
    onTermEnd(s) {
      Milestones.ensure(s);
      Milestones.trigger(s, 'firstReport');
      Milestones.chapter(s);
      if (s.time.year === D.LEVELS.length && s.time.term === D.CONFIG.TERMS_PER_YEAR) Milestones.trigger(s, 'graduation');
    },

    /* ---------- chapters ---------- */
    stampTitle(stamp) { return CHAPTERS[stamp] || stamp; },
    current(s) { const st = St().stamp(s); return { id: st, title: Milestones.stampTitle(st), label: `${D.LEVELS[s.time.year - 1]} · Term ${s.time.term}` }; },
    chapter(s) {
      const id = St().stamp(s);
      if (s.story.chapters.some((c) => c.id === id)) return;
      const r = (s.reports || [])[s.reports.length - 1];
      const best = s.story.bestie && N().get(s, s.story.bestie);
      const moments = [
        ...Object.entries(s.story.milestones).filter(([, m]) => m.at === id).map(([k]) => `${DEFS[k].emoji} ${DEFS[k].title}`),
        ...s.story.beatLog.filter((b) => b.at === id).map((b) => `${b.emoji} ${b.title}`),
      ];
      s.story.chapters.push({
        id, title: Milestones.stampTitle(id), label: `${D.LEVELS[s.time.year - 1]} · Term ${s.time.term}`,
        position: r ? `${BH.Reports.ordinal(r.position)} of ${r.classSize}` : null, average: r ? r.average : null,
        bestie: best ? best.first : null, friends: Milestones.closest(s, 3).map((n) => n.first), moments: moments.slice(0, 12),
        punished: s.stats_history.punished,
      });
    },
    chaptersHtml(s) {
      Milestones.ensure(s);
      const cur = Milestones.current(s);
      const card = (c, now) => `<div class="chapter-card ${now ? 'now' : ''}">
        <div class="ch-head"><b>${U.esc(c.title)}</b><small>${U.esc(c.label)}${now ? ' · now' : ''}</small></div>
        ${c.position ? `<div class="muted tiny">📜 ${c.position} · avg ${c.average}%${c.bestie ? ` · 💛 ${U.esc(c.bestie)}` : ''}</div>` : ''}
        ${c.moments && c.moments.length ? `<ul>${c.moments.map((m) => `<li>${U.esc(m)}</li>`).join('')}</ul>` : `<p class="muted tiny">${now ? 'Still being written…' : 'A quiet term.'}</p>`}
      </div>`;
      const live = Object.assign({}, cur, { moments: [
        ...Object.entries(s.story.milestones).filter(([, m]) => m.at === cur.id).map(([k]) => `${DEFS[k].emoji} ${DEFS[k].title}`),
        ...s.story.beatLog.filter((b) => b.at === cur.id).map((b) => `${b.emoji} ${b.title}`),
      ] });
      return `<div class="chapters">${[...s.story.chapters.map((c) => card(c)), s.gameOver ? '' : card(live, true)].join('')}</div>`;
    },
    openChapters() {
      BH.Panels.open(() => `<div class="menu-panel"><h2>📖 Your Story</h2>${Milestones.chaptersHtml(BH.Game.s)}
        <button class="chunky primary" data-act="closePanel">▶ Back</button></div>`, { cls: 'pop', kind: 'chapters' });
    },

    /* ---------- the ending ---------- */
    endOf(s, def) {
      const arc = s.story.arcs[def.id] || {};
      const n = N().get(s, def.id);
      const left = (s.npcs.left || {})[def.id];
      if (!n && !left) return null; // never met them
      const rel = n ? n.rel : left.rel;
      const end = arc.end || (rel >= 70 ? 'best' : rel >= 40 ? 'mid' : 'low');
      return { id: def.id, name: n ? N().fullName(n) : left.name, nick: def.nick, emoji: def.emoji, end, text: (def.ends || {})[end] || '', left: left ? (left.graduated ? `Graduated when you were in ${D.LEVELS[left.year - 1]}` : `Left when you were in ${D.LEVELS[left.year - 1]} — ${left.why}`) : null, bestie: s.story.bestie === def.id };
    },
    whereNow(s) { return cast().map((d) => Milestones.endOf(s, d)).filter(Boolean).sort((a, b) => (b.bestie - a.bestie) || ({ best: 2, mid: 1, low: 0 }[b.end] - { best: 2, mid: 1, low: 0 }[a.end])); },
    SUPERLATIVE: { regular: 'Most loyal', brilliant: 'Most likely to win a Nobel', bully: 'Most changed', comedian: 'Class clown', hustler: 'Most likely to be a billionaire', snitch: 'Most likely to become a judge', fine: 'Best dressed', sporty: 'Most athletic', churchy: 'Loudest at Morning Devotion', captain: 'Most likely to be President' },
    yearbook(s) {
      const top = s.paths ? Object.entries(s.paths).sort((a, b) => b[1] - a[1])[0] : null;
      const mine = { scholar: 'Most likely to be a professor', sports: 'Sports legend', leader: 'Born leader', hustle: 'Most likely to own a company', popular: 'Most popular', trouble: 'Most punished (and proud)' }[top && top[0]] || 'Survived six years';
      const signed = [...new Set((s.story.ledger || []).filter((e) => e.k === 'signed_shirt').map((e) => e.who))].map((id) => (N().get(s, id) || {}).first).filter(Boolean);
      const people = cast().filter((d) => N().get(s, d.id) && (N().get(s, d.id).type === 'classmate')).map((d) => ({ name: N().get(s, d.id).first, emoji: d.emoji, sup: Milestones.SUPERLATIVE[d.arch] || 'Unforgettable' }));
      return { mine, signed, people };
    },
    endingHtml(s) {
      Milestones.ensure(s);
      const wn = Milestones.whereNow(s);
      const yb = Milestones.yearbook(s);
      const ledger = s.story.ledger || [];
      return `
        <div class="card left ending">
          <h3>🔭 Where are they now?</h3>
          ${wn.map((w) => `<div class="where ${w.end}"><span class="em">${w.emoji || '🙂'}</span><div><b>${U.esc(w.name)}</b>${w.bestie ? ' 💛' : ''}${w.left ? `<small class="muted"> · ${U.esc(w.left)}</small>` : ''}<p>${U.esc(w.text)}</p></div></div>`).join('') || '<p class="muted">You didn\'t stay long enough to really know anyone.</p>'}
        </div>
        <div class="card left yearbook">
          <h3>📒 Yearbook — ${U.esc(s.player.schoolName)}</h3>
          <p><b>${U.esc(s.player.name)}</b> — <i>${U.esc(yb.mine)}</i></p>
          <div class="yb-grid">${yb.people.map((p) => `<div><span>${p.emoji}</span><b>${U.esc(p.name)}</b><small>${U.esc(p.sup)}</small></div>`).join('')}</div>
          ${yb.signed.length ? `<p class="muted tiny">✍️ Signed your shirt: ${yb.signed.map(U.esc).join(', ')}</p>` : ''}
          <p class="muted tiny">📖 ${s.story.chapters.length} chapters · ${(s.story.choices || 0)} story choices · ${ledger.length} memories</p>
        </div>
        <div class="card left"><h3>📖 Your chapters</h3>${Milestones.chaptersHtml(s)}</div>`;
    },
  };

  BH.Events.EVENTS.milestone = {
    forced: true, cinematic: true, emoji: '🎬',
    get title() { return 'Milestone'; },
    text: (s, c) => { const d = DEFS[c.m]; return `**${d.emoji} ${d.title}**\n\n${d.text(s)}`; },
    choices: (s, c) => (DEFS[c.m].choices ? DEFS[c.m].choices(s) : [{ label: '▶ Continue', run: () => '' }]),
  };

  BH.bus.on('onboard', (p, s) => { if (p.step === 'done' && s) Milestones.ensure(s); });
  BH.bus.on('event:done', (p, s) => { if (s && p.id === 'visitingDay') Milestones.trigger(s, 'firstVisiting'); });
  BH.bus.on('punished', (p, s) => { if (s) Milestones.trigger(s, 'firstPunishment'); });

  BH.Milestones = Milestones;
  BH.registerSystem('Milestones', Milestones);
})(window.BH);
