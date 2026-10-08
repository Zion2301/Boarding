/* Where the game server is, and invite links.
   Server address, first match wins:
     1. ?server=https://my-school.fly.dev in the page link (remembered on this device)
     2. window.BH_SERVER_URL from js/net/server-url.js (written at deploy time for Netlify/Vercel — see PLAY_WITH_FRIENDS.md)
     3. the page's own address when the page came from the game server (npm run play / tunnel / Fly / Railway)
   Invite links: <game link>?invite=<your player id> — a friend who opens it gets your school, and their new student
   joins your class arm and house (and becomes your bunkmate if possible). */
(function (BH) {
  const params = new URLSearchParams(location.search);
  const KEY = 'bh_server';
  try { if (params.get('server')) localStorage.setItem(KEY, params.get('server').replace(/\/$/, '')); } catch (e) { /* private mode */ }

  const Server = {
    base() {
      let saved = null;
      try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
      if (saved) return saved;
      if (window.BH_SERVER_URL) return String(window.BH_SERVER_URL).replace(/\/$/, '');
      if (BH.Prefs && BH.Prefs.v.aiServer) return BH.Prefs.v.aiServer.replace(/\/$/, '');
      return /^https?:/.test(location.protocol) ? location.origin : '';
    },
    /* where friends should go: a hosted client, the public tunnel, or this computer's Wi-Fi address */
    async shareBase() {
      const own = location.origin;
      const local = /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])/.test(own);
      if (!local && /^https?:/.test(location.protocol)) return own;
      try {
        const r = await fetch(Server.base() + '/api/online');
        const j = await r.json();
        return (j.links && (j.links.public || j.links.lan[0])) || own;
      } catch (e) { return own; }
    },
    async inviteLink(s) {
      const base = await Server.shareBase();
      const u = new URL(base + '/');
      u.searchParams.set('invite', s.player.playerId);
      if (window.BH_SERVER_URL && !/^https?:\/\/(localhost|127)/.test(base)) u.searchParams.set('server', Server.base());
      return u.toString();
    },
  };

  /* an invite link was opened: remember who invited us until the new student is created */
  const Invite = {
    from: params.get('invite') || (() => { try { return sessionStorage.getItem('bh_invite'); } catch (e) { return null; } })(),
    info: null,
    async load() {
      if (!Invite.from) return null;
      try { sessionStorage.setItem('bh_invite', Invite.from); } catch (e) { /* ignore */ }
      try { const r = await fetch(`${Server.base()}/api/invite?from=${encodeURIComponent(Invite.from)}`); if (r.ok) Invite.info = await r.json(); } catch (e) { /* offline */ }
      BH.UI && BH.UI.screen === 'title' && BH.UI.render();
      return Invite.info;
    },
    used() { Invite.from = null; Invite.info = null; try { sessionStorage.removeItem('bh_invite'); } catch (e) { /* ignore */ } },
  };

  BH.Server = Server;
  BH.Invite = Invite;
})(window.BH);
