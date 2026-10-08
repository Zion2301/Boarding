/* Engine3D — the Three.js renderer, frame loop and map container for the 3D client.
   Render-only: it runs the headless sim (BH.Sim) and draws its state; it never owns game rules.
   Units: 1 metre = 40 map pixels. Map (x, y) px → world (x/40, h, y/40).
   Engine selection: ?engine=2d forces the old Phaser renderer, ?engine=3d the new one. */
(function (BH) {
  const S = 1 / 40;
  const params = new URLSearchParams(location.search);
  const isMobile = () => (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad/i.test(navigator.userAgent);

  const Engine = {
    S,
    DEFAULT_3D: true, // the 3D client is the default; ?engine=2d keeps the old Phaser map during the migration
    debug: params.get('debug') === '1',
    renderer: null, scene: null, camera: null, rig: null, mapRoot: null, raf: 0, running: false,

    wanted() {
      const e = params.get('engine');
      if (e === '2d') return false;
      if (e === '3d') return true;
      return !!(Engine.DEFAULT_3D && window.THREE && window.Pathfinding);
    },
    toWorld(x, y, h = 0) { return new THREE.Vector3(x * S, h, y * S); },
    /* map px (+ height in metres) → screen px (or null when behind the camera) */
    toScreen(x, y, h = 1.6) {
      if (!Engine.renderer) return null;
      const v = new THREE.Vector3(x * S, h, y * S).project(Engine.camera);
      if (v.z > 1) return null;
      const r = Engine.renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
    },

    start(parent) {
      Engine.stop();
      const T = THREE;
      const mobile = isMobile();
      const renderer = new T.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      renderer.setSize(parent.clientWidth || innerWidth, parent.clientHeight || innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      parent.appendChild(renderer.domElement);
      renderer.domElement.classList.add('world3d');
      const scene = new T.Scene();
      scene.background = new T.Color('#9fd3f0');
      const camera = new T.PerspectiveCamera(48, (parent.clientWidth || innerWidth) / (parent.clientHeight || innerHeight), 0.1, 400);
      Object.assign(Engine, { renderer, scene, camera, parent, mobile, running: true });
      Engine.rig = BH.CameraRig.create(camera, renderer.domElement);
      // the 3D world takes over the World/SceneManager facades the game systems use
      Engine.prev = { World: BH.World, SceneManager: BH.SceneManager };
      BH.World = BH.World3D; BH.SceneManager = BH.SceneManager3D;
      Engine.makeFade();
      (BH.Sky3D && BH.Sky3D.build(Engine));
      Engine.showMap((BH.Game.s.world && BH.Game.s.world.map) || 'campus', true);
      BH.Input3D.bind(Engine);
      Engine.onResize = () => {
        const w = parent.clientWidth || innerWidth, h = parent.clientHeight || innerHeight;
        renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      };
      addEventListener('resize', Engine.onResize);
      document.body.classList.add('engine3d');
      if (Engine.debug) Engine.makeStats();
      Engine.last = performance.now();
      const loop = (now) => { if (!Engine.running) return; Engine.raf = requestAnimationFrame(loop); Engine.frame(now); };
      Engine.raf = requestAnimationFrame(loop);
      if (BH.Net && !BH.Net.online) BH.Net.connect();
      return Engine;
    },

    /* build (or rebuild) the map the player is in */
    showMap(mapId, first) {
      const T = THREE;
      if (Engine.mapRoot) { Engine.mapRoot.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); Engine.mapRoot.removeFromParent(); }
      Engine.mapRoot = new T.Group();
      Engine.scene.add(Engine.mapRoot);
      if (first) BH.Sim.load(mapId, BH.Game.s.pos);
      const cm = BH.Content.compile(mapId);
      Engine.indoors = !cm.outdoor;
      if (cm.outdoor) BH.Campus3D.build(Engine); else BH.Interior3D.build(Engine, cm);
      if (!cm.outdoor) BH.Interior3D.walls = BH.Interior3D.walls || [];
      if (cm.outdoor) BH.Interior3D.walls = [];
      BH.Actors3D.reset();
      const pl = BH.Actors.player();
      Engine.rig.followTarget = () => { const p = BH.Actors.player(); return p ? new T.Vector3(p.x * S, 1.0, p.y * S) : null; };
      Engine.rig.jumpTo(new T.Vector3(pl.x * S, 1, pl.y * S));
      Engine.rig.mode = 'follow';
      if (!cm.outdoor) { Engine.rig.distGoal = Math.min(Engine.rig.distGoal, 13); Engine.rig.pitchGoal = Math.max(Engine.rig.pitchGoal, 0.85); }
      if (BH.Sky3D && BH.Sky3D.setIndoors) BH.Sky3D.setIndoors(!cm.outdoor, cm);
      BH.HUD.setMap(cm.outdoor, cm);
      // a brand-new student: resumption-day cutscene at the gate
      const s = BH.Game.s;
      if (cm.outdoor && BH.Onboarding && BH.Onboarding.step(s) === 'cutscene' && BH.Cutscene) BH.Cutscene.play(Engine);
    },
    refreshPlayer() { BH.Actors3D.reset(); },

    /* fade to black for map changes (CSS overlay over the canvas) */
    makeFade() {
      let el = document.getElementById('fade3d');
      if (!el) { el = document.createElement('div'); el.id = 'fade3d'; Engine.parent.appendChild(el); }
      Engine.fadeEl = el;
    },
    fade(on, cb) {
      const el = Engine.fadeEl;
      el.classList.toggle('on', on);
      if (cb) setTimeout(cb, 220);
    },

    frame(now) {
      const dt = Math.min(0.1, Math.max(0, (now - Engine.last) / 1000));
      Engine.last = now;
      const s = BH.Game.s;
      if (!s) return;
      if (!BH.SceneManager3D.busy) BH.Sim.update(dt * 1000);
      if (!Engine.running) return;
      if (BH.Net) BH.Net.update(dt);
      if (BH.Games) BH.Games.update(dt);
      if (BH.Cutscene) BH.Cutscene.update(dt);
      BH.Actors3D.update(dt);
      if (Engine.indoors) BH.Interior3D.update(Engine, dt);
      if (BH.Sky3D && BH.Sky3D.update) BH.Sky3D.update(Engine, dt);
      if (BH.Ambient3D) BH.Ambient3D.update(Engine, dt);
      BH.Input3D.update(Engine, dt);
      Engine.rig.update(dt);
      Engine.renderer.render(Engine.scene, Engine.camera);
      if (Engine.stats) Engine.tickStats(dt);
      BH.HUD.update();
    },

    stop() {
      if (!Engine.renderer) return;
      Engine.running = false;
      cancelAnimationFrame(Engine.raf);
      removeEventListener('resize', Engine.onResize);
      BH.Input3D.unbind();
      Engine.rig && Engine.rig.dispose();
      Engine.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); });
      Engine.renderer.dispose();
      Engine.renderer.domElement.remove();
      if (Engine.fadeEl) Engine.fadeEl.remove();
      if (BH.Actors3D.layer) BH.Actors3D.layer.remove();
      Engine.renderer = null;
      if (Engine.prev) { BH.World = Engine.prev.World; BH.SceneManager = Engine.prev.SceneManager; Engine.prev = null; }
      document.body.classList.remove('engine3d');
      if (Engine.stats) { Engine.stats.remove(); Engine.stats = null; }
    },

    makeStats() { const el = document.createElement('div'); el.className = 'debug-stats'; document.body.appendChild(el); Engine.stats = el; Engine.fpsAcc = 0; Engine.fpsN = 0; },
    tickStats(dt) {
      Engine.fpsAcc += dt; Engine.fpsN++;
      if (Engine.fpsAcc < 0.5) return;
      const info = Engine.renderer.info.render;
      Engine.stats.textContent = `${Math.round(Engine.fpsN / Engine.fpsAcc)} fps · ${info.calls} calls · ${Math.round(info.triangles / 1000)}k tris · ${BH.Actors.list.size} actors`;
      Engine.fpsAcc = 0; Engine.fpsN = 0;
    },
  };

  BH.Engine3D = Engine;
})(window.BH);
