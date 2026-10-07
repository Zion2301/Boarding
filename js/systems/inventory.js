/* Provisions inventory, eating, recipes, tuck shop buying, hustling (selling) */
(function (BH) {
  const U = BH.U;
  const ITEMS = () => BH.data.ITEMS;

  const Inv = {
    onNewGame(s) {
      s.inventory = Object.assign({}, BH.data.BACKGROUNDS[s.player.background].provisions, BH.Content.get('items').starter || {});
    },

    count(s, id) { return s.inventory[id] || 0; },
    has(s, id, n = 1) { return Inv.count(s, id) >= n; },
    add(s, id, n = 1) {
      s.inventory[id] = Inv.count(s, id) + n;
      BH.fx.push(ITEMS()[id].emoji, n, ITEMS()[id].name);
    },
    take(s, id, n = 1) {
      const have = Inv.count(s, id);
      const took = Math.min(have, n);
      s.inventory[id] = have - took;
      if (s.inventory[id] <= 0) delete s.inventory[id];
      if (took) BH.fx.push(ITEMS()[id].emoji, -took, ITEMS()[id].name);
      return took;
    },
    list(s) {
      return Object.keys(s.inventory).filter((id) => s.inventory[id] > 0 && ITEMS()[id]).map((id) => ({ id, qty: s.inventory[id], ...ITEMS()[id] }));
    },
    foodList(s) { return Inv.list(s).filter((i) => i.cat === 'food' || i.cat === 'drink'); },
    // the tasty stuff seniors and thieves go for
    valuables(s) {
      const pref = ['milo', 'milk', 'cornedBeef', 'sardine', 'pringles', 'gala', 'indomie', 'cornflakes', 'chinchin', 'plantainChips', 'sugar', 'biscuits', 'garri'];
      return pref.filter((id) => Inv.has(s, id));
    },

    /* Is eating right now risky? (in class, assembly, worship) */
    eatingRisk(s) {
      const b = BH.Time.block(s);
      if (!b.noEat || !BH.Activities.present(s)) return 0;
      return 0.35 + BH.Discipline.strict(s) * 0.3;
    },

    /* Eat / drink / apply an item directly */
    use(s, id) {
      const it = ITEMS()[id];
      if (!it || !it.use || !Inv.has(s, id)) return { ok: false, text: 'You no fit use that one like that.' };
      const risk = Inv.eatingRisk(s);
      Inv.take(s, id, 1);
      if (risk && BH.Discipline.caught(s, risk)) {
        const p = BH.Discipline.offence(s, `Caught eating ${it.name} during ${BH.Time.block(s).title}`, 1);
        return { ok: true, bad: true, text: `You dey chew ${it.name} under desk... "YOU THERE! Wetin dey your mouth?!" Seized. ${p}` };
      }
      BH.Stats.change(s, it.use);
      if (id === 'cream') s.today.flags.creamed = true;
      BH.bus.emit('eat', { id });
      const lines = {
        food: [`You chop ${it.name}. Small relief. ${it.emoji}`, `${it.name} enter belle. God bless whoever invent am.`],
        drink: [`You drink ${it.name}. Your throat say thank you. ${it.emoji}`],
        toiletry: [`You rub ${it.name}. You dey shine like new Naira note. ${it.emoji}`],
      };
      return { ok: true, text: U.pick(lines[it.cat] || lines.food) };
    },

    /* a need is an item id, or an array of alternatives (water OR pure water) */
    pickNeed(s, need) { return Array.isArray(need) ? need.find((id) => Inv.has(s, id)) : (Inv.has(s, need) ? need : null); },
    missing(s, rid) {
      const r = BH.data.RECIPES[rid];
      const out = r.needs.filter((n) => !Inv.pickNeed(s, n)).map((n) => (Array.isArray(n) ? n : [n]).map((id) => ITEMS()[id].name).join(' / '));
      if (r.tool && !Inv.has(s, r.tool)) out.push(ITEMS()[r.tool].name);
      return out;
    },
    canCook(s, rid) { return Inv.missing(s, rid).length === 0; },
    cook(s, rid) {
      const r = BH.data.RECIPES[rid];
      if (!Inv.canCook(s, rid)) return { ok: false, text: 'You no get wetin you need for this one.' };
      const risk = Inv.eatingRisk(s);
      r.needs.forEach((n) => Inv.take(s, Inv.pickNeed(s, n), 1));
      // illegal cooking leaves a smell anyone passing can follow
      if (r.illegal) { s.world.smell = { map: s.world.map || 'campus', until: BH.Clock.abs(s) + 25 }; BH.Gist.add(s, 'Somebody dey cook Indomie for the hostel. The smell dey everywhere 🍜', { spread: 0.15 }); }
      const bonuses = r.bonus.filter((id) => Inv.has(s, id));
      bonuses.forEach((id) => Inv.take(s, id, 1));
      if (risk && BH.Discipline.caught(s, risk + 0.15)) {
        const p = BH.Discipline.offence(s, `Making ${r.name} during ${BH.Time.block(s).title}`, 2);
        return { ok: true, bad: true, text: `Making ${r.name} for inside ${BH.Time.block(s).loc}?! You don craze? ${p}` };
      }
      const fx = Object.assign({}, r.base);
      bonuses.forEach(() => Object.keys(r.perBonus).forEach((k) => { fx[k] = (fx[k] || 0) + r.perBonus[k]; }));
      BH.Stats.change(s, fx);
      BH.bus.emit('eat', { id: rid, recipe: true });
      const extra = bonuses.length ? ` (with ${bonuses.map((b) => ITEMS()[b].name).join(', ')})` : '';
      return { ok: true, text: U.pick(r.line) + extra };
    },

    /* Free tap water. Bad water at some schools = running stomach */
    drinkTap(s) {
      const water = BH.Stats.school(s).water;
      BH.Stats.change(s, { thirst: 18 });
      s.today.flags.tapAt = s.time.block;
      if (U.chance((5 - water) * 0.045)) {
        BH.Stats.change(s, { health: -8, rest: -3 });
        return 'You drink from the tap... 20 minutes later your belle start to dey sing. Running stomach! 🚽';
      }
      return U.pick(['Tap water. Cold, small rust taste. E do the work. 🚰', 'You cup your hands under the tap and drink like goat. Refreshing.', 'Borehole water. Very cold. Your teeth shake.']);
    },

    /* Tuck shop */
    shopPrice(s, id) {
      const mult = s.player.school === 'private' ? 1.5 : s.player.school === 'state' ? 0.85 : 1;
      const d = s.today && s.today.flags.discount; // haggled with Mama Tuck-shop
      const off = d && d.uses > 0 ? 1 - d.pct / 100 : 1;
      return Math.round((ITEMS()[id].price * mult * off) / 10) * 10;
    },
    buy(s, id) {
      const price = Inv.shopPrice(s, id);
      if (s.money < price) return { ok: false, text: `Mama Tuck-shop look you: "${U.money(price)}. You get am? No? Comot for my front."` };
      BH.Stats.money(s, -price);
      if (s.today.flags.discount && s.today.flags.discount.uses > 0) s.today.flags.discount.uses--;
      const n = ITEMS()[id].pack || 1;
      Inv.add(s, id, n);
      BH.bus.emit('shop:buy', { id, price });
      return { ok: true, text: `You buy ${ITEMS()[id].name}${n > 1 ? ` (${n} uses)` : ''}. ${ITEMS()[id].emoji}` };
    },

    /* Hustle: sell one unit of an item to coursemates for profit */
    sellPrice(s, id) { return Math.max(10, Math.round(Inv.shopPrice(s, id) / (ITEMS()[id].pack || 1) * 1.25 * BH.Stats.mod(s, 'hustle') / 10) * 10); },
    sell(s, id) {
      const it = ITEMS()[id];
      if (!Inv.has(s, id) || it.tool) return { ok: false, text: 'You no get am to sell.' };
      const p = U.clamp(0.7 + BH.Stats.mod(s, 'luck') + (s.reputation - 30) / 200, 0.3, 0.95);
      if (!U.chance(p)) {
        return { ok: true, sold: false, text: U.pick([`Nobody wan buy ${it.name} now. "Na last month price you dey sell?"`, `${it.name}? Hustler for SS1 dey sell am cheaper. Market dull.`, 'Your customer say make you give am "on credit". You refuse. No sale.']) };
      }
      const price = Inv.sellPrice(s, id);
      Inv.take(s, id, 1);
      BH.Stats.money(s, price);
      s.today.earnings += price;
      BH.bus.emit('hustle:sale', { id, price });
      return { ok: true, sold: true, text: U.pick([`Sold ${it.name} for ${U.money(price)}! Business is booming. 📈`, `"Abeg give me one ${it.name}" — cash in hand: ${U.money(price)}. Dangote, see your mate.`]) };
    },

    /* Seniors borrowing / thieves stealing: remove n random valuables, returns names */
    loseRandom(s, n) {
      const lost = [];
      for (let i = 0; i < n; i++) {
        const vals = Inv.valuables(s);
        if (!vals.length) break;
        const id = U.pick(vals.slice(0, 6));
        const qty = Math.min(Inv.count(s, id), U.randInt(1, 3));
        Inv.take(s, id, qty);
        lost.push(`${qty} ${ITEMS()[id].unit}${qty > 1 ? 's' : ''} of ${ITEMS()[id].name}`);
      }
      return lost;
    },
  };

  BH.registerSystem('Inv', Inv);
})(window.BH);
