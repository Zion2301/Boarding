/* Time: days, blocks, weeks, terms. Drives the whole game loop. */
(function (BH) {
  const D = BH.data;
  const U = BH.U;

  const Time = {
    dayType(s) { return s.time.dayType; },
    schedule(s) { return D.SCHEDULES[s.time.dayType]; },
    blockId(s) { return Time.schedule(s)[s.time.block]; },
    block(s) { return D.BLOCKS[Time.blockId(s)]; },
    clock(s) { const b = Time.block(s); return b ? b.time : ''; },
    levelName(s) { return D.LEVELS[s.time.year - 1]; },
    dayName(s) { return D.DAYS[s.time.dow]; },
    dateLabel(s) { return `${Time.levelName(s)} · T${s.time.term} · Wk${s.time.week} · ${Time.dayName(s).slice(0, 3)}`; },

    computeDayType(s) {
      // on the shared school calendar, "today" is the school's day (a late admission can start on a Tuesday)
      if (typeof s.time.calDay === 'number' && window.BHCalendar) return window.BHCalendar.info(s.time.calDay).dayType;
      if (s.time.dayCount === 0 || s.flags.resumptionDay) return 'resumption';
      if (s.time.dow === 5) return 'saturday';
      if (s.time.dow === 6) return 'sunday';
      return 'weekday';
    },

    /* Per-block scene context, created once so random rolls stay stable across re-renders */
    ctx(s) {
      const id = Time.blockId(s);
      if (!(id in s.today.ctx)) s.today.ctx[id] = BH.Activities.initCtx(s, id);
      return s.today.ctx[id];
    },

    newDay(s) {
      s.time.block = 0;
      s.time.dayType = Time.computeDayType(s);
      s.flags.resumptionDay = false;
      s.today = BH.State.freshToday(s);
      if (BH.Clock) s.clock = BH.Clock.blockStart(s, 0); // before hooks, so deadlines set today are right
      BH.hook('onNewDay', s);
    },

    startBlock(s) {
      Time.ctx(s);
      BH.Events.maybeTrigger(s);
      BH.hook('onBlockStart', s, Time.blockId(s));
    },

    /* Finish the current block and move to the next */
    advance(s, opts = {}) {
      const id = Time.blockId(s);
      if (!opts.noDecay) BH.Stats.decay(s, Time.block(s));
      BH.bus.emit('block:end', { block: id });
      BH.hook('onBlockEnd', s, id);
      if (s.gameOver) return;
      s.time.block++;
      if (s.time.block >= Time.schedule(s).length) Time.nextDay(s);
      else Time.startBlock(s);
      BH.Stats.checkConsequences(s);
    },

    nextDay(s) {
      BH.hook('onDayEnd', s);
      BH.bus.emit('day:end', {});
      s.stats_history.daysPlayed++;
      Time.bumpDate(s);
      if (s.gameOver) return;
      Time.newDay(s);
      BH.log(s, `☀️ ${Time.dayName(s)}, Week ${s.time.week}`, 'day');
      Time.startBlock(s);
      if (BH.Pacing) BH.Pacing.afterNewDay(s); // Highlights / Montage: ordinary days pass as day cards
    },

    bumpDate(s) {
      s.time.dayCount++;
      // shared school calendar: the date comes from the formula everyone uses (server + clients agree)
      if (typeof s.time.calDay === 'number' && window.BHCalendar) {
        const Cal = window.BHCalendar;
        const before = Cal.info(s.time.calDay);
        s.time.calDay++;
        const now = Cal.info(s.time.calDay);
        if (now.termIndex !== before.termIndex) { Time.endTerm(s); if (s.gameOver) return; } // report card, promotion at the end of a school year
        Object.assign(s.time, { dow: now.dow, week: now.week, term: now.term, schoolYear: now.schoolYear });
        s.flags.resumptionDay = now.dayType === 'resumption';
        return;
      }
      s.time.dow = (s.time.dow + 1) % 7;
      // the Sunday resumption day belongs to week 1, so don't roll the week over after it
      if (s.time.dow === 0 && s.time.dayType !== 'resumption') {
        s.time.week++;
        if (s.time.week > D.CONFIG.TERM_WEEKS) Time.endTerm(s);
      }
    },

    /* Skip n blocks (sick bay etc.) — gentle decay, no events */
    skipBlocks(s, n) {
      for (let i = 0; i < n; i++) {
        const b = Time.block(s);
        if (b.kind === 'sleep') break; // never skip past lights out
        const half = Object.assign({}, b, { dur: b.dur / 2 });
        BH.Stats.decay(s, half);
        BH.bus.emit('block:end', { block: Time.blockId(s) });
        s.time.block++;
      }
      Time.ctx(s);
      BH.Clock && BH.Clock.sync(s);
    },
    skipToEndOfDay(s) {
      const sched = Time.schedule(s);
      while (s.time.block < sched.length - 1) {
        BH.bus.emit('block:end', { block: Time.blockId(s) });
        s.time.block++;
      }
      Time.ctx(s);
      BH.Clock && BH.Clock.sync(s);
    },
    /* Skip whole days (suspension). Live missions are voided. */
    skipDays(s, n) {
      (s.missions || []).forEach((m) => { if (m.status === 'active' || m.status === 'offered') m.status = 'failed'; });
      for (let i = 0; i < n; i++) Time.bumpDate(s);
      Time.newDay(s);
      Time.startBlock(s);
    },

    /* ---------- joining the shared school calendar ----------
       Go straight to the school's "now": a new student is a late admission (arrives today, whatever day it is);
       a returning student skips the days they were away (no roll-call punishments) and is promoted for every
       school year that ended while they were gone (graduating after SS3). */
    joinCalendar(s, day, min) {
      const Cal = window.BHCalendar;
      const now = Cal.info(day);
      const from = typeof s.time.calDay === 'number' ? s.time.calDay : null;
      const away = from === null ? 0 : day - from;
      const report = [];
      if (from !== null && away > 0) {
        const years = now.schoolYear - Cal.info(from).schoolYear;
        for (let i = 0; i < years && !s.gameOver; i++) {
          if (s.time.year >= D.LEVELS.length) { BH.Reports.finals(s); BH.Game.gameOver(s, 'graduated', BH.Reports.legacy(s)); return { graduated: true }; }
          s.time.year++;
          BH.hook('onNewYear', s);
          report.push(`🎓 Promoted to **${D.LEVELS[s.time.year - 1]}**`);
        }
        if (s.time.year === 4 && !s.academics.dept) BH.Events.queue(s, 'department');
        (s.missions || []).forEach((m) => { if (m.status === 'active' || m.status === 'offered') m.status = 'failed'; });
        // you were at home: rested and fed
        Object.assign(s.stats, { hunger: Math.max(s.stats.hunger, 75), thirst: Math.max(s.stats.thirst, 75), rest: Math.max(s.stats.rest, 80), hygiene: Math.max(s.stats.hygiene, 80), health: Math.max(s.stats.health, 85) });
        if (now.termIndex !== Cal.info(from).termIndex) Object.values(s.academics.subjects).forEach((sub) => { sub.ca = []; sub.exam = []; sub.attended = 0; sub.missed = 0; });
      }
      Object.assign(s.time, { calDay: day, dow: now.dow, week: now.week, term: now.term, schoolYear: now.schoolYear });
      s.flags.resumptionDay = now.dayType === 'resumption';
      Time.newDay(s);
      // the block happening right now
      const times = BH.Clock.times(s);
      let i = 0;
      while (i + 1 < times.length && times[i + 1] <= min) i++;
      s.time.block = i;
      s.clock = Math.max(min, times[0]);
      // no roll call for the block you walked in on
      s.today.flags.excused = BH.Clock.abs(s) + Math.max(10, BH.Clock.nextStart(s) - s.clock);
      s.today.flags.justArrived = true;
      Time.ctx(s);
      BH.hook('onBlockStart', s, Time.blockId(s));
      return { away, report, label: Cal.label(day, min) };
    },

    /* End of term → report card → (BECE / WAEC) → vacation → next term, promotion or graduation */
    endTerm(s) {
      const report = BH.Reports.generate(s);
      BH.hook('onTermEnd', s);
      const yearDone = s.time.term === D.CONFIG.TERMS_PER_YEAR;
      let bece = false;
      if (yearDone && s.time.year === 3) { BH.Reports.bece(s); bece = true; }
      if (yearDone && s.time.year === D.LEVELS.length) {
        BH.Reports.finals(s);
        BH.Game.gameOver(s, 'graduated', BH.Reports.legacy(s));
        return;
      }
      s.time.week = 1;
      s.time.term++;
      if (s.time.term > D.CONFIG.TERMS_PER_YEAR) {
        s.time.term = 1;
        s.time.year++;
        BH.hook('onNewYear', s);
      }
      // fresh CA & exams for the new term
      Object.values(s.academics.subjects).forEach((sub) => { sub.ca = []; sub.exam = []; sub.attended = 0; sub.missed = 0; });
      s.flags.resumptionDay = true;
      BH.Events.queue(s, 'vacation', { report: s.reports.length - 1, bece, level: D.LEVELS[s.time.year - 1], term: s.time.term });
      if (s.time.year === 4 && !s.academics.dept) BH.Events.queue(s, 'department');
      if (s.time.year === 6 && !s.senior.appointed) BH.Events.queue(s, 'prefectAppointment');
    },
  };

  /* Vacation event shown at the start of each new term, with the report card */
  BH.Events.EVENTS.vacation = {
    forced: true, emoji: '🏖️', title: 'Vacation & Report Card',
    text(s, c) {
      const r = s.reports[c.report];
      const best = r.rows.slice().sort((a, b) => b.total - a.total)[0];
      const worst = r.rows.slice().sort((a, b) => a.total - b.total)[0];
      let t = `Term don end! You go home — Mummy's jollof, Daddy's lectures, cartoon all day.\n\n📜 **${r.level} Term ${r.term} Report Card**\nAverage: **${r.average}%** · Position: **${BH.Reports.ordinal(r.position)} out of ${r.classSize}**\nBest: ${best.name} (${best.total}) · Worst: ${worst.name} (${worst.total})\n\n_Form teacher: "${r.form}"_\n_Principal: "${r.principal}"_`;
      if (c.bece && s.certificates.bece) t += `\n\n🎓 **BECE results:** ${s.certificates.bece.summary}.`;
      t += `\n\nNow you dey resume for **${c.level}, Term ${c.term}**.`;
      return t;
    },
    choices: () => [{
      label: '📜 Show Daddy the report & resume school', sub: 'Restock provisions & pocket money',
      run(s, c) {
        const r = s.reports[c.report];
        const reaction = BH.Reports.parentsReact(s, r);
        const bg = D.BACKGROUNDS[s.player.background];
        Object.entries(bg.provisions).forEach(([id, n]) => { if (!D.ITEMS[id].tool) BH.Inv.add(s, id, n); });
        BH.Stats.money(s, bg.money);
        s.stats.hunger = 90; s.stats.thirst = 90; s.stats.rest = 90; s.stats.hygiene = 90; s.stats.health = 95;
        BH.Stats.change(s, { morale: 8 });
        return { text: `${reaction}\n\nThen you pack your chop box again. Here we go! 🚌`, report: c.report };
      },
    }],
  };

  BH.registerSystem('Time', Time);
})(window.BH);
