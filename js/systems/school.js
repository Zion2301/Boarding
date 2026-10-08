/* School structure — the shared state of the school (s.school), built to be owned by a server later:
   - classes: one per level × arm (JSS1A … SS3C) with form teacher, captain + assistant, seating, register, noticeboard
   - students: real players (s.school.students) + optional bot students (s.npcs.*, only when fill_with_bot_students is on)
   - staff: every adult from content/staff.json (s.npcs.teachers / s.npcs.staff), personality text stays in content
   - timetables: generated per class arm from content/school.json so no teacher, class or shared room is double-booked.
     SS levels split by department in "line" periods; RS and NLG split by religion / language.
   Everything here is plain JSON + deterministic from s.school.seed, so every client of a multiplayer room builds the same school. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const C = () => BH.Content;
  const K = () => C().get('school');
  const STAFF = () => C().get('staff');
  const DAYS = 5;

  /* small seeded RNG (mulberry32) so the generated school is the same everywhere */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const shuffled = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const INFORMAL = ['Mama', 'Baba', 'Aunty', 'Mallam', 'Imam', 'Matron', 'Nurse', 'Monsieur'];

  let idx = null; // lookup caches (rebuilt when the timetable changes)

  const School = {
    /* ---------- lifecycle ---------- */
    onNewGame(s) { s.school = null; School.ensure(s); },
    onLoad(s) { School.ensure(s); },
    onNewYear(s) {
      const me = s.school.students.player;
      if (me) me.level = s.time.year;
      Object.values(s.school.classes).forEach((c) => { c.captain = null; c.assistant = null; c.seating = {}; });
      School.ensure(s);
    },
    onNewDay(s) { School.pruneRegisters(s); },

    ensure(s) {
      const sc = s.school = s.school || {};
      sc.seed = sc.seed || (U.hash(`${s.player.name}|${s.createdAt}`) >>> 0) || 1;
      sc.settings = sc.settings || { fill_with_bot_students: School.defaultBots() };
      sc.students = sc.students || {};
      School.ensureStaff(s);
      if (s._carry) School.carryOver(s);
      School.ensureClasses(s);
      if (!sc.tt) School.buildTimetables(s);
      idx = null;
      School.enrol(s, 'player');
      School.syncBots(s, true);
      School.ensureForms(s);
      Object.keys(sc.classes).forEach((cid) => School.ensureSeating(s, cid));
      School.ensureLeaders(s);
    },

    /* ---------- settings ---------- */
    /* Dev/test: fill empty desks with bot students. Off by default (students are meant to be real players).
       ?bots=1 / ?bots=0 in the URL overrides the saved preference for new schools. */
    defaultBots() {
      const q = typeof location !== 'undefined' && typeof URLSearchParams !== 'undefined' && location.search ? new URLSearchParams(location.search).get('bots') : null;
      if (q === '1' || q === '0') return q === '1';
      return !!(BH.Prefs && BH.Prefs.v.fill_with_bot_students);
    },
    botsOn(s) { return !!(s.school && s.school.settings.fill_with_bot_students); },
    setBots(s, on) {
      s.school.settings.fill_with_bot_students = !!on;
      BH.Prefs && BH.Prefs.set('fill_with_bot_students', !!on);
      School.syncBots(s);
      Object.keys(s.school.classes).forEach((cid) => School.ensureSeating(s, cid));
      School.ensureLeaders(s);
      BH.Schedule && BH.Schedule.onBlockStart();
      s.world.seats = {};
      BH.bus.emit('school:bots', { on: !!on });
    },

    /* ---------- staff ---------- */
    staffDef(id) {
      const c = STAFF();
      return c.teachers.find((t) => t.id === id) || c.staff.find((t) => t.id === id) || null;
    },
    call(def) { return INFORMAL.includes(def.title) ? `${def.title} ${def.first}` : `${def.title} ${def.last}`; },
    ensureStaff(s) {
      s.npcs = s.npcs || {};
      ['classmates', 'seniors', 'teachers', 'juniors', 'staff'].forEach((k) => { s.npcs[k] = s.npcs[k] || []; });
      const keepRel = (list, id) => { const o = list.find((x) => x.id === id); return o ? o.rel : null; };
      s.npcs.teachers = STAFF().teachers.map((t) => {
        const old = s.npcs.teachers.find((x) => x.id === t.id);
        return Object.assign(old || { rel: 40 }, {
          id: t.id, type: 'teacher', title: t.title, first: t.first, last: t.last, gender: t.gender, nick: t.nick || null,
          subjects: Object.keys(t.teaches), subject: Object.keys(t.teaches)[0], group: t.group || null,
          strict: t.strict, routine: t.routine || null, authority: true, call: School.call(t),
          emoji: t.gender === 'f' ? '👩🏾‍🏫' : '👨🏾‍🏫',
        });
      });
      s.npcs.staff = STAFF().staff.map((st) => {
        const rel = keepRel(s.npcs.staff, st.id);
        return {
          id: st.id, type: 'staff', role: st.role, title: st.title, first: st.first, last: st.last, call: School.call(st),
          gender: st.gender, emoji: st.emoji, label: st.label, dialogue: st.dialogue || null, authority: !!st.authority,
          strict: st.strict || 0.5, hostel: st.hostel || null, religion: st.religion || null, rel: rel === null ? 45 : rel,
        };
      });
    },
    teachers(s) { return s.npcs.teachers; },
    /* old saves: relationships with the previous teachers/staff move to whoever does that job now */
    carryOver(s) {
      const { oldT, oldS } = s._carry;
      oldT.forEach((o) => { const t = s.npcs.teachers.find((x) => x.subjects.includes(o.subject)); if (t && typeof o.rel === 'number') t.rel = o.rel; });
      oldS.forEach((o) => { const t = s.npcs.staff.find((x) => x.role === o.role && (x.hostel || null) === (o.hostel || null)); if (t && typeof o.rel === 'number') t.rel = o.rel; });
      delete s._carry;
    },

    /* ---------- classes ---------- */
    levelId(n) { return D.LEVELS[n - 1]; },
    ensureClasses(s) {
      const sc = s.school;
      sc.classes = sc.classes || {};
      K().levels.forEach((L) => L.arms.forEach((arm) => {
        const id = L.id + arm;
        sc.classes[id] = Object.assign({ id, level: L.id, n: L.n, arm, stage: L.stage, block: L.block, map: id, form: null, captain: null, assistant: null, seating: {}, register: {}, notices: [] }, sc.classes[id] || {});
      }));
    },
    /* Form teachers: one class each, preferring teachers who teach that level; house masters/mistresses per house */
    ensureForms(s) {
      const sc = s.school;
      const r = rng(sc.seed ^ 0xf0f0);
      const taken = new Set(Object.values(sc.classes).map((c) => c.form).filter(Boolean));
      Object.values(sc.classes).forEach((c) => {
        if (c.form) return;
        const pool = shuffled(STAFF().teachers.filter((t) => !taken.has(t.id)), r)
          .sort((a, b) => (Object.values(b.teaches).some((l) => l.includes(c.level)) ? 1 : 0) - (Object.values(a.teaches).some((l) => l.includes(c.level)) ? 1 : 0));
        if (pool[0]) { c.form = pool[0].id; taken.add(pool[0].id); }
      });
      s.npcs.teachers.forEach((t) => { const c = Object.values(sc.classes).find((x) => x.form === t.id); t.formClass = c ? c.id : null; });
      if (!sc.houseMasters) {
        const pool = shuffled(STAFF().teachers, rng(sc.seed ^ 0x4040));
        sc.houseMasters = {};
        D.HOUSES.forEach((h, i) => { if (pool[i]) sc.houseMasters[h.tag] = pool[i].id; });
      }
      s.npcs.teachers.forEach((t) => { t.house = Object.keys(sc.houseMasters).find((tag) => sc.houseMasters[tag] === t.id) || null; });
    },
    classOf(s, sid = 'player') {
      const st = School.student(s, sid);
      return st ? s.school.classes[School.levelId(st.level) + st.arm] || null : null;
    },
    myClass(s) { return School.classOf(s, 'player'); },
    classIdOfMap(mapId) { const m = C().map(mapId); return (m && m.classId) || null; },

    /* ---------- students (players + bots) ---------- */
    /* A real player joins: give them a class arm (the arm with the fewest players at their level) */
    enrol(s, sid, info) {
      const sc = s.school;
      const lvl = s.time.year;
      const st = sc.students[sid] || {};
      const p = sid === 'player' ? s.player : info || {};
      Object.assign(st, {
        id: sid, kind: 'player', name: p.name, gender: p.gender, level: st.level || lvl,
        religion: p.religion || 'christian', lang: p.lang || 'yoruba', house: p.house ? p.house.tag : null,
        dept: (sid === 'player' && s.academics && s.academics.dept) || st.dept || null,
      });
      if (!st.arm) {
        const L = K().levels.find((x) => x.n === st.level);
        const count = (arm) => Object.values(sc.students).filter((o) => o.kind === 'player' && o.level === st.level && o.arm === arm).length;
        st.arm = L.arms.slice().sort((a, b) => count(a) - count(b) || ((U.hash(sid + a + sc.seed) % 7) - (U.hash(sid + b + sc.seed) % 7)))[0];
      }
      sc.students[sid] = st;
      return st;
    },
    setDept(s, sid, dept) { const st = School.student(s, sid); if (st) st.dept = dept; },
    levelOfNpc(s, n) {
      if (n.type === 'classmate') return s.time.year;
      if (n.type === 'senior') return Number(String(n.level).replace('SS', '')) + 3;
      if (n.type === 'junior') return n.level;
      return null;
    },
    botEntry(s, n) {
      return { id: n.id, kind: 'bot', npc: n.id, name: BH.NPC.fullName(n), gender: n.gender, level: School.levelOfNpc(s, n), arm: n.arm, dept: n.dept || null, religion: n.religion, lang: n.lang, house: BH.NPC.house(n).tag };
    },
    student(s, sid) {
      if (s.school.students[sid]) return s.school.students[sid];
      if (String(sid).startsWith('r:') && BH.Net) return BH.Net.students().find((x) => x.id === sid) || null;
      const n = BH.NPC.get(s, sid);
      return n && ['classmate', 'senior', 'junior'].includes(n.type) ? School.botEntry(s, n) : null;
    },
    students(s) { return [...Object.values(s.school.students), ...(BH.Net && BH.Net.online ? BH.Net.students() : []), ...BH.NPC.students(s).map((n) => School.botEntry(s, n))]; },
    /* online: everybody shares one school (name, uniform, timetables) — the room's */
    adoptSchool(s, sc) {
      if (sc.name) s.player.schoolName = sc.name;
      if (sc.type && BH.data.SCHOOLS[sc.type]) s.player.school = sc.type;
      if (sc.seed && sc.seed !== s.school.seed) {
        s.school.seed = sc.seed;
        s.school.tt = null;
        Object.values(s.school.classes).forEach((c) => { c.form = null; c.seating = {}; c.captain = null; c.assistant = null; });
        s.school.houseMasters = null;
        School.ensure(s);
        s.world.seats = {};
        BH.Schedule.onBlockStart();
      }
    },
    members(s, cid) {
      const c = s.school.classes[cid];
      return School.students(s).filter((st) => School.levelId(st.level) === c.level && st.arm === c.arm);
    },

    /* Bot students: generated only when the dev setting is on; switching it off stashes them (nothing is lost) */
    syncBots(s, quiet) {
      const on = School.botsOn(s);
      const N = s.npcs;
      const have = N.classmates.length + N.seniors.length + (N.juniors || []).length > 0;
      if (on && !have) {
        if (N._bots) { Object.assign(N, N._bots); delete N._bots; } else BH.NPC.makeBots(s);
      } else if (!on && have) {
        N._bots = { classmates: N.classmates, seniors: N.seniors, juniors: N.juniors || [] };
        N.classmates = []; N.seniors = []; N.juniors = [];
      }
      BH.NPC.students(s).forEach((n) => School.placeBot(s, n));
      if (!quiet && BH.UI) BH.UI.toast(on ? '🤖 Bot students on — empty desks are filled for testing.' : '🧑🏾‍🎓 Bot students off — only real players (and the staff) on campus.', 'info');
    },
    /* class arm, religion, language and department for a bot (stable per bot) */
    placeBot(s, n) {
      const me = s.school.students.player;
      const h = U.hash(n.id + (n.first || '') + s.school.seed);
      if (!n.religion) n.religion = n.tribe === 'Hausa' ? 'muslim' : h % 5 === 0 ? 'muslim' : 'christian';
      if (!n.lang) n.lang = { Yoruba: 'yoruba', Igbo: 'igbo', Hausa: 'hausa' }[n.tribe] || ['yoruba', 'igbo', 'hausa'][h % 3];
      const lvl = School.levelOfNpc(s, n);
      if (lvl >= 4 && !n.dept) n.dept = ['science', 'arts', 'commercial'][(h >> 3) % 3];
      if (!n.arm) {
        const arms = K().levels.find((x) => x.n === lvl).arms;
        if (n.type === 'classmate' && me) {
          // your seatmate and bunkmate are in your arm; the rest of your set is spread across the arms
          const i = s.npcs.classmates.indexOf(n);
          n.arm = n.role ? me.arm : arms[(i + arms.indexOf(me.arm)) % arms.length];
        } else n.arm = arms[h % arms.length];
      }
    },

    /* ---------- seating ---------- */
    deskSeats(mapId) {
      const cm = C().compile(mapId);
      if (!cm || cm.outdoor) return [];
      return cm.objects.filter((o) => o.kind === 'desk' && o.seats.length).sort((a, b) => a.y - b.y || a.x - b.x);
    },
    ensureSeating(s, cid) {
      const c = s.school.classes[cid];
      const desks = School.deskSeats(c.map);
      const mem = School.members(s, cid);
      const ids = new Set(mem.map((m) => m.id));
      Object.keys(c.seating).forEach((sid) => { if (!ids.has(sid) || c.seating[sid] >= desks.length) delete c.seating[sid]; });
      const taken = new Set(Object.values(c.seating));
      const free = () => desks.map((d, i) => i).filter((i) => !taken.has(i));
      const give = (sid, i) => { if (i === undefined || i === null) return; c.seating[sid] = i; taken.add(i); };
      const r = rng(s.school.seed ^ U.hash(cid));
      // players first (a random free seat), then each player's seatmate next to them, then everyone else front to back
      mem.filter((m) => m.kind === 'player' && c.seating[m.id] === undefined).forEach((m) => { const f = free(); give(m.id, f[Math.floor(r() * f.length)]); });
      mem.filter((m) => m.kind === 'bot' && c.seating[m.id] === undefined).forEach((m) => {
        const n = BH.NPC.get(s, m.id);
        if (n && n.role === 'seatmate' && c.seating.player !== undefined) {
          const mine = c.seating.player, pair = mine % 2 ? mine - 1 : mine + 1;
          if (!taken.has(pair) && pair < desks.length) return give(m.id, pair);
        }
        give(m.id, free()[0]);
      });
    },
    /* the desk object this student sits at in a classroom map */
    deskOf(s, sid, mapId) {
      const cid = School.classIdOfMap(mapId);
      if (!cid) return null;
      const i = s.school.classes[cid].seating[sid];
      return i === undefined ? null : School.deskSeats(mapId)[i] || null;
    },
    isMyDesk(s, obj) { if (!obj || obj.kind !== 'desk') return false; const d = School.deskOf(s, 'player', obj.map); return !!d && d.id === obj.id; },
    deskOwner(s, obj) {
      const cid = School.classIdOfMap(obj.map);
      if (!cid) return null;
      const i = School.deskSeats(obj.map).findIndex((d) => d.id === obj.id);
      const sid = Object.keys(s.school.classes[cid].seating).find((k) => s.school.classes[cid].seating[k] === i);
      return sid || null;
    },

    /* ---------- class captain & assistant ---------- */
    ensureLeaders(s) {
      Object.values(s.school.classes).forEach((c) => {
        const mem = School.members(s, c.id);
        const ok = (sid) => sid && mem.some((m) => m.id === sid);
        if (ok(c.captain) && (ok(c.assistant) || mem.length < 2)) return;
        const score = (m) => {
          if (m.kind === 'player') return 0.55 + (m.id === 'player' ? (s.reputation || 0) / 400 : 0);
          const n = BH.NPC.get(s, m.id);
          return ({ captain: 1, brilliant: 0.7, churchy: 0.6, snitch: 0.5, regular: 0.4 }[n && n.arch] || 0.3) + (U.hash(m.id) % 10) / 100;
        };
        const ranked = mem.slice().sort((a, b) => score(b) - score(a));
        const was = c.captain;
        c.captain = ranked[0] ? ranked[0].id : null;
        c.assistant = ranked[1] ? ranked[1].id : null;
        if (c.captain === 'player' && was !== 'player' && s.time.dayCount >= 0 && BH.log) BH.log(s, `🎖️ You are the Class Captain of ${c.id}! Keep the noisemakers' list and lead the class.`, 'good');
      });
    },
    nameOf(s, sid) {
      if (!sid) return '—';
      const st = School.student(s, sid);
      if (!st) return '—';
      if (sid === 'player') return `${s.player.name} (you)`;
      return st.name;
    },

    /* ---------- timetables ---------- */
    /* Every class arm gets its own week. Units are booked into free (day, period) slots so that no class, teacher or
       shared room (lab, mosque, library, dining) is in two places at once; SS department lines book all three arms of a
       level together. If a unit can't fit, the period becomes a free period (teacher "no come") — that's Nigeria. */
    buildTimetables(s) {
      const sc = s.school;
      const cfg = K();
      const P = cfg.periodsPerDay;
      const r = rng(sc.seed ^ 0x51ed);
      const defs = STAFF().teachers;
      const load = {};
      defs.forEach((t) => { load[t.id] = 0; });
      const pick = (code, level, group, n) => {
        const pool = defs.filter((t) => t.teaches[code] && t.teaches[code].includes(level) && (!cfg.split[code] || t.group === group));
        if (!pool.length) return null;
        pool.sort((a, b) => load[a.id] - load[b.id] || (U.hash(a.id + sc.seed) % 9) - (U.hash(b.id + sc.seed) % 9));
        load[pool[0].id] += n;
        return pool[0].id;
      };
      const roomOf = (code, group, home) => { const sp = cfg.split[code]; if (!sp) return home; const g = sp.groups[group]; return g === 'classroom' ? home : g; };
      const parts = (code, level, home, n, extra) => (cfg.split[code]
        ? Object.keys(cfg.split[code].groups).map((g) => Object.assign({ code, by: cfg.split[code].by, group: g, t: pick(code, level, g, n), room: roomOf(code, g, home) }, extra))
        : [Object.assign({ code, t: pick(code, level, null, n), room: home }, extra)]);
      const units = [];
      cfg.levels.forEach((L) => {
        const arms = L.arms.map((a) => L.id + a);
        if (L.stage === 'SS') cfg.ssLines.forEach((line, li) => {
          const ps = [];
          Object.entries(cfg.deptRooms).forEach(([dept, arm]) => parts(line[dept], L.id, L.id + arm, line.periods, { dept }).forEach((p) => ps.push(p)));
          units.push({ key: `${L.id}|L${li}`, classes: arms, n: line.periods, parts: ps, line: li });
        });
        arms.forEach((cid) => Object.entries(cfg.periods[L.stage]).forEach(([code, n]) => units.push({ key: `${cid}|${code}`, classes: [cid], n, parts: parts(code, L.id, cid, n, {}) })));
      });
      // hardest first: multi-class lines, then split subjects, then the busiest teachers
      const weight = (u) => u.classes.length * 1000 + u.parts.length * 100 + Math.max(...u.parts.map((p) => load[p.t] || 0));
      units.sort((a, b) => weight(b) - weight(a));

      const SHARED = ['lab', 'mosque', 'library', 'dining'];
      const busy = new Map();
      const isBusy = (k, slot) => busy.has(k) && busy.get(k).has(slot);
      const book = (k, slot) => { if (!busy.has(k)) busy.set(k, new Set()); busy.get(k).add(slot); };
      const tt = {};
      Object.keys(sc.classes).forEach((cid) => { tt[cid] = Array.from({ length: DAYS }, () => Array(P).fill(null)); });
      const perDay = {};
      let free = 0;
      const fits = (u, slot, withTeachers) => u.classes.every((c) => !isBusy('c:' + c, slot))
        && (!withTeachers || u.parts.every((p) => !p.t || !isBusy('t:' + p.t, slot)))
        && (!withTeachers || u.parts.every((p) => !SHARED.includes(p.room) || !isBusy('r:' + p.room, slot)));
      units.forEach((u) => {
        for (let i = 0; i < u.n; i++) {
          let best = -1, bestScore = 1e9;
          shuffled([...Array(DAYS * P).keys()], r).forEach((slot) => {
            if (!fits(u, slot, true)) return;
            const d = Math.floor(slot / P);
            const score = (perDay[`${u.key}|${d}`] || 0) * 10 + (u.n <= DAYS && perDay[`${u.key}|${d}`] ? 50 : 0);
            if (score < bestScore) { bestScore = score; best = slot; }
          });
          let teacherless = false;
          if (best < 0) {
            best = shuffled([...Array(DAYS * P).keys()], r).find((slot) => fits(u, slot, false));
            teacherless = true;
            if (best === undefined) continue;
            free++;
          }
          const d = Math.floor(best / P), p = best % P;
          perDay[`${u.key}|${d}`] = (perDay[`${u.key}|${d}`] || 0) + 1;
          u.classes.forEach((c) => book('c:' + c, best));
          const ps = u.parts.map((q) => {
            const out = Object.assign({}, q);
            if (teacherless) { out.want = out.t; out.t = null; }
            if (out.t) book('t:' + out.t, best);
            // science groups use the lab when it's free
            if (out.dept === 'science' && cfg.labSubjects.includes(out.code) && !isBusy('r:lab', best)) out.room = 'lab';
            if (SHARED.includes(out.room)) book('r:' + out.room, best);
            return out;
          });
          const entry = ps.length === 1 && !u.line ? ps[0] : { line: u.line === undefined ? null : u.line, parts: ps };
          u.classes.forEach((c) => { tt[c][d][p] = entry; });
        }
      });
      free -= School.repair(tt, P);
      sc.tt = tt;
      sc.ttInfo = { free, load, built: s.time.dayCount };
      idx = null;
    },

    /* Swap repair: a period that ended up teacherless swaps with another single-subject period of the same class
       when both teachers are free at the other's time. Returns how many free periods it fixed. */
    repair(tt, P) {
      const busyT = new Map();
      const add = (t, k) => { if (!t) return; if (!busyT.has(t)) busyT.set(t, new Set()); busyT.get(t).add(k); };
      const del = (t, k) => { if (t && busyT.has(t)) busyT.get(t).delete(k); };
      const has = (t, k) => busyT.has(t) && busyT.get(t).has(k);
      Object.values(tt).forEach((week) => week.forEach((day, d) => day.forEach((e, p) => { if (e) (e.parts || [e]).forEach((x) => add(x.t, d * P + p)); })));
      let fixed = 0;
      Object.values(tt).forEach((week) => {
        const slots = week.flatMap((day, d) => day.map((e, p) => ({ e, k: d * P + p, d, p })));
        slots.forEach((a) => {
          const e = a.e;
          if (!e || e.parts || e.t || !e.want) return;
          if (!has(e.want, a.k)) { e.t = e.want; delete e.want; add(e.t, a.k); fixed++; return; }
          const b = slots.find((x) => x.e && !x.e.parts && x.e.t && x.k !== a.k && !has(e.want, x.k) && !has(x.e.t, a.k));
          if (!b) return;
          const e2 = b.e;
          del(e2.t, b.k); add(e2.t, a.k); add(e.want, b.k);
          e.t = e.want; delete e.want;
          week[a.d][a.p] = e2; week[b.d][b.p] = e;
          a.e = e2; b.e = e;
          fixed++;
        });
      });
      return fixed;
    },

    /* the timetable entry a class has in a period, resolved for one student (department / religion / language) */
    entry(s, cid, dow, period) { const t = s.school.tt[cid]; return t && t[dow] ? t[dow][period] : null; },
    resolve(st, e) {
      if (!e) return null;
      if (!e.parts) return e;
      const want = (p) => (!p.dept || p.dept === (st.dept || 'science')) && (!p.by || p.group === st[p.by]);
      return e.parts.find(want) || e.parts.find((p) => !p.dept || p.dept === (st.dept || 'science')) || e.parts[0];
    },
    lessonFor(s, sid, dow = s.time.dow, period) {
      const st = School.student(s, sid);
      if (!st || dow > 4) return null;
      const c = School.classOf(s, sid);
      return c ? School.resolve(st, School.entry(s, c.id, dow, period)) : null;
    },
    /* the class timetable as text rows for one student (noticeboard / phone) */
    weekFor(s, sid = 'player') {
      return [0, 1, 2, 3, 4].map((dow) => Array.from({ length: K().periodsPerDay }, (_, p) => School.lessonFor(s, sid, dow, p)));
    },

    /* reverse indexes: what each teacher / room is doing in each period */
    index(s) {
      if (idx) return idx;
      idx = { teacher: {}, room: {} };
      Object.entries(s.school.tt).forEach(([cid, week]) => week.forEach((day, dow) => day.forEach((e, p) => {
        if (!e) return;
        (e.parts || [e]).forEach((part) => {
          const k = `${dow}|${p}`;
          if (part.t) { const T = (idx.teacher[part.t] = idx.teacher[part.t] || {}); if (!T[k]) T[k] = { room: part.room, code: part.code, classes: [], part }; if (!T[k].classes.includes(cid)) T[k].classes.push(cid); }
          const R = (idx.room[part.room] = idx.room[part.room] || {});
          if (!R[k]) R[k] = { room: part.room, code: part.code, t: part.t, classes: [], part };
          if (!R[k].classes.includes(cid)) R[k].classes.push(cid);
        });
      })));
      return idx;
    },
    teacherSlot(s, tid, dow, period) { const T = School.index(s).teacher[tid]; return T ? T[`${dow}|${period}`] || null : null; },
    roomSlot(s, room, dow, period) { const R = School.index(s).room[room]; return R ? R[`${dow}|${period}`] || null : null; },
    teacherLoad(s, tid) { const T = School.index(s).teacher[tid]; return T ? Object.keys(T).length : 0; },
    /* Who teaches this student a subject (for "your Maths teacher") */
    teacherFor(s, sid, code) {
      const c = School.classOf(s, sid);
      const st = School.student(s, sid);
      if (c && st) for (const day of s.school.tt[c.id]) for (const e of day) { const L = School.resolve(st, e); if (L && L.code === code && L.t) return BH.NPC.get(s, L.t); }
      return s.npcs.teachers.find((t) => t.subjects.includes(code)) || null;
    },

    /* ---------- places ---------- */
    /* campus location key that leads to a map (a class arm → its block, the lab → 'lab') */
    campusKey(mapId) {
      const m = C().map(mapId);
      if (!m) return null;
      if (m.parent) return School.campusKey(m.parent);
      const LOC = D.CAMPUS.LOCATIONS;
      if (LOC[mapId]) return mapId;
      return Object.keys(LOC).find((k) => LOC[k].interior === mapId) || null;
    },
    place(mapId) {
      const m = C().map(mapId);
      const key = School.campusKey(mapId);
      const L = D.CAMPUS.LOCATIONS[key];
      return { key, map: mapId, name: m ? m.name : mapId, emoji: (m && m.emoji) || (L && L.emoji) || '📚' };
    },
    /* where a student should be in a school block (their class, or the room their split group uses) */
    placeFor(s, sid, blockId = BH.Time.blockId(s)) {
      const c = School.classOf(s, sid);
      const b = D.BLOCKS[blockId];
      if (!c) return { key: 'jss', map: 'juniorBlock', name: 'Junior Block' };
      if (b && b.kind === 'class') { const L = School.lessonFor(s, sid, s.time.dow, b.period); if (L && L.room) return School.place(L.room); }
      return School.place(c.map);
    },
    /* where a teacher should be: their timetabled room this period, their form class at register time */
    teacherPlace(s, n, blockId = BH.Time.blockId(s)) {
      const b = D.BLOCKS[blockId];
      if (!b || s.time.dow > 4) return null;
      if (b.kind === 'class') { const hit = School.teacherSlot(s, n.id, s.time.dow, b.period); return hit ? School.place(hit.room) : null; }
      if (b.kind === 'register') { const c = Object.values(s.school.classes).find((x) => x.form === n.id); return c ? School.place(c.map) : null; }
      return null;
    },

    /* ---------- register (attendance) ---------- */
    mark(s, cid, sid, status) {
      const c = s.school.classes[cid];
      const day = String(s.time.dayCount);
      (c.register[day] = c.register[day] || {})[sid] = status;
    },
    pruneRegisters(s) {
      const keep = K().registerDays;
      Object.values(s.school.classes).forEach((c) => Object.keys(c.register).forEach((d) => { if (Number(d) < s.time.dayCount - keep) delete c.register[d]; }));
    },
    attendance(s, cid, sid) {
      const days = Object.values(s.school.classes[cid].register).map((r) => r[sid]).filter(Boolean);
      return { days: days.length, present: days.filter((x) => x === 'P').length, late: days.filter((x) => x === 'L').length, absent: days.filter((x) => x === 'A').length };
    },
    /* end of the register block: the form teacher marks everyone in the class */
    takeRegister(s) {
      const c = School.myClass(s);
      if (!c || s.time.dayType !== 'weekday') return;
      School.members(s, c.id).forEach((m) => {
        if (m.id === 'player') {
          const att = s.today.att && s.today.att.register;
          School.mark(s, c.id, m.id, !att ? 'A' : att.late ? 'L' : 'P');
        } else if (m.kind === 'bot') {
          const h = U.hash(m.id + s.time.dayCount) % 100;
          School.mark(s, c.id, m.id, h < 4 ? 'A' : h < 10 ? 'L' : 'P');
        }
      });
    },
    onBlockEnd(s, id) { if (D.BLOCKS[id] && D.BLOCKS[id].kind === 'register') School.takeRegister(s); },

    /* ---------- class noticeboard ---------- */
    notices(s, cid) {
      const c = s.school.classes[cid];
      const form = c.form && BH.NPC.get(s, c.form);
      const out = [];
      out.push({ k: 'head', text: `📋 ${c.id} · Form teacher: ${form ? BH.NPC.name(form) : '—'}` });
      out.push({ k: 'head', text: `🎖️ Class captain: ${School.nameOf(s, c.captain)} · Assistant: ${School.nameOf(s, c.assistant)}` });
      const A = BH.Academics;
      if (A && A.isTestWeek && A.TEST_WEEKS.includes(s.time.week + 1)) out.push({ k: 'test', text: '📝 TEST NEXT WEEK in every subject. Read your notes!' });
      if (A && s.time.week === D.CONFIG.TERM_WEEKS - 1) out.push({ k: 'test', text: '📝 EXAMS START NEXT WEEK.' });
      (s.missions || []).filter((m) => m.tpl === 'assignment' && m.status === 'active').forEach((m) => out.push({ k: 'assignment', text: `📒 Assignment: ${A.name(s, m.vars.subject, true)} — submit to ${BH.NPC.name(BH.NPC.get(s, m.vars.teacher))}` }));
      const r = rng(s.school.seed ^ U.hash(cid));
      shuffled(K().classNotices, r).slice(0, 2).forEach((t) => out.push({ k: 'note', text: t }));
      c.notices.slice(-5).forEach((n) => out.push({ k: 'post', text: n.text, by: n.by }));
      return out;
    },
  };

  BH.registerSystem('School', School);
})(window.BH);
