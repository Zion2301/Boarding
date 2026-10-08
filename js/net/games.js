/* Free-time minigames you can join from anywhere (🎲 button, or a friend's invite):
   · Last Card — 2–4 players at a table; bots fill empty seats. Online: Colyseus 'whot' room (server deals, hands
     stay private). Offline: the same rules engine (shared/whot.js) runs here against bots.
   · Football — the match on the school field. Walk onto the field, run into the ball to dribble, ⚽ pass / 🥅 shoot
     (Space / F). Online: Colyseus 'football' room (server physics, bots balance teams). Offline: shared/football.js.
   Quick (2–5 min) and rewarding: money, morale, reputation. */
(function (BH) {
  const U = BH.U;
  const W = () => window.BHWhot;
  const F = () => window.BHFootball;
  const N = () => BH.Net;
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast(t, k);
  const SHAPE_NAME = { circle: 'Circle', triangle: 'Triangle', cross: 'Cross', square: 'Square', star: 'Star' };

  /* ================= Last Card ================= */
  const whot = {
    room: null, offline: null, view: null, info: null, pendingWhot: null,

    async create(opts = {}) {
      const s = BH.Game.s;
      const net = N();
      if (net && net.online) {
        try {
          whot.bind(await net.client.create('whot', { token: BH.Account && BH.Account.token, pid: s.player.playerId, name: s.player.name.split(' ')[0], seats: opts.seats || 4, title: `${s.player.name.split(' ')[0]}'s table`, map: s.world.map }));
          if (opts.invite) net.send('invite', { to: opts.invite, kind: 'whot', roomId: whot.room.roomId, title: `${s.player.name.split(' ')[0]}'s table` });
          whot.open();
          return;
        } catch (e) { toast('Could not open a table online — playing against bots.', 'info'); }
      }
      whot.startOffline(opts.seats || 3);
    },
    async join(roomId) {
      const s = BH.Game.s;
      try { whot.bind(await N().client.joinById(roomId, { token: BH.Account && BH.Account.token, pid: s.player.playerId, name: s.player.name.split(' ')[0] })); whot.open(); }
      catch (e) { toast('That table is full or already playing.', 'bad'); }
    },
    bind(room) {
      whot.leave(true);
      whot.room = room;
      room.onMessage('table', (t) => { whot.info = t; whot.view = t.game; BH.Panels.refresh(); });
      room.onMessage('end', (e) => whot.ended(e.winner, e.name));
      room.onMessage('err', (e) => toast(e.why, 'bad'));
      room.onMessage('chat', (c) => toast(`🃏 ${c.name}: ${c.text}`, 'info'));
      room.onLeave(() => { if (whot.room === room) { whot.room = null; whot.view = null; BH.Panels.refresh(); } });
      room.send('ready');
    },
    /* offline table: your classmates play (pass NPCs to sit them at the table), otherwise whoever is around */
    startOffline(n, npcs) {
      const s = BH.Game.s;
      whot.leave(true);
      const pool = (npcs || []).slice();
      // fill seats with classmates who are nearby, else your closest coursemates
      const near = BH.World.nearbyNpcs ? BH.World.nearbyNpcs(260).filter((x) => x && ['classmate', 'senior', 'junior'].includes(x.type)) : [];
      const close = BH.NPC.students(s).slice().sort((a, b) => b.rel - a.rel);
      [...near, ...close].forEach((x) => { if (pool.length < n - 1 && !pool.includes(x)) pool.push(x); });
      const players = [{ id: 'me', name: s.player.name.split(' ')[0] }];
      pool.slice(0, n - 1).forEach((x) => players.push({ id: x.id, name: x.first, bot: true }));
      for (let i = players.length; i < n; i++) players.push({ id: 'bot' + i, name: ['Chioma', 'Musa', 'Tunde'][i % 3], bot: true });
      whot.with = pool.slice(0, n - 1).map((x) => x.id);
      whot.offline = W().create(players, Date.now());
      whot.info = { title: `Last Card with ${players.slice(1).map((p) => p.name).join(' & ')}`, humans: [players[0].name], seats: n, you: 'me' };
      whot.sync();
      whot.open();
    },
    sync() {
      const g = whot.offline;
      if (!g) return;
      whot.view = W().view(g, 'me');
      BH.Panels.refresh();
      if (g.winner) return whot.ended(g.winner, (g.players.find((p) => p.id === g.winner) || {}).name);
      const cur = g.players[g.turn];
      if (cur.bot) setTimeout(() => { if (whot.offline !== g || g.winner) return; W().move(g, cur.id, W().botMove(g, cur.id)); whot.sync(); }, 800 + Math.random() * 600);
    },
    move(mv) {
      if (whot.room) return whot.room.send('move', mv);
      if (!whot.offline) return;
      const r = W().move(whot.offline, 'me', mv);
      if (!r.ok) toast(r.why, 'bad');
      whot.sync();
    },
    myId() { return whot.offline ? 'me' : whot.info && whot.info.you; },
    ended(winner, name) {
      const s = BH.Game.s;
      const won = winner === whot.myId();
      const others = whot.view ? whot.view.players.filter((p) => !p.bot).length : 1;
      if (won) { const prize = 60 + 40 * Math.max(0, others - 1); BH.Stats.money(s, prize); BH.Stats.change(s, { morale: 8 }); BH.Stats.rep(s, 2); toast(`🏆 CHECK UP! You win the Last Card game! +${U.money(prize)} · morale ↑ · clout ↑`, 'good'); }
      else { BH.Stats.change(s, { morale: 3 }); toast(`🃏 ${name} won this round. Rematch?`, 'info'); }
      BH.bus.emit('minigame', { kind: 'whot', won, with: whot.offline ? whot.with || [] : [] });
      BH.Paths && BH.Paths.add(s, 'popular', 1);
      BH.Panels.refresh();
    },
    leave(silent) {
      if (whot.room) try { whot.room.leave(true); } catch (e) { /* closed */ }
      whot.room = null; whot.offline = null; whot.view = null; whot.info = null;
      if (!silent) BH.Panels.closeKind('whot', true);
    },
    card(c, i, playable) {
      const sym = c.s === 'whot' ? 'WILD' : W().ICON[c.s];
      return `<button class="wcard ${c.s} ${playable ? 'ok' : ''}" ${i !== null ? `data-act="whotPlay" data-arg="${i}"` : 'disabled'}><i>${c.n}</i><b>${sym}</b><i class="br">${c.n}</i></button>`;
    },
    open() {
      BH.Panels.open(() => {
        const v = whot.view, info = whot.info || {};
        if (!v) {
          return `<h2>🃏 ${U.esc(info.title || 'Last Card')}</h2>
            <p>At the table: ${(info.humans || []).map(U.esc).join(', ') || '—'} <small class="muted">(${info.seats || 4} seats — bots fill the rest)</small></p>
            <p class="muted">Rules: match the shape or number. 1 Hold on · 2 Pick two · 5 Pick three · 8 Suspension · 14 General market · 20 WILD (choose a shape). Say “Last card!” or pick two.</p>
            <div class="grid-btns"><button class="chunky primary" data-act="whotStart">▶ Deal cards</button><button class="chunky" data-act="whotInvite">📣 Invite a friend</button><button class="chunky ghost" data-act="whotLeave">Leave table</button></div>`;
        }
        const me = whot.myId();
        const turnName = (v.players.find((p) => p.id === v.turn) || {}).name;
        const mine = v.turn === me;
        return `<div class="whot">
          <div class="w-opps">${v.players.filter((p) => p.id !== me).map((p) => `<div class="w-opp ${p.id === v.turn ? 'turn' : ''}"><b>${U.esc(p.name)}</b><span>${'🂠'.repeat(Math.min(p.cards, 8))} ${p.cards}</span>${p.lastCard ? '<em>Last card!</em>' : ''}</div>`).join('')}</div>
          <div class="w-table">
            <div class="w-market"><button class="wcard back" data-act="whotMarket" ${mine ? '' : 'disabled'}>🛒<br><small>Market (${v.market})</small></button></div>
            <div class="w-top">${whot.card(v.top, null)}${v.want ? `<div class="w-want">Need: ${W().ICON[v.want]} ${SHAPE_NAME[v.want]}</div>` : ''}${v.pending ? `<div class="w-want bad">Pick ${v.pending}! (defend with a ${v.pending % 3 === 0 && v.pending >= 3 ? 5 : 2})</div>` : ''}</div>
          </div>
          <div class="w-status ${mine ? 'me' : ''}">${v.winner ? `🏆 ${U.esc((v.players.find((p) => p.id === v.winner) || {}).name)} wins!` : mine ? '👉🏾 Your turn!' : `${U.esc(turnName)} is thinking…`}</div>
          <div class="w-hand">${v.hand.map((c, i) => whot.card(c, mine ? i : null, v.playable.includes(i))).join('')}</div>
          ${whot.pendingWhot !== null ? `<div class="w-shapes"><b>Choose a shape:</b> ${Object.keys(SHAPE_NAME).map((sh) => `<button class="chunky small" data-act="whotWant" data-arg="${sh}">${W().ICON[sh]} ${SHAPE_NAME[sh]}</button>`).join('')}</div>` : ''}
          <div class="w-actions"><button class="chunky small" data-act="whotLast">🗣️ Last card!</button>${v.winner ? '<button class="chunky small primary" data-act="whotStart">🔁 Rematch</button>' : ''}<button class="chunky small ghost" data-act="whotLeave">Leave</button></div>
          <div class="w-log">${v.log.slice(-4).map((l) => `<p>${U.esc(l)}</p>`).join('')}</div>
        </div>`;
      }, { cls: 'sheet', kind: 'whot', onClose: () => {} });
    },
  };

  /* ================= Football ================= */
  const football = {
    room: null, offline: null, snap: null, team: null, field: null, goalW: 110, sendAcc: 0, meshes: null, root: null, myGoals: 0,

    fieldRect() { const L = BH.data.CAMPUS.LOCATIONS.field; return { x: L.x, y: L.y, w: L.w, h: L.h }; },
    active() { return !!(football.room || football.offline); },
    async join() {
      const s = BH.Game.s;
      football.leave(true);
      football.field = football.fieldRect();
      const pl = BH.Actors.player();
      const net = N();
      if (net && net.online) {
        try {
          const room = await net.client.joinOrCreate('football', { token: BH.Account && BH.Account.token, pid: s.player.playerId, name: s.player.name.split(' ')[0], x: pl && pl.x, y: pl && pl.y, field: football.field });
          football.room = room;
          room.onMessage('team', (t) => { football.team = t.team; football.field = t.field; football.goalW = t.goalW; toast(`⚽ You're on ${t.team === 'red' ? '🔴 RED' : '🔵 BLUE'}. Go to the field! Run into the ball to dribble · Space = pass · F = shoot`, 'good'); });
          room.onMessage('fb', (sn) => { football.snap = sn; });
          room.onMessage('goal', (e) => football.goal(e));
          room.onMessage('over', (e) => football.over(e.score));
          room.onMessage('newMatch', () => toast('⚽ New match! Kick-off soon.', 'info'));
          room.onLeave(() => { if (football.room === room) football.leave(true); });
        } catch (e) { toast('Could not join the match online — playing with bots.', 'info'); football.startOffline(); }
      } else football.startOffline();
      BH.Panels.closeAll && BH.Panels.closeAll();
      if (s.world.map !== 'campus' || !football.onField()) N() && (N().waypoint = { map: 'campus', x: football.field.x + football.field.w / 2, y: football.field.y + football.field.h / 2, until: Date.now() + 90000 });
    },
    startOffline() {
      const s = BH.Game.s;
      const st = F().create(football.field, { length: 150 });
      const pl = BH.Actors.player();
      F().addPlayer(st, 'me', { name: s.player.name.split(' ')[0], team: 'red', x: pl ? pl.x : undefined, y: pl ? pl.y : undefined });
      F().balance(st, 3);
      football.offline = st; football.team = 'red';
      toast('⚽ Match vs bots! You\'re 🔴 RED (attack the right goal). Run into the ball to dribble · Space = pass · F = shoot', 'good');
    },
    onField() { const pl = BH.Actors.player(), f = football.field; return pl && BH.Sim.mapId === 'campus' && pl.x > f.x - 30 && pl.x < f.x + f.w + 30 && pl.y > f.y - 30 && pl.y < f.y + f.h + 30; },
    kick(power) {
      const pl = BH.Actors.player();
      if (!pl) return;
      const dx = Math.cos(pl.h), dy = Math.sin(pl.h);
      if (football.room) football.room.send('kick', { dx, dy, power });
      else if (football.offline) F().kick(football.offline, 'me', { dx, dy, power });
      pl.emote = { anim: 'cheer', until: performance.now() + 350 };
    },
    nearBall() {
      const b = football.ballPos(); const pl = BH.Actors.player();
      return b && pl && BH.Sim.mapId === 'campus' && Math.hypot(b.x - pl.x, b.y - pl.y) < F().KICK_R + 6;
    },
    ballPos() {
      if (football.offline) return football.offline.ball;
      const b = football.snap && football.snap.b;
      return b ? { x: b[0], y: b[1], z: b[2] } : null;
    },
    goal(e) {
      const s = BH.Game.s;
      const mine = e.scorer && (e.scorer.id === 'me' || (football.room && e.scorer.id === football.room.sessionId));
      const ours = e.team === football.team;
      if (mine && !e.scorer.own) { football.myGoals++; BH.Stats.money(s, 50); BH.Stats.rep(s, 1); }
      toast(`⚽ GOOOAL! ${e.scorer && e.scorer.name ? e.scorer.name : ''}${e.scorer && e.scorer.own ? ' (own goal 😂)' : ''} — ${e.team === 'red' ? '🔴 RED' : '🔵 BLUE'} scores!${mine ? ' +₦50' : ''}`, ours ? 'good' : 'info');
      const pl = BH.Actors.player(); if (pl && ours) pl.emote = { anim: 'cheer', until: performance.now() + 2500 };
    },
    over(score) {
      const s = BH.Game.s;
      const us = score[football.team], them = score[football.team === 'red' ? 'blue' : 'red'];
      if (us > them) { BH.Stats.change(s, { morale: 10, rest: -6 }); BH.Stats.rep(s, 3); BH.Stats.money(s, 100); toast(`🏆 FULL TIME ${score.red}–${score.blue}. Your team WINS! +₦100 · morale ↑ · clout ↑`, 'good'); }
      else if (us === them) { BH.Stats.change(s, { morale: 5, rest: -6 }); BH.Stats.rep(s, 1); toast(`🤝 FULL TIME ${score.red}–${score.blue}. Draw!`, 'info'); }
      else { BH.Stats.change(s, { morale: 2, rest: -6 }); toast(`😤 FULL TIME ${score.red}–${score.blue}. Una lose. Rematch?`, 'info'); }
      BH.Paths && BH.Paths.add(s, 'sports', 2);
      BH.bus.emit('minigame', { kind: 'football', won: us > them });
      if (football.offline) setTimeout(() => football.leave(), 4000);
    },
    leave(silent) {
      if (football.room) try { football.room.leave(true); } catch (e) { /* closed */ }
      football.room = null; football.offline = null; football.snap = null; football.myGoals = 0;
      football.clearActors();
      if (football.meshes) { football.meshes.ball.visible = false; }
      if (!silent) toast('⚽ You left the match.', 'info');
    },
    clearActors() { [...BH.Actors.list.keys()].filter((k) => k.startsWith('fb:')).forEach((k) => BH.Actors.remove(k)); },

    /* every frame */
    update(dt) {
      if (!football.active()) return;
      const pl = BH.Actors.player();
      let snap;
      if (football.offline) {
        const st = football.offline;
        if (pl && BH.Sim.mapId === 'campus') F().setPlayer(st, 'me', { x: pl.x, y: pl.y, h: pl.h });
        F().step(st, Math.min(dt, 0.05));
        st.events.forEach((e) => { if (e.k === 'goal') football.goal(e); if (e.k === 'over') football.over(st.score); });
        snap = F().snap(st);
      } else {
        snap = football.snap;
        football.sendAcc += dt;
        if (pl && football.sendAcc > 0.066 && BH.Sim.mapId === 'campus') { football.sendAcc = 0; football.room.send('p', { x: Math.round(pl.x), y: Math.round(pl.y), h: +pl.h.toFixed(2) }); }
      }
      football.snapNow = snap;
      football.render(snap);
    },
    /* bots as actors, the ball and the goals as meshes, the scoreboard */
    render(snap) {
      if (!snap) return;
      const E = BH.Engine3D;
      const seen = new Set();
      snap.p.forEach(([id, x, y, h, team, bot, name]) => {
        if (!bot) return;
        const aid = 'fb:' + id;
        seen.add(aid);
        let a = BH.Actors.get(aid);
        if (!a) a = BH.Actors.make(aid, { kind: 'fb', map: 'campus', x, y, h, team, name, gender: 'm' });
        const sp = Math.hypot(x - a.x, y - a.y) / 0.066;
        a.x += (x - a.x) * 0.5; a.y += (y - a.y) * 0.5; a.h = h; a.speed = Math.min(160, sp); a.anim = sp > 100 ? 'run' : sp > 6 ? 'walk' : 'idle'; a.team = team;
      });
      [...BH.Actors.list.keys()].filter((k) => k.startsWith('fb:') && !seen.has(k)).forEach((k) => BH.Actors.remove(k));
      if (E && E.mapRoot && BH.Sim.mapId === 'campus') {
        if (!football.meshes || football.meshes.parent !== E.mapRoot) football.build(E);
        const S = E.S, b = snap.b;
        football.meshes.ball.visible = true;
        football.meshes.ball.position.set(b[0] * S, 0.2 + b[2] * S, b[1] * S);
        football.meshes.ball.rotation.x += 0.1; football.meshes.ball.rotation.z += 0.07;
      }
      const el = document.getElementById('hud-score') || (() => { const d = document.createElement('div'); d.id = 'hud-score'; d.className = 'hud-score hud-card'; (document.querySelector('.hud') || document.body).appendChild(d); return d; })();
      const m = Math.floor(snap.t / 60), s2 = String(snap.t % 60).padStart(2, '0');
      el.innerHTML = `<span class="red">🔴 ${snap.s.red}</span> – <span class="blue">${snap.s.blue} 🔵</span> <small>⏱ ${m}:${s2}${snap.ph === 'kickoff' ? ' · kick-off' : snap.ph === 'goal' ? ' · GOAL!' : snap.ph === 'over' ? ' · full time' : ''}</small> <small class="team-${football.team}">You: ${football.team === 'red' ? 'RED' : 'BLUE'}</small> <button class="chunky small ghost" data-act="fbLeave">Leave</button>`;
      el.hidden = false;
    },
    build(E) {
      const T = THREE, S = E.S, f = football.field, gw = football.goalW;
      const g = new T.Group();
      const ball = new T.Mesh(new T.IcosahedronGeometry(0.2, 1), new T.MeshLambertMaterial({ color: '#ffffff', flatShading: true }));
      ball.castShadow = true;
      g.add(ball);
      const post = new T.MeshLambertMaterial({ color: '#f5f5f5' });
      const net = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, side: T.DoubleSide });
      [[f.x, -1], [f.x + f.w, 1]].forEach(([gx, dir]) => {
        const cz = (f.y + f.h / 2) * S, x = gx * S, w = gw * S, H = 1.9;
        [-1, 1].forEach((k) => { const p = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, H, 8), post); p.position.set(x, H / 2, cz + k * w / 2); p.castShadow = true; g.add(p); });
        const bar = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, w, 8), post); bar.rotation.x = Math.PI / 2; bar.position.set(x, H, cz); g.add(bar);
        const back = new T.Mesh(new T.PlaneGeometry(w, H), net); back.rotation.y = Math.PI / 2; back.position.set(x + dir * 0.9, H / 2, cz); g.add(back);
      });
      E.mapRoot.add(g);
      football.meshes = { group: g, ball, parent: E.mapRoot };
      g.parent && (football.meshes.parent = E.mapRoot);
    },
  };

  /* ================= 100m race (inter-house practice / sports day) ================= */
  const race = {
    st: null,
    start() {
      const s = BH.Game.s;
      if (race.st) return;
      if (BH.Sim.mapId !== 'campus') { toast('🏃🏾 The race is on the field — go outside first.', 'info'); return; }
      const f = football.fieldRect();
      const lanes = [0, 1, 2, 3, 4].map((i) => f.y + 50 + i * 48);
      const x0 = f.x + 30, x1 = f.x + f.w - 30;
      BH.World.snap({ x: x0, y: lanes[2] });
      const pl = BH.Actors.player(); if (pl) pl.h = 0;
      const names = U.sample(['Chidi', 'Musa', 'Tolu', 'Efe', 'Bayo', 'Ngozi', 'Halima', 'Kemi', 'Ifeanyi', 'Sadiq'], 4);
      const houses = U.sample(D().HOUSES.filter((h) => h.tag !== s.player.house.tag), 4);
      const bots = [0, 1, 3, 4].map((lane, i) => {
        const a = BH.Actors.make('fb:race' + i, { kind: 'fb', map: 'campus', x: x0, y: lanes[lane], h: 0, team: 'race', kit: houses[i].color, name: `${names[i]} (${houses[i].tag})`, gender: i % 2 ? 'f' : 'm' });
        return { a, v: 150 + Math.random() * 34, react: 0.15 + Math.random() * 0.3, done: null, dir: 1 };
      });
      s.act = { type: 'busy', label: '🏃🏾 On your marks…' };
      race.st = { t: -3, x0, x1, bots, me: null, said: -4 };
      if (BH.Engine3D.rig) { BH.Engine3D.rig.yawGoal = 0; BH.Engine3D.rig.pitchGoal = 0.6; BH.Engine3D.rig.distGoal = 16; }
    },
    update(dt) {
      const R = race.st; if (!R) return;
      const s = BH.Game.s, pl = BH.Actors.player();
      R.t += dt;
      const sec = Math.ceil(-R.t);
      if (R.t < 0 && sec !== R.said) { R.said = sec; toast(`🏃🏾 ${['', 'Set…', 'Get set…', 'On your marks…'][sec] || ''}`, 'info'); }
      if (R.t >= 0 && !R.go) { R.go = true; if (s.act && s.act.type === 'busy') s.act = null; toast('🔫 GO!!! Hold Shift (or push the stick all the way): RUN → to the far line and back!', 'good'); }
      if (R.t >= 0) R.bots.forEach((b) => {
        if (b.done !== null) { b.a.speed = 0; b.a.anim = 'cheer'; return; }
        // there and back: touch the far line, sprint home
        if (R.t > b.react) { b.a.x += b.v * dt * b.dir; b.a.h = b.dir > 0 ? 0 : Math.PI; b.a.speed = b.v; b.a.anim = 'run'; }
        if (b.dir > 0 && b.a.x >= R.x1) b.dir = -1;
        if (b.dir < 0 && b.a.x <= R.x0) b.done = R.t;
      });
      if (R.go && pl && pl.x >= R.x1 - 4 && !R.turned) { R.turned = true; toast('↩️ Touched the line — now sprint back!', 'info'); }
      if (R.go && R.turned && R.me === null && pl && pl.x <= R.x0 + 4) R.me = R.t;
      const el = scoreEl();
      el.hidden = false;
      el.innerHTML = `🏃🏾 100m ${R.t < 0 ? `<b>${sec}</b>` : `<small>⏱ ${R.t.toFixed(1)}s</small>`} <button class="chunky small ghost" data-act="raceQuit">Quit</button>`;
      const allDone = R.bots.every((b) => b.done !== null) && R.me !== null;
      if (allDone || R.t > 25) race.finish();
    },
    finish() {
      const R = race.st, s = BH.Game.s;
      race.st = null;
      const me = R.me === null ? 99 : R.me;
      const pos = 1 + R.bots.filter((b) => b.done !== null && b.done < me).length;
      const prize = { 1: [150, 3, 8], 2: [80, 1, 5], 3: [40, 0, 3] }[pos] || [0, 0, 2];
      BH.Stats.money(s, prize[0]); BH.Stats.rep(s, prize[1]); BH.Stats.change(s, { morale: prize[2], rest: -6, thirst: -5 });
      toast(R.me === null ? '🏃🏾 You didn\'t finish the race. Next time!' : `🏁 You finished ${['', '1st 🥇', '2nd 🥈', '3rd 🥉', '4th', '5th'][pos]} in ${me.toFixed(2)}s!${prize[0] ? ` +${U.money(prize[0])}` : ''}`, pos <= 3 ? 'good' : 'info');
      if (BH.Net && BH.Net.online && pos === 1) BH.Net.say(`🥇 I just won the 100m for ${s.player.house.name}! (${me.toFixed(2)}s)`, true);
      BH.bus.emit('minigame', { kind: 'race', won: pos === 1 });
      BH.Paths && BH.Paths.add(s, 'sports', pos === 1 ? 3 : 1);
      setTimeout(() => R.bots.forEach((b) => BH.Actors.remove(b.a.id)), 2500);
      const el = document.getElementById('hud-score'); if (el && !football.active()) el.hidden = true;
    },
  };
  const D = () => BH.data;
  function scoreEl() {
    return document.getElementById('hud-score') || (() => { const d = document.createElement('div'); d.id = 'hud-score'; d.className = 'hud-score hud-card'; (document.querySelector('.hud') || document.body).appendChild(d); return d; })();
  }

  /* ================= dance battle (Social Night) ================= */
  const MOVES = [['ArrowLeft', '⬅️'], ['ArrowUp', '⬆️'], ['ArrowRight', '➡️'], ['ArrowDown', '⬇️']];
  const dance = {
    st: null,
    start() {
      if (dance.st) return;
      const net = N();
      const rival = net && net.online ? [...net.players.values()].find((p) => p.map === BH.Sim.mapId) : null;
      dance.st = { seq: Array.from({ length: 8 }, () => Math.floor(Math.random() * 4)), i: 0, hits: 0, t: 0, step: 1.5, rival: rival ? rival.name.split(' ')[0] : U.pick(['Kunle "Legwork" Ade', 'Zainab Shaku-Shaku', 'Obinna Zanku']), rivalScore: 4 + Math.floor(Math.random() * 4), done: false };
      dance.key = (e) => { if (!dance.st || dance.st.done) return; const k = MOVES.findIndex(([code]) => code === e.key); if (k >= 0) { e.preventDefault(); e.stopPropagation(); dance.hit(k); } };
      addEventListener('keydown', dance.key, true);
      dance.open();
    },
    hit(k) {
      const st = dance.st;
      if (!st || st.done) return;
      const ok = k === st.seq[st.i];
      if (ok) st.hits++;
      const pl = BH.Actors.player(); if (pl) pl.emote = { anim: ok ? 'dance' : 'cheer', until: performance.now() + 900 };
      st.flash = ok ? 'hit' : 'miss';
      dance.next();
    },
    next() { const st = dance.st; st.i++; st.t = 0; if (st.i >= st.seq.length) dance.end(); BH.Panels.refresh(); },
    update(dt) { const st = dance.st; if (!st || st.done) return; st.t += dt; if (st.t >= st.step) { st.flash = 'miss'; dance.next(); } },
    end() {
      const st = dance.st, s = BH.Game.s;
      st.done = true;
      removeEventListener('keydown', dance.key, true);
      const won = st.hits > st.rivalScore;
      if (won) { BH.Stats.rep(s, 5); BH.Stats.change(s, { morale: 10 }); BH.Stats.money(s, 100); }
      else BH.Stats.change(s, { morale: 4 });
      if (BH.Net && BH.Net.online) BH.Net.say(`💃🏾 Dance battle: ${st.hits}/8 vs ${st.rival} ${st.rivalScore}/8 — ${won ? 'I WON! 🔥' : 'next time!'}`, true);
      BH.bus.emit('minigame', { kind: 'dance', won });
      const pl = BH.Actors.player(); if (pl) pl.emote = { anim: won ? 'cheer' : 'dance', until: performance.now() + 3000 };
    },
    close() { if (dance.key) removeEventListener('keydown', dance.key, true); dance.st = null; BH.Panels.closeKind('dance', true); },
    open() {
      BH.Panels.open(() => {
        const st = dance.st;
        if (!st) return '';
        if (st.done) {
          const won = st.hits > st.rivalScore;
          return `<h2>🪩 Dance battle</h2><div class="dance-result ${won ? 'won' : ''}"><b>${st.hits}/8</b> vs ${U.esc(st.rival)} <b>${st.rivalScore}/8</b></div>
            <p>${won ? '🔥 The crowd goes WILD. Even the VP is nodding. You win! (+₦100 · clout ↑)' : '😅 The crowd cheered for both of you. Practise your legwork!'}</p>
            <div class="grid-btns"><button class="chunky primary" data-act="danceAgain">🔁 Again</button><button class="chunky ghost" data-act="danceClose">Done</button></div>`;
        }
        const cur = st.seq[st.i];
        return `<h2>🪩 Dance battle vs ${U.esc(st.rival)}</h2>
          <p class="muted">Hit the move shown — arrow keys or tap. ${st.i + 1}/8 · score ${st.hits}</p>
          <div class="dance-move ${st.flash || ''}">${MOVES[cur][1]}</div>
          <div class="dance-pad">${MOVES.map(([, e], k) => `<button class="chunky" data-act="danceHit" data-arg="${k}">${e}</button>`).join('')}</div>`;
      }, { cls: 'pop', kind: 'dance', onClose: () => { if (dance.st && !dance.st.done) dance.close(); } });
    },
  };

  /* ================= the 🎲 panel ================= */
  const Games = {
    whot, football, race, dance,
    update(dt) {
      football.update(dt);
      race.update(dt);
      dance.update(dt);
      const el = document.getElementById('hud-score');
      if (el && !football.active() && !race.st) el.hidden = true;
    },
    openPanel() {
      BH.Panels.open(() => {
        const net = N();
        const online = net && net.online;
        const tables = online ? net.tables.filter((t) => t.kind === 'whot') : [];
        const fb = online && net.tables.find((t) => t.kind === 'football');
        return `<h2>🎲 Free-time games</h2>
          <p class="muted">Quick games with your padi (2–5 min). Win money, morale and clout.${online ? '' : ' <b>Offline</b> — you play against bots.'}</p>
          <div class="card"><h3>🃏 Last Card</h3>
            ${tables.map((t) => `<div class="person"><span class="p-text"><b>${U.esc(t.title)}</b><small>${U.esc(BH.School.place(t.map).name)} · ${t.players.length}/${t.seats} ${t.playing ? '· playing' : '· waiting'}</small></span>${t.playing || t.players.length >= t.seats ? '' : `<button class="chunky small primary" data-act="whotJoin" data-arg="${t.id}">Join</button>`}</div>`).join('')}
            <div class="grid-btns"><button class="chunky primary" data-act="whotNew">${online ? '➕ Open a table' : '▶ Play vs bots'}</button>${online ? '<button class="chunky" data-act="whotBots">🤖 Quick game vs bots</button>' : ''}</div></div>
          <div class="card"><h3>⚽ Football on the field</h3>
            <p class="muted">${fb ? `${fb.players.length} playing${fb.score ? ` · ${fb.score.red}–${fb.score.blue}` : ''}. ` : ''}Real teams; bots fill the gaps. Walk onto the field, run into the ball to dribble, Space = pass, F = shoot.</p>
            <button class="chunky primary" data-act="fbJoin">${football.active() ? '✅ In the match' : '⚽ Join the match'}</button></div>
          <div class="card"><h3>🏃🏾 100m race</h3><p class="muted">Sprint across the field against runners from the other houses (busiest at inter-house practice, Wednesdays 4 PM).</p><button class="chunky" data-act="raceJoin">🏁 Line up</button></div>
          <div class="card"><h3>🪩 Dance battle</h3><p class="muted">Hit the moves in time. Saturday's Social Night is where legends are made.</p><button class="chunky" data-act="danceJoin">💃🏾 Battle</button></div>
          <div class="card"><h3>Board games</h3>
            ${online ? net.tables.filter((t) => ['ayo', 'draughts', 'ludo'].includes(t.kind)).map((t) => `<div class="person"><span class="p-text"><b>${U.esc(t.title)}</b><small>${t.players.length}/${t.seats} ${t.playing ? '· playing' : '· waiting'}</small></span>${t.playing || t.players.length >= t.seats ? '' : `<button class="chunky small primary" data-act="boardJoin" data-arg="${t.id}">Join</button>`}</div>`).join('') : ''}
            <div class="grid-btns"><button class="chunky" data-act="openBoard" data-arg="ayo">🌰 Ayo</button><button class="chunky" data-act="openBoard" data-arg="draughts">⚫ Draughts</button><button class="chunky" data-act="openBoard" data-arg="ludo">🎲 Ludo</button></div></div>
          <div class="card"><h3>Playground & sports</h3><div class="grid-btns"><button class="chunky" data-act="clap">👏🏾 Ten-ten</button><button class="chunky" data-act="suwe">🪨 Suwe (hopscotch)</button><button class="chunky" data-act="rally" data-arg="pingpong">🏓 Table tennis</button><button class="chunky" data-act="rally" data-arg="volley">🏐 Volleyball</button></div></div>
          <div class="card"><h3>Hang out</h3><div class="grid-btns"><button class="chunky" data-act="hangout" data-arg="gist">🌳 Gist circle</button><button class="chunky" data-act="hangout" data-arg="radio">📻 Hostel radio</button><button class="chunky" data-act="hangout" data-arg="story">🕯️ Storytime (night)</button></div></div>`;
      }, { cls: 'sheet', kind: 'games' });
    },
  };

  Object.assign(BH.actions, {
    openGames() { Games.openPanel(); },
    whotNew() { BH.Panels.closeKind('games', true); whot.create({}); },
    whotBots() { BH.Panels.closeKind('games', true); whot.startOffline(3); },
    whotJoin(id) { BH.Panels.closeKind('games', true); whot.join(id); },
    whotStart() { if (whot.room) whot.room.send('start'); else whot.startOffline((whot.info && whot.info.seats) || 3); },
    whotLeave() { whot.leave(); },
    whotInvite() { BH.Social.openPanel('friends'); toast('Tap a friend → 🃏 Play Last Card to invite them to a new table.', 'info'); },
    whotPlay(i) {
      const v = whot.view; if (!v) return;
      const c = v.hand[Number(i)];
      if (!v.playable.includes(Number(i))) { toast(v.pending ? `Defend with a ${v.top.n} or go to market.` : 'That card no match. Match the shape or number — or go to market.', 'bad'); return; }
      if (c.s === 'whot') { whot.pendingWhot = Number(i); BH.Panels.refresh(); return; }
      whot.move({ type: 'play', index: Number(i) });
    },
    whotWant(sh) { const i = whot.pendingWhot; whot.pendingWhot = null; whot.move({ type: 'play', index: i, want: sh }); },
    whotMarket() { whot.move({ type: 'market' }); },
    whotLast() { whot.move({ type: 'lastCard' }); toast('🗣️ "LAST CARD!"', 'info'); },
    fbJoin() { football.join(); },
    raceQuit() { if (race.st) { race.st.me = null; race.finish(); } },
    danceHit(k) { dance.hit(Number(k)); },
    danceAgain() { dance.close(); dance.start(); },
    danceClose() { dance.close(); },
    fbLeave() { football.leave(); },
  });

  BH.Games = Games;
})(window.BH);
