/* Board & playground games (🎲 panel):
   · Ayo, Draughts, Ludo — online tables (Colyseus 'board' room, bots fill seats) or offline vs a bot; rules in shared/boards.js
   · Ten-ten — the clapping/footwork game: pick your foot; the caller scores on a match, the other player on a miss
   · Suwe — hopscotch: throw your stone onto the next square (timing), then hop it; first to square 6 wins */
(function (BH) {
  const U = BH.U;
  const B = () => window.BHBoards;
  const N = () => BH.Net;
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast(t, k);
  const reward = (kind, won) => {
    const s = BH.Game.s;
    if (won) { BH.Stats.money(s, 60); BH.Stats.change(s, { morale: 7 }); BH.Stats.rep(s, 1); toast(`🏆 You win! +${U.money(60)} · morale ↑`, 'good'); }
    else BH.Stats.change(s, { morale: 2 });
    BH.bus.emit('minigame', { kind, won });
  };

  /* ================= board tables ================= */
  const board = {
    room: null, offline: null, kind: null, view: null, info: null, sel: null,
    async create(kind, opts = {}) {
      const s = BH.Game.s, net = N();
      board.leave(true);
      board.kind = kind;
      if (net && net.online) {
        try {
          board.bind(await net.client.create('board', { game: kind, pid: s.player.playerId, name: s.player.name.split(' ')[0], title: `${s.player.name.split(' ')[0]}'s ${B().ENGINES[kind].title}`, map: s.world.map, seats: kind === 'ludo' ? 4 : 2 }));
          if (opts.invite) net.send('invite', { to: opts.invite, kind, roomId: board.room.roomId, title: B().ENGINES[kind].title });
          return board.open();
        } catch (e) { toast('Could not open a table online — playing a bot.', 'info'); }
      }
      board.startOffline(kind);
    },
    async join(roomId) {
      const s = BH.Game.s;
      try { board.bind(await N().client.joinById(roomId, { pid: s.player.playerId, name: s.player.name.split(' ')[0] })); board.open(); }
      catch (e) { toast('That table is full or already playing.', 'bad'); }
    },
    bind(room) {
      board.room = room;
      room.onMessage('table', (t) => { board.info = t; board.kind = t.kind; board.view = t.game; BH.Panels.refresh(); });
      room.onMessage('end', (e) => { reward(board.kind, e.winner === (board.info && board.info.you)); BH.Panels.refresh(); });
      room.onMessage('err', (e) => toast(e.why, 'bad'));
      room.onLeave(() => { if (board.room === room) { board.room = null; board.view = null; BH.Panels.refresh(); } });
      room.send('ready');
    },
    startOffline(kind) {
      const s = BH.Game.s, E = B().ENGINES[kind];
      const players = [{ id: 'me', name: s.player.name.split(' ')[0] }];
      const bots = ['Kola (bot)', 'Amina (bot)', 'Uche (bot)'];
      for (let i = 0; i < (kind === 'ludo' ? 3 : 1); i++) players.push({ id: 'bot' + i, name: bots[i], bot: true });
      board.kind = kind;
      board.offline = E.create(players, Date.now());
      board.info = { title: `${E.title} vs bot`, you: 'me' };
      board.sync();
      board.open();
    },
    sync() {
      const g = board.offline; if (!g) return;
      const E = B().ENGINES[board.kind];
      board.view = E.view(g, 'me');
      BH.Panels.refresh();
      if (g.winner) return reward(board.kind, g.winner === 'me');
      const cur = g.players[g.turn];
      if (cur.bot) setTimeout(() => { if (board.offline !== g || g.winner) return; E.move(g, cur.id, E.botMove(g, cur.id)); board.sync(); }, 650);
    },
    move(mv) {
      board.sel = null;
      if (board.room) return board.room.send('move', mv);
      const r = B().ENGINES[board.kind].move(board.offline, 'me', mv);
      if (!r.ok) toast(r.why, 'bad');
      board.sync();
    },
    leave(silent) { if (board.room) try { board.room.leave(true); } catch (e) { /* closed */ } board.room = null; board.offline = null; board.view = null; board.sel = null; if (!silent) BH.Panels.closeKind('board', true); },

    render() {
      const v = board.view, info = board.info || {};
      const title = (B().ENGINES[board.kind] || {}).title || 'Board game';
      if (!v) return `<h2>${U.esc(info.title || title)}</h2><p>At the table: ${(info.humans || []).map(U.esc).join(', ')}</p><div class="grid-btns"><button class="chunky primary" data-act="boardStart">▶ Start</button><button class="chunky" data-act="boardInvite">📣 Invite a friend</button><button class="chunky ghost" data-act="boardLeave">Leave</button></div>`;
      const mine = v.turn === (board.room ? info.you : 'me');
      const status = v.winner ? (v.winner === 'draw' ? '🤝 Draw' : `🏆 ${U.esc((v.players.find((p) => p.id === v.winner) || {}).name)} wins!`) : mine ? '👉🏾 Your turn' : `${U.esc((v.players.find((p) => p.id === v.turn) || {}).name)} is thinking…`;
      let body = '';
      if (v.kind === 'ayo') {
        const me = v.me === 1 ? 1 : 0;
        const top = me === 0 ? [11, 10, 9, 8, 7, 6] : [5, 4, 3, 2, 1, 0];
        const bot = me === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
        const pit = (i, clickable) => `<button class="ayo-pit ${clickable && v.legal.includes(i) ? 'ok' : ''}" ${clickable && v.legal.includes(i) ? `data-act="ayoSow" data-arg="${i}"` : 'disabled'}><b>${v.pits[i]}</b><span>${'•'.repeat(Math.min(v.pits[i], 12))}</span></button>`;
        body = `<div class="ayo"><div class="ayo-store">${U.esc(v.players[1 - me].name)}<b>${v.store[1 - me]}</b></div><div class="ayo-board"><div class="ayo-row">${top.map((i) => pit(i, false)).join('')}</div><div class="ayo-row">${bot.map((i) => pit(i, mine)).join('')}</div></div><div class="ayo-store me">You<b>${v.store[me]}</b></div></div>`;
      } else if (v.kind === 'draughts') {
        const flip = v.me === 1;
        const rows = [...Array(8).keys()]; if (flip) rows.reverse();
        const froms = new Set(v.legal.map((m) => m.from.join(',')));
        const tos = board.sel ? new Set(v.legal.filter((m) => m.from.join(',') === board.sel).map((m) => m.to.join(','))) : new Set();
        body = `<div class="draughts">${rows.map((r) => `<div class="d-row">${(flip ? [...Array(8).keys()].reverse() : [...Array(8).keys()]).map((c) => {
          const val = v.board[r][c], k = `${r},${c}`, dark = (r + c) % 2 === 1;
          const piece = val ? `<i class="p${val % 2 ? 0 : 1} ${val >= 3 ? 'king' : ''}">${val >= 3 ? '👑' : ''}</i>` : '';
          const act = mine && froms.has(k) ? `data-act="dSel" data-arg="${k}"` : mine && tos.has(k) ? `data-act="dTo" data-arg="${k}"` : '';
          return `<button class="d-sq ${dark ? 'dark' : ''} ${board.sel === k ? 'sel' : ''} ${tos.has(k) ? 'to' : ''} ${mine && froms.has(k) ? 'can' : ''}" ${act || 'disabled'}>${piece}</button>`;
        }).join('')}</div>`).join('')}</div>`;
      } else if (v.kind === 'ludo') {
        const COL = ['#e53935', '#43a047', '#fdd835', '#1e88e5'];
        const pos = (t) => (t === -1 ? 'base' : t === 57 ? '🏠 home' : t > 50 ? `home lane ${t - 50}` : `square ${t + 1}`);
        body = `<div class="ludo">${v.players.map((p, i) => `<div class="l-lane ${v.turn === p.id ? 'turn' : ''}"><b style="color:${COL[i]}">● ${U.esc(p.name)}</b><div class="l-track">${v.tok[i].map((t) => `<span class="l-tok" style="left:${t < 0 ? 0 : (t / 57) * 100}%;background:${COL[i]}"></span>`).join('')}</div></div>`).join('')}
          <div class="l-ctrl"><div class="l-dice">${v.dice ? ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][v.dice] : '🎲'}</div>
          ${mine && !v.rolled ? '<button class="chunky primary" data-act="ludoRoll">🎲 Roll</button>' : ''}
          ${mine && v.rolled ? v.tok[v.me].map((t, k) => `<button class="chunky small ${v.legal.includes(k) ? 'primary' : ''}" ${v.legal.includes(k) ? `data-act="ludoMove" data-arg="${k}"` : 'disabled'}>Token ${k + 1}<br><small>${pos(t)}</small></button>`).join('') : ''}</div></div>`;
      }
      return `<h2>${U.esc(title)}</h2><div class="b-status ${mine ? 'me' : ''}">${status}</div>${body}
        <div class="w-actions">${v.winner ? '<button class="chunky small primary" data-act="boardStart">🔁 Rematch</button>' : ''}<button class="chunky small ghost" data-act="boardLeave">Leave</button></div>
        <div class="w-log">${v.log.map((l) => `<p>${U.esc(l)}</p>`).join('')}</div>`;
    },
    open() { BH.Panels.open(() => board.render(), { cls: 'sheet', kind: 'board' }); },
  };

  /* ================= playground: ten-ten & suwe ================= */
  const play = {
    st: null,
    tenten() {
      play.st = { kind: 'tenten', me: 0, them: 0, round: 1, caller: 'me', last: '', rival: U.pick(['Kemi', 'Halima', 'Tari', 'Chiamaka']) };
      play.open();
    },
    foot(f) {
      const st = play.st; if (!st || st.kind !== 'tenten' || st.over) return;
      const theirs = Math.random() < 0.5 ? 'L' : 'R';
      const match = f === theirs;
      const meScore = st.caller === 'me' ? match : !match;
      if (meScore) st.me++; else st.them++;
      const pl = BH.Actors.player(); if (pl) pl.emote = { anim: 'dance', until: performance.now() + 700 };
      st.last = `👏🏾 Clap clap — you put ${f === 'L' ? 'LEFT' : 'RIGHT'}, ${st.rival} put ${theirs === 'L' ? 'LEFT' : 'RIGHT'}. ${meScore ? 'Point to you!' : `Point to ${st.rival}.`}`;
      st.caller = st.caller === 'me' ? 'them' : 'me';
      st.round++;
      if (st.me >= 5 || st.them >= 5) { st.over = true; reward('tenten', st.me > st.them); }
      BH.Panels.refresh();
    },
    suwe() {
      play.st = { kind: 'suwe', me: 0, them: 0, target: 1, marker: 0, dir: 1, t: 0, last: 'Throw your stone onto square 1 — tap THROW when the marker is on it.', rival: U.pick(['Funke', 'Bimbo', 'Aisha', 'Ebere']) };
      play.open();
      play.tick();
    },
    tick() {
      const st = play.st; if (!st || st.kind !== 'suwe' || st.over) return;
      st.marker += st.dir * 0.22; if (st.marker > 8) { st.marker = 8; st.dir = -1; } if (st.marker < 0) { st.marker = 0; st.dir = 1; }
      const el = document.getElementById('suwe-marker'); if (el) el.style.left = `${(st.marker / 8) * 100}%`;
      play.timer = setTimeout(play.tick, 40);
    },
    throwStone() {
      const st = play.st; if (!st || st.kind !== 'suwe' || st.over) return;
      const sq = Math.min(8, Math.floor(st.marker) + 1);
      if (sq === st.target) { st.me = st.target; st.target++; st.last = `🪨 Stone lands on ${sq}! You hop, hop, turn, hop back. ✅`; const pl = BH.Actors.player(); if (pl) pl.emote = { anim: 'cheer', until: performance.now() + 800 }; }
      else st.last = `🪨 Stone lands on ${sq} — you needed ${st.target}. Your turn passes.`;
      // the rival's throw
      if (Math.random() < 0.45) { st.them++; st.last += ` ${st.rival} lands square ${st.them}.`; } else st.last += ` ${st.rival} misses.`;
      if (st.me >= 6 || st.them >= 6) { st.over = true; clearTimeout(play.timer); reward('suwe', st.me >= 6 && st.me >= st.them); }
      BH.Panels.refresh();
    },
    /* table tennis / volleyball: the ball travels between you; tap when it's in your zone. First to 7. */
    rally(kind) {
      clearTimeout(play.timer);
      play.st = { kind: 'rally', sport: kind, me: 0, them: 0, pos: 0.5, dir: 1, speed: kind === 'pingpong' ? 0.045 : 0.03, last: kind === 'pingpong' ? '🏓 Serve! Tap HIT when the ball reaches your end (the green zone).' : '🏐 Bump, set, spike! Tap HIT when the ball drops into your zone.', rival: U.pick(['Femi', 'Zara', 'Ikenna', 'Hauwa']), hitOk: false };
      play.open();
      play.rallyTick();
    },
    rallyTick() {
      const st = play.st; if (!st || st.kind !== 'rally' || st.over) return;
      st.pos += st.dir * st.speed;
      if (st.dir < 0 && st.pos <= 0.12 && !st.rivalHit) { // their end: they return it (mostly)
        st.rivalHit = true;
        if (Math.random() < 0.82 - st.speed) { st.dir = 1; st.speed = Math.min(0.09, st.speed * 1.08); st.rivalHit = false; }
      }
      if (st.pos < -0.05) play.point('me');
      if (st.pos > 1.05) play.point('them');
      const el = document.getElementById('rally-ball'); if (el) el.style.left = `${Math.max(0, Math.min(1, st.pos)) * 100}%`;
      play.timer = setTimeout(play.rallyTick, 40);
    },
    swing() {
      const st = play.st; if (!st || st.kind !== 'rally' || st.over) return;
      if (st.dir > 0 && st.pos >= 0.8 && st.pos <= 1.02) { st.dir = -1; st.rivalHit = false; st.speed = Math.min(0.09, st.speed * 1.05); const pl = BH.Actors.player(); if (pl) pl.emote = { anim: 'wave', until: performance.now() + 400 }; }
      else st.last = '💨 Swing and a miss — wait for the green zone!';
      BH.Panels.refresh();
    },
    point(who) {
      const st = play.st;
      if (who === 'me') { st.me++; st.last = `✅ ${st.rival} can't return it! Your point.`; } else { st.them++; st.last = `❌ Your point slipped past. ${st.rival}'s point.`; }
      st.pos = 0.5; st.dir = who === 'me' ? -1 : 1; st.rivalHit = false; st.speed = st.sport === 'pingpong' ? 0.045 : 0.03;
      if (st.me >= 7 || st.them >= 7) { st.over = true; clearTimeout(play.timer); reward(st.sport, st.me > st.them); }
      BH.Panels.refresh();
    },
    close() { clearTimeout(play.timer); play.st = null; BH.Panels.closeKind('playground', true); },
    open() {
      BH.Panels.open(() => {
        const st = play.st; if (!st) return '';
        if (st.kind === 'rally') return `<h2>${st.sport === 'pingpong' ? '🏓 Table tennis' : '🏐 Volleyball'} vs ${U.esc(st.rival)}</h2>
          <div class="dance-result">You <b>${st.me}</b> – <b>${st.them}</b> ${U.esc(st.rival)}</div>
          <div class="rally-bar"><span class="zone them"></span><span class="net"></span><span class="zone me"></span><i id="rally-ball" style="left:${st.pos * 100}%">${st.sport === 'pingpong' ? '⚪' : '🏐'}</i></div>
          <p>${U.esc(st.last)}</p>
          ${st.over ? `<p><b>${st.me > st.them ? '🏆 You win!' : `${U.esc(st.rival)} wins!`}</b></p><div class="grid-btns"><button class="chunky primary" data-act="rally" data-arg="${st.sport}">🔁 Again</button><button class="chunky ghost" data-act="playClose">Done</button></div>` : '<button class="chunky primary big-hit" data-act="rallyHit">HIT! (Space)</button>'}`;
        if (st.kind === 'tenten') return `<h2>👏🏾 Ten-ten with ${U.esc(st.rival)}</h2><p class="muted">Clap, jump, put one foot forward. ${st.caller === 'me' ? '<b>You are the caller</b> — you score if your feet MATCH.' : `<b>${U.esc(st.rival)} is calling</b> — you score if your feet DON'T match.`}</p>
          <div class="dance-result"><b>${st.me}</b> – <b>${st.them}</b></div><p>${U.esc(st.last)}</p>
          ${st.over ? `<p><b>${st.me > st.them ? '🏆 You win!' : `${U.esc(st.rival)} wins!`}</b></p><div class="grid-btns"><button class="chunky primary" data-act="clap">🔁 Again</button><button class="chunky ghost" data-act="playClose">Done</button></div>` : '<div class="grid-btns"><button class="chunky primary" data-act="tenFoot" data-arg="L">🦶🏾 LEFT</button><button class="chunky primary" data-act="tenFoot" data-arg="R">RIGHT 🦶🏾</button></div>'}`;
        return `<h2>🪨 Suwe with ${U.esc(st.rival)}</h2><p class="muted">First to hop all six squares wins.</p>
          <div class="suwe-bar">${[...Array(8)].map((_, i) => `<span class="${i + 1 === st.target ? 'target' : ''} ${i < st.me ? 'done' : ''}">${i + 1}</span>`).join('')}<i id="suwe-marker" style="left:${(st.marker / 8) * 100}%"></i></div>
          <div class="dance-result">You <b>${st.me}</b> – <b>${st.them}</b> ${U.esc(st.rival)}</div><p>${U.esc(st.last)}</p>
          ${st.over ? `<div class="grid-btns"><button class="chunky primary" data-act="suweAgain">🔁 Again</button><button class="chunky ghost" data-act="playClose">Done</button></div>` : '<button class="chunky primary" data-act="suweThrow">🪨 THROW</button>'}`;
      }, { cls: 'pop', kind: 'playground', onClose: () => clearTimeout(play.timer) });
    },
  };

  Object.assign(BH.actions, {
    openBoard(kind) { BH.Panels.closeKind('games', true); board.create(kind); },
    boardJoin(id) { BH.Panels.closeKind('games', true); board.join(id); },
    boardStart() { if (board.room) board.room.send('start'); else board.startOffline(board.kind); },
    boardLeave() { board.leave(); },
    boardInvite() { BH.Social.openPanel('friends'); toast('Tap a friend → their menu to invite them (🃏 / 🎲).', 'info'); },
    ayoSow(i) { board.move({ pit: Number(i) }); },
    dSel(k) { board.sel = k; BH.Panels.refresh(); },
    dTo(k) { const [r, c] = k.split(',').map(Number); const [fr, fc] = board.sel.split(',').map(Number); board.move({ from: [fr, fc], to: [r, c] }); },
    ludoRoll() { board.move({ type: 'roll' }); },
    ludoMove(k) { board.move({ type: 'move', token: Number(k) }); },
    clap() { BH.Panels.closeKind('games', true); play.tenten(); },
    tenFoot(f) { play.foot(f); },
    suwe() { BH.Panels.closeKind('games', true); play.suwe(); },
    suweThrow() { play.throwStone(); },
    suweAgain() { clearTimeout(play.timer); play.suwe(); },
    playClose() { play.close(); },
    rally(kind) { BH.Panels.closeKind('games', true); play.rally(kind); },
    rallyHit() { play.swing(); },
    hangout(kind) { BH.Panels.closeKind('games', true); hang[kind](); },
  });

  /* Space hits the ball in a rally */
  addEventListener('keydown', (e) => { if (play.st && play.st.kind === 'rally' && !play.st.over && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); play.swing(); } }, true);

  /* ================= hangouts: gist circle, hostel radio, night storytelling ================= */
  const SONGS = ['Wizkid — Ojuelegba', 'Burna Boy — Ye', 'Asake — Lonely At The Top', 'Tems — Free Mind', 'Rema — Calm Down', 'Davido — Fall', 'Ayra Starr — Rush', 'P-Square — No One Like You', '2Baba — African Queen'];
  const hang = {
    gist() {
      const s = BH.Game.s;
      if (s.world.map !== 'campus') { toast('🌳 Gist circles happen outside under the mango trees — go out first.', 'info'); return; }
      const pl = BH.Actors.player(); if (pl) pl.emote = { anim: 'talk', until: performance.now() + 4000 };
      const line = BH.Gist && BH.Gist.filler ? BH.Gist.filler(s) : '"Did you hear?"';
      BH.Stats.change(s, { morale: 5 }); BH.Stats.rep(s, 1);
      if (N() && N().online) N().say('Gist circle under the mango tree — come! 🌳🗣️', true);
      BH.Dialogue.say({ portrait: { emoji: '🌳' }, name: 'Gist circle', sub: 'Under the mango tree', text: `You sit on the root of the old mango tree. Somebody's sharing chin-chin. The gist starts flowing:

${line}

Everybody gasps, then laughs. (+morale, +clout)` });
      BH.bus.emit('minigame', { kind: 'gist', won: true });
    },
    radio() {
      const s = BH.Game.s;
      if (!/Hostel$/.test(s.world.map || '')) { toast('📻 The radio lives in the hostel common room.', 'info'); return; }
      const song = U.pick(SONGS);
      const pl = BH.Actors.player(); if (pl) pl.emote = { anim: 'dance', until: performance.now() + 6000 };
      BH.Stats.change(s, { morale: 6 });
      if (N() && N().online) { N().say(`📻 ${song} is playing — vibes! 🕺🏾`); N().emote('dance'); }
      toast(`📻 Somebody tunes the hostel radio to Cool FM: ♪ ${song} ♪ — the whole corridor starts dancing. (+morale)`, 'good');
      BH.bus.emit('minigame', { kind: 'radio', won: true });
    },
    story() {
      const s = BH.Game.s;
      if (!/Hostel$/.test(s.world.map || '') || !BH.Clock.isDark(s)) { toast('🕯️ Storytime is after dark in the hostel.', 'info'); return; }
      s.queue.push({ id: 'ghostStory', ctx: {} });
      if (N() && N().online) N().say('🕯️ Storytime! Gather round… make I tell una something…', true);
    },
  };

  BH.Boards = { board, play, hang };
})(window.BH);
