/* Map renderers (placeholder art). Campus = the old procedural top-down drawing, now fed by content/maps/campus.json.
   Interiors = tile grids from content/maps/<id>.json drawn in a 3/4 view (walls and tall furniture get a front face).
   Real art: put images in D.SPRITES.buildings (campus) or D.SPRITES.tiles (by tile type) and they replace the shapes. */
(function (BH) {
  const D = BH.data;
  const C = () => D.CAMPUS;
  const DEPTH = { ground: 0, road: 1, deco: 2, label: 9600 };
  const col = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
  const shade = (hex, f) => { const c = Phaser.Display.Color.HexStringToColor(hex); return Phaser.Display.Color.GetColor(Math.round(c.red * f), Math.round(c.green * f), Math.round(c.blue * f)); };

  const MapRender = {
    DEPTH,
    textures(scene) {
      const T = scene.textures;
      if (!T.exists('grass')) {
        const g = document.createElement('canvas'); g.width = 64; g.height = 64;
        const x = g.getContext('2d');
        x.fillStyle = '#5c9e44'; x.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 60; i++) { x.fillStyle = Math.random() < 0.5 ? '#548f3e' : '#67a94e'; x.fillRect(Math.random() * 64, Math.random() * 64, 2, 3); }
        T.addCanvas('grass', g);
      }
      if (!T.exists('light')) {
        const l = document.createElement('canvas'); l.width = 256; l.height = 256;
        const lx = l.getContext('2d');
        const grd = lx.createRadialGradient(128, 128, 0, 128, 128, 128);
        grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.55, 'rgba(255,255,255,.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        lx.fillStyle = grd; lx.fillRect(0, 0, 256, 256);
        T.addCanvas('light', l);
      }
    },

    /* ---------------- campus ---------------- */
    campus(scene) {
      const cfg = C();
      const s = scene.s;
      scene.add.tileSprite(0, 0, cfg.W, cfg.H, 'grass').setOrigin(0).setDepth(DEPTH.ground);
      const r = scene.add.graphics().setDepth(DEPTH.road);
      cfg.ROADS.forEach(([x, y, w, h]) => { r.fillStyle(0xb89a6a, 1); r.fillRect(x - 3, y - 3, w + 6, h + 6); r.fillStyle(0xd8c49a, 1); r.fillRect(x, y, w, h); });
      const g = scene.add.graphics().setDepth(DEPTH.deco);
      const mine = s.player.gender === 'f' ? 'girlsHostel' : 'boysHostel';
      Object.entries(cfg.LOCATIONS).forEach(([key, L]) => {
        if (L.kind === 'b') MapRender.building(scene, key, L);
        else MapRender.openArea(scene, g, key, L);
        const label = scene.add.text(L.x + L.w / 2, L.kind === 'b' ? L.y - 10 : L.y - 6, `${L.emoji} ${L.name}${key === mine ? ' ⭐' : ''}`, {
          fontFamily: 'Lilita One', fontSize: '22px', color: '#ffffff', stroke: '#1b2a4a', strokeThickness: 6,
        }).setOrigin(0.5, 1).setDepth(DEPTH.label);
        scene.labels.push(label);
      });
      MapRender.trees(scene);
      MapRender.fence(scene);
      // outdoor interactables that need a look of their own
      const og = scene.add.graphics().setDepth(DEPTH.deco + 1);
      BH.Content.compile('campus').objects.forEach((o) => {
        if (o.kind === 'bush') { og.fillStyle(0x1b5e20, 1); og.fillCircle(o.x - 14, o.y, 22); og.fillCircle(o.x + 14, o.y + 4, 20); og.fillStyle(0x2e7d32, 1); og.fillCircle(o.x, o.y - 8, 22); }
        if (o.kind === 'speaker') { og.fillStyle(0x212121, 1); og.fillRect(o.x - 16, o.y - 30, 32, 44); og.fillStyle(0x616161, 1); og.fillCircle(o.x, o.y - 18, 9); og.fillCircle(o.x, o.y + 2, 6); }
      });
    },
    building(scene, key, L) {
      const depth = L.y + L.h;
      if (scene.textures.exists('bld_' + key)) {
        scene.add.image(L.x, L.y, 'bld_' + key).setOrigin(0).setDisplaySize(L.w, L.h).setDepth(depth - 1);
      } else {
        const bg = scene.add.graphics().setDepth(depth - 1);
        bg.fillStyle(0x000000, 0.22); bg.fillRect(L.x + 10, L.y + 14, L.w, L.h);
        bg.fillStyle(col(L.wall), 1); bg.fillRect(L.x, L.y + L.h * 0.45, L.w, L.h * 0.55);
        bg.fillStyle(col(L.roof), 1); bg.fillRect(L.x - 6, L.y, L.w + 12, L.h * 0.55);
        bg.fillStyle(0xffffff, 0.12); bg.fillRect(L.x - 6, L.y, L.w + 12, L.h * 0.12);
        bg.lineStyle(3, 0x000000, 0.18); bg.lineBetween(L.x - 6, L.y + L.h * 0.27, L.x + L.w + 6, L.y + L.h * 0.27);
        if (L.dome) { bg.fillStyle(col(L.roof), 1); bg.fillCircle(L.x + L.w / 2, L.y + L.h * 0.3, L.w * 0.28); bg.fillStyle(0xf5f5f5, 1); bg.fillRect(L.x + L.w - 22, L.y - 30, 14, 60); }
        if (key === 'chapel') { bg.fillStyle(0xffd54f, 1); bg.fillRect(L.x + L.w / 2 - 4, L.y - 8, 8, 40); bg.fillRect(L.x + L.w / 2 - 14, L.y + 4, 28, 8); }
        if (key === 'sickbay') { bg.fillStyle(0xffffff, 1); bg.fillRect(L.x + L.w / 2 - 22, L.y + 10, 44, 44); bg.fillStyle(0xc62828, 1); bg.fillRect(L.x + L.w / 2 - 6, L.y + 16, 12, 32); bg.fillRect(L.x + L.w / 2 - 16, L.y + 26, 32, 12); }
        const wy = L.y + L.h * 0.62, n = Math.max(2, Math.floor(L.w / 60));
        for (let i = 0; i < n; i++) { const wx = L.x + 18 + i * ((L.w - 36 - 22) / Math.max(1, n - 1)); bg.fillStyle(0x35556e, 1); bg.fillRect(wx, wy, 22, 18); bg.fillStyle(0xffffff, 0.25); bg.fillRect(wx, wy, 22, 4); }
        // door (glows a little so you know you can walk in)
        const top = L.door.y < L.y;
        bg.fillStyle(0x5d4037, 1);
        if (top) bg.fillRect(L.door.x - 18, L.y - 2, 36, 12); else bg.fillRect(L.door.x - 18, L.y + L.h - 30, 36, 30);
        bg.fillStyle(0xffe082, 0.9);
        if (top) bg.fillRect(L.door.x - 18, L.y - 4, 36, 3); else bg.fillRect(L.door.x - 18, L.y + L.h - 32, 36, 3);
      }
      const z = scene.add.zone(L.x + L.w / 2, L.y + L.h / 2, L.w, L.h);
      scene.physics.add.existing(z, true);
      scene.solids.add(z);
      // doormat
      const mat = scene.add.graphics().setDepth(DEPTH.road + 1);
      mat.fillStyle(0x8d6e63, 0.9); mat.fillRoundedRect(L.door.x - 22, L.door.y - 10, 44, 18, 4);
    },
    openArea(scene, g, key, L) {
      const solid = (x, y, w, h) => { const z = scene.add.zone(x, y, w, h); scene.physics.add.existing(z, true); scene.solids.add(z); };
      if (key === 'assembly') {
        g.fillStyle(0xcfcfc4, 1); g.fillRect(L.x, L.y, L.w, L.h);
        g.lineStyle(2, 0xb0b0a4, 1); for (let i = 1; i < 6; i++) g.lineBetween(L.x, L.y + (i * L.h) / 6, L.x + L.w, L.y + (i * L.h) / 6);
        g.fillStyle(0x9e9e9e, 1); g.fillRect(L.x + L.w / 2 - 3, L.y + 18, 6, 70);
        [0x008751, 0xffffff, 0x008751].forEach((c, i) => { g.fillStyle(c, 1); g.fillRect(L.x + L.w / 2 + 3 + i * 14, L.y + 18, 14, 26); });
        g.fillStyle(0x795548, 1); g.fillRect(L.x + L.w / 2 - 40, L.y + 64, 80, 14);
        solid(L.x + L.w / 2, L.y + 60, 10, 10);
      } else if (key === 'field') {
        g.fillStyle(0x3f8f33, 1); g.fillRect(L.x, L.y, L.w, L.h);
        for (let i = 0; i < 8; i++) { g.fillStyle(i % 2 ? 0x469a39 : 0x3f8f33, 1); g.fillRect(L.x + (i * L.w) / 8, L.y, L.w / 8, L.h); }
        g.lineStyle(4, 0xffffff, 0.9); g.strokeRect(L.x + 10, L.y + 10, L.w - 20, L.h - 20); g.lineBetween(L.x + L.w / 2, L.y + 10, L.x + L.w / 2, L.y + L.h - 10); g.strokeCircle(L.x + L.w / 2, L.y + L.h / 2, 40);
        g.lineStyle(6, 0xffffff, 1); g.strokeRect(L.x + 2, L.y + L.h / 2 - 34, 14, 68); g.strokeRect(L.x + L.w - 16, L.y + L.h / 2 - 34, 14, 68);
      } else if (key === 'tap') {
        g.fillStyle(0xb0bec5, 1); g.fillRect(L.x, L.y + 30, L.w, L.h - 30);
        g.fillStyle(0x263238, 1); g.fillCircle(L.x + 30, L.y + 26, 26);
        g.fillStyle(0x90a4ae, 1); for (let i = 0; i < 4; i++) g.fillRect(L.x + 64 + i * 18, L.y + 60, 6, 22);
        g.fillStyle(0x4fc3f7, 0.8); g.fillEllipse(L.x + 92, L.y + 90, 70, 14);
        solid(L.x + 30, L.y + 26, 50, 50);
      } else if (key === 'laundry') {
        g.lineStyle(3, 0x6d4c41, 1);
        [0, 40, 80].forEach((dy) => {
          g.lineBetween(L.x, L.y + dy + 10, L.x + L.w, L.y + dy + 10);
          for (let i = 0; i < 7; i++) { g.fillStyle([0xffffff, 0x1f5c3a, 0x2196f3, 0xf2c14e, 0xe57373][(i + dy) % 5], 1); g.fillRect(L.x + 10 + i * 32, L.y + dy + 12, 20, 22); }
        });
        g.fillStyle(0x6d4c41, 1); g.fillRect(L.x - 4, L.y, 8, 100); g.fillRect(L.x + L.w - 4, L.y, 8, 100);
      } else if (key === 'gate') {
        g.fillStyle(0x0f5c3f, 1); g.fillRect(L.x - 10, L.y + L.h - 26, L.w + 20, 18);
        g.fillStyle(0x8d6e63, 1); g.fillRect(L.x - 14, L.y, 22, L.h); g.fillRect(L.x + L.w - 8, L.y, 22, L.h);
        [L.x - 14, L.x + L.w - 8].forEach((x) => solid(x + 11, L.y + L.h / 2, 22, L.h));
        solid(L.x + L.w / 2, L.y + L.h - 17, L.w, 18);
      } else if (key === 'backFence') {
        g.fillStyle(0x6d4c41, 1); g.fillRect(L.x, L.y + 26, L.w, 10);
        g.fillStyle(0x000000, 0.5); g.fillRect(L.x + L.w / 2 - 16, L.y + 22, 32, 18);
      }
    },
    trees(scene) {
      const g = scene.add.graphics().setDepth(DEPTH.deco + 2);
      C().TREES.forEach(([x, y]) => {
        g.fillStyle(0x000000, 0.2); g.fillEllipse(x + 8, y + 22, 70, 28);
        g.fillStyle(0x6d4c41, 1); g.fillRect(x - 5, y, 10, 22);
        g.fillStyle(0x2e7d32, 1); g.fillCircle(x, y - 6, 30);
        g.fillStyle(0x388e3c, 1); g.fillCircle(x - 9, y - 14, 18);
        g.fillStyle(0x43a047, 1); g.fillCircle(x + 9, y - 2, 14);
        const z = scene.add.zone(x, y + 12, 16, 16); scene.physics.add.existing(z, true); scene.solids.add(z);
      });
      // the mango tree gets mangoes
      const mango = BH.Content.compile('campus').objects.find((o) => o.kind === 'mangoTree');
      if (mango) { [[-12, -14], [10, -4], [0, -24]].forEach(([dx, dy]) => { g.fillStyle(0xffb300, 1); g.fillCircle(mango.x + dx, mango.y + dy - 20, 4); }); }
      const lamps = scene.add.graphics().setDepth(DEPTH.deco + 3);
      C().LAMPS.forEach(([x, y]) => { lamps.fillStyle(0x424242, 1); lamps.fillRect(x - 2, y - 30, 4, 30); lamps.fillStyle(0xfff59d, 1); lamps.fillCircle(x, y - 32, 5); });
    },
    fence(scene) {
      const cfg = C();
      const g = scene.add.graphics().setDepth(DEPTH.deco);
      g.lineStyle(10, 0x8d6e63, 1);
      g.strokeRect(5, 5, cfg.W - 10, cfg.H - 10);
      g.lineStyle(3, 0x5d4037, 1);
      for (let x = 20; x < cfg.W; x += 40) { g.lineBetween(x, 0, x, 14); g.lineBetween(x, cfg.H - 14, x, cfg.H); }
    },

    /* ---------------- interiors ---------------- */
    interior(scene, cm) {
      const tiles = BH.Content.get('tiles');
      const T = cm.T;
      const src = cm.src;
      const pal = src.palette || {};
      const floor = tiles.floors[src.floor] || tiles.floors.cement;
      const g = scene.add.graphics().setDepth(DEPTH.ground);
      const art = D.SPRITES.tiles || {};
      // floor (checker) under everything
      for (let y = 0; y < cm.rows; y++) {
        for (let x = 0; x < cm.cols; x++) {
          const d = cm.grid[y][x];
          const own = d.floor ? [d.floor, d.alt || d.floor] : floor;
          g.fillStyle(col(own[(x + y) % 2]), 1);
          g.fillRect(x * T, y * T, T, T);
          if (d.exit) { g.fillStyle(0xffe082, 0.9); g.fillRect(x * T + 4, y * T + T - 8, T - 8, 5); }
        }
      }
      // room tints
      cm.rooms.forEach((r) => { g.fillStyle(r.forbidden ? 0xff5252 : 0xffffff, 0.06); g.fillRect(r.x, r.y, r.w, r.h); });
      // furniture & walls (3/4 view: top face + darker front face), depth-sorted by row
      for (let y = 0; y < cm.rows; y++) {
        const rowG = scene.add.graphics().setDepth((y + 1) * T - 2);
        for (let x = 0; x < cm.cols; x++) {
          const d = cm.grid[y][x];
          if (!d.color) continue;
          if (art[d.t] && scene.textures.exists('tile_' + d.t)) { scene.add.image(x * T, y * T, 'tile_' + d.t).setOrigin(0).setDisplaySize(T, T).setDepth((y + 1) * T - 2); continue; }
          const isWall = d.t === 'wall' || d.t === 'window';
          const base = isWall && pal.wall ? pal.wall : d.color;
          const top = isWall && pal.top && d.t === 'wall' ? pal.top : d.top || d.color;
          const hgt = Math.round(T * 0.42 * (d.h || 0.5));
          const inset = isWall ? 0 : 4;
          rowG.fillStyle(0x000000, 0.18); rowG.fillRect(x * T + inset + 3, y * T + inset + 6, T - inset * 2, T - inset * 2);
          rowG.fillStyle(col(top), 1); rowG.fillRect(x * T + inset, y * T + inset - (isWall ? 0 : 2), T - inset * 2, T - inset * 2 - hgt);
          rowG.fillStyle(shade(base, isWall ? 0.75 : 0.8), 1); rowG.fillRect(x * T + inset, y * T + T - inset - hgt, T - inset * 2, hgt);
          if (d.t === 'window') { rowG.fillStyle(0x9fd3f0, 1); rowG.fillRect(x * T + 8, y * T + 8, T - 16, T * 0.35); }
          if (d.t === 'bunk' || d.t === 'myBed') { rowG.fillStyle(d.t === 'myBed' ? 0x90caf9 : 0xe0e0e0, 1); rowG.fillRect(x * T + 8, y * T + 6, T - 16, 10); }
          if (d.t === 'blackboard') { rowG.lineStyle(1, 0xffffff, 0.35); rowG.lineBetween(x * T + 6, y * T + 14, x * T + T - 10, y * T + 16); }
          if (d.t === 'shelf') { [0x8e24aa, 0x1e88e5, 0x43a047, 0xe53935].forEach((c, i) => { rowG.fillStyle(c, 1); rowG.fillRect(x * T + 6 + i * 9, y * T + 6, 7, T * 0.4); }); }
          if (d.t === 'plant') { rowG.fillStyle(0x66bb6a, 1); rowG.fillCircle(x * T + T / 2, y * T + T / 3, T / 3); }
        }
      }
      // markers on your own things
      const mark = (kind, emoji) => cm.objects.filter((o) => o.kind === kind).forEach((o) => {
        if (!BH.Interaction.mine(scene.s, o)) return;
        scene.add.text(o.x, o.y - 18, emoji, { fontSize: '18px' }).setOrigin(0.5).setDepth(9000);
      });
      mark('myBed', '⭐'); mark('myDesk', '⭐'); mark('chopBox', '📦');
      // labels, house tables, wall titles
      cm.labels.forEach((l) => scene.labels.push(scene.add.text(l.x, l.y, l.text, { fontFamily: 'Nunito', fontStyle: '800', fontSize: '13px', color: '#ffffff', backgroundColor: '#00000066', padding: { x: 4, y: 1 } }).setOrigin(0.5).setDepth(9500)));
      if (src.houseTables) {
        const tables = cm.objects.filter((o) => o.kind === 'diningTable');
        tables.forEach((t, i) => {
          const h = D.HOUSES[i % D.HOUSES.length];
          const mine = h.tag === scene.s.player.house.tag;
          scene.labels.push(scene.add.text(t.x, t.y - 30, `${mine ? '⭐ ' : ''}${h.name}`, { fontFamily: 'Nunito', fontStyle: '800', fontSize: '12px', color: '#fff', backgroundColor: h.color, padding: { x: 4, y: 1 } }).setOrigin(0.5).setDepth(9500));
        });
      }
      const title = scene.add.text(cm.W / 2, -10, `${src.emoji} ${src.name}`, { fontFamily: 'Lilita One', fontSize: '24px', color: '#fff', stroke: '#1b2a4a', strokeThickness: 6 }).setOrigin(0.5, 1).setDepth(9600);
      scene.labels.push(title);
      // physics
      cm.solids.forEach((r) => { const z = scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h); scene.physics.add.existing(z, true); scene.solids.add(z); });
    },

    /* Line of sight: walls and tall furniture block it, desks and beds don't */
    blocked(cm, a, b) {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16);
      for (let i = 1; i < steps; i++) {
        const x = a.x + ((b.x - a.x) * i) / steps, y = a.y + ((b.y - a.y) * i) / steps;
        if (cm.outdoor) {
          if (Object.values(C().LOCATIONS).some((l) => l.kind === 'b' && x > l.x && x < l.x + l.w && y > l.y && y < l.y + l.h)) return true;
        } else {
          const tx = Math.floor(x / cm.T), ty = Math.floor(y / cm.T);
          const d = cm.grid[ty] && cm.grid[ty][tx];
          if (d && d.solid && (d.h || 0) >= 1) return true;
        }
      }
      return false;
    },
  };

  BH.MapRender = MapRender;
})(window.BH);
