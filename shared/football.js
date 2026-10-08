/* Football on the school field — a small physics sim shared by the game server (multiplayer match) and the browser
   (offline match vs bots). Units: map pixels (40 px = 1 m), seconds.
   Players are the real avatars walking on the field (positions come from each player); bots fill the teams.
   Running into the ball dribbles it; a kick sends it where you face. Goals at both short ends of the field. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BHFootball = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  const BALL_R = 7, BODY_R = 13, KICK_R = 30, GOAL_W = 110, MAX_BALL = 560;
  const BOT_SPEED = 125;

  function create(field, opts = {}) {
    return {
      field, goalW: GOAL_W, length: opts.length || 180, time: opts.length || 180,
      ball: { x: field.x + field.w / 2, y: field.y + field.h / 2, vx: 0, vy: 0, z: 0, vz: 0 },
      players: {}, score: { red: 0, blue: 0 }, phase: 'kickoff', pause: 2.5, last: null, scorer: null, events: [], t: 0,
    };
  }
  const goals = (st) => {
    const f = st.field, cy = f.y + f.h / 2;
    return { red: { x: f.x, y1: cy - st.goalW / 2, y2: cy + st.goalW / 2 }, blue: { x: f.x + f.w, y1: cy - st.goalW / 2, y2: cy + st.goalW / 2 } };
  };
  // red defends the left goal (attacks right), blue defends the right goal
  const attackX = (st, team) => (team === 'red' ? st.field.x + st.field.w : st.field.x);

  function addPlayer(st, id, info = {}) {
    const n = { red: 0, blue: 0 };
    Object.values(st.players).forEach((p) => { if (!p.bot) n[p.team]++; });
    const team = info.team || (n.red <= n.blue ? 'red' : 'blue');
    const f = st.field;
    st.players[id] = { id, name: info.name || id, team, bot: !!info.bot, x: info.x ?? (team === 'red' ? f.x + f.w * 0.3 : f.x + f.w * 0.7), y: info.y ?? f.y + f.h / 2, vx: 0, vy: 0, goals: 0, role: info.role || 'att' };
    return st.players[id];
  }
  function removePlayer(st, id) { delete st.players[id]; }
  /* keep teams even with bots (min 2 a side) */
  function balance(st, minSide = 2) {
    const humans = (t) => Object.values(st.players).filter((p) => p.team === t && !p.bot).length;
    const bots = (t) => Object.values(st.players).filter((p) => p.team === t && p.bot);
    const want = Math.max(minSide, humans('red'), humans('blue'));
    ['red', 'blue'].forEach((t) => {
      let b = bots(t);
      while (humans(t) + b.length > want && b.length) { removePlayer(st, b.pop().id); b = bots(t); }
      let i = 0;
      while (humans(t) + bots(t).length < want) addPlayer(st, `bot-${t}-${i++}-${Math.floor(st.t * 10)}`, { team: t, bot: true, name: t === 'red' ? ['Emeka', 'Tunde', 'Musa'][i % 3] : ['Femi', 'Chidi', 'Sani'][i % 3], role: bots(t).length % 2 ? 'def' : 'att' });
    });
  }
  function setPlayer(st, id, p) { const q = st.players[id]; if (!q) return; const dt = 1 / 15; q.vx = (p.x - q.x) / dt; q.vy = (p.y - q.y) / dt; q.x = p.x; q.y = p.y; q.h = p.h; }

  function kick(st, id, k = {}) {
    const p = st.players[id];
    if (!p || st.phase !== 'play') return false;
    const b = st.ball;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d > KICK_R) return false;
    let dx = k.dx, dy = k.dy;
    if (!dx && !dy) { dx = b.x - p.x; dy = b.y - p.y; }
    const L = Math.hypot(dx, dy) || 1;
    const power = Math.max(0.25, Math.min(1, k.power ?? 0.7));
    b.vx = (dx / L) * MAX_BALL * power; b.vy = (dy / L) * MAX_BALL * power;
    b.vz = power > 0.75 ? 160 * power : 40; // a shot lifts the ball
    st.last = id;
    st.events.push({ k: 'kick', id, power });
    return true;
  }

  function resetKickoff(st) {
    const f = st.field;
    Object.assign(st.ball, { x: f.x + f.w / 2, y: f.y + f.h / 2, vx: 0, vy: 0, z: 0, vz: 0 });
    Object.values(st.players).forEach((p) => { if (p.bot) { p.x = p.team === 'red' ? f.x + f.w * (p.role === 'def' ? 0.15 : 0.35) : f.x + f.w * (p.role === 'def' ? 0.85 : 0.65); p.y = f.y + f.h / 2 + (p.role === 'def' ? 40 : -30); } });
    st.phase = 'kickoff'; st.pause = 2;
  }

  function botThink(st, p, dt) {
    const b = st.ball, f = st.field;
    const gx = attackX(st, p.team), gy = f.y + f.h / 2;
    const ownX = attackX(st, p.team === 'red' ? 'blue' : 'red');
    let tx, ty;
    const ballOnOurSide = Math.abs(b.x - ownX) < f.w / 2;
    if (p.role === 'def' && !ballOnOurSide) { tx = ownX + (p.team === 'red' ? 60 : -60); ty = gy + (b.y - gy) * 0.5; }
    else {
      // get behind the ball relative to the goal we attack, then push it
      const dx = gx - b.x, dy = gy - b.y, L = Math.hypot(dx, dy) || 1;
      tx = b.x - (dx / L) * 16; ty = b.y - (dy / L) * 16;
    }
    const mx = tx - p.x, my = ty - p.y, ml = Math.hypot(mx, my);
    const sp = ml > 4 ? BOT_SPEED : 0;
    p.vx = ml ? (mx / ml) * sp : 0; p.vy = ml ? (my / ml) * sp : 0;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.h = Math.atan2(p.vy, p.vx);
    // shoot when close and lined up
    p.cool = (p.cool || 0) - dt;
    if (p.cool <= 0 && Math.hypot(b.x - p.x, b.y - p.y) < KICK_R - 6) {
      const far = Math.abs(gx - b.x);
      p.cool = 0.8;
      kick(st, p.id, { dx: gx - b.x + (Math.random() - 0.5) * 60, dy: gy - b.y + (Math.random() - 0.5) * st.goalW, power: far < 160 ? 0.95 : 0.55 });
    }
  }

  function step(st, dt) {
    st.t += dt;
    st.events = [];
    if (st.phase === 'over') return st;
    if (st.phase === 'kickoff' || st.phase === 'goal') {
      st.pause -= dt;
      if (st.pause <= 0) { if (st.phase === 'goal') resetKickoff(st); else st.phase = 'play'; }
      if (st.phase !== 'play') return st;
    }
    st.time = Math.max(0, st.time - dt);
    if (st.time <= 0) { st.phase = 'over'; st.events.push({ k: 'over', score: st.score }); return st; }
    Object.values(st.players).forEach((p) => { if (p.bot) botThink(st, p, dt); });
    const b = st.ball, f = st.field;
    // bodies push the ball (dribbling)
    Object.values(st.players).forEach((p) => {
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
      if (d < BODY_R + BALL_R && b.z < 20) {
        const nx = dx / (d || 1), ny = dy / (d || 1);
        const push = Math.max(0, p.vx * nx + p.vy * ny);
        b.vx += nx * (push * 1.15 + 60); b.vy += ny * (push * 1.15 + 60);
        b.x = p.x + nx * (BODY_R + BALL_R); b.y = p.y + ny * (BODY_R + BALL_R);
        st.last = p.id;
      }
    });
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_BALL) { b.vx *= MAX_BALL / sp; b.vy *= MAX_BALL / sp; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.vz -= 600 * dt; b.z = Math.max(0, b.z + b.vz * dt); if (b.z === 0) b.vz = Math.abs(b.vz) > 60 ? -b.vz * 0.4 : 0;
    const fr = Math.exp(-(b.z > 0 ? 0.25 : 1.15) * dt);
    b.vx *= fr; b.vy *= fr;
    // goals
    const G = goals(st);
    if (b.x < f.x && b.y > G.red.y1 && b.y < G.red.y2) return scored(st, 'blue');
    if (b.x > f.x + f.w && b.y > G.blue.y1 && b.y < G.blue.y2) return scored(st, 'red');
    // walls
    if (b.x < f.x + BALL_R) { b.x = f.x + BALL_R; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x > f.x + f.w - BALL_R) { b.x = f.x + f.w - BALL_R; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.y < f.y + BALL_R) { b.y = f.y + BALL_R; b.vy = Math.abs(b.vy) * 0.6; }
    if (b.y > f.y + f.h - BALL_R) { b.y = f.y + f.h - BALL_R; b.vy = -Math.abs(b.vy) * 0.6; }
    return st;
  }
  function scored(st, team) {
    st.score[team]++;
    const p = st.players[st.last];
    const own = p && p.team !== team;
    if (p && !own) p.goals++;
    st.scorer = p ? { id: p.id, name: p.name, team, own } : { team };
    st.events.push({ k: 'goal', team, scorer: st.scorer });
    st.phase = 'goal'; st.pause = 2.5;
    return st;
  }
  /* compact snapshot for the network */
  function snap(st) {
    const b = st.ball;
    return { b: [Math.round(b.x), Math.round(b.y), Math.round(b.z)], p: Object.values(st.players).map((p) => [p.id, Math.round(p.x), Math.round(p.y), +(p.h || 0).toFixed(2), p.team, p.bot ? 1 : 0, p.name]), s: st.score, t: Math.ceil(st.time), ph: st.phase, sc: st.scorer };
  }

  return { create, addPlayer, removePlayer, balance, setPlayer, kick, step, snap, goals, KICK_R };
});
