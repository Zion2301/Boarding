/* Anonymous play stats for the admin dashboard (server/analytics.js).
   What is sent: a random device id made up on this device, and events — visit (with the site that linked here and
   phone/computer), a play-time heartbeat each minute while you're in the game, new game, chapter reached, graduation,
   story choices (which branch), conversations, joining a private school. Nothing you type, no names, no accounts.
   ⚙️ → 📊 Play stats: Off stops it completely. */
(function (BH) {
  const KEY = 'bh_device', OFF = 'bh_stats_off';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const rid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

  const Track = {
    lastStamp: null,
    on() { return get(OFF) !== '1'; },
    setOn(on) { set(OFF, on ? null : '1'); },
    device() { let d = get(KEY); if (!d) { d = rid(); set(KEY, d); } return d; },
    send(e, v) {
      if (!Track.on() || location.protocol === 'file:' || !BH.Server) return;
      try {
        fetch(BH.Server.base() + '/api/track', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ d: Track.device(), e, v: v || {} }) }).catch(() => {});
      } catch (err) { /* never break the game */ }
    },
    playing() { const s = BH.Game && BH.Game.s; return !!s && BH.UI && BH.UI.screen === 'game' && !document.hidden && !s.gameOver; },
    chapter(s) {
      const st = s && s.time && BH.Story ? BH.Story.stamp(s) : null;
      if (st && st !== Track.lastStamp) { Track.lastStamp = st; Track.send('chapter', { stamp: st }); }
    },
    /* a system, so it hears new games, loads and new days */
    onNewGame(s) { Track.send('newgame'); Track.lastStamp = null; Track.chapter(s); },
    onLoad(s) { Track.chapter(s); },
    onNewDay(s) { Track.chapter(s); },
  };

  BH.bus.on('arc:choice', (p, s) => { const L = s && s.story && s.story.beatLog; const last = L && L[L.length - 1]; if (last && last.id === p.beat) Track.send('choice', { beat: p.beat, choice: last.choice }); });
  BH.bus.on('milestone', (p) => { if (p.id === 'graduation') Track.send('grad'); });
  BH.bus.on('convo', () => Track.send('convo'));
  BH.bus.on('net:status', (p) => { if (p.online && !Track.mpSent) { Track.mpSent = true; Track.send('mp'); } });

  // visit (+ where it came from) and play time: counted to the second while you're in the game and the tab is visible,
  // sent every 30 s and flushed when you leave or switch apps, so short phone sessions still count
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const q = new URLSearchParams(location.search);
  const src = q.get('ref') || q.get('utm_source') || '';
  setTimeout(() => Track.send('visit', { ref: document.referrer || '', src, mobile: !!coarse }), 1500);
  let acc = 0, last = Date.now();
  const tick = () => { const now = Date.now(); if (Track.playing()) acc += Math.min(now - last, 5000); last = now; };
  const flush = () => { tick(); const s = Math.floor(acc / 1000); if (s >= 1) { acc -= s * 1000; Track.send('beat', { s }); } };
  setInterval(tick, 1000);
  setInterval(flush, 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else last = Date.now(); });
  addEventListener('pagehide', flush);

  Object.assign(BH.actions, { setStats(v) { Track.setOn(v === '1'); if (BH.Panels) BH.Panels.refresh(); if (BH.UI) BH.UI.toast(v === '1' ? '📊 Thank you! Anonymous play stats are on.' : '📊 Play stats off. Nothing is sent.', 'info'); } });
  BH.Track = Track;
  BH.registerSystem('Track', Track);
})(window.BH);
