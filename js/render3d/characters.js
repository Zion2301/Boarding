/* Characters built from parts — body, head, skin tone, hair (incl. hijab), glasses and every clothing piece —
   merged into ONE rigid-skinned mesh per character (one draw call; vertex colours, no textures).
   Animations are keyframed AnimationClips on a 14-bone skeleton, blended by THREE.AnimationMixer:
   locomotion idle↔walk↔run is weighted by speed and time-scaled to the ground speed (no foot sliding);
   poses (sit, sleep, kneel, eat, talk, wave, dance, cheer, crouch, busy…) cross-fade in and out.
   Outfits come from BH.Outfits (js/render3d/outfits.js): uniforms by school/level/gender, house wear, etc. */
(function (BH) {
  const D = BH.data;
  const find = (list, id) => list.find((x) => x.id === id) || list[0];

  /* ---------- skeleton (metres, character faces +Z) ---------- */
  const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'uarmR', 'farmR', 'thighL', 'shinL', 'thighR', 'shinR'];
  function makeBones(P) {
    const T = THREE;
    const b = {};
    BONES.forEach((n) => { b[n] = new T.Bone(); b[n].name = n; });
    b.hips.position.set(0, P.leg, 0); b.root.add(b.hips);
    b.spine.position.set(0, 0.04, 0); b.hips.add(b.spine);
    b.chest.position.set(0, P.torso * 0.5, 0); b.spine.add(b.chest);
    b.neck.position.set(0, P.torso * 0.5, 0); b.chest.add(b.neck);
    b.head.position.set(0, 0.07, 0); b.neck.add(b.head);
    b.uarmL.position.set(P.shoulder, P.torso * 0.42, 0); b.chest.add(b.uarmL);
    b.uarmR.position.set(-P.shoulder, P.torso * 0.42, 0); b.chest.add(b.uarmR);
    b.farmL.position.set(0, -P.uarm, 0); b.uarmL.add(b.farmL);
    b.farmR.position.set(0, -P.uarm, 0); b.uarmR.add(b.farmR);
    b.thighL.position.set(P.hip, -0.02, 0); b.hips.add(b.thighL);
    b.thighR.position.set(-P.hip, -0.02, 0); b.hips.add(b.thighR);
    b.shinL.position.set(0, -P.thigh, 0); b.thighL.add(b.shinL);
    b.shinR.position.set(0, -P.thigh, 0); b.thighR.add(b.shinR);
    return b;
  }

  /* ---------- geometry helpers: each part is made in its bone's local space ---------- */
  function part(list, geo, bone, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const T = THREE;
    const g = geo.index ? geo.toNonIndexed() : geo;
    const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    list.push({ g, bone, color: new T.Color(color) });
  }
  const cyl = (r1, r2, h, seg = 7) => new THREE.CylinderGeometry(r1, r2, h, seg, 1);
  const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  /* ---------- the body plan ---------- */
  function proportions(look) {
    const A = D.AVATAR;
    const W = find(A.builds, look.av.build).w;
    const H = find(A.heights, look.av.height).h;
    const age = look.outfit.kind === 'adult' ? 1.08 : 0.86 + Math.min(6, look.outfit.level || 1) * 0.025; // JSS1 → SS3 grow taller
    const k = H * age;
    return { k, W, leg: 0.8 * k, thigh: 0.4 * k, shin: 0.38 * k, torso: 0.5 * k, uarm: 0.27 * k, farm: 0.25 * k, shoulder: 0.19 * k * W, hip: 0.085 * k * W, headR: 0.135 * k, girth: W };
  }

  function buildParts(look, P) {
    const av = look.av, o = BH.Outfits.resolve(look.outfit);
    const A = D.AVATAR;
    const skin = find(A.skins, av.skin).hex;
    const hair = find(A.hairColors, av.hairColor).hex;
    const L = [];
    const W = P.girth;
    // --- head & face
    part(L, sph(P.headR, 10, 8), 'head', skin, 0, P.headR * 0.95, 0, 0, 0, 0, 0.95, 1.05, 1);
    part(L, sph(P.headR * 0.18, 5, 4), 'head', skin, P.headR * 0.95, P.headR * 0.9, 0); // ears
    part(L, sph(P.headR * 0.18, 5, 4), 'head', skin, -P.headR * 0.95, P.headR * 0.9, 0);
    part(L, sph(P.headR * 0.13, 5, 4), 'head', '#1a1a1a', P.headR * 0.36, P.headR * 1.05, P.headR * 0.84); // eyes
    part(L, sph(P.headR * 0.13, 5, 4), 'head', '#1a1a1a', -P.headR * 0.36, P.headR * 1.05, P.headR * 0.84);
    part(L, box(P.headR * 0.5, P.headR * 0.07, 0.01), 'head', '#5a2a1a', 0, P.headR * 0.62, P.headR * 0.9); // mouth
    if (av.glasses) { [1, -1].forEach((sg) => part(L, new THREE.TorusGeometry(P.headR * 0.22, P.headR * 0.04, 4, 10), 'head', '#111111', sg * P.headR * 0.36, P.headR * 1.05, P.headR * 0.92)); part(L, box(P.headR * 0.3, P.headR * 0.04, 0.01), 'head', '#111111', 0, P.headR * 1.07, P.headR * 0.95); }
    hairParts(L, av.hair, hair, P, o);
    part(L, cyl(P.headR * 0.42, P.headR * 0.48, 0.1), 'neck', o.hijab ? o.hijab : skin, 0, 0.03, 0);
    // --- torso (shirt / gown) with tie or pinafore
    const tw = 0.34 * W * P.k, td = 0.2 * P.k;
    part(L, box(tw, P.torso * 0.55, td), 'chest', o.top, 0, P.torso * 0.22, 0);
    part(L, box(tw * 0.92, P.torso * 0.5, td * 0.92), 'spine', o.top, 0, P.torso * 0.25, 0);
    part(L, cyl(tw * 0.62, tw * 0.62, 0.05, 8), 'chest', o.top, 0, P.torso * 0.5, 0, 0, 0, 0, 1, 1, 0.65); // shoulders
    if (o.tie) part(L, box(0.035 * P.k, P.torso * 0.6, 0.01), 'chest', o.tie, 0, P.torso * 0.12, td / 2 + 0.006);
    if (o.collar) part(L, box(tw * 0.5, 0.03, td * 0.7), 'chest', o.collar, 0, P.torso * 0.48, 0.02);
    if (o.pinafore) { part(L, box(tw * 1.02, P.torso * 0.62, td * 1.06), 'spine', o.pinafore, 0, P.torso * 0.3, 0); [1, -1].forEach((sg) => part(L, box(0.04, P.torso * 0.5, td * 1.08), 'chest', o.pinafore, sg * tw * 0.3, P.torso * 0.3, 0)); }
    if (o.badge) part(L, sph(0.03 * P.k, 6, 4), 'chest', o.badge, tw * 0.28, P.torso * 0.36, td / 2 + 0.01);
    if (o.wrapper) part(L, cyl(tw * 0.62, tw * 0.66, 0.08, 9), 'spine', o.wrapper, 0, P.torso * 0.05, 0); // waist band / iro
    // --- arms: sleeves short or long, skin below
    ['L', 'R'].forEach((side) => {
      const sg = side === 'L' ? 1 : -1;
      const sleeve = o.sleeves === 'long' ? P.uarm : o.sleeves === 'none' ? 0 : P.uarm * 0.55;
      if (sleeve) part(L, cyl(0.055 * P.k * W, 0.05 * P.k * W, sleeve), 'uarm' + side, o.top, 0, -sleeve / 2, 0);
      if (P.uarm - sleeve > 0.01) part(L, cyl(0.04 * P.k, 0.036 * P.k, P.uarm - sleeve), 'uarm' + side, skin, 0, -sleeve - (P.uarm - sleeve) / 2, 0);
      part(L, cyl(0.036 * P.k, 0.032 * P.k, P.farm), 'farm' + side, o.sleeves === 'long' ? o.top : skin, 0, -P.farm / 2, 0);
      part(L, sph(0.045 * P.k, 6, 5), 'farm' + side, skin, 0, -P.farm - 0.02, 0.005);
      void sg;
    });
    // --- legs: shorts / trousers / skirt / gown, socks and shoes
    const bottom = o.bottom;
    ['L', 'R'].forEach((side) => {
      const shortLen = bottom === 'shorts' ? P.thigh * 0.55 : 0;
      if (bottom === 'trousers') { part(L, cyl(0.07 * P.k * W, 0.058 * P.k, P.thigh), 'thigh' + side, o.bottomColor, 0, -P.thigh / 2, 0); part(L, cyl(0.056 * P.k, 0.05 * P.k, P.shin * 0.92), 'shin' + side, o.bottomColor, 0, -P.shin * 0.46, 0); }
      else {
        if (shortLen) part(L, cyl(0.075 * P.k * W, 0.07 * P.k * W, shortLen), 'thigh' + side, o.bottomColor, 0, -shortLen / 2, 0);
        part(L, cyl(0.055 * P.k, 0.048 * P.k, P.thigh - shortLen), 'thigh' + side, skin, 0, -shortLen - (P.thigh - shortLen) / 2, 0);
        const sockH = o.longSocks ? P.shin * 0.75 : P.shin * 0.3;
        part(L, cyl(0.046 * P.k, 0.04 * P.k, P.shin - sockH), 'shin' + side, skin, 0, -(P.shin - sockH) / 2, 0);
        part(L, cyl(0.047 * P.k, 0.042 * P.k, sockH), 'shin' + side, o.socks, 0, -(P.shin - sockH) - sockH / 2, 0);
      }
      part(L, box(0.09 * P.k, 0.06 * P.k, 0.19 * P.k), 'shin' + side, o.shoes, 0, -P.shin - 0.01, 0.03);
    });
    if (bottom === 'shorts' || bottom === 'trousers') part(L, box(0.33 * W * P.k, 0.1 * P.k, 0.2 * P.k), 'hips', o.bottomColor, 0, 0, 0);
    if (bottom === 'skirt' || bottom === 'gown') {
      const len = bottom === 'gown' ? P.leg * 0.92 : o.skirtLen || P.thigh * 1.15;
      part(L, cyl(0.17 * W * P.k, (bottom === 'gown' ? 0.27 : 0.23) * W * P.k, len, 10), 'hips', o.bottomColor, 0, 0.06 - len / 2, 0);
    }
    return L;
  }

  function hairParts(L, style, hair, P, o) {
    const r = P.headR;
    const cap = (s = 1.06, cut = 0.55) => part(L, new THREE.SphereGeometry(r * s, 10, 6, 0, Math.PI * 2, 0, Math.PI * cut), 'head', hair, 0, r * 0.98, -r * 0.03);
    switch (style) {
      case 'bald': break;
      case 'lowcut': case 'fade': case 'waves': cap(1.03, 0.5); break;
      case 'afro': part(L, sph(r * 1.35, 10, 8), 'head', hair, 0, r * 1.3, -r * 0.12); break;
      case 'puff': cap(1.05, 0.5); part(L, sph(r * 0.55, 8, 6), 'head', hair, 0, r * 2.05, -r * 0.2); break;
      case 'buns': cap(1.05, 0.5); [1, -1].forEach((sg) => part(L, sph(r * 0.38, 7, 5), 'head', hair, sg * r * 0.7, r * 1.8, -r * 0.1)); break;
      case 'cornrows': cap(1.06, 0.55); for (let i = -2; i <= 2; i++) part(L, box(r * 0.08, r * 0.1, r * 1.9), 'head', hair, i * r * 0.28, r * 1.75 - Math.abs(i) * r * 0.12, -r * 0.1); break;
      case 'braids': cap(1.07, 0.6); for (let i = 0; i < 7; i++) { const a = -1.3 + i * 0.43; part(L, cyl(r * 0.07, r * 0.06, r * 1.8, 4), 'head', hair, Math.sin(a) * r * 0.95, r * 0.25, -Math.cos(a) * r * 0.8 - r * 0.1); } break;
      case 'hijab': {
        const c = o.hijab || '#263238';
        part(L, sph(r * 1.12, 10, 8), 'head', c, 0, r * 1.0, -r * 0.08, 0, 0, 0, 1, 1.05, 1);
        part(L, new THREE.ConeGeometry(r * 1.55, r * 1.6, 10, 1, true), 'neck', c, 0, -r * 0.35, -r * 0.05);
        break;
      }
      default: cap();
    }
  }

  /* ---------- assemble one skinned mesh ---------- */
  function build(look) {
    const T = THREE;
    const P = proportions(look);
    const bones = makeBones(P);
    const list = [bones.root];
    BONES.slice(1).forEach((n) => list.push(bones[n]));
    const idx = Object.fromEntries(BONES.map((n, i) => [n, i]));
    bones.root.updateMatrixWorld(true);
    const parts = buildParts(look, P);
    const geos = parts.map(({ g, bone, color }) => {
      g.applyMatrix4(bones[bone].matrixWorld);
      const n = g.attributes.position.count;
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { si[i * 4] = idx[bone]; sw[i * 4] = 1; col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
      g.setAttribute('skinIndex', new T.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new T.BufferAttribute(sw, 4));
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      ['uv', 'uv1', 'uv2'].forEach((a) => g.deleteAttribute(a));
      return g;
    });
    const geo = T.BufferGeometryUtils.mergeGeometries(geos, false);
    geo.computeVertexNormals();
    const mesh = new T.SkinnedMesh(geo, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.add(bones.root);
    mesh.bind(new T.Skeleton(list));
    mesh.frustumCulled = false;
    const group = new T.Group();
    group.add(mesh);
    group.userData = { bones, P, mesh };
    return group;
  }

  /* ---------- animation clips (keyframes per joint, Euler radians) ---------- */
  const rad = (d) => (d * Math.PI) / 180;
  function clip(name, dur, keys, opts = {}) {
    const T = THREE;
    const tracks = [];
    const joints = new Set();
    keys.forEach((k) => Object.keys(k.j).forEach((j) => joints.add(j)));
    joints.forEach((j) => {
      const times = [], vals = [];
      keys.forEach((k) => {
        const e = k.j[j] || [0, 0, 0];
        const q = new T.Quaternion().setFromEuler(new T.Euler(rad(e[0]), rad(e[1] || 0), rad(e[2] || 0)));
        times.push(k.t * dur); vals.push(q.x, q.y, q.z, q.w);
      });
      tracks.push(new T.QuaternionKeyframeTrack(`${j}.quaternion`, times, vals));
    });
    if (keys.some((k) => k.y !== undefined)) tracks.push(new T.NumberKeyframeTrack('hips.position[y]', keys.map((k) => k.t * dur), keys.map((k) => (k.y === undefined ? 0 : k.y))));
    const c = new T.AnimationClip(name, dur, tracks);
    c.userData = opts;
    return c;
  }
  const ARMS = { uarmL: [0, 0, 6], uarmR: [0, 0, -6] };
  function clips(P) {
    const leg = P.leg;
    const Y = (dy) => leg + dy;
    const walk = (swing, knee, arm, bob) => [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const ph = Math.sin(t * Math.PI * 2), ph2 = Math.cos(t * Math.PI * 2);
      return { t, y: Y(-Math.abs(ph2) * bob), j: {
        thighL: [-ph * swing], thighR: [ph * swing], shinL: [Math.max(0, ph2) * knee], shinR: [Math.max(0, -ph2) * knee],
        uarmL: [ph * arm, 0, 6], uarmR: [-ph * arm, 0, -6], farmL: [-15], farmR: [-15], spine: [4], hips: [0, ph * 5, 0],
      } };
    });
    const loop = (frames) => frames.concat([Object.assign({}, frames[0], { t: 1 })]);
    return {
      idle: clip('idle', 3, [0, 0.5, 1].map((t) => ({ t, y: Y(-0.006 * Math.sin(t * Math.PI)), j: Object.assign({ chest: [Math.sin(t * Math.PI) * 2], head: [0, Math.sin(t * Math.PI * 2) * 6, 0] }, ARMS) }))),
      walk: clip('walk', 1.0, walk(26, 32, 22, 0.035), { stride: 1.25 * P.k }),
      run: clip('run', 0.66, walk(42, 70, 40, 0.07).map((k) => Object.assign(k, { j: Object.assign(k.j, { spine: [12], farmL: [-70], farmR: [-70] }) })), { stride: 2.3 * P.k }),
      sit: clip('sit', 2, [0, 1].map((t) => ({ t, y: Y(-P.thigh * 0.95 - 0.02), j: { thighL: [-88], thighR: [-88], shinL: [88], shinR: [88], uarmL: [-30, 0, 5], uarmR: [-30, 0, -5], farmL: [-50], farmR: [-50], spine: [3] } }))),
      sleep_sit: clip('sleep_sit', 3, [0, 0.5, 1].map((t) => ({ t, y: Y(-P.thigh * 0.95 - 0.02), j: { thighL: [-88], thighR: [-88], shinL: [88], shinR: [88], spine: [28 + Math.sin(t * Math.PI) * 3], neck: [30], head: [20], uarmL: [-70, 0, 20], uarmR: [-70, 0, -20], farmL: [-80], farmR: [-80] } }))),
      sleep: clip('sleep', 4, [0, 0.5, 1].map((t) => ({ t, y: Y(-leg + 0.12), j: { hips: [-90, 0, 0], chest: [Math.sin(t * Math.PI) * 3], uarmL: [0, 0, 12], uarmR: [0, 0, -12], thighL: [4], thighR: [6], shinL: [6], shinR: [3] } }))),
      kneel: clip('kneel', 2, [0, 0.5, 1].map((t) => ({ t, y: Y(-P.shin - 0.02 + Math.sin(t * Math.PI) * 0.01), j: { thighL: [0], thighR: [0], shinL: [90], shinR: [90], uarmL: [-180 + Math.sin(t * Math.PI) * 4, 0, 10], uarmR: [-180 - Math.sin(t * Math.PI) * 4, 0, -10], spine: [2] } }))),
      crouch: clip('crouch', 2, [0, 1].map((t) => ({ t, y: Y(-P.thigh * 0.7), j: { thighL: [-80], thighR: [-80], shinL: [120], shinR: [120], spine: [30], uarmL: [-40, 0, 10], uarmR: [-40, 0, -10], farmL: [-60], farmR: [-60] } }))),
      eat: clip('eat', 1.4, [0, 0.35, 0.6, 1].map((t, i) => ({ t, y: Y(-P.thigh * 0.95 - 0.02), j: { thighL: [-88], thighR: [-88], shinL: [88], shinR: [88], uarmL: [-30, 0, 5], farmL: [-50], uarmR: [i === 1 || i === 2 ? -60 : -30, 0, -10], farmR: [i === 1 || i === 2 ? -125 : -50], head: [i === 2 ? 8 : 0] } }))),
      talk: clip('talk', 1.6, [0, 0.25, 0.5, 0.75, 1].map((t, i) => ({ t, y: Y(0), j: { uarmL: [-20 - (i % 2) * 25, 0, 14], farmL: [-50 - (i % 2) * 30], uarmR: [-10 - ((i + 1) % 2) * 20, 0, -12], farmR: [-40], head: [((i % 2) * 2 - 1) * 4, (i - 2) * 4, 0] } }))),
      wave: clip('wave', 1.0, [0, 0.25, 0.5, 0.75, 1].map((t, i) => ({ t, y: Y(0), j: Object.assign({ uarmR: [-165, 0, (i % 2 ? -20 : 20) - 10], farmR: [-25], head: [0, -8, 0] }, { uarmL: [0, 0, 6] }) }))),
      dance: clip('dance', 0.9, [0, 0.25, 0.5, 0.75, 1].map((t, i) => ({ t, y: Y(-((i % 2) ? 0.07 : 0)), j: { hips: [0, (i % 2 ? 15 : -15), (i % 2 ? 5 : -5)], uarmL: [i % 2 ? -150 : -40, 0, 20], uarmR: [i % 2 ? -40 : -150, 0, -20], farmL: [-40], farmR: [-40], thighL: [i % 2 ? -25 : 0], thighR: [i % 2 ? 0 : -25], shinL: [i % 2 ? 35 : 0], shinR: [i % 2 ? 0 : 35] } }))),
      cheer: clip('cheer', 0.8, [0, 0.5, 1].map((t, i) => ({ t, y: Y(i === 1 ? 0.12 : 0), j: { uarmL: [-170, 0, 25], uarmR: [-170, 0, -25], farmL: [i === 1 ? -10 : -40], farmR: [i === 1 ? -10 : -40], thighL: [i === 1 ? -10 : 0], thighR: [i === 1 ? -10 : 0] } }))),
      busy: clip('busy', 1.2, [0, 0.5, 1].map((t, i) => ({ t, y: Y(-0.05), j: { spine: [25], uarmL: [-55 - (i === 1 ? 15 : 0), 0, 10], uarmR: [-55 - (i === 1 ? 0 : 15), 0, -10], farmL: [-40], farmR: [-40], thighL: [-15], thighR: [-15], shinL: [20], shinR: [20] } }))),
    };
  }

  /* ---------- a live character: mesh + mixer + blending ---------- */
  const LOCO = ['idle', 'walk', 'run'];
  function create(look) {
    const group = build(look);
    const { P, mesh } = group.userData;
    const mixer = new THREE.AnimationMixer(mesh);
    const set = clips(P);
    const actions = {};
    Object.entries(set).forEach(([n, c]) => { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(n === 'idle' ? 1 : 0); actions[n] = a; });
    const weights = Object.fromEntries(Object.keys(set).map((n) => [n, n === 'idle' ? 1 : 0]));
    const ch = {
      group, mixer, actions, weights, look, P, pose: null, carry: null,
      /* speedMs: ground speed in m/s; pose: null or a clip name */
      update(dt, speedMs, pose) {
        const goal = {};
        Object.keys(weights).forEach((n) => { goal[n] = 0; });
        if (pose && actions[pose]) goal[pose] = 1;
        else {
          // locomotion blend by speed
          const w = Math.min(1, speedMs / 0.6), r = Math.max(0, Math.min(1, (speedMs - 2.8) / 1.0));
          goal.idle = 1 - w; goal.walk = w * (1 - r); goal.run = w * r;
          const ws = set.walk.userData.stride, rs = set.run.userData.stride;
          actions.walk.timeScale = Math.max(0.5, speedMs / (ws / set.walk.duration));
          actions.run.timeScale = Math.max(0.6, speedMs / (rs / set.run.duration));
          // keep walk & run feet in phase so the blend never scissors
          if (goal.run > 0 && goal.walk > 0) actions.run.time = (actions.walk.time / set.walk.duration) * set.run.duration;
        }
        const k = 1 - Math.exp(-dt * (pose ? 7 : 12));
        Object.keys(weights).forEach((n) => { weights[n] += (goal[n] - weights[n]) * k; actions[n].setEffectiveWeight(weights[n]); });
        mixer.update(dt);
        // procedural layer: carrying a bucket on the right arm
        const b = group.userData.bones;
        if (ch.carry === 'bucket' && !pose) { b.uarmR.rotation.set(-0.05, 0, -0.32); b.farmR.rotation.set(-0.15, 0, 0); }
        // chop box on the head, steadied with both hands
        if (ch.carry === 'box' && !pose) { b.uarmR.rotation.set(0, 0, 2.7); b.uarmL.rotation.set(0, 0, -2.7); b.farmR.rotation.set(0, 0, 0.5); b.farmL.rotation.set(0, 0, -0.5); }
        if (ch.carryMesh) ch.carryMesh.visible = ch.carry === 'bucket' && !pose;
        if (ch.boxMesh) ch.boxMesh.visible = ch.carry === 'box' && !pose;
      },
      setCarry(kind) {
        ch.carry = kind;
        if (kind === 'box' && !ch.boxMesh) {
          const T = THREE;
          const bx = new T.Mesh(new T.BoxGeometry(0.62, 0.34, 0.42), new T.MeshLambertMaterial({ color: '#8b5a2b' }));
          bx.position.set(0, P.headR * 2.2 + 0.17, 0);
          group.userData.bones.head.add(bx);
          ch.boxMesh = bx;
        }
        if (kind === 'bucket' && !ch.carryMesh) {
          const T = THREE;
          const bk = new T.Mesh(new T.CylinderGeometry(0.13, 0.1, 0.22, 8, 1, true), new T.MeshLambertMaterial({ color: '#1e88e5', side: T.DoubleSide }));
          bk.position.set(0, -P.farm - 0.16, 0.02);
          group.userData.bones.farmR.add(bk);
          ch.carryMesh = bk;
        }
      },
      dispose() { mesh.geometry.dispose(); mesh.material.dispose(); [ch.carryMesh, ch.boxMesh].forEach((m) => { if (m) { m.geometry.dispose(); m.material.dispose(); } }); },
    };
    return ch;
  }

  BH.Characters = { create, build, clips, BONES, LOCO };
})(window.BH);
