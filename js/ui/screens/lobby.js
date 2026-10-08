/* 🌐 Play with friends — the lobby (from the title screen, or ⚙️ menu in game).
   Who's online right now, the link to send a friend (Wi-Fi link, public tunnel link or hosted link — whatever works),
   your invite link (drops them into YOUR school, class arm and house), and how to connect. Polls /api/online. */
(function (BH) {
  const U = BH.U;
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast(t, k);
  let data = null, err = null, timer = null, invite = '';

  const Lobby = {
    async refresh() {
      try {
        const r = await fetch(`${BH.Server.base()}/api/online`, { cache: 'no-store' });
        data = await r.json(); err = null;
      } catch (e) { data = null; err = 'offline'; }
      const s = BH.Game.s || Lobby.lastSave();
      if (s && s.player && s.player.playerId) invite = await BH.Server.inviteLink(s).catch(() => '');
      if (BH.UI.screen === 'lobby') BH.UI.render();
      if (BH.Panels && BH.Panels.top() && BH.Panels.top().opts.kind === 'lobby') BH.Panels.refresh();
    },
    lastSave() { const slot = BH.Save.lastSlot(); return slot ? BH.Save.load(slot) : null; },
    start() { clearInterval(timer); Lobby.refresh(); timer = setInterval(() => { if (BH.UI.screen !== 'lobby' && !(BH.Panels && BH.Panels.top() && BH.Panels.top().opts.kind === 'lobby')) { clearInterval(timer); return; } Lobby.refresh(); }, 3000); },

    html(inGame) {
      const s = BH.Game.s || Lobby.lastSave();
      const me = s && s.player;
      const links = data && data.links;
      const friendLink = links ? (links.public || links.lan[0] || location.origin) : null;
      const players = data ? data.players : [];
      const cls = s && s.school && BH.School && BH.Game.s ? BH.School.myClass(BH.Game.s) : null;
      const inv = BH.Invite && BH.Invite.info;
      return `
        ${inv ? `<div class="card invite-card"><b>📩 ${U.esc(inv.name)} invited you!</b><p>${inv.arm ? `They're in <b>${U.esc(BH.data.LEVELS[(Number(inv.level) || 1) - 1] || '')}${U.esc(inv.arm)}</b>, ${U.esc(inv.house || '')} House. ` : ''}Create a new student and you'll join their class arm and house.</p><button class="btn primary" data-act="newGameMenu">✏️ Create my student</button></div>` : ''}
        <div class="card">
          <h3>${err ? '📴 Not connected to a game server' : '🟢 Server online'}</h3>
          ${err ? `<p>To play together, the host runs <code>npm run play</code> on their computer and everybody opens the link it prints. See <b>PLAY_WITH_FRIENDS.md</b>.</p>` : `
          <p class="muted">Send this link to your friends:</p>
          <div class="link-box"><code>${U.esc(friendLink)}</code><button class="btn sm" data-act="lobbyCopy" data-arg="${U.esc(friendLink)}">📋 Copy</button></div>
          ${links && links.public ? '<p class="muted tiny">🌍 Public link — works from anywhere.</p>' : links && links.lan.length ? '<p class="muted tiny">📶 Wi-Fi link — your friend must be on the same Wi-Fi or your phone hotspot. Elsewhere? Run <code>npm run tunnel</code>.</p>' : ''}`}
        </div>
        ${me && !err ? `<div class="card"><h3>🔗 Your invite link</h3><p class="muted">Opens the game, puts your friend in <b>your</b> school${cls ? ` and class (<b>${cls.id}</b>, ${U.esc(me.house.tag)} House)` : ', class and house'} when they create their student.</p>
          ${invite ? `<div class="link-box"><code>${U.esc(invite)}</code><button class="btn sm" data-act="lobbyCopy" data-arg="${U.esc(invite)}">📋 Copy</button>${navigator.share ? `<button class="btn sm" data-act="lobbyShare" data-arg="${U.esc(invite)}">📤 Share</button>` : ''}</div>` : '<p class="muted">…</p>'}</div>` : ''}
        <div class="card"><h3>👥 Online now (${players.length})</h3>
          ${players.length ? players.map((p) => `<div class="person"><span class="p-emoji">🧑🏾‍🎓</span><span class="p-text"><b>${p.gang ? `[${U.esc(p.gang)}] ` : ''}${U.esc(p.name)}</b><small>${p.level ? `${U.esc(BH.data.LEVELS[Number(p.level) - 1] || '')}${U.esc(p.arm || '')} · ` : ''}${p.house ? `${U.esc(p.house)} House · ` : ''}📍 ${U.esc(BH.School ? BH.School.place(p.map || 'campus').name : p.map)}</small></span>${inGame && BH.Net && BH.Net.byPid(p.pid) ? `<button class="btn sm" data-act="playerMenu" data-arg="${U.esc(p.pid)}">Hang out</button>` : ''}</div>`).join('') : `<p class="muted">${err ? '—' : 'Nobody yet. Send the link above!'}</p>`}
          ${data && data.tables.length ? `<p class="muted tiny">🎲 Open tables: ${data.tables.map((t) => `${U.esc(t.title)} (${t.players}/${t.seats})`).join(' · ')}</p>` : ''}
        </div>
        <details class="card"><summary><b>❓ How do we connect?</b></summary>
          <p><b>Same Wi-Fi / hotspot:</b> the host runs <code>npm run play</code>; friends open the link it prints (or scan the QR code).</p>
          <p><b>Different places:</b> the host runs <code>npm run tunnel</code> and sends the 🌍 link.</p>
          <p><b>Always online:</b> deploy once (Fly.io / Railway) — see PLAY_WITH_FRIENDS.md.</p>
          <p><b>Same class:</b> use your invite link, or in game tap your friend → 🏫 Join their class.</p>
        </details>`;
    },
  };

  BH.Screens.lobby = {
    render() {
      if (!timer) Lobby.start();
      return `<div class="title-screen"><div class="title-card lobby-card"><h1 class="lobby-title">🌐 Play with friends</h1>${Lobby.html(false)}
        <div class="title-btns"><button class="btn ghost" data-act="lobbyBack">← Back</button></div></div></div>`;
    },
  };

  Object.assign(BH.actions, {
    openLobby() { if (BH.UI.screen === 'game') { BH.Panels.open(() => `<h2>🌐 Play with friends</h2>${Lobby.html(true)}`, { cls: 'sheet', kind: 'lobby' }); Lobby.start(); } else { timer = null; BH.UI.go('lobby'); } },
    lobbyBack() { clearInterval(timer); timer = null; BH.UI.go('title'); },
    async lobbyCopy(text) { try { await navigator.clipboard.writeText(text); toast('📋 Link copied — paste it in your group chat!', 'good'); } catch (e) { prompt('Copy this link:', text); } },
    async lobbyShare(text) { try { await navigator.share({ title: 'Boarding House', text: 'Come and resume with me at Boarding House 🏫', url: text }); } catch (e) { /* cancelled */ } },
  });

  BH.Lobby = Lobby;
  if (BH.Invite && BH.Invite.from) BH.Invite.load();
})(window.BH);
