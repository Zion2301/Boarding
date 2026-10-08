/* WorldScene (Phaser 3): renders ONE map — the outdoor campus or a building interior — from content JSON.
   It owns the player, the NPCs who are in this map right now (from the ScheduleSystem), vision cones and
   detection, the interaction target (for the E-prompt), doors/exits, weather + day/night, markers and the minimap.
   Switching maps is the SceneManager's job (scenemanager.js): it restarts this scene with another mapId.
   BH.World is the small API the rest of the game uses to talk to whatever scene is running. */
(function (BH) {
  const D = BH.data;
  const U = BH.U;
  const C = () => D.CAMPUS;

  const PLAYER_SPEED = 190;
  const NPC_SPEED = [90, 130];
  const DEPTH = { marker: 9700, night: 9500, cones: 9400, ui: 9800, weather: 9550 };
  const TAG_COL = { classmate: '#0f5c3f', senior: '#7b1f2b', teacher: '#1b2a4a', junior: '#5d4037', staff: '#4a148c' };

  const insideRect = (x, y, r, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

  /* Dijkstra over the campus walking graph */
  function graphRoute(from, to) {
    const N = C().NODES, E = C().EDGES;
    const near = (p) => Object.keys(N).reduce((best, k) => { const d = Math.hypot(N[k][0] - p.x, N[k][1] - p.y); return d < best.d ? { k, d } : best; }, { k: null, d: 1e9 }).k;
    const a = near(from), b = near(to);
    if (!a || !b) return [to];
    const adj = {};
    E.forEach(([u, v]) => { (adj[u] = adj[u] || []).push(v); (adj[v] = adj[v] || []).push(u); });
    const dist = { [a]: 0 }, prev = {}, todo = new Set(Object.keys(N));
    while (todo.size) {
      let u = null;
      todo.forEach((k) => { if (dist[k] !== undefined && (u === null || dist[k] < dist[u])) u = k; });
      if (u === null || u === b) break;
      todo.delete(u);
      (adj[u] || []).forEach((v) => { const nd = dist[u] + Math.hypot(N[u][0] - N[v][0], N[u][1] - N[v][1]); if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = u; } });
    }
    const path = [];
    for (let k = b; k; k = prev[k]) { path.unshift({ x: N[k][0], y: N[k][1] }); if (k === a) break; }
    path.push(to);
    return path;
  }

  class WorldScene extends Phaser.Scene {
    constructor() { super('World'); }

    init(data) { this.mapId = (data && data.mapId) || 'campus'; this.spawn = (data && data.spawn) || null; }

    preload() {
      const S = D.SPRITES || {};
      Object.entries(S.buildings || {}).forEach(([k, url]) => { if (!this.textures.exists('bld_' + k)) this.load.image('bld_' + k, url); });
      Object.entries(S.tiles || {}).forEach(([k, url]) => { if (!this.textures.exists('tile_' + k)) this.load.image('tile_' + k, url); });
    }

    create() {
      const s = BH.Game.s;
      this.s = s;
      // Phaser reuses this instance on restart: reset per-map state
      Object.assign(this, { minimap: null, miniDot: null, target: null, follow: null, chasing: null, tappedNpc: null, path: [] });
      const cm = BH.Content.compile(this.mapId);
      this.cm = cm;
      this.outdoor = !!cm.outdoor;
      s.world.map = this.mapId;
      s.world.moved = false;
      this.physics.world.setBounds(0, 0, cm.W, cm.H);
      BH.MapRender.textures(this);
      this.labels = [];
      this.solids = this.physics.add.staticGroup();
      if (this.outdoor) BH.MapRender.campus(this); else BH.MapRender.interior(this, cm);

      // player
      if (!this.textures.exists('pl_f')) BH.Sprites.texture(this, 'pl', BH.Sprites.playerLook(s));
      const start = this.spawn || s.pos || (this.outdoor ? { x: C().LOCATIONS.gate.door.x, y: C().LOCATIONS.gate.door.y - 70 } : cm.entry);
      this.player = this.physics.add.sprite(start.x, start.y, 'pl_f').setScale(0.72);
      this.player.body.setCircle(13, 19, 64);
      this.player.setCollideWorldBounds(true);
      this.physics.add.collider(this.player, this.solids);
      this.path = [];
      this.armed = false;

      // npcs
      this.npcs = new Map();
      this.syncTimer = 0;
      this.syncNpcs(true);

      // markers & overlays
      this.objMarker = this.add.text(0, 0, '!', { fontFamily: 'Lilita One', fontSize: '54px', color: '#ffd400', stroke: '#3a2a00', strokeThickness: 8 }).setOrigin(0.5, 1).setDepth(DEPTH.marker).setVisible(false);
      this.objRing = this.add.ellipse(0, 0, 90, 44).setStrokeStyle(5, 0xffd400, 0.95).setDepth(3).setVisible(false);
      this.wpMarker = this.add.text(0, 0, '📍', { fontSize: '44px' }).setOrigin(0.5, 1).setDepth(DEPTH.marker).setVisible(false);
      this.targetRing = this.add.ellipse(0, 0, 60, 26).setStrokeStyle(3, 0xffffff, 0.85).setDepth(4).setVisible(false);
      this.edgeArrow = this.add.triangle(0, 0, 0, -16, 12, 12, -12, 12, 0x2ec4ff).setStrokeStyle(3, 0x003a55).setScrollFactor(0).setDepth(DEPTH.ui).setVisible(false);
      this.cones = this.add.graphics().setDepth(DEPTH.cones);
      this.secretFx = this.add.text(0, 0, '✨', { fontSize: '18px' }).setOrigin(0.5).setDepth(DEPTH.marker).setVisible(false);

      const cam = this.cameras.main;
      cam.setBounds(this.outdoor ? 0 : -200, this.outdoor ? 0 : -160, cm.W + (this.outdoor ? 0 : 400), cm.H + (this.outdoor ? 0 : 320));
      cam.startFollow(this.player, true, 0.14, 0.14);
      cam.setBackgroundColor(this.outdoor ? '#3f7f33' : '#1b1410');
      this.applyZoom();
      cam.fadeIn(260, 0, 0, 0);

      BH.HUD.setMap(this.outdoor, cm); // HUD layout first, so the minimap lands inside its frame
      this.makeNight();
      this.makeWeather();
      if (this.outdoor) { this.makeMinimap(); this.time.delayedCall(150, () => this.placeMinimap()); }

      // input
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys('W,A,S,D');
      this.input.keyboard.on('keydown-E', () => BH.HUD.primary(0));
      this.input.keyboard.on('keydown-ENTER', () => BH.HUD.primary(0));
      this.input.keyboard.on('keydown-SPACE', () => BH.HUD.primary(0));
      this.input.keyboard.on('keydown-F', () => BH.HUD.primary(1));
      this.input.keyboard.on('keydown-Q', () => BH.HUD.radial());
      this.input.keyboard.on('keydown-TAB', (ev) => { ev.preventDefault && ev.preventDefault(); BH.HUD.radial(); });
      this.input.on('pointerup', (p, over) => this.onTap(p, over));
      this.scale.on('resize', this.onResize, this);
      this.events.once('shutdown', () => { this.scale.off('resize', this.onResize, this); });

      this.spotted = {};
      this.overhearT = 0;
      this.ruleT = 0;
      this.broken = [];
      BH.World.scene = this;
      BH.SceneManager.busy = false;
      if (BH.Writing && BH.AI.online()) BH.Writing.loadGraffiti(s, this.mapId).catch(() => {});
    }

    /* ---------------- NPCs ---------------- */
    placeKey(p) { return p ? `${p.map}|${p.key}|${p.patrol || ''}|${p.seek ? 1 : 0}|${p.fight ? 1 : 0}` : ''; }

    syncNpcs(initial) {
      const s = this.s;
      BH.NPC.all(s).forEach((n) => {
        const place = BH.Schedule.where(s, n);
        const here = place.map === this.mapId;
        const o = this.npcs.get(n.id);
        if (here && !o) {
          const pos = initial ? this.goalPoint(n, place, true) : this.arrivalPoint(n);
          const no = this.spawnNpc(n, pos);
          this.setGoal(no, place, initial);
        } else if (!here && o && !o.leaving) {
          o.leaving = true; o.place = place; o.patrolPts = null; o.seat = false;
          o.path = this.route(o.spr, this.exitPoint(place));
        } else if (here && o && this.placeKey(o.place) !== this.placeKey(place)) {
          o.leaving = false;
          this.setGoal(o, place, false);
        }
        if (o || here) (this.npcs.get(n.id) || {}).lastPlace = place;
      });
    }

    spawnNpc(n, pos) {
      const s = this.s;
      const key = 'npc_' + n.id;
      if (!this.textures.exists(key + '_f')) BH.Sprites.texture(this, key, BH.Sprites.npcLook(s, n));
      const spr = this.physics.add.sprite(pos.x, pos.y, key + '_f').setScale(['teacher', 'staff'].includes(n.type) ? 0.8 : 0.72);
      spr.setInteractive({ useHandCursor: true });
      spr.on('pointerup', (p) => { this.tappedNpc = n.id; });
      const label = n.type === 'teacher' || n.type === 'staff' ? BH.NPC.name(n) : n.first;
      const tag = this.add.text(0, 0, label, { fontFamily: 'Nunito', fontStyle: '800', fontSize: '13px', color: '#ffffff', backgroundColor: TAG_COL[n.type] || '#0f5c3f', padding: { x: 5, y: 2 } }).setOrigin(0.5, 1).setDepth(9600);
      const mark = this.add.text(0, 0, '!', { fontFamily: 'Lilita One', fontSize: '30px', color: '#2ec4ff', stroke: '#002a3a', strokeThickness: 6 }).setOrigin(0.5, 1).setDepth(DEPTH.marker).setVisible(false);
      const bubble = this.add.text(0, 0, '', { fontFamily: 'Nunito', fontStyle: '700', fontSize: '13px', color: '#1b2a4a', backgroundColor: '#ffffff', padding: { x: 6, y: 4 }, wordWrap: { width: 190 } }).setOrigin(0.5, 1).setDepth(DEPTH.marker + 1).setVisible(false);
      if (this.minimap) this.minimap.ignore([tag, mark, bubble]);
      const o = { n, spr, tag, mark, bubble, bubbleT: 0, path: [], wait: Math.random() * 2, idle: 0, speed: U.randInt(NPC_SPEED[0], NPC_SPEED[1]), facing: Math.PI / 2, auth: BH.Schedule.authority(s, n), leaving: false };
      this.npcs.set(n.id, o);
      return o;
    }
    destroyNpc(o) { [o.spr, o.tag, o.mark, o.bubble].forEach((x) => x.destroy()); this.npcs.delete(o.n.id); }

    setGoal(o, place, snap) {
      o.place = place;
      o.patrolPts = null; o.seek = !!place.seek; o.seat = false;
      if (place.patrol) {
        const pts = place.patrol === 'map' ? this.cm.patrol : (C().patrols[place.patrol] || []).map(([x, y]) => ({ x, y }));
        if (pts && pts.length) { o.patrolPts = pts; o.patrolIdx = U.hash(o.n.id) % pts.length; if (!snap) o.path = this.route(o.spr, pts[o.patrolIdx]); return; }
      }
      const g = this.goalPoint(o.n, place, false);
      o.goal = g;
      o.seat = !!g.seat;
      if (snap) { o.spr.setPosition(g.x, g.y); o.path = []; } else o.path = this.route(o.spr, g);
    }

    /* Where an NPC wants to be in THIS map */
    goalPoint(n, place, initial) {
      const s = this.s;
      const h = U.hash(n.id + place.key + s.time.dayCount);
      if (place.seek && s.pos) return { x: this.player ? this.player.x : s.pos.x, y: this.player ? this.player.y + 30 : s.pos.y + 30 };
      if (this.outdoor) {
        if (place.fight && s.world.fight) { const L = C().LOCATIONS[s.world.fight.key]; return { x: L.door.x + (n.id === s.world.fight.a ? -14 : 14), y: L.door.y - 20 }; }
        if (place.patrol && C().patrols[place.patrol]) { const [x, y] = C().patrols[place.patrol][0]; return { x, y }; }
        const L = C().LOCATIONS[place.key];
        if (!L) return { x: 1200, y: 1030 };
        return { x: L.x + 30 + (h % Math.max(1, L.w - 60)), y: L.y + 30 + ((h >> 4) % Math.max(1, L.h - 60)) };
      }
      const spot = BH.Schedule.spotFor(s, n, this.mapId);
      if (spot) return { x: spot.x, y: spot.y };
      const seat = BH.Schedule.seatOf(s, n, this.mapId);
      return seat ? { x: seat.x, y: seat.y, seat: !!seat.obj } : this.cm.entry;
    }
    arrivalPoint(n) {
      if (!this.outdoor) return { x: this.cm.entry.x + U.randInt(-10, 10), y: this.cm.entry.y + this.cm.T * 0.5 };
      const o = this.npcs.get(n.id);
      const prev = (o && o.lastPlace) || null;
      const L = prev && C().LOCATIONS[prev.key];
      if (L && L.kind === 'b') return { x: L.door.x, y: L.door.y };
      // came from a building we don't know: pick the door of the building closest to their goal
      const g = this.goalPoint(n, BH.Schedule.where(this.s, n), false);
      const best = Object.values(C().LOCATIONS).filter((l) => l.kind === 'b').sort((a, b) => Math.hypot(a.door.x - g.x, a.door.y - g.y) - Math.hypot(b.door.x - g.x, b.door.y - g.y))[0];
      return best ? { x: best.door.x, y: best.door.y } : g;
    }
    exitPoint(place) {
      if (!this.outdoor) return { x: this.cm.entry.x, y: this.cm.entry.y + this.cm.T * 0.6 };
      if (!place.map) { const g = C().LOCATIONS.gate.door; return { x: g.x, y: g.y }; }
      const L = C().LOCATIONS[place.key] || C().LOCATIONS[place.map];
      return L ? { x: L.door.x, y: L.door.y } : { x: 1200, y: 1720 };
    }
    route(from, to) {
      const a = { x: from.x, y: from.y };
      if (this.outdoor) return Math.hypot(to.x - a.x, to.y - a.y) < 120 ? [to] : graphRoute(a, to);
      return BH.Content.gridPath(this.cm, a, to);
    }

    updateNpcs(dt, now) {
      const s = this.s;
      this.syncTimer -= dt;
      if (this.syncTimer <= 0) { this.syncTimer = 900; this.syncNpcs(false); }
      const targets = new Set();
      BH.Missions.live(s).forEach((m) => { if (m.status === 'offered') targets.add(m.vars.giver); else { const t = BH.Missions.target(s, m); if (t && t.npc) targets.add(t.npc); } });
      s.world.calls.forEach((c) => c.npc && targets.add(c.npc));
      const sleep = BH.Time.block(s).kind === 'sleep' && BH.Clock.isNight(s);
      const ffMul = Math.min(6, BH.Clock.ffRate(s) / 10 + 1);
      [...this.npcs.values()].forEach((o) => {
        const spr = o.spr;
        // callers come to find you
        if (o.seek && !o.leaving) {
          const d = Math.hypot(this.player.x - spr.x, this.player.y - spr.y);
          if (d > 70 && (!o.path.length || (o.reT = (o.reT || 0) - dt) <= 0)) { o.reT = 600; o.path = this.route(spr, { x: this.player.x, y: this.player.y + 26 }); }
          if (d <= 70) { o.path = []; if (!o.saidHi) { o.saidHi = true; this.say(o, U.pick(['"Hey! You! Come here!"', '"I dey find you since!"', '"Oya come, I wan talk to you."'])); } }
        }
        if (o.wait > 0) { o.wait -= dt / 1000; spr.body.setVelocity(0); }
        else if (o.path.length) {
          const p = o.path[0];
          const dx = p.x - spr.x, dy = p.y - spr.y, d = Math.hypot(dx, dy);
          if (d < 8) {
            o.path.shift();
            if (!o.path.length) {
              if (o.leaving) { this.destroyNpc(o); return; }
              if (o.patrolPts) { o.patrolIdx = (o.patrolIdx + 1) % o.patrolPts.length; o.wait = 0.5 + Math.random() * 1.5; o.path = this.route(spr, o.patrolPts[o.patrolIdx]); }
              else o.wait = o.seat ? 0 : 2 + Math.random() * 4;
            }
          } else {
            const sp = o.speed * (o.leaving || o.seek ? 1.25 : 1) * ffMul;
            spr.body.setVelocity((dx / d) * sp, (dy / d) * sp);
            o.facing = Math.atan2(dy, dx);
            spr.setTexture(`npc_${o.n.id}_${dy < -Math.abs(dx) * 0.6 ? 'b' : 'f'}`);
          }
        } else {
          spr.body.setVelocity(0);
          if (o.seat || (o.goal && !this.outdoor)) o.facing = o.n.type === 'teacher' || o.n.type === 'staff' ? Math.PI / 2 : o.facing;
          o.idle += dt / 1000;
          // outdoors people mill around; indoors they stay put
          if (this.outdoor && !o.seek && o.idle > 4 + Math.random() * 6 && o.goal) { o.idle = 0; o.path = [{ x: o.goal.x + U.randInt(-40, 40), y: o.goal.y + U.randInt(-30, 30) }]; }
          if (o.auth && !o.patrolPts && o.idle > 2.5) { o.idle = 0; o.facing += U.randInt(-1, 1) * 0.9; } // watchers look around
        }
        const moving = spr.body.speed > 5;
        spr.setAngle(moving ? Math.sin(now / 90 + o.speed) * 5 : 0);
        spr.setDepth(spr.y);
        spr.setAlpha(sleep && o.seat && !this.outdoor ? 0.8 : 1);
        o.tag.setPosition(spr.x, spr.y - 36);
        o.mark.setVisible(targets.has(o.n.id)).setPosition(spr.x, spr.y - 52 + Math.sin(now / 200) * 4);
        if (o.bubbleT > 0) { o.bubbleT -= dt; o.bubble.setPosition(spr.x, spr.y - (o.mark.visible ? 84 : 56)); if (o.bubbleT <= 0) o.bubble.setVisible(false); }
      });
    }
    say(o, text, ms = 3500) { o.bubble.setText(text).setVisible(true); o.bubbleT = ms; o.bubble.setPosition(o.spr.x, o.spr.y - 56); }

    /* ---------------- detection ---------------- */
    detect(dt) {
      const s = this.s;
      const v = BH.Rules.vision();
      this.ruleT -= dt;
      if (this.ruleT <= 0) { this.ruleT = 250; this.broken = BH.Rules.active(s); if (s.act && s.act.type === 'lesson') this.broken = this.broken.filter((r) => r !== 'sleepingInClass'); }
      const hidden = BH.Rules.hidden(s);
      const dark = this.outdoor && BH.Clock.isDark(s);
      const range = dark ? (BH.Inv.has(s, 'torch') ? v.nightRange + 40 : v.nightRange) : v.range;
      const half = (v.angle * Math.PI) / 180 / 2;
      const p = { x: this.player.x, y: this.player.y };
      let seer = null;
      this.cones.clear();
      const showCones = this.broken.length > 0 || dark;
      const nowAbs = BH.Clock.abs(s);
      this.npcs.forEach((o) => {
        if (!o.auth || o.leaving) return;
        const dx = p.x - o.spr.x, dy = p.y - o.spr.y, d = Math.hypot(dx, dy);
        if (d > range * 1.8) return;
        const inCone = d < range && angDiff(Math.atan2(dy, dx), o.facing) < half && !BH.MapRender.blocked(this.cm, o.spr, p);
        if (showCones && d < 700) {
          const isSeer = seer && seer.id === o.n.id;
          this.cones.fillStyle(inCone && this.broken.length ? 0xff3b30 : 0xffe066, inCone && this.broken.length ? 0.22 : 0.1);
          this.cones.slice(o.spr.x, o.spr.y, range, o.facing - half, o.facing + half, false);
          this.cones.fillPath();
          if (isSeer) this.cones.lineStyle(2, 0xff3b30, 0.6).strokePath();
        }
        if (!inCone || hidden) return;
        if (!this.spotted[o.n.id] || this.spotted[o.n.id] < nowAbs) {
          this.spotted[o.n.id] = nowAbs + 15;
          BH.bus.emit('spotted', { npc: o.n.id, role: o.n.role || o.n.type });
        }
        const rule = BH.Rules.caresAbout(s, o.auth.kind, this.broken);
        if (rule && (!seer || d < seer.dist)) seer = { id: o.n.id, dist: d, rule, strict: o.auth.strict, o };
      });
      const before = (s.world.sus && s.world.sus.level) || 0;
      const r = BH.Rules.watch(s, dt / 1000, seer);
      if (seer && before < 0.05 && s.world.sus.level > 0) this.say(seer.o, U.pick(['"Hmm? Who be that?"', '"Wait… you there!"', '"Ehen?"']), 1800);
      if (r === 'caught' && seer) this.say(seer.o, '"Ehen! I don catch you!"', 2500);
      // fellow students who see you stealing gossip about it
      const crime = s.world.crime;
      if (crime && crime.rule === 'stealing' && !crime.witnessed) {
        this.npcs.forEach((o) => {
          if (crime.witnessed || o.auth || !['classmate', 'junior', 'senior'].includes(o.n.type)) return;
          const d = Math.hypot(p.x - o.spr.x, p.y - o.spr.y);
          if (d < 150 && !BH.MapRender.blocked(this.cm, o.spr, p) && !hidden) {
            crime.witnessed = true;
            this.say(o, '"I see you o! 👀"');
            BH.Gist.add(s, `${o.n.first} see ${s.player.name.split(' ')[0]} dey thief 👀`, { about: 'me', valence: -0.5, tags: ['stealing'] });
            BH.NPC.rel(s, o.n, -4);
          }
        });
      }
    }

    /* ---------------- overhearing gist ---------------- */
    overhear(dt) {
      this.overhearT -= dt;
      if (this.overhearT > 0) return;
      this.overhearT = 1500;
      const idle = [...this.npcs.values()].filter((o) => !o.path.length && !o.leaving && !o.auth && ['classmate', 'senior', 'junior'].includes(o.n.type));
      for (let i = 0; i < idle.length; i++) {
        for (let j = i + 1; j < idle.length; j++) {
          const a = idle[i], b = idle[j];
          if (Math.hypot(a.spr.x - b.spr.x, a.spr.y - b.spr.y) > 90) continue;
          const mx = (a.spr.x + b.spr.x) / 2, my = (a.spr.y + b.spr.y) / 2;
          if (Math.hypot(this.player.x - mx, this.player.y - my) > 130) continue;
          const line = BH.Gist.overhear(this.s, a.n, b.n);
          if (line) { this.say(a, `🗣️ ${line}`, 5000); return; }
        }
      }
    }

    /* ---------------- player ---------------- */
    onTap(p, over) {
      if (BH.Panels.isOpen()) return;
      if (this.tappedNpc) { const id = this.tappedNpc; this.tappedNpc = null; return this.walkToNpc(id); }
      if (over && over.length) return;
      if (p.getDistance() > 20) return; // drag/swipe
      const wx = p.worldX, wy = p.worldY;
      this.follow = null;
      this.interruptRest();
      if (this.outdoor) {
        const hit = Object.entries(C().LOCATIONS).find(([, L]) => L.kind === 'b' && insideRect(wx, wy, L, 6));
        if (hit) return this.walkTo({ x: hit[1].door.x, y: hit[1].door.y });
      }
      const obj = this.cm.objects.find((o) => Math.hypot(o.x - wx, o.y - wy) < Math.max(30, (o.w || 40) / 2));
      if (obj && !this.outdoor) return this.walkTo({ x: obj.x, y: obj.y + this.cm.T * 0.8 });
      this.walkTo({ x: wx, y: wy });
    }
    walkTo(pt) { this.path = this.route(this.player, pt); this.stuck = 0; this.tapFx(pt); }
    walkToNpc(id) {
      const o = this.npcs.get(id);
      if (!o) return;
      if (Math.hypot(o.spr.x - this.player.x, o.spr.y - this.player.y) < 100) { BH.Dialogue.npc(id); return; }
      this.chasing = id;
      this.walkTo({ x: o.spr.x, y: o.spr.y + 20 });
    }
    tapFx(pt) {
      const c = this.add.circle(pt.x, pt.y, 6, 0xffffff, 0.9).setDepth(5);
      this.tweens.add({ targets: c, radius: 26, alpha: 0, duration: 450, onComplete: () => c.destroy() });
    }
    /* any movement wakes you / stands you up / stops waiting */
    interruptRest() {
      const s = this.s;
      if (s.world.ff) BH.Clock.stopWait(s, 'moved');
      if (s.act && ['lesson', 'prep', 'seat', 'hide', 'sleep', 'busy'].includes(s.act.type)) BH.Activities.stand(s, true);
    }

    movePlayer(dt, now) {
      const s = this.s;
      const k = this.keys, cur = this.cursors, joy = BH.HUD.joy || { x: 0, y: 0 };
      let vx = (k.A.isDown || cur.left.isDown ? -1 : 0) + (k.D.isDown || cur.right.isDown ? 1 : 0) + joy.x;
      let vy = (k.W.isDown || cur.up.isDown ? -1 : 0) + (k.S.isDown || cur.down.isDown ? 1 : 0) + joy.y;
      const input = Math.abs(vx) > 0.15 || Math.abs(vy) > 0.15;
      if (input) { this.path = []; this.chasing = null; this.follow = null; this.interruptRest(); }
      const frozen = s.act && ['sleep', 'busy', 'lesson', 'prep', 'seat'].includes(s.act.type);
      if (frozen) { this.player.setVelocity(0); this.player.setAngle(0); this.player.setDepth(this.player.y); return; }
      if (!input && this.follow) {
        const o = this.npcs.get(this.follow);
        if (!o) this.follow = null;
        else if (Math.hypot(o.spr.x - this.player.x, o.spr.y - this.player.y) > 70) { if (!this.path.length || (this.followT = (this.followT || 0) - dt) <= 0) { this.followT = 500; this.path = this.route(this.player, { x: o.spr.x, y: o.spr.y + 30 }); } }
        else this.path = [];
      }
      if (!input && this.path.length) {
        if (this.chasing) {
          const o = this.npcs.get(this.chasing);
          if (o) {
            this.path[this.path.length - 1] = { x: o.spr.x, y: o.spr.y + 20 };
            if (Math.hypot(o.spr.x - this.player.x, o.spr.y - this.player.y) < 90) { this.path = []; this.chasing = null; BH.Dialogue.npc(o.n.id); return; }
          }
        }
        const p = this.path[0];
        const dx = p.x - this.player.x, dy = p.y - this.player.y, d = Math.hypot(dx, dy);
        if (d < 10) this.path.shift(); else { vx = dx / d; vy = dy / d; }
        if (this.player.body.speed < 20 && (this.stuckT = (this.stuckT || 0) + dt) > 900) { this.stuckT = 0; this.path.shift(); }
      }
      const len = Math.hypot(vx, vy);
      if (len > 0.15) {
        const sp = PLAYER_SPEED * Math.min(1, len) * (BH.WorldSim.raining(s) && this.outdoor ? 0.85 : 1);
        this.player.setVelocity((vx / len) * sp, (vy / len) * sp);
        this.player.setTexture(vy < -Math.abs(vx) * 0.6 ? 'pl_b' : 'pl_f');
        this.player.setFlipX(vx < -0.2);
        this.player.setAngle(Math.sin(now / 80) * 6);
      } else { this.player.setVelocity(0); this.player.setAngle(0); }
      this.player.setDepth(this.player.y);
    }
    snap(pt) { this.player.setPosition(pt.x, pt.y); this.player.setVelocity(0); this.path = []; this.cameras.main.centerOn(pt.x, pt.y); }

    /* ---------------- where am I / doors ---------------- */
    updateArea() {
      const s = this.s;
      const x = this.player.x, y = this.player.y;
      if (this.outdoor) {
        let area = null;
        Object.entries(C().LOCATIONS).forEach(([key, L]) => { if (L.kind === 'o' && insideRect(x, y, L, key === 'backFence' ? 70 : 25)) area = key; });
        s.world.area = area;
        s.world.room = null;
        // building doors: walk into one to go inside
        let nearDoor = null;
        Object.entries(C().LOCATIONS).forEach(([key, L]) => { if (L.kind === 'b' && Math.hypot(L.door.x - x, L.door.y - y) < 26) nearDoor = key; });
        if (!nearDoor) this.armed = true;
        else if (this.armed && !BH.Panels.isOpen()) { this.armed = false; BH.SceneManager.enter(nearDoor); }
      } else {
        s.world.area = null;
        s.world.room = this.cm.rooms.find((r) => insideRect(x, y, r)) || null;
        const onExit = this.cm.exits.some((e) => insideRect(x, y, e, 6)) && y > this.cm.entry.y + 10;
        if (!onExit) this.armed = true;
        else if (this.armed && !BH.Panels.isOpen()) { this.armed = false; BH.SceneManager.exit(); }
      }
    }

    /* ---------------- interaction target (for the E-prompt) ---------------- */
    findTarget() {
      const s = this.s;
      if (s.act && ['lesson', 'prep', 'seat', 'hide', 'sleep'].includes(s.act.type)) return { type: 'self', x: this.player.x, y: this.player.y };
      const px = this.player.x, py = this.player.y;
      let best = null, bd = 1e9;
      const consider = (t, d) => { if (d < bd) { bd = d; best = t; } };
      // people you walk up to win, unless they're just sitting at their own desk/bed next to yours
      this.npcs.forEach((o) => { if (o.leaving) return; const d = Math.hypot(o.spr.x - px, o.spr.y - py); if (d < 78) consider({ type: 'npc', npc: o.n, x: o.spr.x, y: o.spr.y - 40 }, d + (!o.path.length && (o.seat || !this.outdoor) ? 18 : -12)); });
      this.cm.objects.forEach((o) => {
        const dx = Math.max(Math.abs(px - o.x) - (o.w || 0) / 2, 0), dy = Math.abs(py - o.y);
        const d = this.outdoor ? Math.hypot(o.x - px, o.y - py) : Math.hypot(dx, dy);
        const mine = ['myDesk', 'myBed', 'servingCounter', 'shopCounter', 'schoolPhone', 'chopBox'].includes(o.kind) ? 22 : 0;
        if (d < (this.outdoor ? o.r : this.cm.T * 1.05)) consider({ type: 'object', obj: o, x: o.x, y: o.y - (this.outdoor ? 30 : 26) }, d - mine);
      });
      if (this.outdoor) Object.entries(C().LOCATIONS).forEach(([key, L]) => { if (L.kind === 'b') { const d = Math.hypot(L.door.x - px, L.door.y - py); if (d < 80) consider({ type: 'door', key, x: L.door.x, y: L.door.y - 40 }, d + 10); } });
      return best;
    }

    /* ---------------- markers & waypoint ---------------- */
    updateMarkers(now) {
      const s = this.s;
      const e = BH.Activities.expected(s);
      const present = BH.Activities.present(s);
      let obj = null;
      if (e && !present) {
        if (this.outdoor) { const L = C().LOCATIONS[e.key]; if (L) obj = { x: L.door.x, y: L.door.y, top: L.kind === 'b' ? L.y - 36 : L.y - 30 }; }
        else obj = { x: this.cm.entry.x, y: this.cm.entry.y + this.cm.T * 0.5, top: this.cm.entry.y - 20, exit: true };
      } else if (e && present && !this.outdoor && !s.act) {
        const want = { class: ['myDesk', 'labBench'], prep: ['myDesk', 'desk'], meal: [s.today.flags.plate ? 'diningTable' : 'servingCounter'], sleep: ['myBed'] }[BH.Time.block(s).kind];
        const o = want && this.cm.objects.find((x) => want.includes(x.kind) && (x.kind !== 'diningTable' || x.house === s.player.house.tag || !x.house) && (x.kind !== 'myDesk' || BH.Interaction.mine(s, x)));
        if (o) obj = { x: o.x, y: o.y + 10, top: o.y - 26 };
      }
      this.objMarker.setVisible(!!obj); this.objRing.setVisible(!!obj);
      if (obj) { this.objMarker.setPosition(obj.x, obj.top + Math.sin(now / 180) * 8).setText(obj.exit ? '⬇' : '!'); this.objRing.setPosition(obj.x, obj.y).setScale(1 + Math.sin(now / 200) * 0.1); }
      // mission waypoint
      const wp = this.waypointPoint();
      this.wpMarker.setVisible(!!wp);
      if (wp) this.wpMarker.setPosition(wp.x, wp.y - 30 + Math.sin(now / 160) * 6);
      const target = wp || obj;
      const cam = this.cameras.main, v = cam.worldView;
      if (target && !(target.x > v.x && target.x < v.right && target.y > v.y && target.y < v.bottom)) {
        const cx = cam.width / 2, cy = cam.height / 2;
        const sx = (target.x - v.x) * cam.zoom, sy = (target.y - v.y) * cam.zoom;
        const ang = Math.atan2(sy - cy, sx - cx);
        const m = 60, r = Math.min((cam.width / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (cam.height / 2 - m * 1.6) / Math.abs(Math.sin(ang) || 1e-6));
        this.edgeArrow.setVisible(true).setPosition(cx + (Math.cos(ang) * r) / cam.zoom, cy + (Math.sin(ang) * r) / cam.zoom).setScale(1 / cam.zoom).setRotation(ang + Math.PI / 2).setFillStyle(wp ? 0x2ec4ff : 0xffd400);
      } else this.edgeArrow.setVisible(false);
      // target ring under what E would use
      const t = this.target;
      this.targetRing.setVisible(!!t && t.type !== 'self');
      if (t && t.type !== 'self') this.targetRing.setPosition(t.x, t.y + (t.type === 'npc' ? 58 : 34));
      // a sparkle over undiscovered secrets now and then
      const sec = (now % 6000) < 900 && this.cm.objects.find((o) => o.secret && !BH.Interaction.found(s, o) && Math.hypot(o.x - this.player.x, o.y - this.player.y) < 260);
      this.secretFx.setVisible(!!sec);
      if (sec) this.secretFx.setPosition(sec.x + 12, sec.y - 26 - ((now % 900) / 900) * 12);
    }
    waypointPoint() {
      const s = this.s;
      const id = BH.HUD.waypoint;
      if (!id) return null;
      const m = s.missions.find((x) => x.id === id);
      if (!m || !['active', 'offered'].includes(m.status)) { BH.HUD.waypoint = null; return null; }
      const t = m.status === 'offered' ? { npc: m.vars.giver, map: BH.Schedule.where(s, BH.NPC.get(s, m.vars.giver)).map } : BH.Missions.target(s, m);
      if (!t) return null;
      if (t.npc && this.npcs.get(t.npc)) { const o = this.npcs.get(t.npc); return { x: o.spr.x, y: o.spr.y - 40 }; }
      if (t.map === this.mapId) {
        if (t.obj) { const o = this.cm.objects.find((x) => x.id === t.obj); if (o) return { x: o.x, y: o.y }; }
        if (t.object) { const o = this.cm.objects.find((x) => x.secret === t.object); if (o) return { x: o.x, y: o.y }; }
        if (this.outdoor && t.key && C().LOCATIONS[t.key]) { const L = C().LOCATIONS[t.key]; return { x: L.door.x, y: L.door.y }; }
        return null;
      }
      if (!t.map) return null;
      if (this.outdoor) { const L = C().LOCATIONS[t.map] || C().LOCATIONS[t.key]; return L ? { x: L.door.x, y: L.door.y } : null; }
      return { x: this.cm.entry.x, y: this.cm.entry.y + this.cm.T * 0.5 };
    }

    /* ---------------- day / night ---------------- */
    makeNight() {
      const cam = this.cameras.main;
      this.night = this.add.renderTexture(0, 0, cam.width, cam.height).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.night);
      this.brush = this.make.image({ key: 'light', add: false });
    }
    renderNight() {
      const s = this.s;
      const m = BH.Clock.mod(s);
      let a = 0, colr = 0x0b1030;
      const power = BH.WorldSim.power(s);
      const lightsOut = BH.Time.block(s).kind === 'sleep' && (m >= 22 * 60 || m < 300);
      if (this.outdoor) {
        if (m < 300) a = 0.62; else if (m < 390) a = 0.62 * (1 - (m - 300) / 90);
        else if (m < 1080) a = 0; else if (m < 1170) { a = 0.5 * ((m - 1080) / 90); colr = 0x3a1c4a; } else a = 0.6;
        if (lightsOut) a = 0.78;
      } else {
        if (lightsOut && this.mapId !== 'sickbay') a = 0.72;
        else if (!power && BH.Clock.isDark(s)) a = 0.6;
        else if (BH.Clock.isDark(s)) a = 0.08;
      }
      if (s.world.ff && s.act && s.act.type === 'sleep') a = Math.max(a, 0.55);
      if (a < 0.02) { this.night.setVisible(false); return; }
      const cam = this.cameras.main, v = cam.worldView, z = cam.zoom;
      const vw = Math.ceil(cam.width / z), vh = Math.ceil(cam.height / z);
      if (this.night.width !== vw || this.night.height !== vh) this.night.resize(vw, vh);
      this.night.setPosition((cam.width - vw) / 2, (cam.height - vh) / 2);
      this.night.setVisible(true);
      this.night.clear();
      this.night.fill(colr, a);
      const light = (x, y, r) => {
        if (x < v.x - r || x > v.right + r || y < v.y - r || y > v.bottom + r) return;
        this.brush.setScale((r * 2) / 256);
        this.night.erase(this.brush, x - v.x, y - v.y);
      };
      if (this.outdoor) {
        if (power && !lightsOut) { C().LAMPS.forEach(([x, y]) => light(x, y - 20, 150)); Object.values(C().LOCATIONS).forEach((L) => { if (L.kind === 'b') light(L.door.x, L.door.y, 120); }); }
        else light(1240, 1680, 160); // the gate light runs on its own generator
      }
      light(this.player.x, this.player.y, BH.Inv.has(s, 'torch') ? 220 : 120);
    }

    /* ---------------- weather ---------------- */
    makeWeather() {
      const cam = this.cameras.main;
      this.tint = this.add.rectangle(0, 0, cam.width * 3, cam.height * 3, 0x000000, 0).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.weather);
      this.rain = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.weather + 1);
      this.drops = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.6 }));
    }
    renderWeather(dt) {
      const s = this.s;
      const cam = this.cameras.main;
      const kind = BH.WorldSim.weather(s);
      const def = BH.Content.get('world').weather.kinds[kind];
      const raining = BH.WorldSim.raining(s);
      this.tint.setPosition(cam.width / 2, cam.height / 2);
      if (this.outdoor && def && def.tint && (kind !== 'rain' || raining)) { const [r, g, b, al] = def.tint; this.tint.setFillStyle(Phaser.Display.Color.GetColor(r, g, b), al); }
      else this.tint.setFillStyle(0, 0);
      this.rain.clear();
      if (!this.outdoor || !raining) return;
      const w = cam.width / cam.zoom, h = cam.height / cam.zoom;
      this.rain.lineStyle(2, 0xbfd9ff, 0.55);
      this.drops.forEach((d) => {
        d.y += (dt / 1000) * 1.4 * d.s; d.x -= (dt / 1000) * 0.15;
        if (d.y > 1) { d.y = 0; d.x = Math.random(); }
        if (d.x < 0) d.x = 1;
        const x = (cam.width - w) / 2 + d.x * w, y = (cam.height - h) / 2 + d.y * h;
        this.rain.lineBetween(x, y, x - 4, y + 14);
      });
    }

    /* ---------------- minimap (campus) ---------------- */
    makeMinimap() {
      const cfg = C();
      this.minimap = this.cameras.add(0, 0, 110, 110).setZoom(0.06).setBackgroundColor(0x2d5e24).setName('mini');
      this.minimap.setBounds(0, 0, cfg.W, cfg.H);
      this.minimap.ignore([this.night, this.edgeArrow, this.cones, this.tint, this.rain, this.secretFx, this.targetRing]);
      this.children.list.forEach((o) => { if (o.type === 'Text') this.minimap.ignore(o); });
      this.miniDot = this.add.circle(0, 0, 40, 0xff3d00).setDepth(DEPTH.marker + 1);
      this.cameras.main.ignore(this.miniDot);
      this.placeMinimap();
    }
    placeMinimap() {
      const el = document.getElementById('minimap-frame');
      if (!el || !this.minimap) return;
      const r = el.getBoundingClientRect();
      const size = Math.round(r.width);
      if (!size) return;
      this.minimap.setViewport(Math.round(r.left), Math.round(r.top), size, size);
      this.minimap.setZoom(size / 1800);
      const mask = this.make.graphics({ add: false });
      mask.fillStyle(0xffffff); mask.fillCircle(r.left + size / 2, r.top + size / 2, size / 2);
      this.minimap.setMask(mask.createGeometryMask(), true);
    }

    applyZoom() {
      const cam = this.cameras.main;
      const base = Math.min(cam.width, cam.height);
      if (this.outdoor) cam.setZoom(Math.max(0.75, Math.min(1.35, base / 620)));
      else cam.setZoom(Math.max(0.72, Math.min(1.45, Math.min(cam.width / (this.cm.W + 80), cam.height / (this.cm.H + 200)), base / 560)));
    }
    onResize() {
      this.applyZoom();
      if (this.night) this.night.resize(this.cameras.main.width, this.cameras.main.height);
      setTimeout(() => this.placeMinimap(), 50);
    }

    /* ---------------- main loop ---------------- */
    update(now, dt) {
      const s = BH.Game.s;
      if (!s || s !== this.s || BH.SceneManager.busy) return;
      dt = Math.min(dt, 100);
      this.renderNight();
      this.renderWeather(dt);
      if (BH.Panels.isOpen() || document.hidden) {
        this.player.setVelocity(0); this.player.setAngle(0);
        this.npcs.forEach((o) => o.spr.body.setVelocity(0));
        BH.HUD.update();
        return;
      }
      BH.Clock.update(s, dt);
      if (s.gameOver) { BH.UI.go('gameover'); return; }
      if (s.world.moved || (s.world.map && s.world.map !== this.mapId)) { BH.SceneManager.load(s.world.map || 'campus', s.pos); return; }
      if (BH.Events.current(s)) { BH.Dialogue.event(); return; }
      this.movePlayer(dt, now);
      this.updateNpcs(dt, now);
      this.updateArea();
      if (BH.SceneManager.busy) return;
      this.player.setAlpha(BH.Rules.hidden(s) ? 0.35 : 1);
      this.detect(dt);
      this.overhear(dt);
      this.target = BH.Panels.isOpen() ? null : this.findTarget();
      this.updateMarkers(now);
      if (this.minimap) { this.minimap.centerOn(this.player.x, this.player.y); this.miniDot.setPosition(this.player.x, this.player.y); }
      s.pos = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
      BH.HUD.update();
    }
  }

  /* ---------- the API the rest of the game uses ---------- */
  BH.WorldScene = WorldScene;
  BH.World = {
    scene: null,
    start(parent) { if (BH.Engine3D && BH.Engine3D.wanted()) BH.Engine3D.start(parent); else BH.SceneManager.start(parent); },
    stop() { if (BH.Engine3D) BH.Engine3D.stop(); BH.SceneManager.stop(); },
    running() { return BH.SceneManager.running() || !!(BH.Engine3D && BH.Engine3D.running); },
    refreshPlayer() { const sc = BH.World.scene; if (sc) { BH.Sprites.texture(sc, 'pl', BH.Sprites.playerLook(sc.s)); sc.player.setTexture('pl_f'); } },
    snap(pt) { BH.World.scene && BH.World.scene.snap(pt); },
    escort(where) { BH.SceneManager.escort(where); },
    follow(id) { const sc = BH.World.scene; if (sc) sc.follow = id; },
    target() { return BH.World.scene ? BH.World.scene.target : null; },
    toScreen(x, y) {
      const sc = BH.World.scene;
      if (!sc) return null;
      const cam = sc.cameras.main, v = cam.worldView;
      const r = sc.game.canvas.getBoundingClientRect();
      return { x: r.left + (x - v.x) * cam.zoom, y: r.top + (y - v.y) * cam.zoom };
    },
    nearbyNpcs(r) {
      const sc = BH.World.scene;
      if (!sc) return [];
      return [...sc.npcs.values()].filter((o) => Math.hypot(o.spr.x - sc.player.x, o.spr.y - sc.player.y) < r).map((o) => o.n);
    },
    /* closest authority with a clear view of you (phone risk etc.) */
    watcherNear(r) {
      const sc = BH.World.scene;
      if (!sc) return null;
      let best = null;
      sc.npcs.forEach((o) => {
        if (!o.auth) return;
        const d = Math.hypot(o.spr.x - sc.player.x, o.spr.y - sc.player.y);
        if (d < r && !BH.MapRender.blocked(sc.cm, o.spr, sc.player) && (!best || d < best.dist)) best = { id: o.n.id, dist: d };
      });
      return best;
    },
    npcPos(id) { const sc = BH.World.scene; const o = sc && sc.npcs.get(id); return o ? { x: o.spr.x, y: o.spr.y } : null; },
    zone() { return null; },
    nearNpc() { return null; },
  };
})(window.BH);
