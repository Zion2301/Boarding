/* Overlay panels that pop over the map. They stack (e.g. shop over a dialogue).
   While any panel is open the game is paused and the map dims behind it.
   Panels.open(htmlOrRenderFn, { cls: 'pop'|'sheet'|'dialogue'|'phone'|'quiz', title, locked, kind, onClose, mount }) */
(function (BH) {
  const stack = [];

  function host() { return document.getElementById('overlays') || document.body; }

  const Panels = {
    open(content, opts = {}) {
      const cls = opts.cls || 'pop';
      const el = document.createElement('div');
      el.className = `overlay ov-${cls.split(' ')[0]}`;
      el.innerHTML = `<div class="overlay-dim"></div>
        <div class="panel panel-${cls}" role="dialog">
          ${opts.locked ? '' : '<button class="panel-x" data-act="closePanel" aria-label="Close">✕</button>'}
          ${opts.title ? `<div class="panel-title">${opts.title}</div>` : ''}
          <div class="panel-body"></div>
        </div>`;
      host().appendChild(el);
      const entry = { el, opts, render: typeof content === 'function' ? content : null, html: typeof content === 'function' ? '' : content };
      stack.push(entry);
      Panels.paint(entry);
      if (!opts.locked) el.querySelector('.overlay-dim').addEventListener('click', () => Panels.close());
      requestAnimationFrame(() => el.classList.add('show'));
      BH.Sound && BH.Sound.play(cls === 'dialogue' ? 'notify' : 'open');
      opts.mount && opts.mount();
      BH.HUD && BH.HUD.update(true);
      return entry;
    },
    paint(entry) {
      const body = entry.el.querySelector('.panel-body');
      body.innerHTML = entry.render ? entry.render() : entry.html;
    },
    /* replace the top panel's content */
    update(html) {
      const e = stack[stack.length - 1];
      if (!e) return;
      e.render = null; e.html = html;
      Panels.paint(e);
    },
    /* re-render every panel that has a render function */
    refresh() {
      stack.forEach((e) => { if (e.render) { Panels.paint(e); e.opts.mount && e.opts.mount(); } });
      BH.Avatar3D && BH.Avatar3D.sweep();
    },
    remove(e, silent) {
      const i = stack.indexOf(e);
      if (i < 0) return;
      stack.splice(i, 1);
      e.el.classList.remove('show');
      e.el.classList.add('hide');
      setTimeout(() => { e.el.remove(); BH.Avatar3D && BH.Avatar3D.sweep(); }, 160);
      if (!silent && e.opts.onClose) e.opts.onClose();
      BH.HUD && BH.HUD.update(true);
    },
    close(silent) { const e = stack[stack.length - 1]; if (e) Panels.remove(e, silent); },
    closeKind(kind, silent) { const e = stack.slice().reverse().find((x) => x.opts.kind === kind); if (e) Panels.remove(e, silent); },
    closeAll(silent) { while (stack.length) Panels.remove(stack[stack.length - 1], silent); },
    isOpen() { return stack.length > 0; },
    isOpenKind(kind) { return stack.some((x) => x.opts.kind === kind); },
    top() { return stack[stack.length - 1] || null; },
  };

  BH.actions.closePanel = () => Panels.close();
  BH.Panels = Panels;
})(window.BH);
