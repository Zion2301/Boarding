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

      E.rig.colliders = Campus3D.colliders;
      E.rig.bounds = { minX: -4, maxX: W + 4, minZ: -4, maxZ: H + 4 };
      Campus3D.size = { W, H };
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
  };

  /* Sun, sky light and a placeholder player marker for step 1 (replaced by sky.js and the character rig) */
  BH.Sky3D = BH.Sky3D || {
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
      Object.assign(BH.Sky3D, { hemi, sun });
    },
    setIndoors() {},
    /* keep the shadow camera around the player so shadows stay sharp */
    update(E) {
      const pl = BH.Actors.player();
      if (!pl || !BH.Sky3D.sun) return;
      const x = pl.x * E.S, z = pl.y * E.S;
      BH.Sky3D.sun.position.set(x + 20, 40, z + 12);
      BH.Sky3D.sun.target.position.set(x, 0, z);
    },
  };

  BH.Campus3D = Campus3D;
})(window.BH);
