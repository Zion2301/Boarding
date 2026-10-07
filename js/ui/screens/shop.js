/* Tuck shop (buy) and Hustle (sell) modals */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const UI = () => BH.UI;
  const HUSTLE_TRIES = 4; // customers per block

  function shopHtml(s, msg) {
    return `<h2>🛒 Mama Put Tuck Shop</h2>
      <p class="muted">"Wetin you wan buy? No credit today — come tomorrow!" · You get <b>${U.money(s.money)}</b></p>
      ${msg ? `<div class="note">${U.esc(msg)}</div>` : ''}
      <div class="shop-list">${D.SHOP_ITEMS.map((id) => {
        const it = D.ITEMS[id];
        const price = BH.Inv.shopPrice(s, id);
        return `<div class="shop-row"><span class="si-emoji">${it.emoji}</span>
          <span class="si-text"><b>${it.name}</b><small>${it.desc}</small><small class="muted">You get: ${BH.Inv.count(s, id)}</small></span>
          <button class="btn sm ${s.money >= price ? 'primary' : 'ghost'}" data-act="buy" data-arg="${id}" ${s.money >= price ? '' : 'disabled'}>${U.money(price)}</button></div>`;
      }).join('')}</div>`;
  }

  function hustleState(s) {
    const f = s.today.flags;
    if (f.hustleBlock !== s.time.block) { f.hustleBlock = s.time.block; f.hustleLeft = HUSTLE_TRIES; }
    return f;
  }
  function hustleHtml(s, msg) {
    const f = hustleState(s);
    const items = BH.Inv.list(s).filter((i) => !i.tool && i.price);
    return `<h2>💰 Hustle</h2>
      <p class="muted">Sell your provisions to hungry coursemates. Customers left this block: <b>${f.hustleLeft}</b> · Made today: <b>${U.money(s.today.earnings)}</b></p>
      ${msg ? `<div class="note">${U.esc(msg)}</div>` : ''}
      ${items.length ? `<div class="shop-list">${items.map((it) => `
        <div class="shop-row"><span class="si-emoji">${it.emoji}</span>
          <span class="si-text"><b>${it.name}</b><small class="muted">You get: ${it.qty}</small></span>
          <button class="btn sm primary" data-act="sell" data-arg="${it.id}" ${f.hustleLeft > 0 ? '' : 'disabled'}>Sell ${U.money(BH.Inv.sellPrice(s, it.id))}</button></div>`).join('')}</div>`
        : '<p>Your chop box empty. Nothing to sell. 🫙</p>'}`;
  }

  Object.assign(BH.actions, {
    openShop() {
      const s = BH.Game.s;
      UI().modal(shopHtml(s), { onClose: () => UI().refresh() });
    },
    buy(id) {
      const s = BH.Game.s;
      BH.fx.begin();
      const r = BH.Inv.buy(s, id);
      BH.fx.end();
      UI().updateModal(shopHtml(s, r.text));
    },
    openHustle() {
      const s = BH.Game.s;
      UI().modal(hustleHtml(s), { onClose: () => { BH.Save.save(s); UI().refresh(); } });
    },
    sell(id) {
      const s = BH.Game.s;
      const f = hustleState(s);
      if (f.hustleLeft <= 0) return;
      f.hustleLeft--;
      BH.fx.begin();
      const r = BH.Inv.sell(s, id);
      BH.fx.end();
      if (r.sold) UI().toast(`+${U.money(BH.Inv.sellPrice(s, id))}`, 'good');
      UI().updateModal(hustleHtml(s, r.text));
    },
  });
})(window.BH);
