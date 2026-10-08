/* Social — friends, best friend, calls, follow / sit together / share food, gangs, proximity chat + emotes.
   Server side: server/mp (campus room + social.json). Here: the state the server pushes, the UI and the actions.
   · Tap a player's name tag (or walk up to them) → their menu
   · 👥 button → friends / best friend / gang / players on campus
   · 💬 button or C → chat bar (nearby players see a bubble; 📢 shout reaches the whole map); emote row */
(function (BH) {
  const U = BH.U;
  const N = () => BH.Net;
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast(t, k);
  const EMOTES = [['wave', '👋🏾'], ['beckon', '🫴🏾'], ['cheer', '🙌🏾'], ['dance', '💃🏾'], ['clap', '👏🏾'], ['laugh', '😂']];

  const Social = {
    state: { friends: [], requests: [], bestie: null, gang: null, gangInvites: [] },
    chips: [],     // notifications: { id, text, act, arg, until }
    chatOpen: false, shout: false,

    isFriend(pid) { return Social.state.friends.some((f) => f.pid === pid); },
    isBestie(pid) { return !!pid && Social.state.bestie === pid; },
    online(pid) { return N() && !!N().byPid(pid); },
    chip(text, act, arg, secs = 60) { const id = U.uid(); Social.chips.unshift({ id, text, act, arg, until: Date.now() + secs * 1000 }); Social.chips = Social.chips.slice(0, 4); Social.render(); BH.Sound && BH.Sound.play && BH.Sound.play('notify'); return id; },
    dropChip(id) { Social.chips = Social.chips.filter((c) => c.id !== id); Social.render(); },

    /* ---------- messages from the server ---------- */
    on(type, m) {
      const s = BH.Game.s;
      switch (type) {
        case 'social': Social.state = Object.assign(Social.state, m); BH.Panels.refresh(); break;
        case 'friendReq': Social.chip(`🤝 ${m.name} wants to be your padi`, 'friendAccept', m.from, 120); break;
        case 'friendResult': if (m.r === 'friends') toast('🤝 Una don be padi now!', 'good'); else if (m.r === 'requested') toast('🤝 Friend request sent.', 'info'); break;
        case 'call':
          N().waypoint = { map: m.map, x: m.x, y: m.y, actor: Social.actorOf(m.from), until: Date.now() + 120000, label: m.name };
          Social.chip(`📣 ${m.name} dey call you${m.shout ? ' (shouting your name!)' : ''} — follow the blue arrow`, 'callGo', m.from, 120);
          break;
        case 'follow': toast(m.on ? `👣 ${m.name} is walking with you.` : `👣 ${m.name} stopped following you.`, 'info'); break;
        case 'gift': {
          const it = BH.data.ITEMS[m.item];
          if (!it) return;
          BH.Inv.add(s, m.item, m.n);
          BH.Stats.change(s, { morale: 4 });
          toast(`🎁 ${m.name} shared ${m.n} ${it.name} with you! ${it.emoji || ''}`, 'good');
          break;
        }
        case 'invite': Social.chip(`🎲 ${m.name} invites you to play ${({ whot: 'Last Card', ayo: 'Ayo', draughts: 'Draughts', ludo: 'Ludo', football: 'football' })[m.kind] || m.kind} — tap to join`, 'inviteJoin', JSON.stringify(m), 90); break;
        case 'sitWith': Social.chip(`🪑 ${m.name} wants to sit with you`, 'callGo', m.from, 60); break;
        case 'cover': toast(`💛 You covered for ${m.name}${m.what ? ` (${m.what})` : ''}. Real padi.`, 'good'); break;
        case 'gangInvite': Social.chip(`🏴 ${m.name} invites you to join [${m.gang.tag}] ${m.gang.name}`, 'gangJoin', m.gang.id, 180); break;
        default:
      }
      Social.render();
    },
    actorOf(pid) { const p = N() && N().byPid(pid); return p ? 'r:' + p.sid : null; },

    /* ---------- actions ---------- */
    act(op, pid, arg) {
      const s = BH.Game.s;
      const net = N();
      const p = net && net.byPid(pid);
      const name = p ? p.name.split(' ')[0] : 'them';
      if (!net || !net.online) { toast('📴 You need to be online for that.', 'bad'); return; }
      switch (op) {
        case 'friend': net.send('friend', { to: pid }); break;
        case 'unfriend': net.send('friend', { to: pid, remove: true }); toast(`You and ${name} are no longer padi.`, 'info'); break;
        case 'bestie': net.send('bestie', { pid: Social.isBestie(pid) ? null : pid }); toast(Social.isBestie(pid) ? 'Best friend unpinned.' : `💛 ${name} is now your BEST FRIEND. They can see where you are on the map.`, 'good'); break;
        case 'call': net.send('call', { to: pid }); toast(`📣 You called ${name}.`, 'info'); break;
        case 'shout': net.say(`${name.toUpperCase()}!!! Come here! 📣`, true); net.send('call', { to: pid, shout: true }); break;
        case 'wave': net.emote('wave'); break;
        case 'beckon': net.emote('beckon'); net.say(`${name}, come 🫴🏾`); break;
        case 'follow': {
          if (!p) return;
          BH.Sim.follow = 'r:' + p.sid; net.send('follow', { to: pid, on: true });
          toast(`👣 Walking with ${name}. Move to stop.`, 'info'); break;
        }
        case 'sit': Social.sitWith(s, p); break;
        case 'share': Social.shareMenu(pid); return;
        case 'shareItem': {
          if (!BH.Inv.has(s, arg)) return;
          BH.Inv.take(s, arg, 1); net.send('share', { to: pid, item: arg, n: 1 });
          BH.Stats.change(s, { morale: 3 }); BH.Consequences.repChange(s, 'coursemates', 1);
          toast(`🎁 You shared ${BH.data.ITEMS[arg].name} with ${name}.`, 'good');
          BH.Panels.closeKind('player', true); break;
        }
        case 'whot': BH.Games.whot.create({ invite: pid }); break;
        case 'ayo': case 'draughts': case 'ludo': BH.Panels.closeKind('player', true); BH.Boards.board.create(op, { invite: pid }); break;
        case 'gangInvite': net.send('gang', { op: 'invite', to: pid }); toast(`🏴 Gang invite sent to ${name}.`, 'info'); break;
        case 'joinClass': Social.joinClass(s, p); break;
        default:
      }
      BH.Panels.refresh();
    },
    /* testing together: move into a friend's class arm + house (same year only) */
    joinClass(s, p) {
      if (!p) return;
      const first = p.name.split(' ')[0];
      if (Number(p.level) !== s.time.year) { toast(`🏫 ${first} is in ${BH.data.LEVELS[Number(p.level) - 1]} — you're in ${BH.Time.levelName(s)}. You can only share a class in the same year.`, 'bad'); return; }
      const st = BH.School.student(s, 'player');
      st.arm = p.arm;
      const h = BH.data.HOUSES.find((x) => x.tag === p.house);
      if (h) { s.player.house = h; st.house = h.tag; }
      const c = BH.School.myClass(s);
      BH.School.ensureSeating(s, c.id); BH.School.ensureLeaders(s);
      BH.Schedule.onBlockStart(); s.world.seats = {};
      N().lastProf = '';
      toast(`🏫 You moved to ${c.id} and ${s.player.house.name} with ${first}. Same class, same house${p.gender === s.player.gender ? ', same hostel' : ''}! 🤝`, 'good');
      BH.Panels.closeKind('player', true);
    },
    /* sit next to a friend: the free seat nearest to them in the same room */
    sitWith(s, p) {
      if (!p) return;
      const cm = BH.Sim.cm;
      if (p.map !== BH.Sim.mapId || cm.outdoor) { toast(`${p.name.split(' ')[0]} isn't sitting in this room.`, 'info'); return; }
      const seats = cm.objects.filter((o) => o.seats && o.seats.length);
      const near = seats.sort((a, b) => Math.hypot(a.x - p.tx, a.y - p.ty) - Math.hypot(b.x - p.tx, b.y - p.ty)).find((o) => Math.hypot(o.x - p.tx, o.y - p.ty) > 10) || seats[0];
      if (!near) return;
      BH.World.snap({ x: near.x, y: near.y + cm.T * 0.9 });
      const r = BH.Activities.sit(s, near);
      N().send('sitWith', { to: p.pid });
      s.today.flags.satWith = p.pid;
      BH.Stats.change(s, { morale: 3 });
      toast(`🪑 You sit with ${p.name.split(' ')[0]}. ${r && r.text ? r.text.replace(/\*\*/g, '') : ''}`, 'good');
      BH.Panels.closeKind('player', true);
    },
    shareMenu(pid) {
      const s = BH.Game.s;
      const foods = Object.entries(s.inventory || {}).filter(([k, n]) => n > 0 && BH.data.ITEMS[k] && BH.data.ITEMS[k].cat === 'food');
      BH.Panels.open(() => `<h2>🎁 Share with ${U.esc(N().nameOf(pid))}</h2>
        ${foods.length ? `<div class="grid-btns">${foods.map(([k, n]) => `<button class="chunky" data-act="socialAct" data-arg="shareItem|${U.esc(pid)}|${k}">${BH.data.ITEMS[k].emoji || '🍪'} ${U.esc(BH.data.ITEMS[k].name)} <small>×${n}</small></button>`).join('')}</div>` : '<p class="muted">Your chop box is empty. Buy provisions at the tuck shop.</p>'}`, { cls: 'pop', kind: 'share' });
    },
    /* best friend nearby? they might cover for you when you're caught */
    coverChance(s) {
      const net = N();
      if (!net || !net.online || !Social.state.bestie) return null;
      const p = net.byPid(Social.state.bestie);
      const a = p && BH.Actors.get('r:' + p.sid), pl = BH.Actors.player();
      if (!a || !pl || a.map !== pl.map || Math.hypot(a.x - pl.x, a.y - pl.y) > 220) return null;
      return p;
    },

    /* ---------- the player menu ---------- */
    openPlayer(pid) {
      const net = N();
      const p = net && net.byPid(pid);
      if (!p) return;
      BH.Panels.open(() => {
        const q = net.byPid(pid) || p;
        const fr = Social.isFriend(pid), bf = Social.isBestie(pid);
        const req = Social.state.requests.some((r) => r.pid === pid);
        const b = (op, label, cls = '') => `<button class="chunky ${cls}" data-act="socialAct" data-arg="${op}|${U.esc(pid)}">${label}</button>`;
        const where = BH.School.place(q.map || 'campus').name;
        return `<div class="player-card">
          <h2>${bf ? '💛 ' : fr ? '🤝 ' : ''}${q.gang ? `<small class="gang-tag">[${U.esc(q.gang)}]</small> ` : ''}${U.esc(q.name)}</h2>
          <p class="muted">${U.esc(BH.data.LEVELS[(Number(q.level) || 1) - 1] || '')}${q.arm ? U.esc(q.arm) : ''} · ${q.house ? U.esc(q.house) + ' House · ' : ''}📍 ${U.esc(where)}</p>
          <div class="grid-btns">
            ${fr ? '' : b('friend', req ? '✅ Accept padi request' : '🤝 Add friend', 'primary')}
            ${fr ? b('bestie', bf ? '💔 Unpin best friend' : '💛 Pin as BEST FRIEND', bf ? '' : 'primary') : ''}
            ${b('call', '📣 Call')} ${b('shout', '🗣️ Shout their name')}
            ${b('wave', '👋🏾 Wave')} ${b('beckon', '🫴🏾 Beckon')}
            ${b('follow', '👣 Walk together')} ${b('sit', '🪑 Sit together')}
            ${b('share', '🎁 Share food')} ${b('whot', '🃏 Play Last Card')}
            ${b('ayo', '🌰 Play Ayo')} ${b('draughts', '⚫ Play Draughts')}
            ${b('joinClass', '🏫 Join their class')}
            ${Social.state.gang ? b('gangInvite', `🏴 Invite to [${U.esc(Social.state.gang.tag)}]`) : ''}
            ${fr ? b('unfriend', '✖ Unfriend', 'ghost') : ''}
          </div></div>`;
      }, { cls: 'pop', kind: 'player' });
    },

    /* ---------- 👥 panel ---------- */
    openPanel(tab) {
      Social.tab = tab || Social.tab || 'friends';
      BH.Panels.open(() => {
        const net = N();
        const st = Social.state;
        const tabs = [['friends', `🤝 Friends (${st.friends.length})`], ['campus', `🌍 On campus (${net ? net.players.size : 0})`], ['gang', '🏴 Gang']];
        if (st.requests.length) tabs.splice(1, 0, ['requests', `📩 Requests (${st.requests.length})`]);
        const head = `<h2>👥 Your people <button class="chunky small" data-act="openLobby">🔗 Invite a friend</button></h2>${!net || !net.online ? `<p class="warn">📴 Offline. ${net && net.available() ? '<button class="chunky small" data-act="netConnect">Go online</button>' : 'Open the game from the school server (npm run dev) to play with friends.'}</p>` : ''}
          <div class="seg">${tabs.map(([k, l]) => `<button class="${Social.tab === k ? 'on' : ''}" data-act="socialTab" data-arg="${k}">${l}</button>`).join('')}</div>`;
        const where = (pid) => { const p = net && net.byPid(pid); return p ? `🟢 ${U.esc(BH.School.place(p.map || 'campus').name)}` : '⚪ offline'; };
        const row = (pid, name, extra = '') => `<button class="person" data-act="playerMenu" data-arg="${U.esc(pid)}"><span class="p-emoji">${Social.isBestie(pid) ? '💛' : '🧑🏾‍🎓'}</span><span class="p-text"><b>${U.esc(name)}</b><small>${where(pid)}${extra}</small></span></button>`;
        let body = '';
        if (Social.tab === 'friends') {
          const bl = net && net.bestieLoc && Date.now() - net.bestieLoc.at < 6000 ? net.bestieLoc : null;
          body = (bl ? `<div class="card"><b>💛 ${U.esc(bl.name)}</b> (they pinned you) is at <b>${U.esc(BH.School.place(bl.map).name)}</b> <button class="chunky small" data-act="socialFind" data-arg="${U.esc(bl.pid)}">📍 Show me</button></div>` : '')
            + (st.friends.length ? st.friends.slice().sort((a, b) => (Social.online(b.pid) ? 1 : 0) - (Social.online(a.pid) ? 1 : 0)).map((f) => row(f.pid, f.name, f.pid === st.bestie ? ' · 💛 best friend' : '')).join('') : '<p class="muted">No padi yet. Tap a player\'s name tag (yellow) to add them.</p>');
        } else if (Social.tab === 'requests') {
          body = st.requests.map((r) => `<div class="person"><span class="p-text"><b>${U.esc(r.name)}</b><small>wants to be your padi</small></span><button class="chunky small primary" data-act="friendAccept" data-arg="${U.esc(r.pid)}">Accept</button></div>`).join('');
        } else if (Social.tab === 'campus') {
          body = net && net.players.size ? [...net.players.values()].map((p) => row(p.pid, p.name, `${p.level ? ` · ${BH.data.LEVELS[Number(p.level) - 1]}${p.arm || ''}` : ''}${Social.isFriend(p.pid) ? ' · padi' : ''}`)).join('') : '<p class="muted">Nobody else is online. Share the server link with a friend (see ⚙️ Menu → 🌐 Online).</p>';
        } else {
          const g = st.gang;
          body = g ? `<div class="card"><h3>🏴 [${U.esc(g.tag)}] ${U.esc(g.name)}</h3>${g.members.map((m) => row(m.pid, m.name)).join('')}<p class="muted tiny">Invite people from their name tag menu.</p><button class="chunky ghost" data-act="gangLeave">Leave gang</button></div>`
            : `<div class="card"><h3>Start a gang</h3><p class="muted">A squad with a name and a tag over your heads. 😎</p>
               <input id="gang-name" maxlength="28" placeholder="Name e.g. Back Bench Boys"><input id="gang-tag" maxlength="5" placeholder="Tag e.g. BBB">
               <button class="chunky primary" data-act="gangCreate">Create gang</button></div>`
            + (st.gangInvites || []).map((x) => `<div class="person"><span class="p-text"><b>[${U.esc(x.tag)}] ${U.esc(x.name)}</b><small>invited you</small></span><button class="chunky small primary" data-act="gangJoin" data-arg="${x.id}">Join</button></div>`).join('');
        }
        return head + `<section class="people-list">${body}</section>`;
      }, { cls: 'sheet', kind: 'social' });
    },

    /* ---------- chat bar + emotes (mounted into the HUD) ---------- */
    mount() {
      const hud = document.querySelector('.hud');
      if (!hud || document.getElementById('hud-social')) return;
      const br = hud.querySelector('.hud-br');
      if (br) {
        br.insertAdjacentHTML('afterbegin', `<button class="round-btn" data-act="openGames" aria-label="Games">🎲</button><button class="round-btn" data-act="openSocial" aria-label="Friends">👥<span id="social-badge" class="badge" hidden></span></button><button class="round-btn" data-act="chatToggle" aria-label="Chat">💬</button>`);
      }
      const chips = document.createElement('div'); chips.id = 'hud-social'; chips.className = 'hud-social'; hud.appendChild(chips);
      const bar = document.createElement('div'); bar.id = 'chat-bar'; bar.className = 'chat-bar'; bar.hidden = true;
      bar.innerHTML = `<div class="chat-log"></div>
        <div class="emote-row">${EMOTES.map(([a, e]) => `<button data-act="emote" data-arg="${a}" title="${a}">${e}</button>`).join('')}<button class="shout-btn" data-act="chatShout" title="Shout (whole map)">📢</button></div>
        <form autocomplete="off"><input maxlength="140" placeholder="Say something… (people near you see it)" enterkeyhint="send"><button class="chunky small" type="submit">Say</button></form>`;
      hud.appendChild(bar);
      const form = bar.querySelector('form'), inp = bar.querySelector('input');
      form.addEventListener('submit', (e) => { e.preventDefault(); N() && N().say(inp.value, Social.shout); inp.value = ''; Social.shout = false; bar.querySelector('.shout-btn').classList.remove('on'); });
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { inp.blur(); Social.toggleChat(false); } });
      addEventListener('keydown', (e) => {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if ((e.key === 'c' || e.key === 'C') && !(BH.Panels && BH.Panels.isOpen()) && document.body.classList.contains('engine3d')) { e.preventDefault(); Social.toggleChat(true); }
      });
      BH.bus.on('net:chat', () => Social.renderChat());
      Social.render();
    },
    toggleChat(on) {
      const bar = document.getElementById('chat-bar');
      if (!bar) return;
      Social.chatOpen = on === undefined ? !Social.chatOpen : on;
      bar.hidden = !Social.chatOpen;
      if (Social.chatOpen) { Social.renderChat(); setTimeout(() => bar.querySelector('input').focus(), 30); }
    },
    renderChat() {
      const el = document.querySelector('#chat-bar .chat-log');
      if (!el || !N()) return;
      el.innerHTML = N().chat.slice(-6).map((c) => `<p class="${c.mine ? 'me' : ''}"><b>${U.esc(c.name)}:</b> ${c.shout ? '📢 ' : ''}${U.esc(c.text)}</p>`).join('') || '<p class="muted">Nearby players see what you say as a bubble over your head.</p>';
    },
    render() {
      const el = document.getElementById('hud-social');
      if (!el) return;
      const now = Date.now();
      Social.chips = Social.chips.filter((c) => c.until > now);
      el.innerHTML = Social.chips.map((c) => `<button class="call-chip social-chip" data-act="${c.act}" data-arg="${U.esc(c.arg)}" data-chip="${c.id}">${U.esc(c.text)}</button>`).join('');
      const badge = document.getElementById('social-badge');
      if (badge) { const n = Social.state.requests.length + (Social.state.gangInvites || []).length; badge.hidden = !n; badge.textContent = n; }
    },
    update() { if (!document.getElementById('hud-social')) Social.mount(); if ((Social.t = (Social.t || 0) + 1) % 60 === 0) Social.render(); },
  };

  const chipDone = (el) => { const id = el && el.dataset.chip; if (id) Social.dropChip(id); };
  Object.assign(BH.actions, {
    openSocial() { if (BH.Net && BH.Net.online) Social.openPanel(); else BH.Story.openPanel(); },
    socialTab(t) { Social.tab = t; BH.Panels.refresh(); },
    playerMenu(pid) { Social.openPlayer(pid); },
    socialAct(arg) { const [op, pid, extra] = String(arg).split('|'); Social.act(op, pid, extra); },
    friendAccept(pid, el) { N() && N().send('friend', { to: pid }); chipDone(el); },
    callGo(pid, el) { const net = N(); const p = net && net.byPid(pid); if (p) net.waypoint = { map: p.map, x: p.tx, y: p.ty, actor: 'r:' + p.sid, until: Date.now() + 120000 }; chipDone(el); toast('📍 Follow the blue marker.', 'info'); },
    socialFind(pid) { const net = N(); const b = net && net.bestieLoc; if (b) net.waypoint = { map: b.map, x: b.x, y: b.y, actor: Social.actorOf(pid), until: Date.now() + 120000 }; BH.Panels.closeAll(); },
    inviteJoin(json, el) { const m = JSON.parse(json); chipDone(el); if (m.kind === 'whot') BH.Games.whot.join(m.roomId); else if (m.kind === 'football') BH.Games.football.join(); else BH.Boards.board.join(m.roomId); },
    gangCreate() { const name = document.getElementById('gang-name').value, tag = document.getElementById('gang-tag').value; if (name.trim() && tag.trim()) N().send('gang', { op: 'create', name, tag }); },
    gangJoin(id, el) { N().send('gang', { op: 'join', id }); chipDone(el); },
    gangLeave() { N().send('gang', { op: 'leave' }); },
    chatToggle() { Social.toggleChat(); },
    chatShout(_, el) { Social.shout = !Social.shout; el.classList.toggle('on', Social.shout); },
    emote(a) { N() && N().emote(a); },
    netConnect() { BH.Prefs.set('online', true); N().connect().then(() => BH.Panels.refresh()); },
  });

  BH.Social = Social;
})(window.BH);
