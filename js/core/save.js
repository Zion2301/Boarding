/* Save / load with multiple slots in localStorage.
   Each slot: bh_slot_<n> = full JSON state. bh_meta = { lastSlot }. */
(function (BH) {
  const KEY = (n) => 'bh_slot_' + n;
  const META = 'bh_meta';

  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const safeDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

  /* Bump SAVE_VERSION and add a step here whenever the state shape changes */
  const MIGRATIONS = {
    // v1 → v2: departments, exams, juniors, seniority, phone/family, report cards
    1: (s) => {
      s.academics.dept = s.academics.dept || null;
      s.academics.timetable = s.academics.timetable || null;
      Object.values(s.academics.subjects).forEach((x) => { x.exam = x.exam || []; });
      s.npcs.juniors = s.npcs.juniors || [];
      s.npcs.classmates.forEach((c) => { if (c.ability === undefined) c.ability = BH.NPC.baseAbility(c.arch, c.persona); });
      s.senior = s.senior || { style: 0, prefect: null, appointed: false, stripped: false, schoolChild: null };
      s.reports = s.reports || [];
      s.certificates = s.certificates || {};
      BH.Phone.ensure(s);
      return s;
    },
    // v3 → v4: real-time clock on the map
    3: (s) => {
      if (s.today && !s.today.done) s.today.done = {};
      s.clock = undefined; // set by Clock.onLoad from the current block
      return s;
    },
    // v4 → v5: free-roam sandbox — world state, interiors, NPC schedules, data-driven missions, reputation, rumours, paths
    4: (s) => {
      s.world = { map: 'campus', calls: [], overrides: {} };
      s.act = null;
      s.missions = []; s.arcs = {}; s.unlocked = {};
      if (s.today) { s.today.att = {}; s.today.done = undefined; }
      if (s.pos) s.pos = null;
      Object.values(s.academics.subjects).forEach((x) => { x.tests = x.tests || {}; x.late = x.late || 0; x.assignments = x.assignments || 0; });
      return s; // the remaining slices are filled in by each system's onLoad
    },
    // v5 → v6: real school structure — class arms, staff roster, per-arm timetables (8 periods + register), bot students optional
    5: (s) => {
      // the old generated teachers/staff are replaced by the fixed roster (BH.School.ensureStaff keeps nothing by id, so
      // carry relationships over by subject / role)
      const oldT = (s.npcs.teachers || []).map((t) => ({ subject: t.subject, rel: t.rel }));
      const oldS = (s.npcs.staff || []).map((t) => ({ role: t.role, hostel: t.hostel, rel: t.rel }));
      s.npcs.teachers = []; s.npcs.staff = [];
      s.school = null;
      s._carry = { oldT, oldS };
      // keep the current block by clock (the weekday now has 8 periods and a register block)
      if (s.time.dayType === 'weekday' && typeof s.clock === 'number' && BH.Clock) {
        const t = BH.Clock.times(s); let i = 0;
        while (i + 1 < t.length && t[i + 1] <= s.clock) i++;
        s.time.block = i;
      }
      if (s.today) s.today.att = {};
      s.world.seats = {};
      s.act = null;
      // students are real players now: bot coursemates only stay if the dev setting is on (stashed, not deleted)
      if (!(BH.Prefs && BH.Prefs.v.fill_with_bot_students)) {
        s.npcs._bots = { classmates: s.npcs.classmates || [], seniors: s.npcs.seniors || [], juniors: s.npcs.juniors || [] };
        s.npcs.classmates = []; s.npcs.seniors = []; s.npcs.juniors = [];
      }
      return s;
    },
    // v6 → v7: story mode — the school is full of NPC students again (key characters from content/cast.json)
    6: (s) => {
      if (s.school && s.school.settings) s.school.settings.fill_with_bot_students = true;
      s.world.seats = {};
      return s;
    },
    // v2 → v3: 3D avatar
    2: (s) => {
      s.player.avatar = s.player.avatar || BH.data.defaultAvatar(s.player.gender, s.player.religion);
      return s;
    },
  };

  BH.Save = {
    migrate(s) {
      while (s.version < BH.data.CONFIG.SAVE_VERSION) {
        const m = MIGRATIONS[s.version];
        if (m) s = m(s);
        s.version++;
      }
      return s;
    },
    save(s) {
      s.updatedAt = Date.now();
      if (BH.Account) BH.Account.push(s, document.hidden); // logged in: your student lives on the school server
      const ok = safeSet(KEY(s.slot), JSON.stringify(s));
      safeSet(META, JSON.stringify({ lastSlot: s.slot }));
      return ok;
    },

    load(slot) {
      const raw = safeGet(KEY(slot));
      if (!raw) return null;
      try {
        const s = BH.Save.migrate(JSON.parse(raw));
        s.slot = slot;
        return s;
      } catch (e) {
        console.error('Corrupt save in slot', slot, e);
        return null;
      }
    },

    remove(slot) { safeDel(KEY(slot)); },

    meta(slot) {
      const D_STAMP = (s) => BH.data.LEVELS[s.time.year - 1] + 'T' + s.time.term;
      const raw = safeGet(KEY(slot));
      if (!raw) return null;
      try {
        const s = JSON.parse(raw);
        return {
          slot,
          name: s.player.name,
          level: BH.data.LEVELS[s.time.year - 1],
          term: s.time.term,
          week: s.time.week,
          day: BH.data.DAYS[s.time.dow],
          school: BH.data.SCHOOLS[s.player.school].short,
          gameOver: !!s.gameOver,
          chapter: BH.Milestones ? BH.Milestones.stampTitle(D_STAMP(s)) : null,
          updatedAt: s.updatedAt,
        };
      } catch (e) { return { slot, corrupt: true }; }
    },

    allMeta() {
      const out = [];
      for (let i = 1; i <= BH.data.CONFIG.SLOTS; i++) out.push(this.meta(i) || { slot: i, empty: true });
      return out;
    },

    lastSlot() {
      try { return JSON.parse(safeGet(META) || '{}').lastSlot || null; } catch (e) { return null; }
    },
  };
})(window.BH);
