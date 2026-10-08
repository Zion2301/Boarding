/* Navmesh & static collision per map (headless; uses three-pathfinding when available).
   Campus: walkable grid (0.8 m cells) minus buildings, trees, fence, fixtures → triangulated navmesh.
   Interiors: the tile grid's walkable tiles → navmesh. Paths come back in MAP PIXELS ({x, y}).
   Also exposes the solid rectangles used by movement (sliding collision) and line-of-sight. */
(function (BH) {
  const S = 1 / 40;
  const C = () => BH.data.CAMPUS;
  const cache = {};
  let pf = null;

  const rectHit = (x, y, r, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;

  /* Solid rectangles in map px (same obstacles the 2D physics had) */
  function campusSolids() {
    const out = [];
    Object.entries(C().LOCATIONS).forEach(([key, L]) => {
      if (L.kind === 'b') out.push({ x: L.x, y: L.y, w: L.w, h: L.h, building: key, tall: true });
      else if (key === 'tap') out.push({ x: L.x + 5, y: L.y + 1, w: 50, h: 50 });
      else if (key === 'assembly') out.push({ x: L.x + L.w / 2 - 6, y: L.y + 54, w: 12, h: 12 });
      else if (key === 'gate') { out.push({ x: L.x - 14, y: L.y, w: 22, h: L.h }); out.push({ x: L.x + L.w - 8, y: L.y, w: 22, h: L.h }); }
    });
    C().TREES.forEach(([x, y]) => out.push({ x: x - 10, y: y + 2, w: 20, h: 20, tree: true }));
    const W = C().W, H = C().H;
    out.push({ x: 0, y: 0, w: W, h: 12 }, { x: 0, y: H - 12, w: W, h: 12 }, { x: 0, y: 0, w: 12, h: H }, { x: W - 12, y: 0, w: 12, h: H });
    return out;
  }

  function buildGridMesh(cols, rows, cell, walkable, y = 0) {
    const pos = [], idx = [];
    const vid = new Map();
    const v = (cx, cz) => {
      const k = cx + ',' + cz;
      if (!vid.has(k)) { vid.set(k, pos.length / 3); pos.push(cx * cell * S, y, cz * cell * S); }
      return vid.get(k);
    };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!walkable(c, r)) continue;
      const a = v(c, r), b = v(c + 1, r), d = v(c, r + 1), e = v(c + 1, r + 1);
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  const Nav = {
    get(mapId) {
      if (cache[mapId]) return cache[mapId];
      const cm = BH.Content.compile(mapId);
      const n = { mapId, cm, solids: [], zone: 'z_' + mapId, ok: false };
      if (cm.outdoor) {
        n.solids = campusSolids();
        n.cell = 32;
        n.cols = Math.ceil(cm.W / n.cell); n.rows = Math.ceil(cm.H / n.cell);
        n.walk = [];
        for (let r = 0; r < n.rows; r++) { n.walk.push([]); for (let c = 0; c < n.cols; c++) { const x = (c + 0.5) * n.cell, y = (r + 0.5) * n.cell; n.walk[r].push(!n.solids.some((s) => rectHit(x, y, s, 12))); } }
      } else {
        n.cell = cm.T; n.cols = cm.cols; n.rows = cm.rows; n.walk = cm.walk;
        n.solids = cm.solids.map((r) => Object.assign({}, r));
      }
      // navmesh (needs THREE + three-pathfinding; headless tests fall back to straight lines)
      if (window.THREE && window.Pathfinding) {
        try {
          pf = pf || new Pathfinding();
          const geo = buildGridMesh(n.cols, n.rows, n.cell, (c, r) => n.walk[r] && n.walk[r][c]);
          pf.setZoneData(n.zone, Pathfinding.createZone(geo));
          n.ok = true;
        } catch (e) { console.warn('navmesh failed for', mapId, e); }
      }
      cache[mapId] = n;
      return n;
    },

    walkableAt(n, x, y) {
      const c = Math.floor(x / n.cell), r = Math.floor(y / n.cell);
      return !!(n.walk[r] && n.walk[r][c]);
    },
    /* nearest walkable point (px) */
    nearestWalkable(n, p) {
      if (Nav.walkableAt(n, p.x, p.y)) return { x: p.x, y: p.y };
      const c0 = Math.floor(p.x / n.cell), r0 = Math.floor(p.y / n.cell);
      for (let rad = 1; rad < 12; rad++) {
        let best = null, bd = 1e9;
        for (let r = r0 - rad; r <= r0 + rad; r++) for (let c = c0 - rad; c <= c0 + rad; c++) {
          if (!(n.walk[r] && n.walk[r][c])) continue;
          const x = (c + 0.5) * n.cell, y = (r + 0.5) * n.cell, d = Math.hypot(x - p.x, y - p.y);
          if (d < bd) { bd = d; best = { x, y }; }
        }
        if (best) return best;
      }
      return { x: p.x, y: p.y };
    },

    /* path from a to b in px; the last point is the exact goal (even if it's on furniture, e.g. a seat) */
    path(mapId, a, b) {
      const n = Nav.get(mapId);
      const A = Nav.nearestWalkable(n, a), B = Nav.nearestWalkable(n, b);
      let pts = null;
      if (n.ok) {
        const V = (p) => new THREE.Vector3(p.x * S, 0, p.y * S);
        const group = pf.getGroup(n.zone, V(A));
        const res = pf.findPath(V(A), V(B), n.zone, group);
        if (res && res.length) pts = res.map((v) => ({ x: v.x / S, y: v.z / S }));
      }
      if (!pts) pts = [B];
      const last = pts[pts.length - 1];
      if (Math.hypot(last.x - b.x, last.y - b.y) > 2) pts.push({ x: b.x, y: b.y });
      return pts;
    },

    /* is the straight line a→b blocked by a tall solid (walls, buildings, tall furniture)? */
    losBlocked(mapId, a, b) {
      const n = Nav.get(mapId);
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16);
      const cm = n.cm;
      for (let i = 1; i < steps; i++) {
        const x = a.x + ((b.x - a.x) * i) / steps, y = a.y + ((b.y - a.y) * i) / steps;
        if (cm.outdoor) { if (n.solids.some((s) => s.tall && rectHit(x, y, s))) return true; }
        else {
          const d = cm.grid[Math.floor(y / cm.T)] && cm.grid[Math.floor(y / cm.T)][Math.floor(x / cm.T)];
          if (d && d.solid && (d.h || 0) >= 1) return true;
        }
      }
      return false;
    },

    /* push a circle (radius r px) out of solids — sliding collision for movement */
    resolve(mapId, p, r = 12) {
      const n = Nav.get(mapId);
      for (const s of n.solids) {
        const nx = Math.max(s.x, Math.min(p.x, s.x + s.w)), ny = Math.max(s.y, Math.min(p.y, s.y + s.h));
        const dx = p.x - nx, dy = p.y - ny, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = nx + (dx / d) * r; p.y = ny + (dy / d) * r; }
        else { // centre inside: push out along the shallowest axis
          const left = p.x - s.x, right = s.x + s.w - p.x, top = p.y - s.y, bottom = s.y + s.h - p.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) p.x = s.x - r; else if (m === right) p.x = s.x + s.w + r; else if (m === top) p.y = s.y - r; else p.y = s.y + s.h + r;
        }
      }
      return p;
    },
    reset() { Object.keys(cache).forEach((k) => delete cache[k]); },
  };

  BH.Nav = Nav;
})(window.BH);
