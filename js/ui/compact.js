/* Compact HUD for phones (body.compact): a slim top bar with small pills, and everything else stays hidden until
   you tap it or it matters.
   · ❤️ vitals pill: your lowest needs; tap for all six bars + the minimap. Pops open on its own when a need goes critical.
   · 🕑 clock pill: time + a status dot (on time / due / absent); tap for the full clock card and the time controls.
     Pops open for a few seconds when a new bell rings or you're marked late/absent.
   · 🎯 missions pill: count; tap for the tracker. Pops open when a new mission arrives or a deadline is close.
   · ☰ button: 🎒 stays, the rest (phone, me, wait, settings, games, friends, chat) fan out from ☰.
   · 🎯 snap-to-player only shows when you've moved the camera away; the lesson panel only opens when it's your turn.
   Tap the world to close anything that is open. Desktop is unchanged. */
(function (BH) {
  const U = BH.U;
  const QUERY = '(max-width: 640px), (max-height: 520px)';
  const POP = { clock: 5000, missions: 6000, stats: 5000 };
  const ORDER = ['health', 'hunger', 'thirst', 'rest', 'hygiene', 'morale'];

  const Compact = {
    on: false,
    openK: null,
    timer: null,
    sig: {},

    init() {
      const mq = window.matchMedia ? matchMedia(QUERY) : null;
      const apply = () => {
        Compact.on = !!(mq && mq.matches);
        document.body.classList.toggle('compact', Compact.on);
        if (!Compact.on) Compact.close();
      };
      apply();
      if (mq) (mq.addEventListener ? mq.addEventListener('change', apply) : mq.addListener(apply));
      // tapping the world closes whatever is open
      document.addEventListener('pointerdown', (e) => {
        if (!Compact.on || !Compact.openK) return;
        if (e.target.closest && e.target.closest('.hud-bar, .obj-strip, .hud-tl, .hud-tr, .hud-missions, .hud-br, .overlay')) { Compact.hold(); return; }
        Compact.close();
      }, true);
    },

    /* ---------- open / close ---------- */
    open(k, ms) {
      if (Compact.openK && Compact.openK !== k) document.body.classList.remove('x-' + Compact.openK);
      Compact.openK = k;
      document.body.classList.add('x-' + k);
      clearTimeout(Compact.timer);
      if (ms) Compact.timer = setTimeout(() => { if (Compact.openK === k) Compact.close(); }, ms);
    },
    close() {
      clearTimeout(Compact.timer);
      if (Compact.openK) document.body.classList.remove('x-' + Compact.openK);
      Compact.openK = null;
    },
    toggle(k) { if (Compact.openK === k) Compact.close(); else Compact.open(k, k === 'menu' ? 6000 : 9000); },
    /* the player is using what's open: keep it open a bit longer */
    hold() { const k = Compact.openK; if (!k) return; clearTimeout(Compact.timer); Compact.timer = setTimeout(() => { if (Compact.openK === k) Compact.close(); }, 9000); },
    pop(k) { if (!Compact.openK || Compact.openK === k) Compact.open(k, POP[k]); else Compact.pulse(k); },
    pulse(k) {
      const el = document.getElementById('pill-' + k);
      if (!el) return;
      el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
    },

    /* ---------- the always-visible objective strip: where you need to be right now ----------
       priority: resumption-day story step → the timetable (red when you're missing it) → your tracked/most urgent mission */
    objective(s, info, st) {
      const el = document.getElementById('obj-strip');
      if (!el) return;
      let cls = '', html = '';
      const ob = BH.Onboarding && BH.Onboarding.objective(s);
      const e = st.e || (info.status && info.status.e);
      const missing = st.kind === 'absent' || (st.kind === 'due' && info.b.kind !== 'sleep' && s.clock - BH.Clock.blockStart(s) > 3);
      const live = BH.Missions.live(s).filter((m) => m.status === 'active');
      const tracked = (BH.HUD && BH.HUD.waypoint && live.find((m) => m.id === BH.HUD.waypoint)) || live.slice().sort((a, b) => (a.due || 1e12) - (b.due || 1e12))[0];
      const esc = U.esc;
      if (ob) { cls = 'story'; html = `<i>⭐</i><span>${esc(ob.text)}</span>`; }
      else if (st.kind === 'asleep') { el.hidden = true; document.body.classList.remove('has-obj'); return; }
      else if (e && ['due', 'absent'].includes(st.kind)) {
        cls = missing ? 'late' : 'due';
        const subj = info.b.kind === 'class' && BH.Clock.subjectNow(s) ? ` · ${BH.Academics.name(s, BH.Clock.subjectNow(s), true)}` : '';
        html = `<i>${missing ? '❗' : '👉🏾'}</i><span><b>${missing ? 'Missing' : 'Go to'}</b> ${esc(e.name)}<small>${info.b.emoji} ${esc(info.b.title)}${subj}</small></span>`;
      } else if (e && ['present', 'late', 'excused'].includes(st.kind)) {
        cls = 'ok'; html = `<i>✅</i><span>${esc(info.b.title)}${info.b.kind === 'class' && BH.Clock.subjectNow(s) ? ` · ${esc(BH.Academics.name(s, BH.Clock.subjectNow(s), true))}` : ''}<small>${esc(e.name)}</small></span>`;
      } else if (tracked) {
        const left = tracked.due ? tracked.due - BH.Clock.abs(s) : null;
        cls = left !== null && left < 30 ? 'late' : 'mission';
        html = `<i>${tracked.emoji || '🎯'}</i><span>${esc(BH.Missions.stepLabel(s, tracked) || tracked.title)}<small>${esc(tracked.title)}${left !== null ? ` · ⏱ ${BH.Clock.until(left)}` : ''}</small></span>`;
      } else { cls = 'free'; html = `<i>🎈</i><span>Free time — go anywhere<small>🔔 ${esc(info.next.title)} in ${BH.Clock.until(info.left)}</small></span>`; }
      el.className = `obj-strip ${cls}`;
      if (Compact.sig.obj !== html) { Compact.sig.obj = html; el.innerHTML = html; }
      el.hidden = false;
      document.body.classList.add('has-obj');
    },

    /* ---------- render the pills + decide when things pop (called from HUD.update) ---------- */
    update(s) {
      document.body.classList.toggle('cam-free', !!(BH.Engine3D && BH.Engine3D.rig && BH.Engine3D.rig.isFree && BH.Engine3D.rig.isFree()));
      if (!Compact.on || !s) return;
      const set = (id, html) => { if (Compact.sig[id] === html) return; Compact.sig[id] = html; const el = document.getElementById(id); if (el) el.innerHTML = html; };

      // vitals: the two lowest needs
      const lv = (v) => BH.Stats.level(v);
      const low = ORDER.map((k) => ({ k, v: Math.round(s.stats[k]) })).sort((a, b) => a.v - b.v);
      const worst = lv(low[0].v);
      const vit = document.getElementById('pill-stats');
      if (vit) vit.className = `pill vitals ${worst}`;
      set('pill-stats', worst === 'good' ? '<i>💚</i><span>All good</span>' : low.slice(0, 2).filter((x) => lv(x.v) !== 'good').map((x) => `<i>${BH.Stats.ICONS[x.k]}</i><span class="mini"><b class="${lv(x.v)}" style="width:${x.v}%"></b></span>`).join(''));

      // clock: time + status dot (+ paused / fast-forward marks)
      const info = BH.Clock.info(s);
      const st = info.status || { kind: 'free' };
      const dot = { absent: 'late', late: 'soon', due: info.left <= 10 ? 'soon' : 'due', present: 'ok', excused: 'ok' }[st.kind] || 'free';
      const paused = BH.Pacing && BH.Pacing.paused(s);
      set('pill-clock', `<span class="dot ${dot}"></span><b>${BH.Clock.label(s)}</b>${paused ? '<i>⏸</i>' : s.world.ff ? '<i>⏩</i>' : ''}<small>${info.b.emoji}</small>`);

      Compact.objective(s, info, st);

      // missions: count, red when something is due soon
      const live = BH.Missions.live(s);
      const due = live.some((m) => m.status === 'active' && m.due && m.due - BH.Clock.abs(s) < 30);
      const mp = document.getElementById('pill-missions');
      if (mp) { mp.hidden = !live.length; mp.classList.toggle('hot', due); }
      set('pill-missions', `🎯<b>${live.length}</b>`);

      // the ☰ badge = unread messages + friend requests
      const fb = document.getElementById('fab-badge');
      if (fb) {
        const pb = document.getElementById('phone-badge'), sb = document.getElementById('social-badge');
        const n = (pb && !pb.hidden ? Number(pb.textContent) || 0 : 0) + (sb && !sb.hidden ? Number(sb.textContent) || 1 : 0);
        fb.hidden = !n; fb.textContent = n;
      }

      // pop things open when they matter (not on the very first update)
      const first = !Compact.sig._init;
      Compact.sig._init = true;
      const blk = BH.Time.blockId(s);
      if (!first && blk !== Compact.sig.blk && !(BH.Pacing && BH.Pacing.simulating) && !s.world.ff) Compact.pop('clock');
      if (!first && ['late', 'absent'].includes(st.kind) && Compact.sig.st !== st.kind) Compact.pop('clock');
      Compact.sig.blk = blk; Compact.sig.st = st.kind;
      const ids = live.map((m) => m.id + m.status).join(',');
      const newOne = live.some((m) => !(Compact.sig.mids || '').includes(m.id + m.status));
      if (!first && newOne) Compact.pop('missions');
      if (!first && due && !Compact.sig.due) Compact.pop('missions');
      Compact.sig.mids = ids; Compact.sig.due = due;
      if (!first && worst === 'crit' && Compact.sig.worst !== 'crit') Compact.pop('stats');
      Compact.sig.worst = worst;
    },
  };

  Object.assign(BH.actions, {
    cxToggle(k) { Compact.toggle(k); },
  });
  // using any ☰ button closes the fan
  document.addEventListener('click', (e) => {
    if (!Compact.on || Compact.openK !== 'menu') return;
    const b = e.target.closest && e.target.closest('.hud-br .round-btn');
    if (b && !b.classList.contains('menu-fab')) setTimeout(() => Compact.close(), 0);
  });

  BH.Compact = Compact;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Compact.init); else Compact.init();
})(window.BH);
