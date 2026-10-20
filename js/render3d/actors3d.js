/* Draws BH.Actors (read-only): characters, smoothed position/heading, blob shadows, name tags & speech
   bubbles (DOM, crisp on phones), objective / waypoint / target markers, and the guards' vision cones. */
(function (BH) {
  const D = BH.data;
  const E = () => BH.Engine3D;

  const Actors3D = {
    chars: new Map(),   // actor id → { ch, key, lod }
    frame: 0,

    reset() {
      Actors3D.chars.forEach((c) => { c.ch.group.removeFromParent(); c.ch.dispose(); });
      Actors3D.chars.clear();
      if (Actors3D.layer) Actors3D.layer.remove();
      Actors3D.layer = document.createElement('div');
      Actors3D.layer.className = 'tags3d';
      (document.getElementById('hud-root') || document.body).prepend(Actors3D.layer);
      Actors3D.tags = new Map();
      Actors3D.makeMarkers();
    },

    lookFor(a) {
      const s = BH.Game.s;
      if (a.kind === 'remote') {
        if (!a.look || !a.look.av) return null;
        return { key: 'r|' + JSON.stringify(a.look), look: { av: a.look.av, outfit: a.look.outfit || { kind: 'student', level: 1, gender: a.look.av.gender || 'm', style: 'uniform' } } };
      }
      if (a.kind === 'extra') return a.look ? { key: 'x|' + a.id, look: a.look } : null;
      if (a.kind === 'fb') return { key: 'fb|' + a.team + (a.kit || ''), look: { av: BH.data.defaultAvatar(a.gender || 'm', 'christian'), outfit: { kind: 'student', school: s.player.school, level: 4, gender: a.gender || 'm', style: 'house', house: a.kit || (a.team === 'red' ? '#c62828' : '#1565c0'), seed: a.id } } };
      if (a.kind === 'player') {
        const req = BH.Outfits.forPlayer(s);
        return { key: 'p|' + JSON.stringify(s.player.avatar) + req.style + req.level + req.prefect, look: { av: s.player.avatar || D.defaultAvatar(s.player.gender, s.player.religion), outfit: req } };
      }
      const n = BH.NPC.get(s, a.npcId);
      if (!n) return null;
      const req = BH.Outfits.forNpc(s, n);
      return { key: 'n|' + req.style + req.level + req.prefect, look: { av: BH.Sprites.npcLook(s, n).av, outfit: req } };
    },

    update(dt) {
      const s = BH.Game.s;
      const eng = E();
      const S = eng.S;
      Actors3D.frame++;
      const seen = new Set();
      const camPos = eng.camera.position;
      BH.Actors.list.forEach((a) => {
        if (a.map !== BH.Sim.mapId) return;
        seen.add(a.id);
        let c = Actors3D.chars.get(a.id);
        // (re)build when the outfit changes (night wear, Sunday white, house wear…) — checked every ~2 s
        if (!c || (Actors3D.frame + (c.salt || 0)) % 60 === 0) {
          const lf = Actors3D.lookFor(a);
          if (lf && (!c || c.key !== lf.key)) {
            const old = c;
            const ch = BH.Characters.create(lf.look);
            ch.group.traverse((o) => { if (o.isMesh) { o.castShadow = a.kind === 'player'; } });
            eng.mapRoot.add(ch.group);
            ch.group.position.set(a.x * S, 0, a.y * S);
            ch.group.rotation.y = Math.PI / 2 - a.h;
            c = { ch, key: lf.key, salt: (Math.random() * 60) | 0, x: a.x, y: a.y, h: a.h };
            if (old) { c.x = old.x; c.y = old.y; c.h = old.h; old.ch.group.removeFromParent(); old.ch.dispose(); }
            Actors3D.chars.set(a.id, c);
          }
        }
        if (!c) return;
        // smooth the 30 Hz sim into 60 fps rendering
        const k = 1 - Math.exp(-dt * 18);
        if (Math.hypot(a.x - c.x, a.y - c.y) > 120) { c.x = a.x; c.y = a.y; } else { c.x += (a.x - c.x) * k; c.y += (a.y - c.y) * k; }
        let dh = (a.h - c.h) % (Math.PI * 2); if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
        c.h += dh * (1 - Math.exp(-dt * 14));
        const g = c.ch.group;
        // sleepers lie on the mattress (not the floor), centred on the bed so head and feet stay on it
        const lift = a.seat || a.anim === 'sleep' ? Actors3D.seatHeight(a) : 0;
        const T = BH.Sim.cm.T, onBed = a.anim === 'sleep' && lift > 0.3;
        g.position.set((onBed ? (Math.floor(c.x / T) + 0.5) * T : c.x) * S, lift, (onBed ? (Math.floor(c.y / T) + 0.5) * T : c.y) * S);
        g.rotation.y = Math.PI / 2 - c.h;
        g.visible = !a.hidden;
        g.traverse((o) => { if (o.material && o.isMesh && !o.userData.bucket) { o.material.transparent = !!a.ghost; o.material.opacity = a.ghost ? 0.35 : 1; } });
        c.ch.setCarry(a.carry || null);
        // animation LOD: far characters update less often
        const dist = camPos.distanceTo(g.position);
        const every = dist > 45 ? 4 : dist > 25 ? 2 : 1;
        c.acc = (c.acc || 0) + dt;
        if (Actors3D.frame % every === 0) { c.ch.update(c.acc, (a.speed || 0) / 40, Actors3D.poseFor(a)); c.acc = 0; }
      });
      Actors3D.chars.forEach((c, id) => { if (!seen.has(id)) { c.ch.group.removeFromParent(); c.ch.dispose(); Actors3D.chars.delete(id); } });
      Actors3D.updateShadows();
      Actors3D.updateMarkers(dt);
      Actors3D.updateTags();
      void s;
    },
    poseFor(a) {
      const p = a.anim;
      return ['idle', 'walk', 'run'].includes(p) ? null : p;
    },
    seatHeight(a) {
      const cm = BH.Sim.cm;
      if (cm.outdoor) return 0;
      const d = cm.grid[Math.floor(a.y / cm.T)] && cm.grid[Math.floor(a.y / cm.T)][Math.floor(a.x / cm.T)];
      if (!d) return 0;
      if (a.anim === 'sleep') return ['bunk', 'myBed', 'sickBed'].includes(d.t) ? 0.48 : 0.05;
      return 0.02; // chairs/benches are implied by the sit pose (hips at seat height)
    },

    /* ---------- blob shadows for NPCs (one instanced draw call) ---------- */
    updateShadows() {
      const T = THREE;
      const eng = E();
      if (!Actors3D.blobs || Actors3D.blobs.parent !== eng.mapRoot) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const x = cv.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
        const geo = new T.PlaneGeometry(0.9, 0.9); geo.rotateX(-Math.PI / 2);
        Actors3D.blobs = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false }), 160);
        Actors3D.blobs.renderOrder = 1;
        eng.mapRoot.add(Actors3D.blobs);
      }
      const m = new T.Matrix4();
      let i = 0;
      Actors3D.chars.forEach((c, id) => {
        if (id === 'player' || !c.ch.group.visible || i >= 160) return;
        m.makeTranslation(c.ch.group.position.x, 0.06, c.ch.group.position.z);
        Actors3D.blobs.setMatrixAt(i++, m);
      });
      Actors3D.blobs.count = i;
      Actors3D.blobs.instanceMatrix.needsUpdate = true;
    },

    /* ---------- markers & cones ---------- */
    makeMarkers() {
      const T = THREE;
      const eng = E();
      const ring = (col) => { const r = new T.Mesh(new T.RingGeometry(0.55, 0.72, 28), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false })); r.rotation.x = -Math.PI / 2; return r; };
      const arrow = (col) => { const a = new T.Mesh(new T.ConeGeometry(0.28, 0.6, 4), new T.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.4 })); a.rotation.x = Math.PI; return a; };
      Actors3D.mk = {
        objRing: ring('#ffd400'), objArrow: arrow('#ffd400'), wpRing: ring('#2ec4ff'), wpArrow: arrow('#2ec4ff'),
        target: (() => { const r = new T.Mesh(new T.RingGeometry(0.42, 0.5, 24), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })); r.rotation.x = -Math.PI / 2; return r; })(),
        cones: [],
      };
      Object.values(Actors3D.mk).forEach((o) => { if (o.isObject3D) eng.scene.add(o); });
      if (Actors3D.edge) Actors3D.edge.remove();
      Actors3D.edge = document.createElement('div');
      Actors3D.edge.className = 'edge-arrow';
      Actors3D.layer.appendChild(Actors3D.edge);
    },
    updateMarkers() {
      const T = THREE;
      const eng = E();
      const S = eng.S;
      const mk = Actors3D.mk;
      const t = performance.now() / 1000;
      const M = BH.Sim.markers || {};
      // missing class: the objective goes red, bigger and faster
      const urgent = !!(M.objective && M.objective.urgent);
      if (mk.urgent !== urgent) {
        mk.urgent = urgent;
        const c = urgent ? '#ff2d2d' : '#ffd400';
        mk.objRing.material.color.set(c); mk.objArrow.material.color.set(c); mk.objArrow.material.emissive.set(c);
        mk.objArrow.scale.setScalar(urgent ? 1.7 : 1);
      }
      // only one floating arrow at a time (the edge arrow's goal); the other marker keeps just its ground ring,
      // and the arrow drops away once you're standing near it
      const goal = urgent ? M.objective : M.waypoint || M.objective;
      const pl = BH.Actors.player();
      const place = (ring, arrow, p) => {
        ring.visible = !!p;
        arrow.visible = !!p && p === goal && !(pl && Math.hypot(p.x - pl.x, p.y - pl.y) < 60);
        if (!p) return;
        const u = p.urgent ? 2.2 : 1;
        ring.position.set(p.x * S, 0.08, p.y * S); ring.scale.setScalar((p.urgent ? 1.5 : 1) + Math.sin(t * 4 * u) * 0.08 * u);
        arrow.position.set(p.x * S, (p.h || 2) + 0.6 * u + Math.sin(t * 3 * u) * 0.15 * u, p.y * S); arrow.rotation.y = t * 1.5 * u;
      };
      place(mk.objRing, mk.objArrow, M.objective);
      place(mk.wpRing, mk.wpArrow, M.waypoint);
      const tg = BH.Sim.target;
      mk.target.visible = !!tg && tg.type !== 'self';
      if (mk.target.visible) mk.target.position.set(tg.x * S, 0.09, tg.y * S);
      // vision cones (pooled)
      const cones = BH.Sim.cones || [];
      while (mk.cones.length < cones.length) {
        const m = new T.Mesh(new T.CircleGeometry(1, 20, 0, 1), new T.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        eng.scene.add(m); mk.cones.push(m);
      }
      mk.cones.forEach((m, i) => {
        const c = cones[i];
        m.visible = !!c;
        if (!c) return;
        if (m.userData.half !== c.half) { m.geometry.dispose(); m.geometry = new T.CircleGeometry(1, 20, -c.half, c.half * 2); m.userData.half = c.half; }
        m.position.set(c.x * S, 0.1, c.y * S);
        m.scale.setScalar(c.range * S);
        m.rotation.set(-Math.PI / 2, 0, -c.h);
        m.material.color.set(c.hot ? '#ff3b30' : '#ffe066');
        m.material.opacity = c.hot ? 0.28 : 0.14;
      });
      // off-screen arrow toward the waypoint/objective
      const el = Actors3D.edge;
      el.classList.toggle('urgent', urgent);
      if (goal) {
        const v = new T.Vector3(goal.x * S, 1, goal.y * S).project(eng.camera);
        const off = v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95;
        el.style.display = off ? 'block' : 'none';
        if (off) {
          let x = v.x, y = v.y; if (v.z > 1) { x = -x; y = -y; }
          const ang = Math.atan2(-y, x);
          const r = 0.82;
          const sx = (Math.cos(ang) * r * 0.5 + 0.5) * innerWidth, sy = (Math.sin(ang) * r * 0.5 + 0.5) * innerHeight;
          el.style.transform = `translate(${sx}px, ${sy}px) rotate(${ang + Math.PI / 2}rad)`;
          el.style.borderBottomColor = urgent ? '#ff2d2d' : M.waypoint ? '#2ec4ff' : '#ffd400';
        }
      } else el.style.display = 'none';
    },

    /* ---------- DOM tags: names near you, speech bubbles always ---------- */
    updateTags() {
      const s = BH.Game.s;
      const pl = BH.Actors.player();
      const used = new Set();
      const tg = BH.Sim.target;
      // only the nearest few names (+ the target) and a handful of bubbles, so crowds stay readable
      const cand = [];
      const now = performance.now();
      BH.Actors.list.forEach((a) => {
        if (a.hidden || a.map !== BH.Sim.mapId) return;
        if (a.bubble && a.bubble.until < now && a.kind !== 'npc') a.bubble = null;
        const d = pl ? Math.hypot(a.x - pl.x, a.y - pl.y) : 0;
        if (a.kind === 'player' || a.kind === 'extra') { if (a.bubble) cand.push({ a, d: a.kind === 'player' ? -1 : d, isTarget: false, me: true }); return; }
        // real players: always named (they're the people you came to play with)
        if (a.kind === 'remote' || a.kind === 'fb') { if (d < 900) cand.push({ a, d: d - 1000, isTarget: tg && tg.type === 'remote' && tg.pid === a.pid, real: true }); return; }
        if (a.kind !== 'npc') return;
        const isTarget = tg && tg.type === 'npc' && tg.npc && tg.npc.id === a.npcId;
        if (d < 260 || a.bubble || isTarget) cand.push({ a, d, isTarget });
      });
      cand.sort((p, q) => (q.isTarget - p.isTarget) || p.d - q.d);
      let names = 0, bubbles = 0;
      const small = document.body.classList.contains('compact');
      const maxNames = small ? 3 : 7, maxBubbles = small ? 2 : 4, near = small ? 170 : 260;
      cand.forEach(({ a, d, isTarget, me, real }) => {
        const showName = !me && (isTarget || real || (d < near && names < maxNames));
        const showBubble = a.bubble && (bubbles < maxBubbles || me || isTarget);
        if (!showName && !showBubble) return;
        if (showName) names++;
        if (showBubble) bubbles++;
        const c = Actors3D.chars.get(a.id);
        if (!c) return;
        const p = E().toScreen(c.x, c.y, (c.ch.P.leg + c.ch.P.torso + c.ch.P.headR * 2.4) * (['sit', 'eat', 'sleep_sit'].includes(a.anim) ? 0.7 : 1) + 0.25);
        if (!p) return;
        used.add(a.id);
        let el = Actors3D.tags.get(a.id);
        if (!el) { el = document.createElement('div'); el.className = 'tag3d'; Actors3D.layer.appendChild(el); Actors3D.tags.set(a.id, el); }
        let nameHtml = '';
        if (showName && a.kind === 'remote') {
          const fr = BH.Social && BH.Social.isFriend(a.pid), bf = BH.Social && BH.Social.isBestie(a.pid);
          nameHtml = `<span class="name3d player ${fr ? 'friend' : ''}" data-act="playerMenu" data-arg="${BH.U.esc(a.pid || '')}">${bf ? '💛 ' : fr ? '🤝 ' : ''}${a.gang ? `[${BH.U.esc(a.gang)}] ` : ''}${BH.U.esc(String(a.name || 'Player').split(' ')[0])}</span>`;
        } else if (showName && a.kind === 'fb') nameHtml = `<span class="name3d fb ${a.team}">${BH.U.esc(a.name || '')}</span>`;
        else if (showName) {
          const n = BH.NPC.get(s, a.npcId);
          const name = n ? (n.type === 'teacher' || n.type === 'staff' ? BH.NPC.name(n) : n.first) : '';
          const St = BH.Story, sq = St && s.story && s.story.squad;
          const pre = n && St ? `${St.isBestie(s, n.id) ? '💛 ' : ''}${sq && St.inSquad(s, n.id) ? `[${BH.U.esc(sq.tag)}] ` : ''}` : '';
          nameHtml = `<span class="name3d ${n ? n.type : ''} ${n && n.key ? 'key' : ''}">${pre}${BH.U.esc(name)}</span>`;
        }
        const html = `<div class="tagw">${showBubble ? `<div class="bubble3d ${a.bubble.player ? 'chat' : ''}">${BH.U.esc(a.bubble.text)}</div>` : ''}${nameHtml}</div>`;
        if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      });
      Actors3D.tags.forEach((el, id) => { if (!used.has(id)) { el.remove(); Actors3D.tags.delete(id); } });
    },
  };

  BH.Actors3D = Actors3D;
})(window.BH);
