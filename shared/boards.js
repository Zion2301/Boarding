/* Board games shared by the game server (online tables) and the browser (offline vs a bot).
   Every engine: create(players, seed) · move(g, id, mv) → { ok, why?, win? } · botMove(g, id) · view(g, id) · current(g)
   · Ayo (Ayo Olopon) — 2 players, 12 pits × 4 seeds; sow anticlockwise; landing in the opponent's row on 2 or 3 captures
     (and the pits before it, while they are 2 or 3). Starve your opponent and you must feed them if you can. 25+ wins.
   · Draughts — 8×8, men move diagonally forward, captures are compulsory (multi-jumps continue), reach the end → king.
   · Ludo — 2–4 players, roll a 6 to leave base, 52-square track + 6 home squares, land on a rival to send them home
     (star squares are safe), a 6 rolls again. First to bring all four tokens home wins. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BHBoards = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const base = (players) => ({ players: players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot })), turn: 0, winner: null, log: [], moves: 0 });
  const current = (g) => g.players[g.turn].id;
  const idx = (g, id) => g.players.findIndex((p) => p.id === id);
  const nameOf = (g, id) => (g.players[idx(g, id)] || {}).name || '?';
  const say = (g, t) => { g.log.push(t); if (g.log.length > 20) g.log.shift(); };

  /* ======================= AYO ======================= */
  const Ayo = {
    title: 'Ayo Olopon', seats: [2, 2],
    create(players, seed) { const g = base(players); g.pits = Array(12).fill(4); g.store = [0, 0]; say(g, 'Ayo! 4 seeds in every pit. Sow anticlockwise; capture 2s and 3s on the other side.'); return g; },
    // player 0 owns pits 0-5 (bottom, left→right), player 1 owns 6-11 (top, right→left): one anticlockwise ring
    own: (p, i) => (p === 0 ? i < 6 : i >= 6),
    legal(g, p) {
      const mine = [...Array(6)].map((_, k) => (p === 0 ? k : k + 6)).filter((i) => g.pits[i] > 0);
      const oppEmpty = g.pits.filter((n, i) => !Ayo.own(p, i)).every((n) => n === 0);
      if (!oppEmpty) return mine;
      // must feed a starving opponent if any move can
      const feeding = mine.filter((i) => { const n = g.pits[i]; const dist = p === 0 ? 6 - i : 12 - i; return n >= dist; });
      return feeding.length ? feeding : mine;
    },
    sim(g, p, i) {
      const pits = g.pits.slice(); let n = pits[i]; pits[i] = 0; let j = i;
      while (n > 0) { j = (j + 1) % 12; if (j === i) continue; pits[j]++; n--; }
      let got = 0;
      while (!Ayo.own(p, j) && (pits[j] === 2 || pits[j] === 3)) { got += pits[j]; pits[j] = 0; j = (j + 11) % 12; }
      return { pits, got };
    },
    move(g, id, mv) {
      if (g.winner) return { ok: false, why: 'Game over' };
      if (current(g) !== id) return { ok: false, why: 'Not your turn' };
      const p = g.turn, i = Number(mv.pit);
      if (!Ayo.legal(g, p).includes(i)) return { ok: false, why: 'You can\'t sow from that pit' };
      const { pits, got } = Ayo.sim(g, p, i);
      g.pits = pits; g.store[p] += got; g.moves++;
      say(g, `${nameOf(g, id)} sows ${i % 6 + 1}${got ? ` and captures ${got}! 🌰` : ''}`);
      if (g.store[p] >= 25) { g.winner = id; say(g, `🏆 ${nameOf(g, id)} wins ${g.store[p]}–${g.store[1 - p]}!`); return { ok: true, win: true }; }
      g.turn = 1 - p;
      if (!Ayo.legal(g, g.turn).length || g.moves > 300) {
        // no move left: each player keeps the seeds on their side
        g.pits.forEach((n, k) => { g.store[k < 6 ? 0 : 1] += n; g.pits[k] = 0; });
        const w = g.store[0] === g.store[1] ? null : g.store[0] > g.store[1] ? 0 : 1;
        g.winner = w === null ? 'draw' : g.players[w].id;
        say(g, w === null ? '🤝 Draw!' : `🏆 ${g.players[w].name} wins ${g.store[w]}–${g.store[1 - w]}!`);
      }
      return { ok: true, win: g.winner === id };
    },
    botMove(g) { const p = g.turn; const L = Ayo.legal(g, p); let best = L[0], bs = -1; L.forEach((i) => { const { got } = Ayo.sim(g, p, i); const sc = got * 10 + Math.random(); if (sc > bs) { bs = sc; best = i; } }); return { pit: best }; },
    view(g, id) { return { kind: 'ayo', players: g.players, pits: g.pits, store: g.store, turn: current(g), me: idx(g, id), legal: current(g) === id ? Ayo.legal(g, g.turn) : [], winner: g.winner, log: g.log.slice(-4) }; },
  };

  /* ======================= DRAUGHTS ======================= */
  const Draughts = {
    title: 'Draughts', seats: [2, 2],
    create(players) {
      const g = base(players);
      // board[r][c]: 0 empty · 1/2 men of player 0/1 · 3/4 kings. Player 0 at the bottom (rows 5-7), moves up.
      g.board = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => ((r + c) % 2 === 1 ? (r < 3 ? 2 : r > 4 ? 1 : 0) : 0)));
      g.chain = null; say(g, 'Draughts! Captures are compulsory. Reach the far side to crown a king.');
      return g;
    },
    owner: (v) => (v === 1 || v === 3 ? 0 : v === 2 || v === 4 ? 1 : -1),
    king: (v) => v >= 3,
    steps(g, r, c) {
      const v = g.board[r][c], p = Draughts.owner(v);
      const dirs = Draughts.king(v) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : p === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
      const caps = [], moves = [];
      const inb = (a, b) => a >= 0 && a < 8 && b >= 0 && b < 8;
      dirs.forEach(([dr, dc]) => {
        const r1 = r + dr, c1 = c + dc;
        if (!inb(r1, c1)) return;
        if (g.board[r1][c1] === 0) moves.push({ from: [r, c], to: [r1, c1] });
        else if (Draughts.owner(g.board[r1][c1]) === 1 - p && inb(r1 + dr, c1 + dc) && g.board[r1 + dr][c1 + dc] === 0) caps.push({ from: [r, c], to: [r1 + dr, c1 + dc], cap: [r1, c1] });
      });
      return { caps, moves };
    },
    legal(g, p) {
      if (g.chain) return Draughts.steps(g, g.chain[0], g.chain[1]).caps;
      let caps = [], moves = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (Draughts.owner(g.board[r][c]) === p) { const s = Draughts.steps(g, r, c); caps = caps.concat(s.caps); moves = moves.concat(s.moves); }
      return caps.length ? caps : moves;
    },
    move(g, id, mv) {
      if (g.winner) return { ok: false, why: 'Game over' };
      if (current(g) !== id) return { ok: false, why: 'Not your turn' };
      const p = g.turn;
      const L = Draughts.legal(g, p);
      const m = L.find((x) => x.from[0] === mv.from[0] && x.from[1] === mv.from[1] && x.to[0] === mv.to[0] && x.to[1] === mv.to[1]);
      if (!m) return { ok: false, why: L.some((x) => x.cap) ? 'You must capture!' : 'Not a legal move' };
      const v = g.board[m.from[0]][m.from[1]];
      g.board[m.from[0]][m.from[1]] = 0;
      let nv = v;
      if ((p === 0 && m.to[0] === 0) || (p === 1 && m.to[0] === 7)) nv = p === 0 ? 3 : 4;
      g.board[m.to[0]][m.to[1]] = nv;
      g.moves++;
      if (m.cap) {
        g.board[m.cap[0]][m.cap[1]] = 0;
        // keep jumping with the same piece if possible (and it wasn't just crowned)
        g.chain = [m.to[0], m.to[1]];
        if (nv === v && Draughts.steps(g, m.to[0], m.to[1]).caps.length) { say(g, `${nameOf(g, id)} captures… and can jump again!`); return { ok: true }; }
        say(g, `${nameOf(g, id)} captures! ✂️`);
      } else say(g, `${nameOf(g, id)} moves.`);
      if (nv !== v) say(g, `👑 ${nameOf(g, id)} gets a king!`);
      g.chain = null;
      g.turn = 1 - p;
      if (!Draughts.legal(g, g.turn).length || g.moves > 400) { g.winner = g.moves > 400 ? 'draw' : id; say(g, g.winner === 'draw' ? '🤝 Draw.' : `🏆 ${nameOf(g, id)} wins!`); return { ok: true, win: g.winner === id }; }
      return { ok: true };
    },
    botMove(g) {
      const L = Draughts.legal(g, g.turn);
      const sc = (m) => (m.cap ? 10 : 0) + ((g.turn === 0 && m.to[0] === 0) || (g.turn === 1 && m.to[0] === 7) ? 5 : 0) + Math.random();
      const m = L.slice().sort((a, b) => sc(b) - sc(a))[0];
      return { from: m.from, to: m.to };
    },
    view(g, id) { return { kind: 'draughts', players: g.players, board: g.board, turn: current(g), me: idx(g, id), legal: current(g) === id ? Draughts.legal(g, g.turn).map((m) => ({ from: m.from, to: m.to, cap: !!m.cap })) : [], chain: g.chain, winner: g.winner, log: g.log.slice(-4) }; },
  };

  /* ======================= LUDO ======================= */
  const START = [0, 13, 26, 39], SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
  const Ludo = {
    title: 'Ludo', seats: [2, 4],
    create(players, seed) {
      const g = base(players);
      g.tok = players.map(() => [-1, -1, -1, -1]); // -1 base · 0..50 track (relative) · 51..56 home column · 57 home
      g.dice = null; g.rolled = false; g.seed = seed; g.r = 0;
      say(g, 'Ludo! Roll a 6 to bring a token out. Land on a rival to send them home.');
      return g;
    },
    abs: (p, rel) => (START[p] + rel) % 52,
    legal(g, p) {
      if (!g.rolled) return [];
      const d = g.dice;
      return g.tok[p].map((t, k) => (t === -1 ? (d === 6 ? k : -1) : t + d <= 57 ? k : -1)).filter((k) => k >= 0);
    },
    move(g, id, mv) {
      if (g.winner) return { ok: false, why: 'Game over' };
      if (current(g) !== id) return { ok: false, why: 'Not your turn' };
      const p = g.turn;
      if (mv.type === 'roll') {
        if (g.rolled) return { ok: false, why: 'Move a token first' };
        g.dice = 1 + Math.floor(rng(g.seed + (g.r++) * 7919)() * 6); g.rolled = true;
        say(g, `${nameOf(g, id)} rolls ${['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][g.dice]} ${g.dice}`);
        if (!Ludo.legal(g, p).length) { say(g, 'No move.'); Ludo.pass(g, false); }
        return { ok: true };
      }
      const k = Number(mv.token);
      if (!Ludo.legal(g, p).includes(k)) return { ok: false, why: 'That token can\'t move' };
      const t = g.tok[p][k];
      const nt = t === -1 ? 0 : t + g.dice;
      g.tok[p][k] = nt;
      let bonus = g.dice === 6;
      if (nt <= 50) {
        const a = Ludo.abs(p, nt);
        if (!SAFE.includes(a)) g.tok.forEach((ts, q) => { if (q === p) return; ts.forEach((u, j) => { if (u >= 0 && u <= 50 && Ludo.abs(q, u) === a) { ts[j] = -1; bonus = true; say(g, `💥 ${nameOf(g, id)} sends ${g.players[q].name}'s token home!`); } }); });
      }
      if (nt === 57) { say(g, `🏠 ${nameOf(g, id)} brings a token home!`); bonus = true; }
      if (g.tok[p].every((u) => u === 57)) { g.winner = id; say(g, `🏆 ${nameOf(g, id)} wins Ludo!`); return { ok: true, win: true }; }
      Ludo.pass(g, bonus);
      return { ok: true };
    },
    pass(g, again) { g.rolled = false; g.dice = again ? g.dice : null; if (!again) g.turn = (g.turn + 1) % g.players.length; g.moves++; if (g.moves > 900) { g.winner = 'draw'; } },
    botMove(g) {
      const p = g.turn;
      if (!g.rolled) return { type: 'roll' };
      const L = Ludo.legal(g, p);
      const sc = (k) => { const t = g.tok[p][k]; const nt = t === -1 ? 0 : t + g.dice; let v = Math.random(); if (t === -1) v += 6; if (nt === 57) v += 8; if (nt <= 50) { const a = Ludo.abs(p, nt); g.tok.forEach((ts, q) => { if (q !== p) ts.forEach((u) => { if (u >= 0 && u <= 50 && Ludo.abs(q, u) === a && !SAFE.includes(a)) v += 10; }); }); } return v + nt / 60; };
      return { type: 'move', token: L.sort((a, b) => sc(b) - sc(a))[0] };
    },
    view(g, id) { return { kind: 'ludo', players: g.players, tok: g.tok, dice: g.dice, rolled: g.rolled, turn: current(g), me: idx(g, id), legal: current(g) === id ? Ludo.legal(g, g.turn) : [], winner: g.winner, log: g.log.slice(-4), START, SAFE }; },
  };

  const ENGINES = { ayo: Ayo, draughts: Draughts, ludo: Ludo };
  return { ENGINES, current, Ayo, Draughts, Ludo };
});
