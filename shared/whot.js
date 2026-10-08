/* Last Card — the Nigerian card game. Pure rules engine shared by the game server (multiplayer tables) and the
   browser (offline table vs bots). No I/O; state is plain JSON.
   Deck (54): circle & triangle 1-5,7,8,10-14 · cross & square 1,2,3,5,7,10,11,13,14 · star 1-5,7,8 · 5× WHOT 20.
   Play a card that matches the top card's shape or number (WHOT 20 goes on anything and requests a shape).
   1 Hold On (play again) · 2 Pick Two · 5 Pick Three · 8 Suspension (next player skips) · 14 General Market
   (everyone else picks one) · 20 Whot (choose the shape). Can't play? Go to market (pick one, turn ends).
   Pick Two / Pick Three can be defended with the same number (the penalty stacks onto the next player).
   First to empty their hand wins; say "Last card!" when you have one left (forget and you pick two). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BHWhot = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];
  const ICON = { circle: '●', triangle: '▲', cross: '✚', square: '■', star: '★', whot: 'W' };
  const NUMBERS = {
    circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
    triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
    cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
    square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
    star: [1, 2, 3, 4, 5, 7, 8],
  };
  const HAND = 5;

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function deck() {
    const d = [];
    SHAPES.forEach((sh) => NUMBERS[sh].forEach((n) => d.push({ s: sh, n })));
    for (let i = 0; i < 5; i++) d.push({ s: 'whot', n: 20 });
    return d;
  }
  const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const label = (c) => (c.s === 'whot' ? 'WILD 20' : `${ICON[c.s]} ${c.n}`);
  const SPECIAL = { 1: 'Hold on!', 2: 'Pick two!', 5: 'Pick three!', 8: 'Suspension!', 14: 'General market!', 20: 'WILD!' };

  /* players: [{ id, name, bot }] */
  function create(players, seed = Date.now()) {
    const r = rng(seed);
    const d = shuffle(deck(), r);
    const hands = {};
    players.forEach((p) => { hands[p.id] = d.splice(0, HAND); });
    // the first top card must not be a special card
    let i = d.findIndex((c) => !SPECIAL[c.n]);
    const top = d.splice(i, 1)[0];
    return { seed, players: players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot })), hands, market: d, pile: [top], turn: 0, dir: 1, want: null, pending: 0, pendingN: 0, lastCard: {}, winner: null, log: [`Game start! Top card: ${label(top)}`], moves: 0 };
  }
  const top = (g) => g.pile[g.pile.length - 1];
  const current = (g) => g.players[g.turn].id;
  const nextIdx = (g, k = 1) => (g.turn + g.dir * k + g.players.length * 4) % g.players.length;
  const name = (g, id) => (g.players.find((p) => p.id === id) || {}).name || id;

  function draw(g, id, n) {
    const got = [];
    for (let i = 0; i < n; i++) {
      if (!g.market.length) { // reshuffle the pile into the market
        const t = g.pile.pop();
        g.market = shuffle(g.pile, rng(g.seed + g.moves));
        g.pile = [t];
        if (!g.market.length) break;
      }
      const c = g.market.pop();
      g.hands[id].push(c);
      got.push(c);
    }
    return got;
  }

  /* can this card go on the table now? */
  function canPlay(g, c) {
    const t = top(g);
    if (g.pending) return c.n === g.pendingN; // defend a pick-two/three with the same number
    if (c.s === 'whot') return true;
    if (g.want) return c.s === g.want;
    return c.s === t.s || c.n === t.n;
  }
  const playable = (g, id) => (g.hands[id] || []).map((c, i) => (canPlay(g, c) ? i : -1)).filter((i) => i >= 0);

  /* a move: { type: 'play', index, want? } | { type: 'market' } | { type: 'lastCard' } */
  function move(g, id, mv) {
    if (g.winner) return { ok: false, why: 'Game over' };
    if (mv.type === 'lastCard') { if (g.hands[id] && g.hands[id].length <= 2) { g.lastCard[id] = true; g.log.push(`${name(g, id)}: "Last card!" 🗣️`); } return { ok: true }; }
    if (current(g) !== id) return { ok: false, why: 'Not your turn' };
    g.moves++;
    if (g.moves > 260) { // market don finish & nobody fit play — count your cards, fewest wins
      const best = g.players.slice().sort((a, b) => g.hands[a.id].length - g.hands[b.id].length)[0];
      g.winner = best.id; g.log.push(`⏱ Too long! Count cards — ${best.name} has the fewest and wins.`);
      return { ok: true, win: best.id === id };
    }
    if (mv.type === 'market') {
      if (g.pending) {
        const got = draw(g, id, g.pending);
        g.log.push(`${name(g, id)} picks ${got.length} 😩`);
        g.pending = 0; g.pendingN = 0;
      } else {
        draw(g, id, 1);
        g.log.push(`${name(g, id)} goes to market 🛒`);
      }
      g.lastCard[id] = false;
      g.turn = nextIdx(g);
      return { ok: true };
    }
    const hand = g.hands[id];
    const c = hand[mv.index];
    if (!c || !canPlay(g, c)) return { ok: false, why: 'You can\'t play that card' };
    hand.splice(mv.index, 1);
    g.pile.push(c);
    g.want = null;
    let txt = `${name(g, id)} plays ${label(c)}`;
    let step = 1;
    if (c.n === 1) { step = 0; txt += ' — Hold on! ✋'; }
    else if (c.n === 2 || c.n === 5) { g.pending += c.n === 2 ? 2 : 3; g.pendingN = c.n; txt += ` — ${c.n === 2 ? 'Pick two' : 'Pick three'}! (${g.pending})`; }
    else if (c.n === 8) { step = 2; txt += ' — Suspension! ⛔'; }
    else if (c.n === 14) { g.players.forEach((p) => { if (p.id !== id) draw(g, p.id, 1); }); txt += ' — General market! Everybody pick one 🛒'; }
    else if (c.n === 20) { g.want = SHAPES.includes(mv.want) ? mv.want : SHAPES[0]; txt += ` — I need ${ICON[g.want]} ${g.want.toUpperCase()}!`; }
    g.log.push(txt);
    if (g.log.length > 30) g.log.shift();
    if (!hand.length) {
      g.winner = id;
      g.log.push(`🏆 ${name(g, id)} CHECK UP! Wins the game!`);
      return { ok: true, win: true };
    }
    // one card left and they didn't say "Last card!" → caught, pick two
    if (hand.length === 1 && !g.lastCard[id]) { draw(g, id, 2); g.log.push(`${name(g, id)} forgot to say "Last card!" — pick two 😂`); }
    if (hand.length > 1) g.lastCard[id] = false;
    g.turn = nextIdx(g, step);
    return { ok: true };
  }

  /* a simple bot: defend, then specials, then match; prefers its most common shape for WHOT */
  function botMove(g, id) {
    const hand = g.hands[id];
    const can = playable(g, id);
    if (hand.length === 2 && can.length && !g.lastCard[id]) move(g, id, { type: 'lastCard' });
    if (!can.length) return { type: 'market' };
    const score = (i) => { const c = hand[i]; return (c.n === 20 ? -5 : 0) + ([2, 5, 8, 14, 1].includes(c.n) ? 3 : 0) + c.n / 100; };
    const index = can.sort((a, b) => score(b) - score(a))[0];
    let want;
    if (hand[index].n === 20) {
      const counts = {};
      hand.forEach((c, i) => { if (i !== index && c.s !== 'whot') counts[c.s] = (counts[c.s] || 0) + 1; });
      want = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 'circle';
    }
    return { type: 'play', index, want };
  }

  /* what one player may see (their own hand, everyone's card counts) */
  function view(g, id) {
    return {
      players: g.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot, cards: (g.hands[p.id] || []).length, lastCard: !!g.lastCard[p.id] })),
      hand: g.hands[id] || [], top: top(g), market: g.market.length, turn: current(g), want: g.want, pending: g.pending,
      winner: g.winner, log: g.log.slice(-6), playable: current(g) === id ? playable(g, id) : [],
    };
  }

  return { SHAPES, ICON, create, move, botMove, view, label, canPlay, playable, current, SPECIAL };
});
