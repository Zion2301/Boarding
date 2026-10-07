/* 3D avatar: a stylised low-poly student built from primitives (no model files → works offline).
   BH.Avatar3D.build(avatar, outfit) → THREE.Group with userData.limbs for walk animation.
   BH.Avatar3D.viewer(el, avatar, outfit) → drag-to-spin preview. All WebGL views are tracked
   and disposed whenever the UI re-renders (browsers only allow a few live WebGL contexts). */
(function (BH) {
  const D = BH.data;
  const live = new Set();
  let lastAngle = 0.5;

  const hasWebGL = () => {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; }
  };

  const find = (list, id) => list.find((x) => x.id === id) || list[0];

  /* outfit: { school, level (1-6), gender, house } */
  function outfitFor(s) {
    return { school: s.player.school, level: s.time.year, gender: s.player.gender, house: s.player.house.color };
  }

  function build(av, outfit) {
    const T = THREE;
    const A = D.AVATAR;
    const g = new T.Group();
    const mat = (hex) => new T.MeshToonMaterial({ color: new T.Color(hex) });
    const uni = D.UNIFORMS[outfit.school] || D.UNIFORMS.fgc;
    const skin = mat(find(A.skins, av.skin).hex);
    const hairM = mat(find(A.hairColors, av.hairColor).hex);
    const top = mat(uni.top), bottom = mat(uni.bottom), socks = mat(uni.socks), shoes = mat(uni.shoes);
    const tie = mat(outfit.house || '#c0392b');
    const dark = mat('#1a1a1a'), white = mat('#ffffff');
    const W = find(A.builds, av.build).w;
    const H = find(A.heights, av.height).h;
    const girl = outfit.gender === 'f';
    const juniorBoy = !girl && (outfit.level || 1) <= 3; // JSS boys wear shorts

    const add = (geo, m, x, y, z, parent = g) => { const mesh = new T.Mesh(geo, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
    const limbs = {};

    // ---- legs (pivot at hip so they can swing) ----
    ['L', 'R'].forEach((side, i) => {
      const x = (i ? 1 : -1) * 0.12 * W;
      const hip = new T.Group(); hip.position.set(x, 0.72, 0); g.add(hip);
      const thighMat = girl ? skin : bottom;
      add(new T.CylinderGeometry(0.1 * W, 0.09 * W, 0.34, 10), thighMat, 0, -0.17, 0, hip);
      add(new T.CylinderGeometry(0.085 * W, 0.08 * W, 0.3, 10), juniorBoy || girl ? skin : bottom, 0, -0.47, 0, hip);
      add(new T.CylinderGeometry(0.085 * W, 0.085 * W, 0.12, 10), socks, 0, -0.6, 0, hip);
      add(new T.BoxGeometry(0.17 * W, 0.08, 0.28), shoes, 0, -0.68, 0.05, hip);
      limbs['leg' + side] = hip;
    });
    // ---- lower body: skirt or shorts/trousers ----
    if (girl) add(new T.CylinderGeometry(0.24 * W, 0.36 * W, 0.4, 16), bottom, 0, 0.68, 0);
    else add(new T.CylinderGeometry(0.25 * W, 0.24 * W, 0.2, 14), bottom, 0, 0.78, 0);
    // ---- torso ----
    add(new T.CylinderGeometry(0.25 * W, 0.24 * W, 0.5, 16), top, 0, 1.08, 0);
    add(new T.SphereGeometry(0.25 * W, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), top, 0, 1.3, 0);
    // tie in house colour
    const tieMesh = add(new T.BoxGeometry(0.07, 0.3, 0.02), tie, 0, 1.12, 0.245 * W);
    tieMesh.rotation.x = -0.05;
    if (girl) { // pinafore straps
      add(new T.BoxGeometry(0.05, 0.42, 0.02), bottom, -0.12 * W, 1.08, 0.24 * W);
      add(new T.BoxGeometry(0.05, 0.42, 0.02), bottom, 0.12 * W, 1.08, 0.24 * W);
    }
    // ---- arms (pivot at shoulder) ----
    ['L', 'R'].forEach((side, i) => {
      const sgn = i ? 1 : -1;
      const sh = new T.Group(); sh.position.set(sgn * 0.31 * W, 1.28, 0); g.add(sh);
      add(new T.CylinderGeometry(0.085, 0.08, 0.2, 10), top, 0, -0.1, 0, sh);
      add(new T.CylinderGeometry(0.068, 0.062, 0.26, 10), skin, 0, -0.32, 0, sh);
      add(new T.SphereGeometry(0.075, 10, 8), skin, 0, -0.48, 0, sh);
      sh.rotation.z = sgn * 0.08;
      limbs['arm' + side] = sh;
    });
    // ---- neck & head ----
    add(new T.CylinderGeometry(0.08, 0.09, 0.12, 10), skin, 0, 1.4, 0);
    const head = new T.Group(); head.position.set(0, 1.66, 0); g.add(head);
    add(new T.SphereGeometry(0.3, 24, 18), skin, 0, 0, 0, head);
    [-1, 1].forEach((sgn) => {
      add(new T.SphereGeometry(0.06, 8, 6), skin, sgn * 0.29, -0.02, 0, head);           // ears
      add(new T.SphereGeometry(0.052, 10, 8), white, sgn * 0.1, 0.03, 0.255, head);      // eye white
      add(new T.SphereGeometry(0.032, 8, 6), dark, sgn * 0.1, 0.03, 0.295, head);        // pupil
      const brow = add(new T.BoxGeometry(0.09, 0.018, 0.02), hairM, sgn * 0.1, 0.11, 0.27, head);
      brow.rotation.z = sgn * -0.12;
    });
    const smile = add(new T.TorusGeometry(0.07, 0.014, 6, 14, Math.PI), dark, 0, -0.1, 0.27, head);
    smile.rotation.z = Math.PI;
    add(new T.SphereGeometry(0.035, 8, 6), skin, 0, -0.02, 0.3, head); // nose
    if (av.glasses) {
      [-1, 1].forEach((sgn) => add(new T.TorusGeometry(0.065, 0.012, 6, 16), dark, sgn * 0.1, 0.03, 0.3, head));
      add(new T.BoxGeometry(0.07, 0.012, 0.012), dark, 0, 0.04, 0.31, head);
    }
    hair(head, av.hair, hairM, add, T, girl);

    g.scale.set(1, H, 1);
    head.scale.set(1, 1 / H, 1); // keep the head round when height changes
    g.userData.limbs = limbs;
    g.userData.head = head;
    return g;
  }

  function hair(head, style, m, add, T) {
    const cap = (r, thetaLen) => add(new T.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, thetaLen), m, 0, 0.0, 0, head);
    switch (style) {
      case 'bald': break;
      case 'lowcut': cap(0.305, 1.25).position.y = 0.01; break;
      case 'fade': { const c = cap(0.31, 1.0); c.position.y = 0.04; break; }
      case 'waves': {
        cap(0.307, 1.3);
        for (let i = 0; i < 5; i++) { const t = add(new T.TorusGeometry(0.12 + i * 0.035, 0.008, 4, 24), m, 0, 0.29 - i * 0.025, 0, head); t.rotation.x = Math.PI / 2; }
        break;
      }
      case 'afro': { const a = add(new T.SphereGeometry(0.4, 18, 14), m, 0, 0.12, -0.06, head); a.scale.set(1, 0.85, 0.95); break; }
      case 'puff': cap(0.31, 1.3); add(new T.SphereGeometry(0.2, 16, 12), m, 0, 0.3, -0.18, head); break;
      case 'buns': cap(0.31, 1.3); [-1, 1].forEach((s) => add(new T.SphereGeometry(0.13, 14, 10), m, s * 0.2, 0.28, -0.05, head)); break;
      case 'cornrows': {
        cap(0.307, 1.4);
        for (let i = -3; i <= 3; i++) { const r = add(new T.TorusGeometry(0.31, 0.014, 4, 24, Math.PI), m, i * 0.05, 0.0, 0, head); r.rotation.y = Math.PI / 2; }
        break;
      }
      case 'braids': {
        cap(0.31, 1.45);
        for (let i = 0; i < 9; i++) {
          const ang = Math.PI * 0.55 + (i / 8) * Math.PI * 0.9;
          const b = add(new T.CylinderGeometry(0.025, 0.02, 0.62, 6), m, Math.cos(ang) * 0.27, -0.28, Math.sin(ang) * 0.27 - 0.02, head);
          b.rotation.x = 0.08;
        }
        break;
      }
      case 'hijab': {
        const h = add(new T.SphereGeometry(0.345, 24, 18, Math.PI * 0.62, Math.PI * 1.76, 0, Math.PI * 0.72), m, 0, 0.0, -0.01, head);
        h.rotation.y = Math.PI;
        const drape = add(new T.CylinderGeometry(0.3, 0.42, 0.42, 20, 1, true, Math.PI * 0.62, Math.PI * 1.76), m, 0, -0.38, -0.02, head);
        drape.rotation.y = Math.PI;
        break;
      }
      default: cap(0.305, 1.25);
    }
  }

  function animateWalk(group, t, speed) {
    const L = group.userData.limbs;
    if (!L) return;
    const a = speed > 0.01 ? Math.sin(t * 9) * 0.55 : 0;
    L.legL.rotation.x = a; L.legR.rotation.x = -a;
    L.armL.rotation.x = -a * 0.8; L.armR.rotation.x = a * 0.8;
  }

  /* Drag-to-spin preview */
  function viewer(el, av, outfit) {
    if (!el) return null;
    if (!hasWebGL()) { el.innerHTML = '<div class="avatar-fallback">🧑🏾‍🎓<small>3D no dey work for this browser</small></div>'; return null; }
    const T = THREE;
    const w = el.clientWidth || 280, h = el.clientHeight || 280;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    el.innerHTML = '';
    el.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(32, w / h, 0.1, 50);
    cam.position.set(0, 1.25, 4.6);
    cam.lookAt(0, 1.05, 0);
    scene.add(new T.HemisphereLight(0xffffff, 0x8a7a5a, 0.9));
    const sun = new T.DirectionalLight(0xffffff, 0.7); sun.position.set(2, 4, 3); scene.add(sun);
    const floor = new T.Mesh(new T.CircleGeometry(0.75, 32), new T.MeshToonMaterial({ color: 0x0f5c3f, transparent: true, opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    let model = build(av, outfit);
    scene.add(model);
    let angle = lastAngle, vel = 0, dragging = false, lastX = 0, raf = 0;
    const down = (e) => { dragging = true; lastX = (e.touches ? e.touches[0] : e).clientX; vel = 0; };
    const move = (e) => { if (!dragging) return; const x = (e.touches ? e.touches[0] : e).clientX; vel = (x - lastX) * 0.012; angle += vel; lastX = x; if (e.cancelable) e.preventDefault(); };
    const up = () => { dragging = false; };
    const c = renderer.domElement;
    c.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    c.addEventListener('touchstart', down, { passive: true }); c.addEventListener('touchmove', move, { passive: false }); c.addEventListener('touchend', up);
    const t0 = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dragging) { vel *= 0.94; angle += vel + (Math.abs(vel) < 0.002 ? 0.004 : 0); }
      lastAngle = angle;
      model.rotation.y = angle;
      model.position.y = Math.sin((performance.now() - t0) / 600) * 0.02;
      renderer.render(scene, cam);
    };
    loop();
    const v = {
      el,
      update(av2, outfit2) { scene.remove(model); dispose(model); model = build(av2, outfit2 || outfit); scene.add(model); },
      dispose() {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        dispose(scene); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss();
        live.delete(v);
      },
    };
    live.add(v);
    return v;
  }

  function dispose(obj) {
    obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  BH.Avatar3D = {
    build, viewer, animateWalk, outfitFor, hasWebGL, dispose,
    track(v) { live.add(v); },
    untrack(v) { live.delete(v); },
    disposeAll() { [...live].forEach((v) => v.dispose()); live.clear(); },
    /* dispose 3D views whose element is no longer on the page */
    sweep() { [...live].forEach((v) => { if (!v.el || !document.body.contains(v.el)) v.dispose(); }); },
  };
})(window.BH);
