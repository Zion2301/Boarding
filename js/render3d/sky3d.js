/* Day/night lighting and torchlights for the 3D client.
   · Sky: sun + sky light + background/fog follow the game clock — dawn 5:30–7:00, golden dusk 18:00–19:30, blue-black night.
     Indoors follows the room's lights: bright while there's power and it isn't lights out, dark otherwise (NEPA!).
   · Torches: a fixed pool of spot lights + visible beams (never added/removed at runtime, so no shader recompiles).
     At night they go to the nearest torch carriers: the night watchman (unless he's dozing), patrolling prefects and
     house masters, and you — if you own a torchlight. Beams sweep side to side like a real torch. */
(function (BH) {
  const POOL = 4;
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  const Sky3D = {
    build(E) {
      const T = THREE;
      const hemi = new T.HemisphereLight('#cfe9ff', '#7a5a3a', 1.1);
      const sun = new T.DirectionalLight('#fff3d6', 2.2);
      sun.position.set(40, 60, 20);
      sun.castShadow = true;
      sun.shadow.mapSize.set(E.mobile ? 1024 : 2048, E.mobile ? 1024 : 2048);
      const sc = sun.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.far = 120;
      sun.target.position.set(30, 0, 22);
      E.scene.add(hemi, sun, sun.target);
      E.scene.fog = new T.Fog('#9fd3f0', 90, 220);
      const torches = [];
      for (let i = 0; i < POOL; i++) {
        const light = new T.SpotLight('#fff1c4', 0, 22, 0.38, 0.55, 1.4);
        const beam = new T.Mesh(new T.ConeGeometry(1.6, 9, 16, 1, true), new T.MeshBasicMaterial({ color: '#fff4cc', transparent: true, opacity: 0.09, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false }));
        beam.geometry.translate(0, -4.5, 0); // tip at the torch, wide end out front
        beam.visible = false;
        E.scene.add(light, light.target, beam);
        torches.push({ light, beam, seed: i * 1.7 });
      }
      Object.assign(Sky3D, {
        hemi, sun, torches, indoors: false,
        cols: { skyDay: new T.Color('#9fd3f0'), skyDusk: new T.Color('#f0a35e'), skyNight: new T.Color('#0b1426'), tmp: new T.Color(),
          hemiDay: new T.Color('#cfe9ff'), hemiNight: new T.Color('#5a6f9f'), sunDay: new T.Color('#fff3d6'), sunDusk: new T.Color('#ffb070'), moon: new T.Color('#9db4e0') },
      });
    },
    setIndoors(on) { Sky3D.indoors = on; },

    /* 0 = night, 1 = full day; dusk = how golden-hour it is right now */
    daylight(m) {
      const day = m < 12 * 60 ? clamp01((m - 330) / 90) : clamp01((1170 - m) / 90);
      const dusk = m > 12 * 60 ? clamp01(1 - Math.abs(m - 1125) / 60) : clamp01(1 - Math.abs(m - 375) / 50) * 0.5;
      return { day, dusk };
    },

    update(E, dt) {
      const s = BH.Game.s;
      const pl = BH.Actors.player();
      if (!pl || !Sky3D.sun || !s) return;
      const x = pl.x * E.S, z = pl.y * E.S;
      Sky3D.sun.position.set(x + 20, 40, z + 12);
      Sky3D.sun.target.position.set(x, 0, z);
      Sky3D.light(E, s);
      Sky3D.updateTorches(E, s, dt);
    },

    light(E, s) {
      const C = Sky3D.cols, m = BH.Clock.mod(s);
      let { day, dusk } = Sky3D.daylight(m);
      if (Sky3D.indoors) {
        const lightsOut = (m >= BH.Clock.LIGHTS_OUT || m < 5 * 60) && BH.Time.block(s).kind === 'sleep';
        const power = !BH.WorldSim || BH.WorldSim.power(s);
        const bulbs = power && !lightsOut ? 1 : 0;
        day = Math.max(day, bulbs * 0.85); dusk = 0;
      }
      Sky3D.dark = day < 0.35;
      Sky3D.hemi.intensity = lerp(0.32, 1.1, day);
      Sky3D.hemi.color.copy(C.hemiNight).lerp(C.hemiDay, day);
      Sky3D.sun.intensity = lerp(0.35, 2.2, day) * (1 - dusk * 0.3);
      Sky3D.sun.color.copy(C.moon).lerp(C.sunDay, day).lerp(C.sunDusk, dusk);
      const bg = C.tmp.copy(C.skyNight).lerp(C.skyDay, day).lerp(C.skyDusk, dusk * 0.7);
      if (!Sky3D.indoors) { E.scene.background.copy(bg); E.scene.fog.color.copy(bg); E.scene.fog.near = lerp(30, 90, day); E.scene.fog.far = lerp(110, 220, day); }
      E.renderer.toneMappingExposure = lerp(0.85, 1.05, day);
    },

    /* who is holding a lit torch right now */
    carriers(s) {
      if (!Sky3D.dark) return [];
      const out = [];
      const pl = BH.Actors.player();
      BH.Actors.list.forEach((a) => {
        if (a.map !== BH.Sim.mapId || a.hidden || a.leaving) return;
        if (a.kind === 'player') { if (BH.Inv.has(s, 'torch')) out.push(a); return; }
        if (a.kind !== 'npc' || !a.auth) return;
        const watchman = a.npcId === 'sunday_nw';
        if (watchman && BH.Gate && BH.Gate.dozing(s)) return; // torch off, snoring
        if (watchman || a.patrolPts) out.push(a);
      });
      return out.sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y)).slice(0, POOL);
    },

    updateTorches(E, s) {
      const S = E.S, now = performance.now() / 1000;
      const list = Sky3D.carriers(s);
      Sky3D.torches.forEach((t, i) => {
        const a = list[i];
        t.beam.visible = !!a;
        t.light.intensity = a ? 2.4 : 0;
        if (!a) return;
        const c = BH.Actors3D.chars.get(a.id);
        const px = c ? c.x : a.x, py = c ? c.y : a.y, h = c ? c.h : a.h;
        const sweep = a.kind === 'player' ? 0 : Math.sin(now * 1.2 + t.seed) * 0.4; // guards sweep side to side
        const dir = h + sweep;
        const hx = px * S + Math.cos(dir) * 0.35, hz = py * S + Math.sin(dir) * 0.35;
        t.light.position.set(hx, 1.25, hz);
        t.light.target.position.set(px * S + Math.cos(dir) * 7, 0, py * S + Math.sin(dir) * 7);
        t.light.target.updateMatrixWorld();
        t.beam.position.set(hx, 1.25, hz);
        t.beam.lookAt(t.light.target.position);
        t.beam.rotateX(-Math.PI / 2); // the cone's axis is -Y after the translate; point it at the target
      });
    },
  };

  BH.Sky3D = Sky3D;
})(window.BH);
