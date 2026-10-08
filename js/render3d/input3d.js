/* Input for the 3D client → sim intents. Nothing here changes game state directly.
   Tap/click: on a character → walk up and talk · on the ground → walk there (path-finding) · on a building → walk to its door.
   WASD / arrows / joystick: move relative to the camera (Shift = run; a full joystick push runs).
   Space/Enter = main action · F = second action · Tab = radial menu · Q/E rotate · R/V tilt · wheel/pinch zoom. */
(function (BH) {
  const C = () => BH.data.CAMPUS;
  const keys = {};
  const isText = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

  const Input3D = {
    bind(E) {
      Input3D.E = E;
      E.rig.onTap = (x, y) => Input3D.tap(x, y);
      Input3D.kd = (e) => {
        if (isText(e)) return;
        const k = e.key.toLowerCase();
        keys[k] = true;
        if (BH.Panels.isOpen()) { if (k === ' ' || k === 'enter') { e.preventDefault(); BH.HUD.primary(0); } return; }
        if (k === ' ' || k === 'enter') { e.preventDefault(); BH.HUD.primary(0); }
        else if (k === 'f') BH.HUD.primary(1);
        else if (k === 'tab') { e.preventDefault(); BH.HUD.radial(); }
      };
      Input3D.ku = (e) => { keys[e.key.toLowerCase()] = false; };
      addEventListener('keydown', Input3D.kd);
      addEventListener('keyup', Input3D.ku);
    },
    unbind() { if (Input3D.kd) { removeEventListener('keydown', Input3D.kd); removeEventListener('keyup', Input3D.ku); } },

    /* per frame: keyboard + joystick → camera-relative move vector (map space) */
    update(E) {
      const fwd = { x: -Math.sin(E.rig.yaw), y: -Math.cos(E.rig.yaw) };
      const right = { x: -fwd.y, y: fwd.x };
      let f = 0, r = 0;
      if (!BH.Panels.isOpen()) {
        if (keys.w || keys.arrowup) f += 1;
        if (keys.s || keys.arrowdown) f -= 1;
        if (keys.d || keys.arrowright) r += 1;
        if (keys.a || keys.arrowleft) r -= 1;
        const j = BH.HUD.joy || { x: 0, y: 0 };
        r += j.x; f -= j.y;
      }
      const len = Math.hypot(f, r);
      const n = len > 1 ? 1 / len : 1;
      const j = BH.HUD.joy || { x: 0, y: 0 };
      BH.Sim.input = { dx: (fwd.x * f + right.x * r) * n, dy: (fwd.y * f + right.y * r) * n, run: !!keys.shift || Math.hypot(j.x, j.y) > 0.9 };
      if (len > 0.15 && E.rig.isFree()) E.rig.snapBack(); // moving brings the camera home
    },

    tap(cx, cy) {
      const E = Input3D.E;
      if (BH.Panels.isOpen()) return;
      const T = THREE;
      // 1) characters: nearest projected head within 44 px
      let best = null, bd = 44;
      BH.Actors.list.forEach((a) => {
        if (a.kind !== 'npc' || a.hidden) return;
        const p = E.toScreen(a.x, a.y, 1.1);
        if (!p) return;
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < bd) { bd = d; best = a; }
      });
      if (best) { BH.Sim.walkToNpc(best.npcId); return; }
      // 2) the ground
      const r = E.renderer.domElement.getBoundingClientRect();
      const ndc = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      const ray = new T.Raycaster();
      ray.setFromCamera(ndc, E.camera);
      const hit = new T.Vector3();
      if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), hit)) return;
      let pt = { x: hit.x / E.S, y: hit.z / E.S };
      if (BH.Sim.cm.outdoor) {
        const b = Object.values(C().LOCATIONS).find((L) => L.kind === 'b' && pt.x > L.x && pt.x < L.x + L.w && pt.y > L.y && pt.y < L.y + L.h);
        if (b) pt = { x: b.door.x, y: b.door.y };
      }
      pt = BH.Nav.nearestWalkable(BH.Nav.get(BH.Sim.mapId), pt);
      BH.Sim.walkTo(pt);
      Input3D.ripple(pt);
    },
    ripple(pt) {
      const E = Input3D.E, T = THREE;
      const m = new T.Mesh(new T.RingGeometry(0.15, 0.25, 20), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(pt.x * E.S, 0.08, pt.y * E.S);
      E.scene.add(m);
      const t0 = performance.now();
      const grow = () => {
        const k = (performance.now() - t0) / 450;
        if (k >= 1 || !E.renderer) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); return; }
        m.scale.setScalar(1 + k * 3); m.material.opacity = 0.9 * (1 - k);
        requestAnimationFrame(grow);
      };
      grow();
    },
  };

  BH.Input3D = Input3D;
})(window.BH);
