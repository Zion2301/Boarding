/* Content loader + map compiler.
   Source of truth: content/*.json (see content/manifest.json).
   - Served over http(s): the JSON files are fetched live, so editing content needs no build.
   - Opened from file:// or offline: falls back to js/content/bundle.js (regenerate with `node tools/build-content.js`).
   After loading, legacy BH.data tables (ITEMS, RECIPES, SHOP_ITEMS, CAMPUS) point at the content. */
(function (BH) {
  const D = BH.data;
  const compiled = {};

  const Content = {
    data: null,

    init(done) {
      const bundle = BH.CONTENT_BUNDLE || null;
      const finish = (data) => { Content.apply(data || bundle); done && done(); };
      if (!/^https?:/.test(location.protocol) || typeof fetch !== 'function') return finish(bundle);
      Content.fetchAll().then(finish, (err) => { console.warn('Live content failed, using bundle:', err); finish(bundle); });
    },

    async fetchAll() {
      const get = (f) => fetch(`content/${f}`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });
      const manifest = await get('manifest.json');
      const out = {};
      await Promise.all(Object.entries(manifest).filter(([k]) => !k.startsWith('_')).map(async ([key, val]) => {
        if (key === 'maps') {
          out.maps = {};
          const maps = await Promise.all(val.map((id) => get(`maps/${id}.json`)));
          val.forEach((id, i) => { out.maps[id] = maps[i]; });
        } else out[key] = await get(val);
      }));
      return out;
    },

    apply(data) {
      if (!data) throw new Error('No game content found. Run `node tools/build-content.js`.');
      Content.data = data;
      Object.keys(compiled).forEach((k) => delete compiled[k]);
      // resolve "extends" between maps (girls' hostel reuses the boys' layout, etc.)
      Object.values(data.maps).forEach((m) => {
        if (!m.extends) return;
        const base = data.maps[m.extends];
        Object.keys(base).forEach((k) => { if (m[k] === undefined && k !== 'id' && k !== '_doc') m[k] = base[k]; });
      });
      D.ITEMS = data.items.items;
      D.RECIPES = data.items.recipes;
      D.SHOP_ITEMS = data.items.shop;
      D.CAMPUS = data.maps.campus;
    },

    get(key) { return Content.data[key]; },
    map(id) { return Content.data.maps[id] || null; },
    mapIds() { return Object.keys(Content.data.maps); },
    isInterior(id) { return id !== 'campus' && !!Content.data.maps[id]; },
    interactable(kind) { return Content.data.interactables[kind] || null; },

    /* ---------- map compiler ----------
       Interiors become: px size, solid rects, objects (interactables with seats), exits, spots, patrol, rooms. */
    compile(id) {
      if (compiled[id]) return compiled[id];
      const m = Content.map(id);
      if (!m) return null;
      const out = id === 'campus' ? compileCampus(m) : compileInterior(m);
      compiled[id] = out;
      return out;
    },
  };

  function compileCampus(m) {
    const objects = (m.objects || []).map((o) => ({
      id: `${o.kind}@${o.x},${o.y}`, kind: o.kind, x: o.x, y: o.y, r: o.r || 60,
      hide: !!o.hide, secret: o.secret || null, map: 'campus',
    }));
    return { id: 'campus', outdoor: true, W: m.W, H: m.H, objects, src: m };
  }

  function compileInterior(m) {
    const tiles = Content.data.tiles;
    const T = tiles.size;
    const rows = m.layout;
    const H = rows.length, W = rows[0].length;
    const def = (ch) => tiles.chars[ch] || tiles.chars['.'];
    const grid = rows.map((r) => r.split('').map(def));
    const solids = [];
    // merge horizontal runs of solid tiles into one rect per run
    rows.forEach((r, y) => {
      let x = 0;
      while (x < W) {
        if (!def(r[x]).solid) { x++; continue; }
        const x0 = x;
        while (x < W && def(r[x]).solid) x++;
        solids.push({ x: x0 * T, y: y * T, w: (x - x0) * T, h: T });
      }
    });
    const objects = [];
    const seen = new Set();
    const secretAt = {};
    (m.secrets || []).forEach((sc) => { secretAt[sc.at.join(',')] = sc.id; });
    rows.forEach((r, y) => {
      for (let x = 0; x < W; x++) {
        const d = def(r[x]);
        if (!d.interact || seen.has(x + ',' + y)) continue;
        const tilesOf = [[x, y]];
        seen.add(x + ',' + y);
        if (d.group) { let x2 = x + 1; while (x2 < W && r[x2] === r[x]) { tilesOf.push([x2, y]); seen.add(x2 + ',' + y); x2++; } }
        const xs = tilesOf.map((t) => t[0]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const secret = tilesOf.map((t) => secretAt[t.join(',')]).find(Boolean) || null;
        objects.push({
          id: `${d.interact}@${x},${y}`, kind: d.interact, tile: d.t, map: m.id,
          x: ((minX + maxX + 1) / 2) * T, y: (y + 0.5) * T, w: (maxX - minX + 1) * T, h: T,
          r: Math.max(T * 1.05, ((maxX - minX + 1) * T) / 2 + T * 0.55),
          solid: !!d.solid, hide: !!d.hide,
          seats: d.seat ? tilesOf.map(([sx, sy]) => ({ x: (sx + 0.5) * T, y: (sy + 0.5) * T + (d.solid ? T * 0.15 : 0) })) : [],
          secret, tiles: tilesOf,
        });
      }
    });
    const exits = [];
    rows.forEach((r, y) => { for (let x = 0; x < W; x++) if (def(r[x]).exit) exits.push({ x: x * T, y: y * T, w: T, h: T }); });
    const px = ([x, y]) => ({ x: (x + 0.5) * T, y: (y + 0.5) * T });
    const spots = {};
    Object.entries(m.spots || {}).forEach(([k, v]) => { spots[k] = px(v); });
    const walk = rows.map((r) => r.split('').map((ch) => !def(ch).solid));
    const ex = exits.length ? exits.reduce((a, e) => ({ x: a.x + e.x / exits.length, y: a.y + e.y / exits.length }), { x: 0, y: 0 }) : { x: T, y: T };
    return {
      id: m.id, outdoor: false, T, cols: W, rows: H, W: W * T, H: H * T, grid, solids, objects, exits,
      entry: { x: ex.x + T / 2, y: ex.y - T * 0.6 },
      spots, walk,
      patrol: (m.patrol || []).map(px),
      rooms: (m.rooms || []).map((rm) => ({ ...rm, x: rm.rect[0] * T, y: rm.rect[1] * T, w: rm.rect[2] * T, h: rm.rect[3] * T })),
      labels: (m.labels || []).map((l) => ({ text: l.text, ...px([l.x, l.y]) })),
      src: m,
    };
  }

  /* BFS on the walk grid (interiors). Returns a list of px points from a to b. */
  Content.gridPath = (cm, a, b) => {
    const T = cm.T;
    const cell = (p) => ({ x: Math.max(0, Math.min(cm.cols - 1, Math.floor(p.x / T))), y: Math.max(0, Math.min(cm.rows - 1, Math.floor(p.y / T))) });
    const s = cell(a);
    let e = cell(b);
    // seats sit on solid furniture: path to the nearest walkable neighbour, then hop on
    const nearWalk = (c) => {
      if (cm.walk[c.y] && cm.walk[c.y][c.x]) return c;
      const n = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }))
        .find((q) => cm.walk[q.y] && cm.walk[q.y][q.x]);
      return n || c;
    };
    e = nearWalk(e);
    const start = nearWalk(s);
    const key = (c) => c.y * cm.cols + c.x;
    const prev = new Map([[key(start), null]]);
    const q = [start];
    while (q.length) {
      const c = q.shift();
      if (c.x === e.x && c.y === e.y) break;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const n = { x: c.x + dx, y: c.y + dy };
        if (!cm.walk[n.y] || !cm.walk[n.y][n.x] || prev.has(key(n))) return;
        prev.set(key(n), c);
        q.push(n);
      });
    }
    if (!prev.has(key(e))) return [b];
    const path = [];
    for (let c = e; c; c = prev.get(key(c))) path.unshift({ x: (c.x + 0.5) * T, y: (c.y + 0.5) * T });
    path.shift();
    path.push(b);
    return path;
  };

  BH.Content = Content;
})(window.BH);
