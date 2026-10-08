/* Interiors in 3D from the same tile-grid JSON (content/maps/<id>.json): floor, walls, furniture.
   Wall cutaway (Sims-style): any wall segment between the camera and the player drops to a short stub,
   smoothly, so you can always see inside. Roofs are never drawn indoors. */
(function (BH) {
  const Interior3D = {
    walls: [],

    build(E, cm) {
      const T = THREE;
      const S = E.S, Tm = cm.T * S;           // tile size in metres
      const root = new T.Group(); root.name = 'interior';
      E.mapRoot.add(root);
      const tiles = BH.Content.get('tiles');
      const src = cm.src;
      const floorCols = tiles.floors[src.floor] || tiles.floors.cement;
      const pal = src.palette || {};
      const geos = { floor: [], furn: [] };
      const colored = (geo, hex) => {
        const c = new T.Color(hex); const n = geo.attributes.position.count; const a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        geo.setAttribute('color', new T.BufferAttribute(a, 3)); return geo;
      };
      const at = (geo, x, y, z) => { geo.translate(x, y, z); return geo; };
      // floor tiles
      for (let r = 0; r < cm.rows; r++) for (let c = 0; c < cm.cols; c++) {
        const d = cm.grid[r][c];
        const fc = d.floor ? [d.floor, d.alt || d.floor] : floorCols;
        const g = new T.PlaneGeometry(Tm, Tm); g.rotateX(-Math.PI / 2);
        geos.floor.push(colored(at(g, (c + 0.5) * Tm, 0.01, (r + 0.5) * Tm), d.exit ? '#ffe082' : fc[(r + c) % 2]));
      }
      // walls: one mesh per horizontal run so each can be cut away independently
      Interior3D.walls = [];
      const wallH = 2.7;
      const wallMat = new T.MeshLambertMaterial({ color: new T.Color(pal.wall || '#6b4f3a') });
      for (let r = 0; r < cm.rows; r++) {
        let c = 0;
        while (c < cm.cols) {
          const d = cm.grid[r][c];
          if (!(d.t === 'wall' || d.t === 'window')) { c++; continue; }
          const c0 = c; while (c < cm.cols && ['wall', 'window'].includes(cm.grid[r][c].t)) c++;
          const w = (c - c0) * Tm;
          const m = new T.Mesh(new T.BoxGeometry(w, wallH, Tm), wallMat);
          m.geometry.translate(0, wallH / 2, 0);
          m.position.set(c0 * Tm + w / 2, 0, (r + 0.5) * Tm);
          m.castShadow = m.receiveShadow = true;
          m.userData.cut = 1;
          root.add(m);
          Interior3D.walls.push(m);
        }
      }
      // furniture blocks (one merged mesh, vertex coloured)
      for (let r = 0; r < cm.rows; r++) for (let c = 0; c < cm.cols; c++) {
        const d = cm.grid[r][c];
        if (!d.color || d.t === 'wall' || d.t === 'window') continue;
        const x = (c + 0.5) * Tm, z = (r + 0.5) * Tm;
        const h = Math.max(0.35, (d.h || 0.5) * 1.6);
        const inset = 0.08;
        if (['bunk', 'myBed', 'sickBed'].includes(d.t)) {
          geos.furn.push(colored(at(new T.BoxGeometry(Tm - inset, 0.38, Tm - inset), x, 0.19, z), d.color));
          geos.furn.push(colored(at(new T.BoxGeometry(Tm - inset * 2, 0.12, Tm - inset * 2), x, 0.44, z), d.top));
          if (d.t === 'bunk') { geos.furn.push(colored(at(new T.BoxGeometry(Tm - inset, 0.1, Tm - inset), x, 1.45, z), d.color)); geos.furn.push(colored(at(new T.BoxGeometry(Tm - inset * 2, 0.1, Tm - inset * 2), x, 1.55, z), d.top)); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => geos.furn.push(colored(at(new T.BoxGeometry(0.06, 1.6, 0.06), x + sx * (Tm / 2 - 0.06), 0.8, z + sz * (Tm / 2 - 0.06)), d.color))); }
          if (d.t === 'myBed') geos.furn.push(colored(at(new T.BoxGeometry(0.4, 0.1, 0.25), x, 0.55, z - Tm * 0.3), '#ffd54f')); // your pillow ⭐
        } else if (['desk', 'myDesk', 'diningTable', 'staffTable', 'labBench', 'teacherTable', 'officeDesk', 'principalDesk', 'houseMasterDesk', 'nurseDesk', 'librarianDesk', 'prefectTable'].includes(d.t)) {
          const top = d.t === 'labBench' ? 0.9 : 0.74;
          geos.furn.push(colored(at(new T.BoxGeometry(Tm - inset, 0.06, Tm * 0.7), x, top, z), d.top));
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => geos.furn.push(colored(at(new T.BoxGeometry(0.05, top, 0.05), x + sx * (Tm / 2 - 0.08), top / 2, z + sz * (Tm * 0.35 - 0.05)), d.color)));
          if (['desk', 'myDesk', 'diningTable', 'labBench'].includes(d.t)) geos.furn.push(colored(at(new T.BoxGeometry(Tm * 0.8, 0.45, 0.3), x, 0.22, z + Tm * 0.42), d.color)); // bench/stool behind
        } else if (['pew'].includes(d.t)) {
          geos.furn.push(colored(at(new T.BoxGeometry(Tm, 0.45, Tm * 0.45), x, 0.22, z), d.color));
          geos.furn.push(colored(at(new T.BoxGeometry(Tm, 0.6, 0.08), x, 0.75, z - Tm * 0.2), d.top));
        } else {
          geos.furn.push(colored(at(new T.BoxGeometry(Tm - inset, h, Tm - inset), x, h / 2, z), d.color));
          geos.furn.push(colored(at(new T.BoxGeometry(Tm - inset * 1.5, 0.04, Tm - inset * 1.5), x, h + 0.02, z), d.top || d.color));
        }
      }
      const vmat = () => new T.MeshLambertMaterial({ vertexColors: true });
      const merge = (list) => T.BufferGeometryUtils.mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
      if (geos.floor.length) { const f = new T.Mesh(merge(geos.floor), vmat()); f.receiveShadow = true; root.add(f); }
      if (geos.furn.length) { const f = new T.Mesh(merge(geos.furn), vmat()); f.castShadow = f.receiveShadow = true; root.add(f); }
      // a ground skirt outside so the room doesn't float in the void
      const skirt = new T.Mesh(new T.PlaneGeometry(cm.W * S + 30, cm.H * S + 30), new T.MeshLambertMaterial({ color: '#4d7a3a' }));
      skirt.rotation.x = -Math.PI / 2; skirt.position.set(cm.W * S / 2, -0.02, cm.H * S / 2);
      root.add(skirt);
      // doorways into other rooms (hallways): a dark open door + a painted name sign above it
      Interior3D.board = null;
      (cm.doors || []).forEach((dr) => {
        const x = dr.x * S, zBack = dr.ty * Tm;
        const hole = new T.Mesh(new T.PlaneGeometry(Tm * 0.86, 2.2), new T.MeshBasicMaterial({ color: '#1d140d' }));
        hole.position.set(x, 1.1, zBack + 0.05);
        const frame = new T.Mesh(new T.BoxGeometry(Tm, 0.16, Tm * 0.9), new T.MeshLambertMaterial({ color: '#5d4037' }));
        frame.position.set(x, 2.3, zBack + Tm / 2);
        const sign = Interior3D.sign(dr.to === BH.Activities.myClassroom(BH.Game.s) ? `${dr.to} ★` : dr.to);
        sign.position.set(x, 2.55, (dr.ty + 1) * Tm + 0.03);
        root.add(hole, frame, sign);
      });
      // classrooms: the blackboard shows the live lesson (BH.Lessons)
      const bb = cm.src.classroom && cm.objects.find((o) => o.kind === 'blackboard');
      if (bb) {
        const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
        const tex = new T.CanvasTexture(cv);
        tex.colorSpace = T.SRGBColorSpace;
        const plane = new T.Mesh(new T.PlaneGeometry(bb.w * S * 0.94, 1.0), new T.MeshBasicMaterial({ map: tex }));
        plane.position.set(bb.x * S, 1.15, (bb.y + cm.T / 2) * S + 0.012);
        root.add(plane);
        Interior3D.board = { cv, tex, key: null, map: cm.id };
        Interior3D.drawBoard(true);
      }
      E.rig.colliders = [];
      E.rig.bounds = { minX: -2, maxX: cm.W * S + 2, minZ: -2, maxZ: cm.H * S + 2 };
      Interior3D.root = root;
    },

    /* a small painted sign (canvas texture) */
    sign(text) {
      const T = THREE;
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
      const x = cv.getContext('2d');
      x.fillStyle = '#f4ead2'; x.fillRect(0, 0, 256, 96);
      x.strokeStyle = '#5d4037'; x.lineWidth = 8; x.strokeRect(4, 4, 248, 88);
      x.fillStyle = '#1b2a4a'; x.font = 'bold 54px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, 128, 52);
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
      return new T.Mesh(new T.PlaneGeometry(0.95, 0.36), new T.MeshBasicMaterial({ map: tex }));
    },
    /* chalk text for the current lesson's board */
    drawBoard(force) {
      const B = Interior3D.board;
      const s = BH.Game.s;
      if (!B || !s || !BH.Lessons) return;
      const L = s.school && s.school.lessons[B.map];
      const lines = L ? (L.kind === 'register' ? [`REGISTER — ${L.cid}`, BH.Time.dayName(s)] : L.free ? ['FREE PERIOD', '(no teacher)'] : L.board.slice(-4)) : [];
      const key = lines.join('|');
      if (!force && key === B.key) return;
      B.key = key;
      const x = B.cv.getContext('2d');
      x.fillStyle = '#24412f'; x.fillRect(0, 0, 1024, 256);
      x.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 40; i++) x.fillRect((i * 97) % 1024, (i * 53) % 256, 60, 2);
      x.fillStyle = '#f2f5ea'; x.font = '34px "Comic Sans MS", "Chalkboard SE", cursive'; x.textBaseline = 'top';
      let y = 14;
      lines.forEach((ln) => {
        const words = String(ln).split(' ');
        let row = '';
        words.forEach((w) => { const t = row ? row + ' ' + w : w; if (x.measureText(t).width > 980) { if (y < 220) x.fillText(row, 22, y); y += 42; row = w; } else row = t; });
        if (row && y < 220) x.fillText(row, 22, y);
        y += 46;
      });
      B.tex.needsUpdate = true;
    },

    /* cutaway: walls nearer the camera than the player (and in the way) drop to stubs */
    update(E, dt) {
      if (Interior3D.board) Interior3D.drawBoard(false);
      if (!Interior3D.walls.length) return;
      const pl = BH.Actors.player();
      if (!pl) return;
      const S = E.S;
      const px = pl.x * S, pz = pl.y * S;
      const cam = E.camera.position;
      const dx = cam.x - px, dz = cam.z - pz, dl = Math.hypot(dx, dz) || 1;
      const k = 1 - Math.exp(-dt * 10);
      Interior3D.walls.forEach((m) => {
        const w = m.geometry.parameters.width / 2;
        const nx = Math.max(m.position.x - w, Math.min(px, m.position.x + w)), nz = m.position.z;
        const along = ((nx - px) * dx + (nz - pz) * dz) / dl; // how far toward the camera this wall sits
        const goal = along > 0.4 ? 0.12 : 1;
        m.userData.cut += (goal - m.userData.cut) * k;
        m.scale.y = Math.max(0.05, m.userData.cut);
      });
    },
  };

  BH.Interior3D = Interior3D;
})(window.BH);
