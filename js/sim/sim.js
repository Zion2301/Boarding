/* Sim — the headless world simulation for the 3D client (and later the multiplayer server).
   - BH.Actors: serializable state of every character in the current map (player + NPC "remote actors").
   - BH.Intents: everything that moves a character is an intent ({type:'moveTo'|'move'|'stop'|'face'|'emote'|'teleport'}),
     produced by local input (player) or the local NPC controller. A Colyseus client would send/receive the same objects.
   - Movement: acceleration, turn-rate limited heading (characters walk in arcs, never slide sideways),
     arrival slow-down, separation from other characters, sliding collision against solids (BH.Nav).
   - Map logic ported from the 2D scene: doors/exits, areas/rooms, interaction target, objective & waypoint markers.
   Coordinates are MAP PIXELS (same as content/*.json). Renderers read state; they never write it. */
(function (BH) {
  const D = BH.data;
  const U = BH.U;
  const C = () => D.CAMPUS;
  const TICK = 1 / 30;
  const insideRect = (x, y, r, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  /* ---------------- actor store ---------------- */
  const Actors = {
    list: new Map(),
    make(id, props) {
      const a = Object.assign({
        id, kind: 'npc', npcId: null, map: 'campus', x: 0, y: 0, h: Math.PI / 2, vx: 0, vy: 0, speed: 0,
        maxSpeed: 70, runSpeed: 150, accel: 380, turnRate: 9, radius: 11,
        path: [], move: null, run: false, anim: 'idle', pose: null, seat: false, hidden: false, leaving: false,
        wait: 0, idle: 0, bubble: null, emote: null, stuck: 0,
      }, props);
      Actors.list.set(id, a);
      return a;
    },
    get(id) { return Actors.list.get(id) || null; },
    remove(id) { Actors.list.delete(id); },
    clear() { Actors.list.clear(); },
    player() { return Actors.list.get('player') || null; },
    /* render/network snapshot: plain data only */
    snapshot() { return [...Actors.list.values()].map((a) => ({ id: a.id, kind: a.kind, npcId: a.npcId, map: a.map, x: a.x, y: a.y, h: a.h, speed: a.speed, anim: a.anim, pose: a.pose, seat: a.seat, hidden: a.hidden, bubble: a.bubble })); },
  };

  /* ---------------- intents ---------------- */
  const Intents = {
    queue: [],
    push(actorId, intent) { Intents.queue.push(Object.assign({ actor: actorId }, intent)); },
    drain() { const q = Intents.queue; Intents.queue = []; return q; },
    /* game actions (not movement): applied now in single-player; the multiplayer layer will send these to the server */
    send(actorId, intent) { const it = Object.assign({ actor: actorId }, intent); if (BH.Net && BH.Net.send) BH.Net.send(it); else Intents.apply(it); },
    apply(it) {
      const a = Actors.get(it.actor);
      if (!a) return;
      switch (it.type) {
        case 'moveTo': a.path = BH.Nav.path(a.map, a, { x: it.x, y: it.y }); a.run = !!it.run; a.move = null; a.stuck = 0; break;
        case 'path': a.path = it.path.slice(); a.run = !!it.run; a.move = null; a.stuck = 0; break;
        case 'move': if (Math.hypot(it.dx, it.dy) > 0.15) { a.move = { dx: it.dx, dy: it.dy }; a.run = !!it.run; a.path = []; } else a.move = null; break;
        case 'stop': a.path = []; a.move = null; break;
        case 'face': a.faceTo = { x: it.x, y: it.y }; break;
        case 'emote': a.emote = { anim: it.anim, until: performance.now() + (it.secs || 2) * 1000 }; break;
        case 'teleport': Object.assign(a, { x: it.x, y: it.y, vx: 0, vy: 0, speed: 0, path: [], move: null }); if (it.map) a.map = it.map; break;
        default:
          if (String(it.type).startsWith('lesson:') && BH.Lessons) BH.Lessons.intent(it);
      }
    },
  };

  /* ---------------- movement ---------------- */
  function moveActor(a, dt, all) {
    if (a.hidden) return;
    let dx = 0, dy = 0, want = 0;
    const top = a.run ? a.runSpeed : a.maxSpeed;
    if (a.move && Math.hypot(a.move.dx, a.move.dy) > 0.15) {
      const m = Math.min(1, Math.hypot(a.move.dx, a.move.dy));
      dx = a.move.dx; dy = a.move.dy;
      want = (a.run ? a.runSpeed : a.maxSpeed) * Math.min(1, m * 1.15);
    } else if (a.path.length) {
      const p = a.path[0];
      const ex = p.x - a.x, ey = p.y - a.y, d = Math.hypot(ex, ey);
      const last = a.path.length === 1;
      if (d < (last ? 4 : 14)) { a.path.shift(); if (!a.path.length) a.arrived = true; }
      else {
        dx = ex; dy = ey;
        let rem = d; for (let i = 1; i < a.path.length; i++) rem += Math.hypot(a.path[i].x - a.path[i - 1].x, a.path[i].y - a.path[i - 1].y);
        want = Math.min(top, Math.max(18, rem * 2.2));
      }
    }
    // separation from other characters (natural passing; not while seated)
    if (!a.seat) {
      for (const b of all) {
        if (b === a || b.hidden || b.map !== a.map) continue;
        const ox = a.x - b.x, oy = a.y - b.y, od = Math.hypot(ox, oy);
        const min = a.radius + b.radius + 4;
        if (od > 0.01 && od < min * 1.8) { const push = ((min * 1.8 - od) / (min * 1.8)) * (b.seat ? 1.6 : 0.9); dx += (ox / od) * push * (want ? 1 : 0.5) * 1.2; dy += (oy / od) * push * (want ? 1 : 0.5) * 1.2; if (!want) want = Math.min(30, push * 40); }
      }
    }
    const len = Math.hypot(dx, dy);
    const tx = len > 0.001 ? (dx / len) * want : 0, ty = len > 0.001 ? (dy / len) * want : 0;
    // acceleration toward the desired velocity
    const ax = tx - a.vx, ay = ty - a.vy, am = Math.hypot(ax, ay), maxA = a.accel * dt;
    if (am > maxA) { a.vx += (ax / am) * maxA; a.vy += (ay / am) * maxA; } else { a.vx = tx; a.vy = ty; }
    const sp = Math.hypot(a.vx, a.vy);
    // heading turns toward travel direction at a limited rate; movement follows the heading (no sideways sliding)
    if (sp > 4) {
      const want_h = Math.atan2(a.vy, a.vx);
      const err = angDiff(want_h, a.h);
      a.h += Math.max(-a.turnRate * dt, Math.min(a.turnRate * dt, err));
      const fwd = Math.max(0, Math.cos(angDiff(want_h, a.h)));
      a.speed = sp * (0.35 + 0.65 * fwd);
      a.x += Math.cos(a.h) * a.speed * dt;
      a.y += Math.sin(a.h) * a.speed * dt;
    } else {
      a.speed = 0; a.vx = 0; a.vy = 0;
      if (a.faceTo) { const err = angDiff(Math.atan2(a.faceTo.y - a.y, a.faceTo.x - a.x), a.h); a.h += Math.max(-a.turnRate * dt, Math.min(a.turnRate * dt, err)); if (Math.abs(err) < 0.05) a.faceTo = null; }
    }
    if (!a.seat && !a.noclip) BH.Nav.resolve(a.map, a, a.radius);
    // stuck on a waypoint (e.g. blocked by a crowd) → skip it
    if (a.path.length && a.speed < 6) { a.stuck += dt; if (a.stuck > 1.2) { a.path.shift(); a.stuck = 0; } } else a.stuck = 0;
    // locomotion animation from speed (activities can override with a pose)
    a.anim = a.pose || (a.emote && a.emote.until > performance.now() ? a.emote.anim : a.speed > 125 ? 'run' : a.speed > 6 ? 'walk' : 'idle');
  }

  /* ---------------- the simulation for one map ---------------- */
  const Sim = {
    mapId: null, cm: null, acc: 0, armed: false, target: null, markers: {}, cones: [], follow: null, chasing: null,

    load(mapId, spawn) {
      const s = BH.Game.s;
      Sim.mapId = mapId;
      Sim.cm = BH.Content.compile(mapId);
      s.world.map = mapId;
      s.world.moved = false;
      Actors.clear();
      const start = spawn || s.pos || (Sim.cm.outdoor ? { x: C().LOCATIONS.gate.door.x, y: C().LOCATIONS.gate.door.y - 70 } : Sim.cm.entry);
      const p = BH.Nav.nearestWalkable(BH.Nav.get(mapId), start);
      Actors.make('player', { kind: 'player', map: mapId, x: p.x, y: p.y, maxSpeed: 105, runSpeed: 185, accel: 620, turnRate: 11, radius: 12 });
      Sim.armed = false; Sim.follow = null; Sim.chasing = null; Sim.target = null;
      if (BH.SimNPC) BH.SimNPC.reset(true);
      BH.bus.emit('sim:loaded', { map: mapId });
    },

    /* fixed-step update; returns false when paused */
    update(dtMs) {
      const s = BH.Game.s;
      if (!s || !Sim.cm) return false;
      if (BH.Panels.isOpen() || document.hidden) { Actors.list.forEach((a) => { a.vx = a.vy = 0; a.speed = 0; if (!a.pose) a.anim = 'idle'; }); return false; }
      BH.Clock.update(s, dtMs);
      if (s.gameOver) { BH.UI.go('gameover'); return false; }
      if (s.world.moved || (s.world.map && s.world.map !== Sim.mapId)) { BH.SceneManager.load(s.world.map || 'campus', s.pos); return false; }
      if (BH.Events.current(s)) { BH.Dialogue.event(); return false; }
      Sim.acc += dtMs / 1000;
      let steps = 0;
      while (Sim.acc >= TICK && steps < 4) { Sim.tick(TICK); Sim.acc -= TICK; steps++; }
      if (steps === 4) Sim.acc = 0;
      return true;
    },

    tick(dt) {
      const s = BH.Game.s;
      const pl = Actors.player();
      Sim.playerControl(pl, dt);
      if (BH.SimNPC) BH.SimNPC.update(dt);
      Intents.drain().forEach(Intents.apply);
      const all = [...Actors.list.values()];
      all.forEach((a) => moveActor(a, dt, all));
      Sim.poses(pl);
      Sim.updateArea(pl);
      if (BH.SceneManager.busy) return;
      if (BH.SimDetect) { BH.SimDetect.detect(dt); BH.SimDetect.overhear(dt); }
      Sim.target = BH.Panels.isOpen() ? null : Sim.findTarget(pl);
      Sim.updateMarkers(pl);
      s.pos = { x: Math.round(pl.x), y: Math.round(pl.y) };
    },

    /* ---------- player input → intents ---------- */
    input: { dx: 0, dy: 0, run: false },
    playerControl(pl, dt) {
      const s = BH.Game.s;
      const inp = Sim.input;
      const moving = Math.hypot(inp.dx, inp.dy) > 0.15;
      const frozen = s.act && ['sleep', 'busy', 'lesson', 'prep', 'seat'].includes(s.act.type);
      if (moving) { Sim.follow = null; Sim.chasing = null; Sim.interruptRest(); }
      if (frozen) { Intents.push('player', { type: 'stop' }); return; }
      if (moving) { Intents.push('player', { type: 'move', dx: inp.dx, dy: inp.dy, run: inp.run }); return; }
      if (pl.move) Intents.push('player', { type: 'move', dx: 0, dy: 0 });
      // following an NPC / walking up to talk to one
      const chase = Sim.chasing || Sim.follow;
      if (chase) {
        const o = Actors.get('npc:' + chase);
        if (!o) { Sim.chasing = null; Sim.follow = null; return; }
        const d = Math.hypot(o.x - pl.x, o.y - pl.y);
        if (Sim.chasing && d < 70) { Sim.chasing = null; Intents.push('player', { type: 'stop' }); BH.Dialogue.npc(o.npcId); return; }
        Sim.reT = (Sim.reT || 0) - dt;
        if (d > 60 && Sim.reT <= 0) { Sim.reT = 0.5; Intents.push('player', { type: 'moveTo', x: o.x, y: o.y + 20 }); }
      }
    },
    walkTo(pt, run) {
      Sim.follow = null; Sim.chasing = null;
      Sim.interruptRest();
      const pl = Actors.player();
      const far = Math.hypot(pt.x - pl.x, pt.y - pl.y) > 480;
      Intents.push('player', { type: 'moveTo', x: pt.x, y: pt.y, run: run || far });
    },
    walkToNpc(npcId) {
      const o = Actors.get('npc:' + npcId), pl = Actors.player();
      if (!o) return;
      if (Math.hypot(o.x - pl.x, o.y - pl.y) < 90) { BH.Dialogue.npc(npcId); return; }
      Sim.chasing = npcId;
      Intents.push('player', { type: 'moveTo', x: o.x, y: o.y + 20 });
    },
    interruptRest() {
      const s = BH.Game.s;
      if (s.world.ff) BH.Clock.stopWait(s, 'moved');
      if (s.act && ['lesson', 'prep', 'seat', 'hide', 'sleep', 'busy'].includes(s.act.type)) BH.Activities.stand(s, true);
    },
    snap(pt) { const pl = Actors.player(); if (pl) Intents.apply({ actor: 'player', type: 'teleport', x: pt.x, y: pt.y }); },

    /* activity → body pose for the renderer (sit/sleep/kneel/carry…) */
    poses(pl) {
      const s = BH.Game.s;
      const a = s.act;
      pl.seat = !!(a && ['lesson', 'prep', 'seat'].includes(a.type));
      pl.hidden = false;
      pl.pose = !a ? null : a.type === 'sleep' ? 'sleep' : ['lesson', 'prep', 'seat'].includes(a.type) ? (a.mode === 'doze' ? 'sleep_sit' : 'sit') : a.type === 'busy' ? 'busy' : a.type === 'hide' ? 'crouch' : null;
      pl.carry = BH.Inv.has(s, 'water') ? 'bucket' : null;
      pl.ghost = BH.Rules.hidden(s);
    },

    /* ---------- doors, exits, areas (ported from the 2D scene) ---------- */
    updateArea(pl) {
      const s = BH.Game.s;
      const x = pl.x, y = pl.y;
      if (Sim.cm.outdoor) {
        let area = null;
        Object.entries(C().LOCATIONS).forEach(([key, L]) => { if (L.kind === 'o' && insideRect(x, y, L, key === 'backFence' ? 70 : 25)) area = key; });
        s.world.area = area; s.world.room = null;
        let nearDoor = null;
        Object.entries(C().LOCATIONS).forEach(([key, L]) => { if (L.kind === 'b' && Math.hypot(L.door.x - x, L.door.y - y) < 26) nearDoor = key; });
        if (!nearDoor) Sim.armed = true;
        else if (Sim.armed && !BH.Panels.isOpen()) { Sim.armed = false; BH.SceneManager.enter(nearDoor); }
      } else {
        s.world.area = null;
        s.world.room = Sim.cm.rooms.find((r) => insideRect(x, y, r)) || null;
        const onExit = Sim.cm.exits.some((e) => insideRect(x, y, e, 6)) && y > Sim.cm.entry.y + 10;
        // hallway doors lead into classrooms
        const door = (Sim.cm.doors || []).find((d) => Math.abs(d.x - x) < d.w * 0.45 && y < d.y + d.h * 0.4);
        if (!onExit && !door) Sim.armed = true;
        else if (Sim.armed && !BH.Panels.isOpen()) { Sim.armed = false; if (door) BH.SceneManager.enterRoom(door.to); else BH.SceneManager.exit(); }
      }
    },

    /* ---------- what E/Space would use (ported findTarget) ---------- */
    findTarget(pl) {
      const s = BH.Game.s;
      if (s.act && ['lesson', 'prep', 'seat', 'hide', 'sleep'].includes(s.act.type)) return { type: 'self', x: pl.x, y: pl.y, h: 1.9 };
      const px = pl.x, py = pl.y, cm = Sim.cm;
      let best = null, bd = 1e9;
      const consider = (t, d) => { if (d < bd) { bd = d; best = t; } };
      Actors.list.forEach((o) => {
        if (o.kind !== 'npc' || o.leaving || o.hidden) return;
        const d = Math.hypot(o.x - px, o.y - py);
        if (d < 78) consider({ type: 'npc', npc: BH.NPC.get(s, o.npcId), x: o.x, y: o.y, h: 2.1 }, d + (!o.path.length && (o.seat || !cm.outdoor) ? 18 : -12));
      });
      cm.objects.forEach((o) => {
        const dx = Math.max(Math.abs(px - o.x) - (o.w || 0) / 2, 0), dy = Math.abs(py - o.y);
        const d = cm.outdoor ? Math.hypot(o.x - px, o.y - py) : Math.hypot(dx, dy);
        const mine = ['myDesk', 'myBed', 'servingCounter', 'shopCounter', 'schoolPhone', 'chopBox'].includes(o.kind) ? 22 : 0;
        if (d < (cm.outdoor ? o.r : cm.T * 1.05)) consider({ type: 'object', obj: o, x: o.x, y: o.y, h: cm.outdoor ? 1.6 : 1.3 }, d - mine);
      });
      if (cm.outdoor) Object.entries(C().LOCATIONS).forEach(([key, L]) => { if (L.kind === 'b') { const d = Math.hypot(L.door.x - px, L.door.y - py); if (d < 80) consider({ type: 'door', key, x: L.door.x, y: L.door.y, h: 2.6 }, d + 10); } });
      else (cm.doors || []).forEach((dr) => { const d = Math.hypot(dr.x - px, dr.y - py); if (d < 70) consider({ type: 'door', room: dr.to, x: dr.x, y: dr.y + cm.T * 0.5, h: 2.6 }, d + 6); });
      return best;
    },

    /* ---------- objective + mission waypoint (data for the renderer) ---------- */
    updateMarkers() {
      const s = BH.Game.s;
      const e = BH.Activities.expected(s);
      const present = BH.Activities.present(s);
      let obj = null;
      if (e && !present) obj = Sim.route(e.map, e.key);
      else if (e && present && !Sim.cm.outdoor && !s.act) {
        const kind = BH.Time.block(s).kind;
        const desk = ['class', 'register', 'prep'].includes(kind) ? BH.School.deskOf(s, 'player', Sim.mapId) : null;
        const want = { class: ['labBench', 'pew', 'prayerMat', 'staffTable', 'diningTable', 'desk'], meal: [s.today.flags.plate ? 'diningTable' : 'servingCounter'], sleep: ['myBed'] }[kind];
        const o = desk || (want && Sim.cm.objects.find((x) => want.includes(x.kind) && (x.kind !== 'diningTable' || kind !== 'meal' || x.house === s.player.house.tag || !x.house)));
        if (o) obj = { x: o.x, y: o.y, h: 1.3 };
      }
      Sim.markers = { objective: obj, waypoint: Sim.waypoint() };
    },
    /* the next marker on the way to a map: a campus door, a hallway door, or this room's exit */
    route(map, key) {
      const cm = Sim.cm;
      const M = BH.Content.map(map);
      if (cm.outdoor) { const L = C().LOCATIONS[key || BH.School.campusKey(map)]; return L ? { x: L.door.x, y: L.door.y, h: L.kind === 'b' ? 3.2 : 1.5 } : null; }
      const door = (cm.doors || []).find((d) => d.to === map);
      if (door) return { x: door.x, y: door.y + cm.T * 0.3, h: 2.6 };
      if (M && M.parent === Sim.mapId) return null;
      return { x: cm.entry.x, y: cm.entry.y + cm.T * 0.5, h: 1.2, exit: true };
    },
    waypoint() {
      const s = BH.Game.s;
      const id = BH.HUD.waypoint;
      if (!id) return null;
      const m = s.missions.find((x) => x.id === id);
      if (!m || !['active', 'offered'].includes(m.status)) { BH.HUD.waypoint = null; return null; }
      const t = m.status === 'offered' ? { npc: m.vars.giver, map: BH.Schedule.where(s, BH.NPC.get(s, m.vars.giver)).map } : BH.Missions.target(s, m);
      if (!t) return null;
      const o = t.npc && Actors.get('npc:' + t.npc);
      if (o) return { x: o.x, y: o.y, h: 2.4 };
      if (t.map === Sim.mapId) {
        if (t.obj) { const ob = Sim.cm.objects.find((x) => x.id === t.obj); if (ob) return { x: ob.x, y: ob.y, h: 1.6 }; }
        if (t.object) { const ob = Sim.cm.objects.find((x) => x.secret === t.object); if (ob) return { x: ob.x, y: ob.y, h: 1.6 }; }
        if (Sim.cm.outdoor && t.key && C().LOCATIONS[t.key]) { const L = C().LOCATIONS[t.key]; return { x: L.door.x, y: L.door.y, h: 3 }; }
        return null;
      }
      if (!t.map) return null;
      if (Sim.cm.outdoor) { const L = C().LOCATIONS[t.map] || C().LOCATIONS[t.key] || C().LOCATIONS[BH.School.campusKey(t.map)]; return L ? { x: L.door.x, y: L.door.y, h: 3 } : null; }
      return Sim.route(t.map, t.key);
    },
  };

  /* ---------------- SceneManager for the 3D client (same API as the 2D one) ---------------- */
  const SM3 = {
    busy: false,
    start(parent) { BH.Engine3D.start(parent); },
    stop() { BH.Engine3D.stop(); },
    running() { return !!BH.Engine3D.running; },
    current() { return Sim.mapId; },
    load(mapId, spawn) {
      const s = BH.Game.s;
      if (SM3.busy) return;
      if (!BH.Content.map(mapId)) { s.world.map = Sim.mapId; s.world.moved = false; return; }
      SM3.busy = true;
      const from = Sim.mapId;
      if (s.act && ['lesson', 'prep', 'seat', 'hide'].includes(s.act.type)) s.act = null;
      BH.Sound && BH.Sound.play('door');
      BH.Engine3D.fade(true, () => {
        BH.Save.save(s);
        Sim.load(mapId, spawn);
        BH.Engine3D.showMap(mapId);
        BH.bus.emit('map:changed', { from, to: mapId });
        SM3.busy = false;
        BH.Engine3D.fade(false);
      });
    },
    enter(key) {
      const L = C().LOCATIONS[key];
      if (!L || L.kind !== 'b') return;
      const id = L.interior || key;
      const cm = BH.Content.compile(id);
      if (!cm) { BH.UI.toast(`${L.emoji} ${L.name} is locked for now.`, 'info'); return; }
      BH.bus.emit('enter', { map: id, key });
      SM3.load(id, { x: cm.entry.x, y: cm.entry.y });
    },
    /* hallway → classroom */
    enterRoom(id) {
      const cm = BH.Content.compile(id);
      if (!cm) return;
      BH.bus.emit('enter', { map: id, key: BH.School.campusKey(id) });
      SM3.load(id, { x: cm.entry.x, y: cm.entry.y });
    },
    exit() {
      if (Sim.cm.outdoor) return;
      const parent = Sim.cm.src.parent;
      if (parent) { const pm = BH.Content.compile(parent); const d = (pm.doors || []).find((x) => x.to === Sim.mapId); return SM3.load(parent, d ? { x: d.x, y: d.y + pm.T * 1.1 } : pm.entry); }
      SM3.load('campus', SM3.doorSpawn(Sim.cm.src.exit || Sim.mapId));
    },
    doorSpawn(key) { const L = C().LOCATIONS[key]; if (!L) return null; return { x: L.door.x, y: L.door.y + (L.door.y < L.y ? -46 : 46) }; },
    escort(where) {
      const s = BH.Game.s;
      const my = BH.Schedule.myHostel(s);
      const go = (map, spawn) => setTimeout(() => SM3.load(map, spawn), 600);
      if (where === 'hostel') { const cm = BH.Content.compile(my); const bed = cm.objects.find((o) => o.kind === 'myBed'); return go(my, bed ? { x: bed.x, y: bed.y + cm.T } : cm.entry); }
      if (where === 'class') { const e = BH.Activities.expected(s); if (e && e.map !== 'campus') return go(e.map, BH.Content.compile(e.map).entry); return null; }
      if (where === 'sickbay') { const cm = BH.Content.compile('sickbay'); const bed = cm.objects.find((o) => o.kind === 'sickBed'); return go('sickbay', bed ? { x: bed.x, y: bed.y + cm.T } : cm.entry); }
      if (where === 'out') { if (!Sim.cm.outdoor) return go('campus', SM3.doorSpawn(BH.School.campusKey(Sim.mapId) || Sim.cm.src.exit || Sim.mapId)); const a = C().LOCATIONS.assembly.door; return go('campus', { x: a.x, y: a.y }); }
      return null;
    },
  };

  /* ---------------- BH.World facade for the systems (same API the 2D scene offered) ---------------- */
  const compat = {
    get mapId() { return Sim.mapId; },
    get cm() { return Sim.cm; },
    get player() { return Actors.player() || { x: 0, y: 0 }; },
    get npcs() {
      const m = new Map();
      Actors.list.forEach((a) => { if (a.kind === 'npc') m.set(a.npcId, { n: BH.NPC.get(BH.Game.s, a.npcId), spr: a, seat: a.seat, leaving: a.leaving, path: a.path }); });
      return m;
    },
    get target() { return Sim.target; },
    snap(pt) { Sim.snap(pt); },
  };
  const World3D = {
    get scene() { return Sim.cm ? compat : null; },
    set scene(v) { /* ignored in 3D */ },
    start(parent) { SM3.start(parent); },
    stop() { SM3.stop(); },
    running() { return SM3.running(); },
    refreshPlayer() { BH.Engine3D.refreshPlayer && BH.Engine3D.refreshPlayer(); },
    snap(pt) { Sim.snap(pt); },
    escort(where) { SM3.escort(where); },
    follow(id) { Sim.follow = id; },
    target() { return Sim.target; },
    toScreen(x, y, h) { return BH.Engine3D.toScreen(x, y, h); },
    nearbyNpcs(r) { const pl = Actors.player(); if (!pl) return []; return [...Actors.list.values()].filter((a) => a.kind === 'npc' && Math.hypot(a.x - pl.x, a.y - pl.y) < r).map((a) => BH.NPC.get(BH.Game.s, a.npcId)); },
    watcherNear(r) {
      const pl = Actors.player(); if (!pl) return null;
      let best = null;
      Actors.list.forEach((a) => { if (a.kind !== 'npc' || !a.auth) return; const d = Math.hypot(a.x - pl.x, a.y - pl.y); if (d < r && !BH.Nav.losBlocked(Sim.mapId, a, pl) && (!best || d < best.dist)) best = { id: a.npcId, dist: d }; });
      return best;
    },
    npcPos(id) { const a = Actors.get('npc:' + id); return a ? { x: a.x, y: a.y } : null; },
    zone() { return null; }, nearNpc() { return null; },
  };

  BH.Actors = Actors;
  BH.Intents = Intents;
  BH.Sim = Sim;
  BH.SceneManager3D = SM3;
  BH.World3D = World3D;
  BH.SimUtil = { angDiff, insideRect };
})(window.BH);
