/* UI core: screen routing (title / create / game / gameover), click delegation, toasts, helpers.
   In the 'game' screen the Phaser map fills the viewport, the HUD floats on top and menus are overlay panels.
   Buttons use data-act="actionName" data-arg="..." → BH.actions[actionName](arg, el). */
(function (BH) {
  const U = BH.U;

  const UI = {
    screen: 'title',
    root: null,

    init() {
      UI.root = document.getElementById('app');
      document.addEventListener('click', (ev) => {
        const el = ev.target.closest('[data-act]');
        if (!el || el.disabled) return;
        const fn = BH.actions[el.dataset.act];
        if (!fn) return;
        ev.preventDefault();
        BH.Sound && BH.Sound.play('click');
        el.classList.remove('tapped'); void el.offsetWidth; el.classList.add('tapped');
        fn(el.dataset.arg, el, ev);
      });
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          const top = BH.Panels.top();
          if (top && !top.opts.locked) BH.Panels.close();
          else if (!top && UI.screen === 'game') BH.actions.openMenu();
        }
      });
      // lock the page like a native game: no pinch-zoom, no double-tap zoom, no context menu on the map
      ['gesturestart', 'gesturechange', 'gestureend'].forEach((e) => document.addEventListener(e, (ev) => ev.preventDefault()));
      let lastTouch = 0;
      document.addEventListener('touchend', (ev) => { const now = Date.now(); if (now - lastTouch < 300 && !ev.target.closest('input,select,textarea')) ev.preventDefault(); lastTouch = now; }, { passive: false });
      document.addEventListener('contextmenu', (ev) => { if (UI.screen === 'game') ev.preventDefault(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && BH.Game.s && UI.screen === 'game') BH.Save.save(BH.Game.s); });
    },

    go(screen) {
      if (BH.Panels) BH.Panels.closeAll(true);
      if (screen !== 'game' && BH.World) BH.World.stop();
      UI.screen = screen;
      document.body.dataset.screen = screen;
      if (UI.root) UI.root.innerHTML = '';
      UI.render();
    },

    render() {
      if (UI.screen === 'game') {
        const s = BH.Game.s;
        if (s.gameOver) { UI.go('gameover'); return; }
        if (!document.getElementById('game-root')) {
          UI.root.innerHTML = '<div id="game-root"></div><div id="hud-root"></div><div id="overlays"></div>';
          BH.HUD.mount(document.getElementById('hud-root'));
          const start = () => BH.World.start(document.getElementById('game-root'));
          if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('22px "Lilita One"'), document.fonts.load('800 13px "Nunito"')]).then(start, start);
          else start();
        } else {
          BH.Store.changed();
          BH.HUD.update(true);
          BH.Panels.refresh();
        }
        return;
      }
      const sc = BH.Screens[UI.screen];
      if (!sc) return;
      UI.root.innerHTML = `<div class="screen screen-${UI.screen}">${sc.render()}</div><div id="overlays"></div>`;
      BH.Avatar3D && BH.Avatar3D.sweep();
      sc.mount && sc.mount();
    },
    refresh() { UI.render(); },

    /* ---------- tiny markdown: **bold**, _italic_, newlines ---------- */
    md(text) {
      return U.esc(text)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/(^|[\s(])_(.+?)_(?=[\s.,)!?]|$)/g, '$1<i>$2</i>')
        .replace(/\n/g, '<br>');
    },
    fxChips(fx) {
      if (!fx || !fx.length) return '';
      return `<div class="fx">${fx.map((f) => {
        const n = Math.round(f.amount);
        const shown = f.icon === '₦' ? `${n > 0 ? '+' : '−'}${U.money(Math.abs(n))}` : `${n > 0 ? '+' : ''}${n} ${f.icon}`;
        return `<span class="chip ${n > 0 ? 'up' : 'down'}" title="${U.esc(f.label)}">${shown}</span>`;
      }).join('')}</div>`;
    },
    relBar(v, cls = '') { return `<span class="mini-bar ${cls}"><i style="width:${v}%;background:hsl(${Math.round(v * 1.25)} 62% 42%)"></i></span>`; },

    /* Old modal API → overlay panels (they stack) */
    modal(html, opts = {}) { return BH.Panels.open(html, Object.assign({ cls: 'pop' }, opts)); },
    updateModal(html) { BH.Panels.update(html); },
    closeModal(silent) { BH.Panels.close(silent); },

    /* ---------- toasts & effects ---------- */
    toast(text, type = 'info', celebrate) {
      let wrap = document.getElementById('toasts');
      if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; wrap.className = 'toasts-floating'; document.body.appendChild(wrap); }
      const t = document.createElement('div');
      t.className = `toast ${type}`;
      t.innerHTML = U.esc(String(text).replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)_(.+?)_(?=[\s.,!?]|$)/g, '$1$2'));
      wrap.appendChild(t);
      while (wrap.children.length > 3) wrap.firstChild.remove();
      setTimeout(() => t.classList.add('out'), 3200);
      setTimeout(() => t.remove(), 3700);
      if (BH.Sound) BH.Sound.play(celebrate ? 'success' : type === 'bad' ? 'bad' : 'notify');
      if (celebrate) UI.burst(['🎉', '⭐', '✨', '💯']);
    },
    burst(emojis) {
      for (let i = 0; i < 14; i++) {
        const e = document.createElement('span');
        e.className = 'confetti';
        e.textContent = U.pick(emojis);
        e.style.left = (40 + Math.random() * 20) + 'vw';
        e.style.setProperty('--dx', (Math.random() * 80 - 40) + 'vw');
        e.style.setProperty('--dy', (-30 - Math.random() * 40) + 'vh');
        e.style.animationDelay = (Math.random() * 0.15) + 's';
        document.body.appendChild(e);
        setTimeout(() => e.remove(), 1500);
      }
    },
    shake() {
      document.body.classList.remove('shake');
      void document.body.offsetWidth;
      document.body.classList.add('shake');
      setTimeout(() => document.body.classList.remove('shake'), 500);
    },
  };

  BH.UI = UI;
})(window.BH);
