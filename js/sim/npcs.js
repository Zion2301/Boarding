/* NPC controller — every NPC in the current map is an actor ("remote player") driven locally by the
   ScheduleSystem through the same intents a networked player would send. Ported from the 2D scene:
   who is here (schedule sync), where they want to be (seats, staff spots, patrols, callers, fights),
   arrivals/departures through doors and exits, idle milling, watchers looking around, speech bubbles. */
(function (BH) {
  const D = BH.data;
  const U = BH.U;
  const C = () => D.CAMPUS;
  const A = () => BH.Actors;
  const I = () => BH.Intents;
  const id = (n) => 'npc:' + n.id;

  const NPC3 = {
    syncT: 0,
    reset(initial) { NPC3.syncT = 0; NPC3.sync(!!initial); },

    placeKey(p) { return p ? `${p.map}|${p.key}|${p.patrol || ''}|${p.seek ? 1 : 0}|${p.fight ? 1 : 0}` : ''; },

    /* how many people a room shows at once (the school has ~550 students; phones can't draw them all) */
    cap(map) {
      const cm = BH.Sim.cm;
      let n = cm.outdoor ? 60 : cm.src.classId ? 36 : /Hostel$/.test(map) ? 36 : map === 'dining' ? 48 : 30;
      if (BH.Engine3D && BH.Engine3D.mobile) n = Math.round(n * 0.7);
      return n;
    },

    /* who should be in this map right now — key characters first, then staff, your arm, your set, then the crowd */
    sync(initial) {
      const s = BH.Game.s;
      const map = BH.Sim.mapId;
      const me = BH.School && s.school ? BH.School.myClass(s) : null;
      const here = [];
      [...BH.NPC.all(s), ...(BH.Crowd ? BH.Crowd.all(s) : [])].forEach((n) => {
        const place = BH.Schedule.where(s, n);
        const a = A().get(id(n));
        if (place.map === map) here.push({ n, place, a });
        else if (a && !a.leaving) {
          a.leaving = true; a.place = place; a.patrolPts = null; a.seat = false; a.pose = null;
          I().push(a.id, { type: 'path', path: BH.Nav.path(map, a, NPC3.exitPoint(place)) });
        }
        if (a) a.lastPlace = place;
      });
      const rank = ({ n, a }) => (a && !a.leaving ? -1 : 0) * 5000 + (n.key ? 0 : n.type === 'teacher' || n.type === 'staff' ? 1 : !n.crowd && me && n.arm === me.arm ? 2 : !n.crowd ? 3 : 4) * 1000 + (U.hash(n.id) % 1000);
      here.sort((p, q) => rank(p) - rank(q));
      here.slice(0, NPC3.cap(map)).forEach(({ n, place, a }) => {
        if (!a) {
          const pos = initial ? NPC3.goalPoint(n, place) : NPC3.arrivalPoint(n);
          a = A().make(id(n), {
            kind: 'npc', npcId: n.id, map, x: pos.x, y: pos.y, h: Math.PI / 2,
            maxSpeed: U.randInt(58, 82), runSpeed: 140, accel: 300, turnRate: 7, radius: 11,
            auth: BH.Schedule.authority(s, n), wait: Math.random() * 2,
          });
          NPC3.setGoal(a, n, place, initial);
        } else if (NPC3.placeKey(a.place) !== NPC3.placeKey(place) || a.leaving) {
          a.leaving = false;
          NPC3.setGoal(a, n, place, false);
        }
        a.lastPlace = place;
      });
    },

    setGoal(a, n, place, snap) {
      const map = BH.Sim.mapId;
      a.place = place; a.patrolPts = null; a.seek = !!place.seek; a.seat = false; a.pose = null; a.arrived = false;
      if (place.patrol) {
        const pts = place.patrol === 'map' ? BH.Sim.cm.patrol : (C().patrols[place.patrol] || []).map(([x, y]) => ({ x, y }));
        if (pts && pts.length) {
          a.patrolPts = pts; a.patrolIdx = U.hash(n.id) % pts.length;
          if (snap) Object.assign(a, pts[a.patrolIdx]);
          else I().push(a.id, { type: 'path', path: BH.Nav.path(map, a, pts[a.patrolIdx]) });
          return;
        }
      }
      const g = NPC3.goalPoint(n, place);
      a.goal = g;
      a.wantSeat = !!g.seat;
      if (snap) { a.x = g.x; a.y = g.y; a.path = []; a.seat = a.wantSeat; a.arrived = true; if (a.seat) NPC3.sitDown(a, n); }
      else I().push(a.id, { type: 'path', path: BH.Nav.path(map, a, g) });
    },

    /* where an NPC wants to be in THIS map (ported goalPoint) */
    goalPoint(n, place) {
      const s = BH.Game.s;
      const pl = A().player();
      const h = U.hash(n.id + place.key + s.time.dayCount);
      if (place.seek && pl) return { x: pl.x, y: pl.y + 30 };
      if (BH.Sim.cm.outdoor) {
        if (place.fight && s.world.fight) { const L = C().LOCATIONS[s.world.fight.key]; return { x: L.door.x + (n.id === s.world.fight.a ? -14 : 14), y: L.door.y - 20 }; }
        if (place.patrol && C().patrols[place.patrol]) { const [x, y] = C().patrols[place.patrol][0]; return { x, y }; }
        const L = C().LOCATIONS[place.key];
        if (!L) return { x: 1200, y: 1030 };
        const p = { x: L.x + 30 + (h % Math.max(1, L.w - 60)), y: L.y + 30 + ((h >> 4) % Math.max(1, L.h - 60)) };
        return BH.Nav.nearestWalkable(BH.Nav.get('campus'), p);
      }
      const spot = BH.Schedule.spotFor(s, n, BH.Sim.mapId);
      if (spot) return { x: spot.x, y: spot.y };
      const seat = BH.Schedule.seatOf(s, n, BH.Sim.mapId);
      return seat ? { x: seat.x, y: seat.y, seat: !!seat.obj, obj: seat.obj } : BH.Sim.cm.entry;
    },
    arrivalPoint(n) {
      if (!BH.Sim.cm.outdoor) return { x: BH.Sim.cm.entry.x + U.randInt(-10, 10), y: BH.Sim.cm.entry.y + BH.Sim.cm.T * 0.5 };
      const a = A().get(id(n));
      const prev = a && a.lastPlace;
      const L = prev && C().LOCATIONS[prev.key];
      if (L && L.kind === 'b') return { x: L.door.x, y: L.door.y };
      const g = NPC3.goalPoint(n, BH.Schedule.where(BH.Game.s, n));
      const best = Object.values(C().LOCATIONS).filter((l) => l.kind === 'b').sort((p, q) => Math.hypot(p.door.x - g.x, p.door.y - g.y) - Math.hypot(q.door.x - g.x, q.door.y - g.y))[0];
      return best ? { x: best.door.x, y: best.door.y } : g;
    },
    exitPoint(place) {
      const cm = BH.Sim.cm;
      if (!cm.outdoor) return { x: cm.entry.x, y: cm.entry.y + cm.T * 0.6 };
      if (!place.map) { const g = C().LOCATIONS.gate.door; return { x: g.x, y: g.y }; }
      const L = C().LOCATIONS[place.key] || C().LOCATIONS[place.map];
      return L ? { x: L.door.x, y: L.door.y } : { x: 1200, y: 1720 };
    },
    /* sitting at a desk/bench/bed: face the room's front, take the pose */
    sitDown(a, n) {
      a.seat = true;
      // walking pushes them out of solid furniture, so they arrive beside a bed/bench — hop onto the seat itself
      const g = a.goal;
      if (g && g.seat && Math.hypot(g.x - a.x, g.y - a.y) < BH.Sim.cm.T * 2) { a.x = g.x; a.y = g.y; a.vx = a.vy = 0; a.path = []; }
      a.pose = NPC3.restPose();
      a.h = Math.PI / 2 + (BH.Sim.cm.src.houseTables ? 0 : -Math.PI); // classrooms face the board (north)
      if (BH.Sim.cm.src.classroom || BH.Sim.mapId === 'chapel' || BH.Sim.mapId === 'mosque') a.h = -Math.PI / 2;
    },

    /* seated in the hostel after lights out = asleep on the bunk; otherwise just sitting */
    restPose() {
      const s = BH.Game.s;
      return BH.Time.block(s).kind === 'sleep' && BH.Clock.isNight(s) && /Hostel$/.test(BH.Sim.mapId) ? 'sleep' : 'sit';
    },

    /* ---------- per tick ---------- */
    update(dt) {
      const s = BH.Game.s;
      NPC3.syncT -= dt;
      if (NPC3.syncT <= 0) { NPC3.syncT = 0.9; NPC3.sync(false); }
      const pl = A().player();
      const map = BH.Sim.mapId;
      A().list.forEach((a) => {
        if (a.kind !== 'npc') return;
        const n = BH.NPC.get(s, a.npcId);
        // departures vanish at the door / exit
        if (a.leaving && !a.path.length) { A().remove(a.id); return; }
        // callers come to find you
        if (a.seek && !a.leaving && pl) {
          const d = Math.hypot(pl.x - a.x, pl.y - a.y);
          a.reT = (a.reT || 0) - dt;
          if (d > 70 && (!a.path.length || a.reT <= 0)) { a.reT = 0.6; I().push(a.id, { type: 'moveTo', x: pl.x, y: pl.y + 26 }); }
          if (d <= 70 && a.place && a.place.sitWith && !BH.Sim.cm.outdoor) {
            // "come sit with me": take the free seat closest to you
            const seat = BH.Sim.cm.objects.filter((o) => o.seats && o.seats.length && Math.hypot(o.x - pl.x, o.y - pl.y) > 20).sort((p, q) => Math.hypot(p.x - pl.x, p.y - pl.y) - Math.hypot(q.x - pl.x, q.y - pl.y))[0];
            a.seek = false;
            if (seat) { a.goal = { x: seat.seats[0].x, y: seat.seats[0].y, seat: true }; a.wantSeat = true; I().push(a.id, { type: 'path', path: BH.Nav.path(map, a, a.goal) }); NPC3.say(a, '"Shift small, I dey come." 🪑'); }
          } else if (d <= 70) { if (a.path.length) I().push(a.id, { type: 'stop' }); I().push(a.id, { type: 'face', x: pl.x, y: pl.y }); if (!a.saidHi) { a.saidHi = true; NPC3.say(a, U.pick(['"Hey! You! Come here!"', '"I dey find you since!"', '"Oya come, I wan talk to you."'])); } }
        }
        // already on a bunk when lights go out (or the rising bell rings): lie down / sit up
        if (a.seat && (a.pose === 'sit' || a.pose === 'sleep') && /Hostel$/.test(map)) a.pose = NPC3.restPose();
        if (a.wait > 0) { a.wait -= dt; if (a.path.length) { a.pausedPath = a.path; a.path = []; } return; }
        if (a.pausedPath) { a.path = a.pausedPath; a.pausedPath = null; }
        if (a.arrived) {
          a.arrived = false;
          if (a.patrolPts) { a.patrolIdx = (a.patrolIdx + 1) % a.patrolPts.length; a.wait = 0.5 + Math.random() * 1.5; I().push(a.id, { type: 'path', path: BH.Nav.path(map, a, a.patrolPts[a.patrolIdx]) }); }
          else if (a.wantSeat && !a.seat) NPC3.sitDown(a, n);
          else if (!a.seek) { a.wait = 2 + Math.random() * 4; if (n && (n.type === 'teacher' || n.type === 'staff')) a.h = Math.PI / 2; }
        }
        // teaching: write on the board facing it during notes, then turn to the class to talk / ask
        if (n && n.type === 'teacher' && !a.path.length && !a.leaving && s.school && s.school.lessons) {
          const L = s.school.lessons[map];
          if (L && L.t === n.id && L.kind === 'lesson' && !L.free && L.done.enter && BH.Sim.cm.src.classroom) {
            const m = s.clock - L.start;
            const writing = m < 19 && !(L.q && !L.q.closed);
            a.pose = writing ? 'busy' : null;
            a.h = writing ? -Math.PI / 2 : Math.PI / 2;
            if (!writing && a.bubble && (!a.emote || a.emote.until < performance.now())) a.emote = { anim: 'talk', until: performance.now() + 1600 };
          } else if (a.pose === 'busy') a.pose = null;
        }
        if (!a.path.length && !a.seat && !a.seek && !a.patrolPts && a.pose !== 'kneel' && a.pose !== 'sit') {
          a.idle += dt;
          // outdoors people mill around; watchers look around
          if (BH.Sim.cm.outdoor && a.idle > 4 + Math.random() * 6 && a.goal) { a.idle = 0; I().push(a.id, { type: 'moveTo', x: a.goal.x + U.randInt(-40, 40), y: a.goal.y + U.randInt(-30, 30) }); }
          if (a.auth && a.idle > 2.5) { a.idle = 0; a.h += U.randInt(-1, 1) * 0.9; }
        }
        if (a.bubble && a.bubble.until < performance.now()) a.bubble = null;
      });
    },
    say(a, text, ms = 3500) { a.bubble = { text, until: performance.now() + ms }; },
  };

  BH.SimNPC = NPC3;
})(window.BH);
