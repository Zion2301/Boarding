/* Net — the multiplayer client (Colyseus, same server that serves the game).
   Joins the "campus" room for your school and keeps:
   · remote players as actors (kind 'remote', id 'r:<sessionId>') — rendered like everyone else, smoothed
   · the shared school clock: your time of day / weekday follow the room; sleeping/waiting is a vote (all must agree)
   · proximity chat + shouts, emotes, calls, gifts, invites, friends / best friend / gang (BH.Social owns the UI)
   · lesson answers relayed to everyone in the same classroom
   Single-player keeps working when there's no server (file://, offline) or when you switch "Online" off. */
(function (BH) {
  const U = BH.U;
  const WEEK = 7 * 1440;
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast && BH.UI.toast(t, k);

  const Net = {
    room: null, client: null, sid: null, online: false, connecting: false,
    players: new Map(),   // sid → profile + target position
    social: { friends: [], requests: [], bestie: null, gang: null, gangInvites: [] },
    tables: [], chat: [], time: null, base: null, counted: 0, bestieLoc: null, waypoint: null, cohort: null,
    sendAcc: 0, profAcc: 0, lastSent: '', lastProf: '',

    available() { return /^https?:/.test(location.protocol) && !!window.Colyseus; },
    wanted() { return Net.available() && BH.Prefs.v.online !== false; },
    send(type, msg) { if (Net.room && Net.online) try { Net.room.send(type, msg); } catch (e) { /* closed */ } },

    /* ---------- connect ---------- */
    async connect() {
      const s = BH.Game.s;
      if (!s || !Net.wanted() || Net.online || Net.connecting) return;
      Net.connecting = true;
      try {
        Net.client = Net.client || new window.Colyseus.Client(location.origin);
        const st = BH.School.student(s, 'player') || {};
        const loc = Net.localWeekMin(s);
        Net.room = await Net.client.joinOrCreate('campus', Object.assign(Net.profile(s), {
          school: 'main', pid: s.player.playerId, newPlayer: !s.flags.onboarded && s.time.dayCount === 0,
          dow: Math.floor(loc / 1440), min: loc % 1440, map: s.world.map || 'campus', x: s.pos ? s.pos.x : 1200, y: s.pos ? s.pos.y : 1660,
          schoolName: s.player.schoolName, schoolType: s.player.school, seed: s.school.seed, arm: st.arm,
        }));
        Net.bind(Net.room);
        Net.room.send('ready');
      } catch (e) {
        console.warn('Multiplayer unavailable:', e && e.message);
        Net.room = null;
      }
      Net.connecting = false;
    },
    disconnect() {
      if (Net.room) try { Net.room.leave(true); } catch (e) { /* ignore */ }
      Net.reset();
    },
    reset() {
      Net.room = null; Net.online = false; Net.sid = null; Net.base = null; Net.time = null;
      Net.players.forEach((p) => BH.Actors && BH.Actors.remove('r:' + p.sid));
      Net.players.clear();
      BH.bus.emit('net:status', { online: false });
    },

    profile(s) {
      const st = BH.School.student(s, 'player') || {};
      return {
        name: s.player.name, gender: s.player.gender, level: String(s.time.year), arm: st.arm, house: s.player.house && s.player.house.tag,
        dept: st.dept || '', religion: s.player.religion, lang: s.player.lang,
        look: { av: s.player.avatar, outfit: BH.Outfits ? BH.Outfits.forPlayer(s) : null },
        status: s.act ? s.act.type : '',
      };
    },

    bind(room) {
      room.onMessage('welcome', (m) => Net.welcome(m));
      room.onMessage('join', (p) => Net.addPlayer(p, true));
      room.onMessage('leave', (m) => Net.removePlayer(m.sid));
      room.onMessage('prof', (p) => { const q = Net.players.get(p.sid); if (q) Object.assign(q, p); else Net.addPlayer(p); Net.syncActor(Net.players.get(p.sid)); });
      room.onMessage('ps', (ps) => Object.entries(ps).forEach(([sid, v]) => { const p = Net.players.get(sid); if (!p) return; [p.map, p.tx, p.ty, p.th, p.a, p.sp] = v; p.at = performance.now(); Net.syncActor(p); }));
      room.onMessage('time', (t) => Net.onTime(t));
      room.onMessage('ffDone', () => { const s = BH.Game.s; if (s && s.world.ff) BH.Clock.stopWait(s, 'time'); });
      room.onMessage('said', (m) => Net.onSaid(m));
      room.onMessage('emote', (m) => { const a = BH.Actors.get(m.sid === Net.sid ? 'player' : 'r:' + m.sid); if (a) a.emote = { anim: m.a === 'beckon' ? 'wave' : m.a === 'clap' || m.a === 'laugh' ? 'cheer' : m.a, until: performance.now() + 2500 }; });
      room.onMessage('blocked', (m) => toast(`🚫 Not sent: ${m.reason}`, 'bad'));
      room.onMessage('safety', (m) => BH.Dialogue && BH.Dialogue.say ? BH.Dialogue.say({ portrait: { emoji: '💛' }, name: 'Take a moment', text: m.text }) : toast(m.text, 'info'));
      room.onMessage('lesson', (m) => { const s = BH.Game.s; if (s && s.world.map === m.room && BH.Lessons) BH.Lessons.answer(s, 'r:' + m.pid, m.text); });
      room.onMessage('tables', (t) => { Net.tables = t || []; BH.bus.emit('net:tables', {}); });
      room.onMessage('bestieLoc', (m) => { Net.bestieLoc = Object.assign(m, { at: Date.now() }); });
      room.onMessage('bunkmate', (m) => { BH.Onboarding && BH.Onboarding.bunkmate(BH.Game.s, m); });
      // social messages are handled by BH.Social (UI); keep them registered here so nothing is dropped
      ['social', 'friendReq', 'friendResult', 'call', 'follow', 'gift', 'invite', 'sitWith', 'cover', 'gangInvite'].forEach((t) => room.onMessage(t, (m) => BH.Social && BH.Social.on(t, m)));
      room.onLeave(() => { const was = Net.online; Net.reset(); if (was) toast('📴 Lost connection to the school server — playing offline.', 'bad'); });
      room.onError((code, msg) => console.warn('room error', code, msg));
    },

    welcome(m) {
      const s = BH.Game.s;
      Net.sid = m.sid;
      Net.online = true;
      // everyone online is in the same school (name, uniform, timetables)
      if (m.school) BH.School.adoptSchool(s, m.school);
      Net.onTime(m.time);
      Net.align(s);
      m.players.forEach((p) => Net.addPlayer(p));
      Net.tables = m.tables || [];
      if (m.social) BH.Social && BH.Social.on('social', m.social);
      if (m.cohort) { Net.cohort = m.cohort; BH.Onboarding && BH.Onboarding.cohort(s, m.cohort); }
      BH.bus.emit('net:status', { online: true });
      const n = m.players.length;
      toast(n ? `🌐 Online — ${n} other player${n === 1 ? '' : 's'} on campus.` : '🌐 Online — you\'re the first one on campus.', 'good');
    },

    /* ---------- remote players ---------- */
    addPlayer(p, announce) {
      const q = Object.assign(Net.players.get(p.sid) || {}, p, { tx: p.x, ty: p.y, th: p.h || 0, a: p.a || 'idle', at: performance.now() });
      Net.players.set(p.sid, q);
      Net.syncActor(q);
      if (announce && BH.Social && BH.Social.isFriend(q.pid)) toast(`👋🏾 Your padi ${q.name} just came online.`, 'good');
    },
    removePlayer(sid) {
      const p = Net.players.get(sid);
      Net.players.delete(sid);
      BH.Actors && BH.Actors.remove('r:' + sid);
      const s = BH.Game.s;
      if (p && s && BH.Sim && BH.Sim.follow === 'r:' + sid) BH.Sim.follow = null;
    },
    syncActor(p) {
      if (!BH.Actors || !p) return;
      let a = BH.Actors.get('r:' + p.sid);
      if (!a) a = BH.Actors.make('r:' + p.sid, { kind: 'remote', pid: p.pid, map: p.map || 'campus', x: p.tx ?? p.x ?? 0, y: p.ty ?? p.y ?? 0, h: p.th || 0, maxSpeed: 200 });
      Object.assign(a, { pid: p.pid, name: p.name, map: p.map || a.map, look: p.look, gang: p.gang, remoteSeat: p.seat });
    },
    /* smooth remote players toward their last known position (called every frame) */
    update(dt) {
      if (!Net.online) return;
      const k = 1 - Math.exp(-dt * 10);
      Net.players.forEach((p) => {
        const a = BH.Actors.get('r:' + p.sid);
        if (!a) return;
        const dx = p.tx - a.x, dy = p.ty - a.y;
        if (Math.hypot(dx, dy) > 200 || a.map !== p.map) { a.x = p.tx; a.y = p.ty; a.map = p.map; }
        else { a.x += dx * k; a.y += dy * k; }
        a.h = p.th;
        a.speed = p.sp || 0;
        a.anim = p.a || 'idle';
        a.pose = ['sit', 'sleep', 'sleep_sit', 'kneel', 'crouch', 'busy', 'dance', 'cheer', 'eat'].includes(a.anim) ? a.anim : null;
      });
      // send my position ~8×/s when it changes, my profile when it changes
      const s = BH.Game.s, pl = BH.Actors.player();
      Net.sendAcc += dt;
      if (pl && Net.sendAcc >= 0.12) {
        Net.sendAcc = 0;
        const msg = [BH.Sim.mapId, Math.round(pl.x), Math.round(pl.y), +pl.h.toFixed(2), pl.anim, Math.round(pl.speed || 0)];
        const key = msg.join('|');
        if (key !== Net.lastSent) { Net.lastSent = key; Net.send('p', msg); }
      }
      Net.profAcc += dt;
      if (s && Net.profAcc >= 2) {
        Net.profAcc = 0;
        const prof = Net.profile(s);
        const key = JSON.stringify(prof);
        if (key !== Net.lastProf) { Net.lastProf = key; Net.send('prof', prof); }
      }
    },
    byPid(pid) { for (const p of Net.players.values()) if (p.pid === pid) return p; return null; },
    nameOf(pid) { const p = Net.byPid(pid); return p ? p.name.split(' ')[0] : 'Someone'; },
    /* online classmates, for the school roster (registers, seating, lessons) */
    students() {
      return [...Net.players.values()].filter((p) => p.level).map((p) => ({ id: 'r:' + p.pid, kind: 'player', remote: true, name: p.name, gender: p.gender, level: Number(p.level), arm: p.arm, dept: p.dept || null, religion: p.religion, lang: p.lang, house: p.house }));
    },
    here(map) { return [...Net.players.values()].filter((p) => p.map === map); },

    /* ---------- the shared clock ---------- */
    onTime(t) { if (t) Net.time = Object.assign(t, { at: performance.now() }); },
    est() { const t = Net.time; return t ? t.abs + ((performance.now() - t.at) / 1000) * t.rate : 0; },
    clockOn() { return Net.online && !!Net.time && Net.base !== null; },
    localWeekMin(s) { const day = (s.time.dow + Math.floor(s.clock / 1440)) % 7; return day * 1440 + (((s.clock % 1440) + 1440) % 1440); },
    /* catch my clock up with the room's (forward only), then follow it */
    align(s) {
      const want = ((Math.floor(Net.est()) % WEEK) + WEEK) % WEEK;
      let diff = (want - Net.localWeekMin(s) + WEEK) % WEEK;
      if (diff > WEEK - 30) diff = 0; // a few minutes "behind" → just wait for the room
      if (diff > 0) { toast(`⏩ Joining the school day (${BH.Clock.until(diff)} ahead)…`, 'info'); BH.Clock.tick(s, diff); }
      Net.base = Net.est(); Net.counted = 0;
    },
    /* minutes the local clock should tick now (server time minus what we already ticked) */
    due() { return Math.floor(Net.est() - Net.base - Net.counted); },
    ticked(n) { if (Net.clockOn()) Net.counted += n; },
    vote(minutes, rate, label) { Net.send('ff', { minutes, rate, label }); },
    unvote() { Net.send('ff', { cancel: true }); },
    waitingLabel() { const t = Net.time; return t && t.n > 1 && t.rate <= 1 ? ` (waiting for everyone: ${t.ff}/${t.n})` : ''; },

    /* ---------- chat ---------- */
    say(text, shout) {
      const s = BH.Game.s;
      text = String(text || '').trim().slice(0, 140);
      if (!text) return;
      const mod = window.BHModeration ? window.BHModeration.moderate(text, { context: 'public', max: 140 }) : { verdict: 'ok', text };
      if (mod.distress) { BH.Dialogue.say({ portrait: { emoji: '💛' }, name: 'Take a moment', text: 'What you wrote sounds really hard, and it matters. Please talk to a trusted adult today — a parent, relative, teacher or school counsellor. If you are in danger right now, contact local emergency services.' }); return; }
      if (mod.verdict === 'blocked') { toast(`🚫 ${window.BHModeration.explain(mod.reasons)}`, 'bad'); return; }
      // talking in class can get you caught
      const L = BH.Lessons && BH.Lessons.here(s);
      if (L && L.kind === 'lesson' && !(L.q && !L.q.closed) && !L.free && BH.Lessons.teacher(s, L)) BH.Lessons.chatter(s, L, 'player', mod.text);
      if (Net.online) Net.send('say', { text: mod.text, shout: !!shout });
      else Net.onSaid({ sid: null, pid: s.player.playerId, text: mod.text, shout: !!shout });
    },
    onSaid(m) {
      const s = BH.Game.s;
      const mine = !m.sid || m.sid === Net.sid;
      const a = BH.Actors && BH.Actors.get(mine ? 'player' : 'r:' + m.sid);
      const pl = BH.Actors && BH.Actors.player();
      const name = mine ? s.player.name.split(' ')[0] : Net.nameOf(m.pid);
      // proximity: you hear people near you (same room); shouts carry across the whole map
      const near = mine || (a && pl && a.map === pl.map && (m.shout || Math.hypot(a.x - pl.x, a.y - pl.y) < 360));
      if (!near) return;
      if (a) a.bubble = { text: (m.shout ? '📢 ' : '') + m.text, until: performance.now() + 4500 + m.text.length * 40, player: true };
      Net.chat.push({ name, text: m.text, shout: m.shout, mine, at: Date.now() });
      if (Net.chat.length > 40) Net.chat.shift();
      BH.bus.emit('net:chat', {});
    },
    emote(a) { BH.bus.emit('emote', { a }); if (Net.online) Net.send('emote', { a }); const pl = BH.Actors.player(); if (pl) pl.emote = { anim: a === 'beckon' ? 'wave' : a, until: performance.now() + 2500 }; },
  };

  BH.Net = Net;
})(window.BH);
