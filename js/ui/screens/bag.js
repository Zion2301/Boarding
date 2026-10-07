/* Backpack overlay: grid inventory (tap a slot → details & Use), plus the boarding-house "kitchen" recipes */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const UI = () => BH.UI;

  let selected = null;
  const SLOTS = 20;

  BH.Screens.bag = {
    render(s, tab) {
      const list = BH.Inv.list(s);
      if (selected && !BH.Inv.has(s, selected)) selected = null;
      const risk = BH.Inv.eatingRisk(s);
      const slots = [];
      for (let i = 0; i < Math.max(SLOTS, list.length); i++) {
        const it = list[i];
        slots.push(it
          ? `<button class="slot ${selected === it.id ? 'sel' : ''} cat-${it.cat}" data-act="bagSel" data-arg="${it.id}" title="${U.esc(it.name)}"><span class="slot-emoji">${it.emoji}</span><b class="slot-qty">${it.qty}</b></button>`
          : '<div class="slot empty"></div>');
      }
      const sel = selected && D.ITEMS[selected];
      const detail = sel ? `<div class="item-detail">
          <span class="id-emoji">${sel.emoji}</span>
          <div class="id-text"><b>${sel.name}</b> <span class="muted">× ${BH.Inv.count(s, selected)}</span><small>${sel.desc}</small></div>
          ${sel.contraband ? '<span class="tag bad">🚨 Contraband</span>' : ''}
          ${sel.use ? `<button class="chunky primary" data-act="useItem" data-arg="${selected}">${sel.cat === 'toiletry' ? 'Use' : sel.cat === 'drink' ? 'Drink' : 'Chop'}</button>` : `<span class="tag">${sel.tool ? 'Tool' : 'Ingredient'}</span>`}
        </div>` : '<div class="item-detail hint">Tap an item to see am. 👆</div>';

      const recipes = Object.entries(D.RECIPES).map(([id, r]) => {
        const can = BH.Inv.canCook(s, id);
        const missing = BH.Inv.missing(s, id);
        const bonus = r.bonus.filter((b) => BH.Inv.has(s, b)).map((b) => D.ITEMS[b].emoji).join('');
        return `<button class="recipe-card ${can ? '' : 'off'}" data-act="cook" data-arg="${id}" ${can ? '' : 'disabled'}>
          <span class="rc-emoji">${r.emoji}</span><b>${r.name}</b>${r.illegal ? '<small class="bad-txt">🚨 illegal — smell go travel</small>' : ''}${bonus ? `<small>+${bonus}</small>` : ''}
          ${missing.length ? `<small class="bad-txt">Need ${missing.join(', ')}</small>` : '<small class="good-txt">Ready!</small>'}</button>`;
      }).join('');

      return `<div class="backpack">
        ${risk ? `<div class="warn">🚨 You dey ${BH.Time.block(s).title}. Eating now get ${Math.round(risk * 100)}% risk.</div>` : ''}
        <div class="inv-grid2">${slots.join('')}</div>
        ${detail}
        <h3 class="sec" id="bag-kitchen">🥣 Cook / combine</h3>
        <p class="muted tiny">Combine ingredients from your chop box. Water comes from the tap with a bucket (or use pure water).</p>
        <div class="recipe-grid">${recipes}</div>
        <button class="chunky" data-act="wHub">✍️ Writing — diary, letters, slam book, shirt</button>
        <p class="muted tiny center">💰 ${U.money(s.money)} · Buy more at the 🛒 Tuck Shop</p>
      </div>`;
    },
  };

  function afterUse(s, r) {
    const fx = BH.fx.end();
    UI().toast(r.text, r.bad ? 'bad' : 'good');
    if (fx.length) UI().toast(fx.map((f) => `${f.amount > 0 ? '+' : ''}${Math.round(f.amount)}${f.icon}`).join('  '), 'info');
    BH.Save.save(s);
    UI().render();
  }

  Object.assign(BH.actions, {
    bagSel(id) { selected = selected === id ? null : id; BH.Panels.refresh(); },
    useItem(id) { const s = BH.Game.s; BH.fx.begin(); afterUse(s, BH.Inv.use(s, id)); },
    cook(id) { const s = BH.Game.s; BH.fx.begin(); afterUse(s, BH.Inv.cook(s, id)); },
  });
})(window.BH);
