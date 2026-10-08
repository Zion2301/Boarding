/* Sims-style camera rig.
   Desktop: right-drag (or Shift+drag) = rotate & tilt · left/middle-drag = pan · wheel = zoom · Q/E rotate · R/V (PgUp/PgDn) tilt · +/- zoom
   Touch:   one-finger drag = rotate & tilt · pinch = zoom · two-finger twist = rotate · two-finger drag = pan
   A short tap/click (no drag) is reported to rig.onTap(clientX, clientY) — used for tap-to-walk / tap-to-interact.
   Panning detaches the camera from the player; rig.snapBack() returns it. Everything is damped.
   Collision: the camera is pulled in front of anything in rig.colliders (Box3 list) between it and the focus point. */
(function (BH) {
  const LIMITS = { minDist: 2.6, maxDist: 95, minPitch: 0.16, maxPitch: 1.48 };

  function create(camera, dom) {
    const T = THREE;
    const rig = {
      camera, dom,
      focus: new T.Vector3(30, 1, 22), focusGoal: new T.Vector3(30, 1, 22),
      yaw: 0.6, yawGoal: 0.6, pitch: 0.72, pitchGoal: 0.72, dist: 16, distGoal: 16,
      mode: 'follow', followTarget: null, colliders: [], onTap: null, keys: {},
      bounds: { minX: -5, maxX: 65, minZ: -5, maxZ: 50 },
    };
    const ptrs = new Map();
    let gesture = null;

    const ray = new T.Ray();
    const tmp = new T.Vector3();

    /* ---------- input ---------- */
    const panBy = (dx, dy) => {
      const k = rig.dist * 0.0016;
      const fwd = new T.Vector3(-Math.sin(rig.yaw), 0, -Math.cos(rig.yaw));
      const right = new T.Vector3(Math.cos(rig.yaw), 0, -Math.sin(rig.yaw));
      rig.focusGoal.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
      rig.mode = 'free';
      rig.clampFocus();
    };
    const orbitBy = (dx, dy) => { rig.yawGoal -= dx * 0.008; rig.pitchGoal = Math.max(LIMITS.minPitch, Math.min(LIMITS.maxPitch, rig.pitchGoal + dy * 0.006)); };
    rig.zoomBy = (f) => { rig.distGoal = Math.max(LIMITS.minDist, Math.min(LIMITS.maxDist, rig.distGoal * f)); };

    const onDown = (e) => {
      dom.setPointerCapture && dom.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, shift: e.shiftKey, type: e.pointerType });
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        gesture = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      }
    };
    const onMove = (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 7) p.dragged = true;
      if (!p.dragged) return;
      if (ptrs.size >= 2 && gesture) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        if (gesture.d > 0) rig.zoomBy(gesture.d / d);
        let da = ang - gesture.ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
        rig.yawGoal += da;
        panBy(cx - gesture.cx, cy - gesture.cy);
        Object.assign(gesture, { d, ang, cx, cy });
        return;
      }
      const touch = p.type === 'touch' || p.type === 'pen';
      if (touch || p.button === 2 || p.shift) orbitBy(dx, dy);
      else panBy(dx, dy);
    };
    const onUp = (e) => {
      const p = ptrs.get(e.pointerId);
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) gesture = null;
      if (p && !p.dragged && p.button !== 2 && performance.now() - p.t < 450 && ptrs.size === 0 && rig.onTap) rig.onTap(e.clientX, e.clientY);
    };
    const onWheel = (e) => { e.preventDefault(); rig.zoomBy(Math.exp(e.deltaY * 0.0012)); };
    const onKey = (e, down) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      rig.keys[e.key.toLowerCase()] = down;
    };
    const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
    const noMenu = (e) => e.preventDefault();
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', noMenu);
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    dom.style.touchAction = 'none';

    /* ---------- API ---------- */
    rig.snapBack = () => { rig.mode = 'follow'; };
    rig.isFree = () => rig.mode === 'free';
    rig.clampFocus = () => {
      const b = rig.bounds;
      rig.focusGoal.x = Math.max(b.minX, Math.min(b.maxX, rig.focusGoal.x));
      rig.focusGoal.z = Math.max(b.minZ, Math.min(b.maxZ, rig.focusGoal.z));
    };
    rig.jumpTo = (v) => { rig.focus.copy(v); rig.focusGoal.copy(v); };
    rig.dispose = () => {
      dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointermove', onMove); dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp); dom.removeEventListener('wheel', onWheel); dom.removeEventListener('contextmenu', noMenu);
      removeEventListener('keydown', kd); removeEventListener('keyup', ku);
    };

    rig.update = (dt) => {
      const k = rig.keys;
      if (k.q) rig.yawGoal += dt * 1.8;
      if (k.e) rig.yawGoal -= dt * 1.8;
      if (k.pageup || k.r) rig.pitchGoal = Math.min(LIMITS.maxPitch, rig.pitchGoal + dt * 0.9);
      if (k.pagedown || k.v) rig.pitchGoal = Math.max(LIMITS.minPitch, rig.pitchGoal - dt * 0.9);
      if (k['+'] || k['=']) rig.zoomBy(Math.exp(-dt * 1.5));
      if (k['-'] || k._) rig.zoomBy(Math.exp(dt * 1.5));
      if (rig.mode === 'follow' && rig.followTarget) { const t = rig.followTarget(); if (t) rig.focusGoal.set(t.x, t.y, t.z); }
      const damp = (rate) => 1 - Math.exp(-dt * rate);
      rig.focus.lerp(rig.focusGoal, damp(rig.mode === 'follow' ? 7 : 10));
      rig.yaw += (rig.yawGoal - rig.yaw) * damp(10);
      rig.pitch += (rig.pitchGoal - rig.pitch) * damp(10);
      rig.dist += (rig.distGoal - rig.dist) * damp(8);
      // position on a sphere around the focus
      const cp = Math.cos(rig.pitch);
      const dir = tmp.set(Math.sin(rig.yaw) * cp, Math.sin(rig.pitch), Math.cos(rig.yaw) * cp).normalize();
      let d = rig.dist;
      // collision: pull in front of buildings between the focus and the camera
      if (rig.colliders.length && d > 3) {
        ray.set(rig.focus, dir);
        const hit = new T.Vector3();
        for (const box of rig.colliders) {
          if (box.containsPoint(rig.focus)) continue; // indoors: cutaway handles walls
          if (ray.intersectBox(box, hit)) { const t = hit.distanceTo(rig.focus); if (t < d) d = Math.max(2.2, t - 0.4); }
        }
      }
      camera.position.copy(rig.focus).addScaledVector(dir, d);
      if (camera.position.y < 0.5) camera.position.y = 0.5;
      camera.lookAt(rig.focus);
    };
    return rig;
  }

  BH.CameraRig = { create, LIMITS };
})(window.BH);
