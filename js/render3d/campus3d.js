/* Outdoor campus in 3D, built from content/maps/campus.json (+ campus3d.json decor in step 3).
   Step 1: ground, red-earth paths, open areas, building volumes with roofs, fence, simple trees, camera colliders. */
(function (BH) {
  const C = () => BH.data.CAMPUS;

  const Campus3D = {
    colliders: [],

    build(E) {
      const T = THREE;
      const S = E.S;
      const cfg = C();
      const W = cfg.W * S, H = cfg.H * S;
      const root = new T.Group();
      root.name = 'campus';
      E.mapRoot.add(root);
      Campus3D.root = root;
      Campus3D.colliders = [];
      const lam = (c, extra) => new T.MeshLambertMaterial(Object.assign({ color: new T.Color(c) }, extra || {}));

      // ground: big grass plane with gentle colour variation (vertex colours, no textures)
      const g = new T.PlaneGeometry(W + 40, H + 40, 64, 48);
      g.rotateX(-Math.PI / 2);
      g.translate(W / 2, 0, H / 2);
      const col = [];
      const pos = g.attributes.position;
      const c1 = new T.Color('#6aa84f'), c2 = new T.Color('#7cb85a'), c3 = new T.Color('#5d9a45');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const n = (Math.sin(x * 0.35) + Math.cos(z * 0.41) + Math.sin((x + z) * 0.13)) / 3;
        const c = c1.clone().lerp(n > 0 ? c2 : c3, Math.abs(n));
        col.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      const ground = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true }));
      ground.receiveShadow = true;
      ground.name = 'ground';
      root.add(ground);
      Campus3D.ground = ground;

      // red-earth (laterite) paths
      const pathMat = lam('#b5683c');
      const edgeMat = lam('#9a5530');
      cfg.ROADS.forEach(([x, y, w, h]) => {
        const edge = new T.Mesh(new T.BoxGeometry((w + 8) * S, 0.03, (h + 8) * S), edgeMat);
        edge.position.set((x + w / 2) * S, 0.015, (y + h / 2) * S);
        const p = new T.Mesh(new T.BoxGeometry(w * S, 0.05, h * S), pathMat);
        p.position.set((x + w / 2) * S, 0.03, (y + h / 2) * S);
        p.receiveShadow = edge.receiveShadow = true;
        root.add(edge, p);
      });

      // open areas
      Object.entries(cfg.LOCATIONS).forEach(([key, L]) => {
        const cx = (L.x + L.w / 2) * S, cz = (L.y + L.h / 2) * S, w = L.w * S, d = L.h * S;
        if (L.kind === 'b') return Campus3D.building(root, key, L, S);
        if (key === 'field') {
          const f = new T.Mesh(new T.BoxGeometry(w, 0.04, d), lam('#4f9a3a')); f.position.set(cx, 0.02, cz); f.receiveShadow = true; root.add(f);
          const line = lam('#ffffff');
          const mk = (lw, ld, x, z) => { const m = new T.Mesh(new T.BoxGeometry(lw, 0.05, ld), line); m.position.set(x, 0.045, z); root.add(m); };
          mk(w - 0.5, 0.08, cx, cz - d / 2 + 0.25); mk(w - 0.5, 0.08, cx, cz + d / 2 - 0.25);
          mk(0.08, d - 0.5, cx - w / 2 + 0.25, cz); mk(0.08, d - 0.5, cx + w / 2 - 0.25, cz); mk(0.08, d - 0.5, cx, cz);
        } else if (key === 'assembly') {
          const a = new T.Mesh(new T.BoxGeometry(w, 0.06, d), lam('#cfcabd')); a.position.set(cx, 0.03, cz); a.receiveShadow = true; root.add(a);
        } else if (key === 'tap') {
          const a = new T.Mesh(new T.BoxGeometry(w, 0.08, d), lam('#a7b4ba')); a.position.set(cx, 0.04, cz); root.add(a);
        } else if (key === 'gate') {
          [-1, 1].forEach((sg) => { const p = new T.Mesh(new T.BoxGeometry(0.6, 3, 0.6), lam('#8d6e63')); p.position.set(cx + sg * (w / 2 + 0.3), 1.5, cz); p.castShadow = true; root.add(p); });
        }
      });

      // perimeter fence (thin wall) — instanced posts
      const fenceMat = lam('#a1887f');
      const G = cfg.LOCATIONS.gate, g1 = (G.x + 10) * S, g2 = (G.x + G.w - 10) * S; // opening at the school gate
      [[W / 2, 0.1, W, 0.15], [g1 / 2, H - 0.1, g1, 0.15], [(g2 + W) / 2, H - 0.1, W - g2, 0.15], [0.1, H / 2, 0.15, H], [W - 0.1, H / 2, 0.15, H]].forEach(([x, z, w, d]) => {
        const f = new T.Mesh(new T.BoxGeometry(w, 1.6, d), fenceMat); f.position.set(x, 0.8, z); f.castShadow = true; root.add(f);
      });

      // trees (placeholder; real species + wind in step 3) — instanced trunks & crowns
      const trees = cfg.TREES;
      const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.18, 0.26, 2.2, 6), lam('#6d4c41'), trees.length);
      const crown = new T.InstancedMesh(new T.IcosahedronGeometry(1.6, 0), lam('#2f7d32', { flatShading: true }), trees.length);
      const m4 = new T.Matrix4();
      trees.forEach(([x, y], i) => {
        m4.makeTranslation(x * S, 1.1, y * S); trunk.setMatrixAt(i, m4);
        m4.makeTranslation(x * S, 2.9, y * S); crown.setMatrixAt(i, m4);
      });
      trunk.castShadow = crown.castShadow = true;
      root.add(trunk, crown);

      Campus3D.buildLamps(root, cfg, S);
      E.rig.colliders = Campus3D.colliders;
      E.rig.bounds = { minX: -4, maxX: W + 4, minZ: -4, maxZ: H + 4 };
      Campus3D.size = { W, H };
    },

    /* street lamps (LAMPS) leaning over the nearest path + a security bulb over every building door.
       Bulbs and the warm pools on the ground are unlit meshes Sky3D fades in at night; it also parks a small pool
       of real point lights on the lamps nearest you. */
    buildLamps(root, cfg, S) {
      const T = THREE;
      const posts = [], bulbs = [];
      cfg.LAMPS.forEach(([x, y]) => {
        // lean the arm toward the closest road
        let best = null;
        cfg.ROADS.forEach(([rx, ry, rw, rh]) => {
          const nx = Math.max(rx, Math.min(x, rx + rw)), ny = Math.max(ry, Math.min(y, ry + rh));
          const d = Math.hypot(nx - x, ny - y);
          if (!best || d < best.d) best = { d, dx: nx - x, dy: ny - y };
        });
        const l = best && best.d > 1 ? best.d : 0;
        const ux = l ? best.dx / l : 0, uz = l ? best.dy / l : 1;
        posts.push({ x: x * S, z: y * S, ux, uz });
        bulbs.push({ x: x * S + ux * 0.8, y: 4.05, z: y * S + uz * 0.8, r: 4.2, street: true });
      });
      Object.values(cfg.LOCATIONS).forEach((L) => {
        if (L.kind !== 'b' || !L.door) return;
        const cz = (L.y + L.h / 2) * S, d = L.h * S;
        const front = L.door.y > L.y + L.h / 2;
        bulbs.push({ x: L.door.x * S, y: 2.55, z: front ? cz + d / 2 + 0.2 : cz - d / 2 - 0.2, r: 2.6 });
      });

      const metal = new T.MeshLambertMaterial({ color: new T.Color('#4b4f54') });
      const pole = new T.InstancedMesh(new T.CylinderGeometry(0.06, 0.09, 4.2, 6), metal, posts.length);
      const arm = new T.InstancedMesh(new T.BoxGeometry(0.06, 0.06, 0.9), metal, posts.length);
      const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1);
      posts.forEach((p, i) => {
        m4.makeTranslation(p.x, 2.1, p.z); pole.setMatrixAt(i, m4);
        q.setFromAxisAngle(up, Math.atan2(p.ux, p.uz));
        m4.compose(new T.Vector3(p.x + p.ux * 0.4, 4.17, p.z + p.uz * 0.4), q, one); arm.setMatrixAt(i, m4);
      });
      pole.castShadow = true;

      const bulbMat = new T.MeshBasicMaterial({ color: new T.Color('#5a5a52'), fog: false });
      const bulb = new T.InstancedMesh(new T.BoxGeometry(0.34, 0.12, 0.34), bulbMat, bulbs.length);
      // soft warm pools on the ground under each bulb (additive, no real light needed)
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const x = cv.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,214,140,1)'); gr.addColorStop(0.45, 'rgba(255,190,110,.45)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      const glowMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false });
      const pg = new T.PlaneGeometry(2, 2); pg.rotateX(-Math.PI / 2);
      const glow = new T.InstancedMesh(pg, glowMat, bulbs.length);
      bulbs.forEach((b, i) => {
        m4.makeTranslation(b.x, b.y, b.z); bulb.setMatrixAt(i, m4);
        m4.makeScale(b.r, 1, b.r).setPosition(b.x, 0.07, b.z); glow.setMatrixAt(i, m4);
      });
      glow.renderOrder = 2; glow.visible = false;
      root.add(pole, arm, bulb, glow);
      Campus3D.lamps = bulbs;
      Campus3D.lampFx = { bulbMat, glowMat, glow };
    },

    /* a building volume with a gable roof, door and windows; registers a camera collider */
    building(root, key, L, S) {
      const T = THREE;
      const w = L.w * S, d = L.h * S, cx = (L.x + L.w / 2) * S, cz = (L.y + L.h / 2) * S;
      const wallH = ['boysHostel', 'girlsHostel', 'admin'].includes(key) ? 4.2 : 3.4;
      const g = new T.Group();
      g.name = 'bld_' + key;
      const wall = new T.Mesh(new T.BoxGeometry(w, wallH, d), new T.MeshLambertMaterial({ color: new T.Color(L.wall) }));
      wall.position.set(cx, wallH / 2, cz);
      wall.castShadow = wall.receiveShadow = true;
      g.add(wall);
      // gable roof as a stretched triangular prism, slightly overhanging
      const rh = Math.min(2.2, d * 0.45);
      const shape = new T.Shape();
      shape.moveTo(-d / 2 - 0.4, 0); shape.lineTo(d / 2 + 0.4, 0); shape.lineTo(0, rh); shape.closePath();
      const roofGeo = new T.ExtrudeGeometry(shape, { depth: w + 0.8, bevelEnabled: false });
      roofGeo.rotateY(Math.PI / 2);
      roofGeo.translate(-(w + 0.8) / 2, 0, 0);
      const roof = new T.Mesh(roofGeo, new T.MeshLambertMaterial({ color: new T.Color(L.roof), flatShading: true }));
      roof.position.set(cx, wallH, cz);
      roof.castShadow = true;
      roof.name = 'roof';
      g.add(roof);
      // door on the side facing the path
      const doorFront = L.door.y > L.y + L.h / 2;
      const door = new T.Mesh(new T.BoxGeometry(1.1, 2.1, 0.08), new T.MeshLambertMaterial({ color: new T.Color('#5d4037') }));
      door.position.set(L.door.x * S, 1.05, doorFront ? cz + d / 2 + 0.04 : cz - d / 2 - 0.04);
      g.add(door);
      g.add(Campus3D.sign(key, L, S, wallH, doorFront ? cz + d / 2 + 0.07 : cz - d / 2 - 0.07, doorFront, w));
      // windows
      const winMat = new T.MeshLambertMaterial({ color: new T.Color('#35556e') });
      const n = Math.max(2, Math.floor(w / 2.2));
      for (let i = 0; i < n; i++) {
        const wx = cx - w / 2 + (i + 0.5) * (w / n);
        if (Math.abs(wx - L.door.x * S) < 1) continue;
        [1, -1].forEach((side) => { const win = new T.Mesh(new T.BoxGeometry(0.9, 0.8, 0.06), winMat); win.position.set(wx, wallH * 0.55, cz + side * (d / 2 + 0.03)); g.add(win); });
      }
      root.add(g);
      Campus3D.colliders.push(new T.Box3(new T.Vector3(cx - w / 2, 0, cz - d / 2), new T.Vector3(cx + w / 2, wallH + rh, cz + d / 2)));
      return g;
    },

    /* painted name board over the door (canvas texture, redrawn once the display font has loaded) */
    sign(key, L, S, wallH, z, front, w) {
      const T = THREE;
      const st = BH.Game && BH.Game.s;
      const mine = st && st.player ? (st.player.gender === 'f' ? 'girlsHostel' : 'boysHostel') : null;
      const text = `${L.emoji} ${L.name}${key === mine ? ' ⭐' : ''}`;
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
      const tex = new T.CanvasTexture(cv);
      tex.colorSpace = T.SRGBColorSpace;
      const draw = () => {
        const x = cv.getContext('2d');
        x.fillStyle = '#1b2a4a'; x.fillRect(0, 0, 512, 112);
        x.fillStyle = '#f4ead2'; x.fillRect(8, 8, 496, 96);
        let fs = 64;
        x.font = `${fs}px 'Lilita One', sans-serif`;
        while (fs > 28 && x.measureText(text).width > 470) { fs -= 4; x.font = `${fs}px 'Lilita One', sans-serif`; }
        x.fillStyle = '#1b2a4a'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(text, 256, 60);
        tex.needsUpdate = true;
      };
      draw();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
      const bw = Math.min(w * 0.85, 4.2), bh = bw * (112 / 512);
      const board = new T.Mesh(new T.PlaneGeometry(bw, bh), new T.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 }));
      board.position.set(L.door.x * S, Math.min(wallH - bh / 2 - 0.15, 2.35 + bh / 2), z);
      if (!front) board.rotation.y = Math.PI;
      board.name = 'sign';
      return board;
    },
  };

  BH.Campus3D = Campus3D;
})(window.BH);
