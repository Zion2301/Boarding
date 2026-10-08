/* NPC ScheduleSystem — where every NPC is at any moment, from content/routines.json.
   Headless: answers "where is X now?" for the scene, missions (waypoints), detection and gist.
   A place is { key, map, patrol?, spot? }:
     key   = a campus LOCATIONS key (or 'home' = off campus, nowhere)
     map   = interior map id ('campus' for open areas, null when home)
     patrol = list of points to walk (campus route or the interior's own patrol)
   Overrides (fights, sick bay, someone coming to call you) sit on top for a while. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const C = () => BH.Content;

  const cache = { key: null, places: {} };

  const Schedule = {
    onNewGame(s) { s.world = s.world || {}; s.world.overrides = {}; },
    onLoad(s) { s.world.overrides = s.world.overrides || {}; },
    onBlockStart() { cache.key = null; },

    /* Staff (house masters, nurse, tuck-shop aunty, principal, gateman…) live in s.npcs.staff, built from content/staff.json by BH.School */
    staff(s, role, hostel) {
      const list = (s.npcs.staff || []).filter((x) => x.role === role);
      if (hostel) return list.find((x) => x.hostel === hostel) || list[0] || null;
      if (role === 'houseMaster') return list.find((x) => x.hostel === Schedule.hostelOf(s.player.gender)) || list[0] || null;
      return list[0] || null;
    },

    hostelOf(gender) { return gender === 'f' ? 'girlsHostel' : 'boysHostel'; },
    myHostel(s) { return Schedule.hostelOf(s.player.gender); },
    /* a student's class arm room (or their split-group room this period) */
    classroomOf(s, n) { return BH.School.placeFor(s, n.id); },

    /* Which routine an NPC follows */
    routineKey(n) {
      if (n.type === 'teacher') return n.routine || 'teacher';
      if (n.type === 'staff') return n.role;
      const role = n.role || n.prefect;
      if (role === 'labourPrefect') return 'labourPrefect';
      if (C().get('routines').authorityRoles.includes(role)) return 'prefect';
      return 'student';
    },
    routine(key) {
      const R = C().get('routines').routines;
      const r = R[key] || R.student;
      return r.extends ? Object.assign({}, Schedule.routine(r.extends), r) : r;
    },

    /* Is this NPC someone who catches rule-breakers? → { kind, strict } or null */
    authority(s, n) {
      if (!n) return null;
      if (n.type === 'teacher') return { kind: 'teacher', strict: n.strict || 0.5 };
      if (n.type === 'staff') return n.authority ? { kind: 'staff', strict: n.strict || 0.6 } : null;
      const role = n.role || n.prefect;
      if (role && C().get('routines').authorityRoles.includes(role)) return { kind: 'prefect', strict: 0.6 };
      return null;
    },

    /* ---------- the core question: where is this NPC now? ---------- */
    where(s, n) {
      const k = `${s.time.dayCount}|${s.time.block}`;
      if (cache.key !== k) { cache.key = k; cache.places = {}; }
      const ov = s.world.overrides && s.world.overrides[n.id];
      if (ov && ov.until > BH.Clock.abs(s)) return ov.place;
      if (!cache.places[n.id]) cache.places[n.id] = Schedule.compute(s, n);
      return cache.places[n.id];
    },
    override(s, id, place, minutes) {
      s.world.overrides[id] = { place, until: BH.Clock.abs(s) + minutes };
    },
    clearOverride(s, id) { delete s.world.overrides[id]; },

    compute(s, n) {
      const blockId = BH.Time.blockId(s);
      const b = D.BLOCKS[blockId];
      const r = Schedule.routine(Schedule.routineKey(n));
      let token = r[blockId] !== undefined ? r[blockId] : r[b.kind] !== undefined ? r[b.kind] : r.default || 'hostel';
      const h = U.hash(n.id + blockId + s.time.dayCount);
      if (Array.isArray(token)) token = token[h % token.length];
      // students sometimes skip class; teachers sometimes don't show up
      if (n.type !== 'teacher' && n.type !== 'staff' && b.kind === 'class') {
        const skip = C().get('routines').skipClass;
        const p = skip[n.arch] !== undefined ? skip[n.arch] : skip.default;
        if ((h % 1000) / 1000 < p) token = ['field', 'hostel', 'tuckshop', 'backFence'][h % 4];
      }
      if (token === '$teaching' || token === '$form') {
        // the timetable says which room (class arm, lab, mosque…) — or the staff room when they're free
        const pl = BH.School.teacherPlace(s, n, blockId);
        if (pl && !(s.world.teacherAbsent && s.world.teacherAbsent[n.id])) return { key: pl.key, map: pl.map, teaching: true };
        token = 'staff';
      }
      if (n.type === 'teacher' && s.world.teacherAbsent && s.world.teacherAbsent[n.id]) token = 'home';
      return Schedule.resolve(s, n, token);
    },

    resolve(s, n, token) {
      const LOC = D.CAMPUS.LOCATIONS;
      if (token === 'home') return { key: 'home', map: null };
      if (token.startsWith('patrol:')) {
        const route = token.slice(7);
        if (route === 'hostel') {
          const hostel = n.hostel || Schedule.hostelOf(n.gender);
          return { key: hostel, map: hostel, patrol: 'map' };
        }
        const pts = D.CAMPUS.patrols[route];
        return pts ? { key: 'patrol', map: 'campus', patrol: route } : Schedule.resolve(s, n, route);
      }
      let key = token;
      if (token === 'classroom') { const pl = Schedule.classroomOf(s, n); return { key: pl.key, map: pl.map }; }
      if (token === 'hostel') key = n.hostel || Schedule.hostelOf(n.gender);
      else if (token === 'worship') key = (n.religion || (n.tribe === 'Hausa' ? 'muslim' : 'christian')) === 'muslim' ? 'mosque' : 'chapel';
      const L = LOC[key];
      if (!L) return { key: 'home', map: null };
      return { key, map: L.kind === 'b' ? (L.interior || key) : 'campus' };
    },

    /* Everyone whose place is this map right now */
    npcsIn(s, mapId) {
      return [...BH.NPC.all(s), ...(BH.Crowd ? BH.Crowd.all(s) : [])].filter((n) => { const p = Schedule.where(s, n); return p.map === mapId; });
    },
    /* A named staff member's current place (for HUD/mission hints) */
    placeLabel(s, n) {
      const p = Schedule.where(s, n);
      if (!p.map) return 'off campus';
      if (p.key === 'patrol') return 'on patrol';
      const L = D.CAMPUS.LOCATIONS[p.key];
      return L ? L.name : p.key;
    },

    /* ---------- seats & owners (deterministic per save) ----------
       Classroom desks, hostel bunks, dining tables… each NPC gets the same seat every time. */
    seatMap(s, mapId) {
      s.world.seats = s.world.seats || {};
      const tag = `${mapId}|${s.time.year}`;
      if (s.world.seats[tag] && !s.world.seats[tag].live) return s.world.seats[tag];
      const cm = C().compile(mapId);
      const out = {}; // npcId -> { obj, i } ; and owners: objId -> npcId
      const owners = {};
      if (!cm || cm.outdoor) return (s.world.seats[tag] = { seat: out, owners });
      if (cm.src.classId) {
        // a class arm: seats come from the class seating arrangement
        const cid = cm.src.classId;
        const desks = BH.School.deskSeats(mapId);
        const seating = s.school.classes[cid].seating;
        Object.entries(seating).forEach(([sid, i]) => { if (sid === 'player' || !desks[i]) return; out[sid] = { obj: desks[i].id, i: 0 }; owners[desks[i].id] = sid; });
        return { seat: out, owners, live: true };
      }
      const kinds = cm.src.npcSeats || [];
      const seats = [];
      cm.objects.filter((o) => kinds.includes(o.kind)).forEach((o) => o.seats.forEach((p, i) => seats.push({ obj: o.id, i, x: p.x, y: p.y, kind: o.kind })));
      const taken = new Set();
      const give = (n, seat) => { if (!seat) return; out[n.id] = { obj: seat.obj, i: seat.i }; taken.add(seat.obj + '#' + seat.i); if (!owners[seat.obj]) owners[seat.obj] = n.id; };
      const free = () => seats.filter((x) => !taken.has(x.obj + '#' + x.i));
      const near = (pt) => free().sort((a, b) => Math.hypot(a.x - pt.x, a.y - pt.y) - Math.hypot(b.x - pt.x, b.y - pt.y))[0];
      // reserve the player's own furniture
      const mine = cm.objects.find((o) => o.kind === 'myBed' || o.kind === 'myDesk');
      if (cm.src.houseTables) {
        // dining: tables belong to houses; your house table is yours
        const tables = cm.objects.filter((o) => o.kind === 'diningTable');
        const houseOf = (n) => D.HOUSES[U.hash(n.id + (n.first || n.last)) % D.HOUSES.length].tag;
        const byTable = {};
        tables.forEach((t, i) => { byTable[t.id] = D.HOUSES[i % D.HOUSES.length].tag; t.house = byTable[t.id]; });
        BH.NPC.students(s).forEach((n) => {
          const want = seats.filter((x) => byTable[x.obj] === houseOf(n) && !taken.has(x.obj + '#' + x.i));
          give(n, want[0] || free()[0]);
        });
        s.world.seats[tag] = { seat: out, owners, tables: byTable };
        return s.world.seats[tag];
      }
      const people = Schedule.residents(s, mapId);
      if (mine) {
        const buddy = people.find((n) => n.role === (mine.kind === 'myBed' ? 'bunkmate' : 'seatmate'));
        if (buddy) give(buddy, near(mine));
      }
      people.forEach((n) => { if (!out[n.id]) give(n, free()[0]); });
      s.world.seats[tag] = { seat: out, owners };
      return s.world.seats[tag];
    },
    /* Who normally sits/sleeps in this map (for owners & seats) */
    residents(s, mapId) {
      const all = BH.NPC.students(s);
      if (mapId === 'boysHostel' || mapId === 'girlsHostel') return all.filter((n) => Schedule.hostelOf(n.gender) === mapId);
      const cm = C().compile(mapId);
      if (cm && cm.src.classId) return BH.School.members(s, cm.src.classId).filter((m) => m.kind === 'bot').map((m) => BH.NPC.get(s, m.id));
      return all;
    },
    seatOf(s, n, mapId) {
      const cm = C().compile(mapId);
      if (!cm || cm.outdoor) return null;
      const sm = Schedule.seatMap(s, mapId);
      const st = sm.seat[n.id];
      if (st) {
        const o = cm.objects.find((x) => x.id === st.obj);
        if (o && o.seats[st.i]) return { x: o.seats[st.i].x, y: o.seats[st.i].y, obj: o.id };
      }
      // visitors: any free seat of the map's seat kinds, else a random walkable tile
      const kinds = cm.src.npcSeats || [];
      const cand = cm.objects.filter((o) => kinds.includes(o.kind) && o.seats.length);
      const h = U.hash(n.id + mapId);
      if (cand.length) { const o = cand[h % cand.length]; const p = o.seats[(h >> 3) % o.seats.length]; return { x: p.x, y: p.y, obj: o.id }; }
      return Schedule.randomSpot(cm, h);
    },
    randomSpot(cm, h) {
      for (let k = 0; k < 40; k++) {
        const x = 1 + ((h >> (k % 8)) + k * 7) % (cm.cols - 2), y = 1 + ((h >> ((k + 3) % 8)) + k * 5) % (cm.rows - 2);
        if (cm.walk[y][x]) return { x: (x + 0.5) * cm.T, y: (y + 0.5) * cm.T };
      }
      return { x: cm.entry.x, y: cm.entry.y - cm.T };
    },
    owner(s, mapId, objId) {
      const sm = Schedule.seatMap(s, mapId);
      return sm.owners[objId] ? BH.NPC.get(s, sm.owners[objId]) : null;
    },
    /* Staff stand at their spot (nurse at her desk, keeper behind the counter) */
    spotFor(s, n, mapId) {
      const cm = C().compile(mapId);
      if (!cm || cm.outdoor) return null;
      const roleSpot = { teacher: 'teacher', staff: n.role }[n.type];
      if (roleSpot && cm.spots[roleSpot]) return cm.spots[roleSpot];
      if (n.type === 'teacher' && cm.spots.teacher) return cm.spots.teacher;
      if ((n.role === 'diningPrefect' || n.role === 'headPrefect') && cm.spots.prefect) return cm.spots.prefect;
      return null;
    },
  };

  BH.registerSystem('Schedule', Schedule);
})(window.BH);
