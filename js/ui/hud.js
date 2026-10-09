/* HUD floating over the world (GTA-style). Reads the single store (BH.Game.s).
   TL: stats + minimap (campus) / room name (inside) · TR: clock, money, weather, what the world expects of you
   Top-centre: people calling you + the 👁️ suspicion meter · Right: mission tracker with ⏱ deadlines (tap = 📍)
   Over the world: the E-prompt above whatever you're next to (1–2 actions; ⋯ / hold E / long-press = radial)
   BR: 🎒 📱 👤 ⏳ ⚙️ · BL: joystick (touch) · bottom: fast-forward banner while waiting/sleeping. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;

  BH.Store = {
    get state() { return BH.Game.s; },
    changed() { HUD.dirty = true; },
  };

  const HUD = {
    joy: { x: 0, y: 0 },
    waypoint: null,
    dirty: true,
    last: 0,
    sig: {},
    prompt: { target: null, actions: [] },

    mount(root) {
      root.innerHTML = `
        <div class="hud">
          <div class="hud-bar">
            <button id="pill-stats" class="pill vitals" data-act="cxToggle" data-arg="stats" aria-label="Your needs"></button>
            <span class="bar-gap"></span>
            <button id="pill-missions" class="pill missions" data-act="cxToggle" data-arg="missions" aria-label="Missions" hidden></button>
            <button id="pill-clock" class="pill clock" data-act="cxToggle" data-arg="clock" aria-label="Clock"></button>
          </div>
          <div class="hud-tl"><div id="hud-stats" class="hud-stats"></div><div id="minimap-frame" class="minimap-frame"></div><div id="hud-room" class="hud-room"></div></div>
          <div class="hud-tr"><div id="hud-clock" class="hud-card clock-card"></div><div id="toasts"></div></div>
          <div id="hud-top" class="hud-top"></div>
          <div id="hud-missions" class="hud-missions"></div>
          <div class="hud-br">
            <button class="round-btn" data-act="openMenu" aria-label="Menu">⚙️</button>
            <button class="round-btn" data-act="openWait" aria-label="Wait">⏳</button>
            <button class="round-btn" data-act="openMe" aria-label="Me">👤</button>
            <button class="round-btn" data-act="openPhone" aria-label="Phone">📱<span id="phone-badge" class="badge" hidden></span></button>
            <button class="round-btn big" data-act="openBag" aria-label="Backpack">🎒</button>
            <button class="round-btn menu-fab" data-act="cxToggle" data-arg="menu" aria-label="More">☰<span id="fab-badge" class="badge" hidden></span></button>
          </div>
          <button class="round-btn snap-btn" data-act="camSnap" aria-label="Back to player" title="Back to player">🎯</button>
          <div id="joystick" class="joystick"><div class="joy-knob"></div></div>
          <div id="hud-prompt" class="hud-prompt"></div>
          <div id="hud-ff" class="hud-ff"></div>
        </div>`;
      HUD.bindJoystick();
      HUD.bindPrompt();
      HUD.sig = {};
      HUD.dirty = true;
      HUD.update(true);
    },
    setMap(outdoor, cm) {
      document.body.classList.toggle('indoors', !outdoor);
      const r = document.getElementById('hud-room');
      if (r) r.innerHTML = outdoor ? '' : `<div class="hud-card room-card">${cm.src.emoji} ${U.esc(cm.src.name)}${cm.src.quiet ? ' <small>🤫 quiet</small>' : ''}${cm.src.forbidden ? ' <small class="bad-txt">⛔ no students</small>' : ''}</div>`;
      HUD.sig = {};
      HUD.dirty = true;
    },

    /* ---------- joystick ---------- */
    bindJoystick() {
      const base = document.getElementById('joystick');
      if (!base) return;
      const knob = base.querySelector('.joy-knob');
      let id = null, cx = 0, cy = 0;
      const R = 46;
      const move = (x, y) => {
        let dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        HUD.joy = { x: dx / R, y: dy / R };
      };
      const end = () => { id = null; knob.style.transform = ''; HUD.joy = { x: 0, y: 0 }; base.classList.remove('on'); };
      base.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0]; id = t.identifier;
        const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        base.classList.add('on'); move(t.clientX, t.clientY); e.preventDefault();
      }, { passive: false });
      base.addEventListener('touchmove', (e) => { const t = [...e.changedTouches].find((x) => x.identifier === id); if (t) { move(t.clientX, t.clientY); e.preventDefault(); } }, { passive: false });
      base.addEventListener('touchend', end); base.addEventListener('touchcancel', end);
      base.addEventListener('mousedown', (e) => {
        const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; base.classList.add('on'); move(e.clientX, e.clientY);
        const mm = (ev) => move(ev.clientX, ev.clientY);
        const mu = () => { end(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
        window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
      });
    },
    /* long-press the prompt → radial menu */
    bindPrompt() {
      const el = document.getElementById('hud-prompt');
      let timer = null;
      el.addEventListener('pointerdown', () => { clearTimeout(timer); timer = setTimeout(() => { HUD.longPressed = true; HUD.radial(); }, 480); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => el.addEventListener(e, () => clearTimeout(timer)));
      el.addEventListener('click', (ev) => { if (HUD.longPressed) { HUD.longPressed = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
      // hold E on a keyboard → radial
      let eDown = 0;
      document.addEventListener('keydown', (ev) => { if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return; if (document.body.classList.contains('engine3d')) return; if ((ev.key === 'e' || ev.key === 'E') && !ev.repeat) eDown = Date.now(); if ((ev.key === 'e' || ev.key === 'E') && ev.repeat && eDown && Date.now() - eDown > 450) { eDown = 0; HUD.radial(); } });
    },

    /* ---------- rendering ---------- */
    set(id, html) {
      if (HUD.sig[id] === html) return;
      HUD.sig[id] = html;
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    },

    update(force) {
      const s = BH.Game.s;
      if (!s || !document.getElementById('hud-stats')) return;
      HUD.placePrompt(s);
      BH.Compact && BH.Compact.update(s);
      BH.LessonUI && BH.LessonUI.update();
      BH.Social && BH.Social.update();
      BH.TimeBar && BH.TimeBar.update();
      const now = performance.now();
      if (!force && !HUD.dirty && now - HUD.last < 250) return;
      HUD.last = now; HUD.dirty = false;

      HUD.set('hud-stats', BH.Stats.KEYS.map((k) => {
        const v = Math.round(s.stats[k]);
        return `<div class="st ${BH.Stats.level(v)}" title="${BH.Stats.LABELS[k]} ${v}"><i>${BH.Stats.ICONS[k]}</i><span class="bar"><b style="width:${v}%"></b></span></div>`;
      }).join(''));

      // clock card: time, money, weather, and what the world expects of you
      const info = BH.Clock.info(s);
      const st = info.status || { kind: 'free', text: '' };
      const W = BH.Content.get('world').weather.kinds[BH.WorldSim.weather(s)];
      const raining = BH.WorldSim.raining(s);
      const wx = `${raining ? '🌧️' : W.emoji}${BH.WorldSim.power(s) ? '' : ' ⚡❌'}`;
      const speed = BH.Clock.speed(s);
      const cls = { absent: 'late', late: 'soon', due: info.left <= 10 ? 'soon' : '', present: 'ok', excused: 'ok' }[st.kind] || '';
      HUD.set('hud-clock', `<div class="clock-row"><b>${BH.Clock.label(s)}</b><span class="wx">${wx}</span><span class="money">${U.money(s.money)}</span></div>
        <div class="clock-sub">${BH.Time.levelName(s)} · T${s.time.term} · Wk${s.time.week}${speed > 1.5 ? ` · <span class="ff">⏩×${Math.round(speed)}</span>` : ''}</div>
        <div class="next ${cls}">${info.b.emoji} ${info.b.title}${info.b.kind === 'class' && BH.Clock.subjectNow(s) ? ` · ${BH.Academics.name(s, BH.Clock.subjectNow(s), true)}` : ''}<small>${U.esc(st.text)}</small><small class="muted">🔔 ${info.next.title} in ${BH.Clock.until(info.left)}</small></div>`);

      // calls + suspicion (top centre)
      const calls = s.world.calls.map((c) => {
        const n = c.npc && BH.NPC.get(s, c.npc);
        const left = c.expires - BH.Clock.abs(s);
        return `<button class="call-chip" data-act="callTap" data-arg="${c.uid}">${n ? `📢 ${U.esc(BH.NPC.name(n))} dey call you` : U.esc(c.text)} <small>⏱ ${BH.Clock.until(left)}</small></button>`;
      }).join('');
      const sus = s.world.sus && s.world.sus.level > 0.02 ? s.world.sus : null;
      const susHtml = sus ? `<div class="sus ${sus.level > 0.6 ? 'hot' : ''}"><span>👁️ ${U.esc((BH.NPC.get(s, sus.by) ? BH.NPC.name(BH.NPC.get(s, sus.by)) : 'Someone'))} dey look!</span><i style="width:${Math.round(sus.level * 100)}%"></i></div>` : '';
      const hide = BH.Rules.hidden(s) ? '<div class="sus safe"><span>🫥 Hidden</span></div>' : '';
      HUD.set('hud-top', calls + susHtml + hide);
      document.body.classList.toggle('has-calls', !!(calls || susHtml || hide));

      // missions tracker
      const ms = BH.Missions.live(s).concat((s.missions || []).filter((m) => !['offered', 'active'].includes(m.status) && BH.Clock.abs(s) - (m.closedAt || 0) < 90));
      HUD.set('hud-missions', ms.length ? `<div class="hud-card missions-card ${HUD.missionsOpen ? 'open' : ''}"><div class="mc-title" data-act="toggleMissions">🎯 Missions ${ms.length > 3 ? `<small>(${ms.length})</small>` : ''}</div>${ms.slice(0, 6).map((m) => {
        const box = m.status === 'completed' ? '☑' : ['failed', 'expired', 'ignored', 'refused'].includes(m.status) ? '☒' : m.status === 'offered' ? '📢' : '☐';
        const left = m.due ? m.due - BH.Clock.abs(s) : null;
        const t = m.status === 'active' && left !== null ? `<small class="due ${left < 30 ? 'hot' : ''}">⏱ ${BH.Clock.until(left)}</small>` : m.status === 'offered' ? '<small class="due">talk to them</small>' : `<small class="due">${m.status}</small>`;
        const st2 = m.status === 'active' ? `<small class="step">${U.esc(BH.Missions.stepLabel(s, m))}</small>` : '';
        return `<button class="mrow ${m.status} ${HUD.waypoint === m.id ? 'wp' : ''}" data-act="missionTap" data-arg="${m.id}" title="${U.esc(m.desc)}">
          <span class="box">${box}</span><span class="mt">${m.emoji} ${U.esc(m.title)}${st2}${t}</span>${HUD.waypoint === m.id ? '<span class="pin">📍</span>' : ''}</button>`;
      }).join('')}</div>` : '');

      const badge = document.getElementById('phone-badge');
      if (badge) { const un = s.phone && s.phone.has && !s.phone.confiscated ? BH.Phone.unreadTotal(s) : 0; badge.hidden = !un; badge.textContent = un; }

      // fast-forward banner
      const ff = s.world.ff;
      HUD.set('hud-ff', ff ? `<button class="ff-banner" data-act="stopWait">${U.esc(ff.label || '⏩')} <small>${BH.Clock.until(ff.until - BH.Clock.abs(s))} · tap or move to stop</small></button>` : '');

      HUD.renderPrompt(s);
    },

    /* ---------- the E-prompt ---------- */
    renderPrompt(s) {
      const t = BH.Panels.isOpen() || s.world.ff ? null : BH.World.target();
      const acts = t ? BH.Interaction.actions(s, t).filter((a) => !a.disabled) : [];
      HUD.prompt = { target: t, actions: acts };
      if (!t || !acts.length) { HUD.set('hud-prompt', ''); return; }
      const keys = document.body.classList.contains('engine3d') ? ['Space', 'F'] : ['E', 'F'];
      const shown = acts.slice(0, 2);
      HUD.set('hud-prompt', `<div class="prompt-card">
        <div class="prompt-title">${U.esc(BH.Interaction.title(s, t))}</div>
        <div class="prompt-btns">${shown.map((a, i) => `<button class="chunky ${i === 0 ? 'primary' : ''} ${a.crime ? 'risky' : ''}" data-act="promptDo" data-arg="${i}"><kbd>${keys[i]}</kbd> ${a.emoji || ''} ${U.esc(a.label)}</button>`).join('')}
        ${acts.length > 2 ? `<button class="chunky more" data-act="openRadial" aria-label="More actions">⋯ <small>${acts.length - 2}</small></button>` : ''}</div></div>`);
    },
    /* keep the prompt floating above the target as the camera moves */
    placePrompt(s) {
      const el = document.getElementById('hud-prompt');
      const t = HUD.prompt.target;
      if (!el || !t || !el.firstElementChild) return;
      const p = BH.World.toScreen(t.x, t.y);
      if (!p) return;
      const w = el.offsetWidth || 260, h = el.offsetHeight || 80;
      const x = Math.max(8 + w / 2, Math.min(window.innerWidth - 8 - w / 2, p.x));
      const y = Math.max(h + 70, Math.min(window.innerHeight - 140, p.y - 12));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    },

    /* keyboard E / F */
    primary(i = 0) {
      if (BH.Panels.isOpen()) {
        if (i !== 0) return;
        const btn = document.querySelector('.overlay:last-child .dlg-choice.primary, .overlay:last-child .dlg-choice:not([disabled]):not(.ghost)');
        if (btn) btn.click();
        return;
      }
      if (BH.Game.s.world.ff) { BH.Clock.stopWait(BH.Game.s, 'moved'); return; }
      BH.actions.promptDo(i);
    },
    radial() {
      if (BH.Panels.isOpen()) return;
      const s = BH.Game.s;
      const t = BH.World.target();
      if (!t) return;
      BH.Radial.open(t, BH.Interaction.actions(s, t));
    },
    runAction(t, a) {
      const s = BH.Game.s;
      if (!t || !a) return;
      const r = BH.Interaction.run(s, t, a);
      if (r && r.text) BH.UI.toast(r.text, r.bad ? 'bad' : r.good ? 'good' : 'info');
      if (r && r.fx && r.fx.length) BH.UI.toast(r.fx.map((f) => `${f.amount > 0 ? '+' : ''}${Math.round(f.amount)}${f.icon}`).join('  '), 'info');
      BH.Save.save(s);
      HUD.dirty = true; HUD.sig['hud-prompt'] = null;
      HUD.update(true);
    },
  };

  /* ---------- HUD actions ---------- */
  Object.assign(BH.actions, {
    openChapters() { BH.Milestones.openChapters(); },
    promptDo(i) { const p = HUD.prompt; const a = p.actions[Number(i)]; if (a) HUD.runAction(p.target, a); },
    openRadial() { HUD.radial(); },
    camSnap() { const E = BH.Engine3D; if (E && E.rig) E.rig.snapBack(); },
    toggleMissions() { HUD.missionsOpen = !HUD.missionsOpen; HUD.sig['hud-missions'] = null; HUD.update(true); },
    stopWait() { BH.Clock.stopWait(BH.Game.s, 'moved'); HUD.update(true); },
    missionTap(id) {
      const s = BH.Game.s;
      const m = s.missions.find((x) => x.id === id);
      if (!m) return;
      if (['active', 'offered'].includes(m.status)) {
        HUD.waypoint = HUD.waypoint === id ? null : id;
        BH.UI.toast(HUD.waypoint ? `📍 ${m.title}: ${m.status === 'offered' ? 'find them and talk' : BH.Missions.stepLabel(s, m)}${m.hints.length ? ` · 💡 ${m.hints.join(' · ')}` : ''}` : 'Waypoint cleared', 'info');
      } else BH.UI.toast(`${m.emoji} ${m.title}: ${m.status}`, 'info');
      HUD.dirty = true; HUD.sig['hud-missions'] = null; HUD.update(true);
    },
    callTap(uid) {
      const s = BH.Game.s;
      const c = s.world.calls.find((x) => x.uid === uid);
      if (!c) return;
      if (c.kind === 'signout') { BH.WorldSim.dropCall(s, c.uid); BH.Screens.writing.shirt(); return; }
      if (!c.npc) { BH.Dialogue.callEvent(c); return; }
      const near = BH.World.npcPos(c.npc);
      const sc = BH.World.scene;
      if (near && sc && Math.hypot(near.x - sc.player.x, near.y - sc.player.y) < 140) { BH.Dialogue.npc(c.npc); return; }
      const m = c.mid && s.missions.find((x) => x.id === c.mid);
      if (m) HUD.waypoint = m.id;
      BH.UI.toast(`${BH.NPC.name(BH.NPC.get(s, c.npc))} dey come find you — or go meet them. Walk away if you no send.`, 'info');
    },
    talkNpc(id) { BH.Dialogue.npc(id); },
    openBag(tab) { BH.Panels.open(() => BH.Screens.bag.render(BH.Game.s, tab), { cls: 'sheet', kind: 'bag', title: '🎒 Backpack' }); },
    openPhone() {
      const s = BH.Game.s;
      if (!s.phone.has || s.phone.confiscated) {
        BH.Panels.open(`<div class="center"><div class="big-emoji">📵</div><h2>${s.phone.confiscated ? 'Phone seized' : 'No phone'}</h2><p>${s.phone.confiscated ? 'It dey the house master\'s confiscation box. Beg them for am, pay the fine… or sneak into the office 👀' : 'Phones na contraband. Smuggle one in at resumption, or somebody fit sell you one.'}</p><p class="muted">Without phone: the school phone in the Admin Block, or write a letter on your bed.</p></div>`, { cls: 'pop', kind: 'phone' });
        return;
      }
      if (BH.Phone.risk(s) > 0.3) BH.UI.toast('👁️ Somebody fit see you pressing phone here…', 'bad');
      BH.Panels.open(() => BH.Screens.phone.render(BH.Game.s), { cls: 'phone', kind: 'phone' });
    },
    openMe() { BH.Panels.open(() => BH.Screens.me.render(BH.Game.s), { cls: 'sheet', kind: 'me', mount: () => BH.Screens.me.mount(BH.Game.s) }); },
    openWait() {
      const s = BH.Game.s;
      const info = BH.Clock.info(s);
      const night = BH.Clock.isNight(s);
      BH.Panels.open(() => `<div class="menu-panel">
          <h2>⏳ Wait</h2>
          <p class="muted">Time runs fast while you wait. Anything important (a call, someone spotting you) stops it.</p>
          <div class="wait-grid">
            <button class="chunky" data-act="waitFor" data-arg="15">15 min</button>
            <button class="chunky" data-act="waitFor" data-arg="30">30 min</button>
            <button class="chunky" data-act="waitFor" data-arg="60">1 hour</button>
            <button class="chunky" data-act="waitFor" data-arg="120">2 hours</button>
          </div>
          <button class="chunky primary" data-act="waitFor" data-arg="bell">🔔 Until ${U.esc(info.next.title)} (${BH.Clock.until(info.left)})</button>
          ${night ? '<button class="chunky" data-act="waitFor" data-arg="sleep">😴 Sleep right here (risky)</button>' : ''}
        </div>`, { cls: 'pop', kind: 'wait' });
    },
    waitFor(arg) {
      const s = BH.Game.s;
      BH.Panels.close();
      BH.Activities.stand(s, true);
      if (arg === 'bell') BH.Clock.waitUntilNextBell(s);
      else if (arg === 'sleep') { const r = BH.Activities.sleep(s, 'floor'); BH.UI.toast(r.text, 'info'); }
      else { s.act = { type: 'busy', label: '⏳ Waiting…' }; BH.Clock.wait(s, Number(arg), { reason: 'busy', label: '⏳ Waiting…' }); }
      HUD.update(true);
    },
    openMenu() {
      const scale = BH.Clock.RATE;
      BH.Panels.open(() => `<div class="menu-panel">
          <h2>⏸ Paused</h2>
          <button class="chunky primary" data-act="closePanel">▶ Resume</button>
          <button class="chunky" data-act="openLobby">🌐 Play with friends ${BH.Net && BH.Net.online ? `<small>(${BH.Net.players.size} online)</small>` : ''}</button>
          <button class="chunky" data-act="openChapters">📖 Chapters <small>${U.esc(BH.Milestones.current(BH.Game.s).title)}</small></button>
          <button class="chunky" data-act="saveNow">💾 Save game</button>
          <button class="chunky" data-act="loadMenu">📂 Load game</button>
          <div class="setting"><b>⏱ Game speed</b><small>in-game minutes per real second</small>
            <div class="seg">${BH.Clock.SCALES.map((v) => `<button class="${v === BH.Clock.RATE ? 'on' : ''}" data-act="setScale" data-arg="${v}">${v}×</button>`).join('')}</div></div>
          <div class="setting"><b>✨ AI conversations</b><small>${BH.AI.available() ? 'On — NPCs reply to what you type' : BH.AI.online() ? 'Switched off on the server' : BH.AI.playerOn() ? 'Game server not reachable — preset replies' : 'Off — preset replies only'}</small>
            <div class="seg"><button class="${BH.AI.playerOn() ? 'on' : ''}" data-act="setAi" data-arg="1">On</button><button class="${BH.AI.playerOn() ? '' : 'on'}" data-act="setAi" data-arg="0">Off</button></div></div>
          <div class="setting"><b>🧪 Bot students <small class="muted">(dev / testing)</small></b><small>${BH.School.botsOn(BH.Game.s) ? 'On — bots fill empty desks so the campus isn\'t empty' : 'Off — students are real players; only staff are NPCs'}</small>
            <div class="seg"><button class="${BH.School.botsOn(BH.Game.s) ? 'on' : ''}" data-act="setBots" data-arg="1">On</button><button class="${BH.School.botsOn(BH.Game.s) ? '' : 'on'}" data-act="setBots" data-arg="0">Off</button></div></div>
          <button class="chunky" data-act="openHelp">💛 Help & support</button>
          <button class="chunky" data-act="howTo">❓ How to play</button>
          <div class="setting"><b>🎵 Music</b><small>Afrobeat by day, calm at night, party at Social Night</small>
            <div class="seg">${[['Off', 0], ['Low', 0.25], ['Mid', 0.5], ['Loud', 0.9]].map(([l, v]) => `<button class="${Math.abs(BH.Music.volume - v) < 0.01 ? 'on' : ''}" data-act="setMusic" data-arg="${v}">${l}</button>`).join('')}</div></div>
          <button class="chunky" data-act="toggleSound">${BH.Sound.muted ? '🔇 Sound: off' : '🔊 Sound: on'}</button>
          <button class="chunky ghost" data-act="quitToTitle">🏠 Save & quit to title</button>
        </div>`, { cls: 'pop', kind: 'menu' });
      return scale;
    },
    setBots(v) { BH.School.setBots(BH.Game.s, v === '1'); BH.Panels.refresh(); },
    setMusic(v) { BH.Music.setVolume(Number(v)); BH.Music.start(); BH.Panels.refresh(); },
    setAi(v) { BH.Prefs.set('aiOn', v === '1'); BH.AI.check(true).then(() => BH.Panels.refresh()); },
    setScale(v) { BH.Prefs.set('timeScale', Number(v)); BH.Panels.refresh(); BH.UI.toast(`⏱ 1 real second = ${v} game minute${Number(v) === 1 ? '' : 's'}`, 'info'); },
    toggleSound() { BH.Sound.toggle(); BH.Panels.refresh(); },
  });

  BH.HUD = HUD;
})(window.BH);
