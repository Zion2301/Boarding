/* TimeSystem — the world clock.
   - Time always moves: Prefs.timeScale in-game minutes per real second (Settings), paused only while a menu is open.
   - The timetable is the WORLD's schedule: when a block's start time arrives the bell rings and the block
     changes, whether or not you showed up. Attendance is judged by where you are (see activities.js).
   - Fast-forward: Clock.wait() (the ⏳ button) and sleeping run the clock at ×30–×90 until a target time,
     and stop early if something needs you (a call, getting spotted, a forced event).
   Builds on BH.Time (blocks/days/terms); the clock decides WHEN Time.advance happens. */
(function (BH) {
  const D = BH.data;

  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const cache = {};

  /* Player preferences that are not part of a save */
  const PREFS_KEY = 'bh_prefs';
  BH.Prefs = {
    v: { timeScale: 1 },
    load() { try { Object.assign(BH.Prefs.v, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch (e) { /* private mode */ } },
    set(k, val) { BH.Prefs.v[k] = val; try { localStorage.setItem(PREFS_KEY, JSON.stringify(BH.Prefs.v)); } catch (e) { /* ignore */ } },
  };
  BH.Prefs.load();

  const Clock = {
    get RATE() { return BH.Prefs.v.timeScale || 1; },
    SCALES: [0.5, 1, 2, 4],
    LATE: 15,          // minutes after a block starts before you're "late"
    LIGHTS_OUT: 22 * 60 + 15,

    toMin,
    /* Start minute of every block in today's schedule (fixed so they never overlap) */
    times(s) {
      const type = s.time.dayType;
      if (cache[type]) return cache[type];
      const sched = D.SCHEDULES[type];
      const out = [];
      sched.forEach((id, i) => {
        let t = toMin(D.BLOCKS[id].time);
        if (i > 0) { const prev = D.BLOCKS[sched[i - 1]]; const prevEnd = out[i - 1] + Math.round(prev.dur * 60); if (t < prevEnd) t = prevEnd; }
        out.push(t);
      });
      cache[type] = out;
      return out;
    },
    blockStart(s, i = s.time.block) { return Clock.times(s)[i]; },
    nextStart(s, i = s.time.block) { const t = Clock.times(s); return i + 1 < t.length ? t[i + 1] : 24 * 60 + 5 * 60; },
    /* Start/end of a block by id today (null if it isn't on today's schedule) */
    window(s, blockId) {
      const i = BH.Time.schedule(s).indexOf(blockId);
      return i < 0 ? null : { start: Clock.blockStart(s, i), end: Clock.nextStart(s, i) };
    },

    /* Absolute game minute (monotonic across days) — used for deadlines */
    abs(s) { return s.time.dayCount * 1440 + s.clock; },
    mod(s) { return ((s.clock % 1440) + 1440) % 1440; },
    isNight(s) { const m = Clock.mod(s); return m >= 21 * 60 + 30 || m < 5 * 60; },
    isDark(s) { const m = Clock.mod(s); return m >= 19 * 60 || m < 6 * 60; },

    onNewGame(s) { s.clock = Clock.blockStart(s); Clock.ensure(s); },
    onNewDay(s) { s.clock = Clock.blockStart(s, 0); },
    onLoad(s) { if (typeof s.clock !== 'number') s.clock = Clock.blockStart(s); Clock.ensure(s); s.world.ff = null; },
    ensure(s) { s.world = s.world || {}; },
    sync(s) { s.clock = Math.max(s.clock || 0, Clock.blockStart(s)); },

    /* ---------- speed ---------- */
    ffRate(s) { const ff = s.world && s.world.ff; return ff ? ff.rate : 1; },
    speed(s) { return Clock.RATE * Clock.ffRate(s); },
    fastForwarding(s) { return !!(s.world && s.world.ff); },

    /* Wait / skip time on purpose. until = absolute minute. */
    wait(s, minutes, opts = {}) {
      const until = Clock.abs(s) + Math.max(1, Math.round(minutes));
      s.world.ff = { until, rate: opts.rate || (minutes > 120 ? 90 : 40), reason: opts.reason || 'wait', label: opts.label || '⏩ Waiting…' };
      BH.Store && BH.Store.changed();
    },
    waitUntilNextBell(s) { Clock.wait(s, Clock.nextStart(s) - s.clock, { label: '⏩ Waiting for the bell…' }); },
    stopWait(s, why) {
      if (!s.world.ff) return;
      const reason = s.world.ff.reason;
      s.world.ff = null;
      BH.Activities && BH.Activities.waitEnded(s, reason, why);
      BH.Store && BH.Store.changed();
    },

    /* Called every frame by the scene (or a headless test). dtMs = real milliseconds. */
    acc: 0,
    update(s, dtMs) {
      Clock.acc += (dtMs / 1000) * Clock.speed(s);
      const mins = Math.min(240, Math.floor(Clock.acc));
      if (mins <= 0) return 0;
      Clock.acc -= mins;
      Clock.tick(s, mins);
      return mins;
    },

    /* ---------- the ticking ---------- */
    tick(s, minutes) {
      for (let i = 0; i < minutes; i++) {
        if (s.gameOver) return;
        s.clock++;
        BH.Stats.minute(s);
        if (s.clock % 30 === 0) BH.Stats.checkConsequences(s);
        BH.hook('onMinute', s);
        if (s.clock >= Clock.nextStart(s)) Clock.passBlock(s);
        const ff = s.world.ff;
        if (ff && Clock.abs(s) >= ff.until) Clock.stopWait(s, 'time');
        if (s.queue.length && s.world.ff) Clock.stopWait(s, 'event');
      }
      BH.Store && BH.Store.changed();
    },
    /* Spend time on an activity (studying, washing…) — runs the world for those minutes */
    spend(s, minutes) { Clock.tick(s, minutes); },

    passBlock(s) {
      const before = s.time.dayCount;
      BH.Time.advance(s, { noDecay: true });
      if (s.gameOver) return;
      Clock.sync(s);
      BH.bus.emit('bell', { block: BH.Time.blockId(s) });
      if (s.time.dayCount !== before) BH.Save.save(s); // autosave at the end of each day
    },

    /* ---------- labels ---------- */
    timeLabel(m) {
      m = ((m % 1440) + 1440) % 1440;
      const h = Math.floor(m / 60), mm = m % 60;
      return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    },
    label(s) { return `${D.DAYS[s.time.dow].slice(0, 3)} ${Clock.timeLabel(s.clock)}`; },
    /* "in 25 min" / "in 2h 10m" */
    until(mins) { mins = Math.max(0, Math.round(mins)); return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`; },
    subjectNow(s) { const b = BH.Time.block(s); return b.kind === 'class' ? BH.Academics.periodSubject(s, b.period) : null; },
    location(s, id = BH.Time.blockId(s)) { return D.BLOCK_LOCATION(s, id, id === BH.Time.blockId(s) ? Clock.subjectNow(s) : null); },

    /* What's happening now and next (for the HUD) */
    info(s) {
      const sched = BH.Time.schedule(s);
      const b = BH.Time.block(s);
      const id = BH.Time.blockId(s);
      const nextId = sched[s.time.block + 1];
      return {
        id, b, loc: Clock.location(s, id), left: Clock.nextStart(s) - s.clock,
        next: nextId ? D.BLOCKS[nextId] : D.BLOCKS[D.SCHEDULES.weekday[0]],
        late: s.clock - Clock.blockStart(s),
        status: BH.Activities ? BH.Activities.status(s) : null,
      };
    },
  };

  BH.registerSystem('Clock', Clock);
})(window.BH);
