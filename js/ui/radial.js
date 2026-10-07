/* Radial menu: every action for the thing you're next to, arranged in a ring around it.
   Opened with ⋯ on the prompt, a long-press, Q / Tab, or holding E. Pauses the game like any menu. */
(function (BH) {
  const U = BH.U;
  let current = null;

  const Radial = {
    open(target, actions) {
      const s = BH.Game.s;
      if (!actions.length) return;
      current = { target, actions };
      const p = BH.World.toScreen(target.x, target.y) || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const R = Math.min(130, Math.max(92, 30 + actions.length * 11));
      const cx = Math.max(R + 70, Math.min(window.innerWidth - R - 70, p.x));
      const cy = Math.max(R + 60, Math.min(window.innerHeight - R - 60, p.y));
      const n = actions.length;
      const btns = actions.map((a, i) => {
        const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R;
        return `<button class="radial-btn ${a.crime ? 'risky' : ''}" style="left:${x}px;top:${y}px" data-act="radialPick" data-arg="${i}" ${a.disabled ? 'disabled' : ''}>
          <span class="rb-emoji">${a.emoji || '•'}</span><span class="rb-label">${U.esc(a.label)}</span></button>`;
      }).join('');
      BH.Panels.open(`<div class="radial" data-act="closePanel">
          <div class="radial-hub" style="left:${cx}px;top:${cy}px">${U.esc(BH.Interaction.title(s, target))}</div>${btns}</div>`, { cls: 'radial', kind: 'radial', locked: true });
    },
  };

  BH.actions.radialPick = (i) => {
    const c = current;
    BH.Panels.closeKind('radial', true);
    if (!c) return;
    const a = c.actions[Number(i)];
    if (a) BH.HUD.runAction(c.target, a);
  };

  BH.Radial = Radial;
})(window.BH);
