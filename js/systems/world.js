/* WorldSim — the school lives without you.
   - Weather per day by term (rainy season, harmattan, heat) with rain spells; affects decay, labour, the look.
   - NEPA takes light in the evening; the generator rarely has diesel.
   - World events from content/world.json fire every ~30 game minutes: fights break out, provisions vanish,
     a teacher doesn't show up, raids, rumours…
   - Calls: someone comes looking for you (a senior with an errand, the bully, your crush). It's a request,
     never a lock: answer by talking to them, or ignore it and live with the consequence when it expires.
   - Happenings: small optional events (rats, mosquitoes, found money) you can open from the HUD or ignore. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const C = () => BH.Content;
  const W = () => C().get('world');
  const abs = (s) => BH.Clock.abs(s);
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast(t, k);

  const WorldSim = {
    onNewGame(s) { WorldSim.ensure(s); WorldSim.rollDay(s); },
    onLoad(s) { WorldSim.ensure(s); },
    ensure(s) {
      s.world = s.world || {};
      const w = s.world;
      w.calls = w.calls || [];
      w.overrides = w.overrides || {};
      w.teacherAbsent = w.teacherAbsent || {};
      w.weather = w.weather || { kind: 'clear', rain: false, until: 0 };
      w.power = w.power || { on: true, until: 0 };
      w.nextEvent = w.nextEvent || 0;
      w.witnessed = w.witnessed || [];
    },
    onNewDay(s) { WorldSim.rollDay(s); },

    rollDay(s) {
      const w = s.world;
      const odds = W().weather.terms[String(s.time.term)] || W().weather.terms['1'];
      const kind = U.weighted(Object.keys(odds), (k) => odds[k]) || 'clear';
      w.weather = { kind, rain: kind === 'rain' && U.chance(0.4), until: abs(s) + U.randInt(40, 160) };
      w.power = { on: true, until: 0 };
      w.teacherAbsent = {};
      w.calls = (w.calls || []).filter((c) => c.expires > abs(s));
      w.callsToday = 0;
      if (kind !== 'clear') toast(`${W().weather.kinds[kind].emoji} Today: ${W().weather.kinds[kind].label}${kind === 'harmattan' ? ' — dry, dusty, cold morning. Rub cream!' : kind === 'heat' ? ' — drink plenty water.' : kind === 'rain' ? ' — the field go muddy.' : ''}`);
    },

    /* ---------- queries ---------- */
    weather(s) { return (s.world.weather && s.world.weather.kind) || 'clear'; },
    raining(s) { return !!(s.world.weather && s.world.weather.rain); },
    power(s) { return !s.world.power || s.world.power.on; },
    outdoors(s) { return (s.world.map || 'campus') === 'campus'; },
    /* weather multipliers for stat decay */
    decayMult(s) {
      const k = WorldSim.weather(s);
      const def = W().weather.kinds[k];
      if (!def) return null;
      if (k === 'rain' && !(WorldSim.raining(s) && WorldSim.outdoors(s))) return null;
      const out = Object.assign({}, def.decay);
      if (k === 'harmattan' && BH.Inv.has(s, 'cream') && s.today.flags.creamed) out.hygiene = 1;
      return out;
    },

    /* ---------- every minute ---------- */
    onMinute(s) {
      const w = s.world;
      const now = abs(s);
      // rain spells come and go
      if (w.weather.kind === 'rain' && now >= w.weather.until) {
        w.weather.rain = !w.weather.rain;
        w.weather.until = now + (w.weather.rain ? U.randInt(30, 120) : U.randInt(60, 240));
        if (w.weather.rain) toast('🌧️ Rain don start! The field go turn mud.'); else toast('🌤️ Rain don stop.');
      }
      // NEPA comes back
      if (w.power && !w.power.on && now >= w.power.until) { w.power.on = true; toast('💡 UP NEPA!!! Light don come back! The whole school dey shout.'); }
      // calls expire → ignoring has consequences
      w.calls.filter((c) => c.expires <= now).forEach((c) => WorldSim.expireCall(s, c));
      // fights end, people go to the sick bay
      if (w.fight && now >= w.fight.until) { [w.fight.a, w.fight.b].forEach((id) => BH.Schedule.override(s, id, { key: 'sickbay', map: 'sickbay' }, 90)); w.fight = null; }
      // the world event roll
      if (now >= w.nextEvent) { w.nextEvent = now + U.randInt(20, 45); WorldSim.roll(s); }
    },

    roll(s) {
      if (BH.Time.dayType(s) === 'resumption' && BH.Time.blockId(s) === 'arrival') return;
      const list = W().events.filter((e) => !e.when || BH.Interaction.test(s, e.when));
      const e = U.weighted(list, (x) => x.weight);
      if (e && H[e.do]) H[e.do](s, e);
    },

    /* ---------- calls ---------- */
    call(s, c) {
      if (s.world.calls.some((x) => x.npc && x.npc === c.npc)) return null;
      const call = Object.assign({ uid: U.uid(), expires: abs(s) + (c.minutes || 40) }, c);
      s.world.calls.push(call);
      if (call.npc) {
        const n = BH.NPC.get(s, call.npc);
        // they come and find you (wherever you are)
        BH.Schedule.override(s, call.npc, { key: s.world.area || s.world.map || 'campus', map: s.world.map || 'campus', seek: true }, (c.minutes || 40) + 5);
        toast(`📢 ${n ? BH.NPC.name(n) : 'Somebody'} dey look for you! (${BH.Clock.until(c.minutes || 40)} to answer)`, 'info');
      } else toast(`❗ ${call.text}`, 'info');
      if (!(s.act && s.act.type === 'sleep')) BH.Clock.stopWait(s, 'call');
      BH.Sound && BH.Sound.play('notify');
      return call;
    },
    dropCall(s, mid) {
      const c = s.world.calls.find((x) => x.mid === mid || x.uid === mid);
      if (!c) return;
      s.world.calls = s.world.calls.filter((x) => x !== c);
      if (c.npc) BH.Schedule.clearOverride(s, c.npc);
    },
    expireCall(s, c) {
      WorldSim.dropCall(s, c.uid);
      if (c.kind === 'mission') {
        const m = s.missions.find((x) => x.id === c.mid);
        if (m && m.status === 'offered') BH.Missions.ignore(s, m);
      } else if (c.kind === 'signout') {
        // the shirt waits in 🎒 → ✍️ Writing
      } else if (c.kind === 'excuse') {
        const n = BH.NPC.get(s, c.npc);
        BH.fx.begin();
        BH.Excuse.punishFor(s, `${c.excuse.offence} (and you avoided ${n ? BH.NPC.name(n) : 'them'})`, Math.min(3, (c.excuse.sev || 0) + 1), n);
        BH.fx.end();
      } else if (c.kind === 'event') {
        BH.fx.begin();
        const text = BH.Events.ignore(s, c.id, c.ctx);
        BH.fx.end();
        if (text) toast(`⌛ ${text}`, 'info');
      }
    },
    callFrom(s, npcId) { return s.world.calls.find((c) => c.npc === npcId) || null; },

    /* ---------- move the player somewhere (scene does it; headless just sets the map) ---------- */
  };

  /* World event handlers (content/world.json "do") */
  const H = {
    fight(s, e) {
      const pool = BH.NPC.students(s).filter((n) => ['bully', 'sporty', 'comedian', 'regular', 'hustler'].includes(n.arch) || n.role === 'bully');
      const [a, b] = U.sample(pool.length >= 2 ? pool : BH.NPC.students(s), 2);
      if (!a || !b) return;
      const place = U.pick(['field', 'assembly', 'tap', 'tuckshop']);
      s.world.fight = { a: a.id, b: b.id, key: place, until: abs(s) + 25 };
      [a, b].forEach((n) => BH.Schedule.override(s, n.id, { key: place, map: 'campus', fight: true }, 25));
      s.world.witnessed.push({ npc: a.id, what: 'fighting', at: abs(s) });
      BH.Gist.add(s, `${BH.NPC.name(a)} and ${BH.NPC.name(b)} fight for the ${D.CAMPUS.LOCATIONS[place].name.toLowerCase()} 🥊`, { about: a.id, spread: 0.2 });
      toast(U.fill(e.text, { place: D.CAMPUS.LOCATIONS[place].name, a: BH.NPC.name(a), b: BH.NPC.name(b) }), 'info');
    },
    theft(s, e) {
      const mine = BH.Inv.valuables(s).length && !BH.Inv.has(s, 'padlock') && !s.flags.padlocked && (s.world.map || '') !== BH.Schedule.myHostel(s) && U.chance(0.35);
      if (mine) {
        const lost = BH.Inv.loseRandom(s, 1);
        BH.bus.emit('provisions:lost', { items: lost });
        toast(`🫳 You come back to find your locker open — ${lost.join(', ')} don miss! (Padlock dey tuck shop…)`, 'bad');
        BH.Gist.add(s, `Thief don strike again for ${s.player.house.name} hostel 😤`, { spread: 0.2 });
        if (!s.arcs.thief && s.time.dayCount >= 2) { s.arcs.thief = 'started'; BH.Missions.assign(s, 'thiefArc1'); }
        return;
      }
      const victim = U.pick(BH.NPC.students(s));
      const thief = BH.NPC.byArch(s, 'thief');
      if (thief) s.world.witnessed.push({ npc: thief.id, what: 'stealing provisions', at: abs(s) });
      BH.Gist.add(s, `Somebody thief ${victim.first}'s provisions. ${victim.first} dey cry for corridor 😢`, { about: victim.id, spread: 0.15, tags: ['theft'] });
    },
    teacherAbsent(s, e) {
      const todays = [0, 1, 2, 3].map((p) => BH.Academics.periodSubject(s, p)).filter(Boolean);
      const code = U.pick(todays);
      const t = code && BH.NPC.teacher(s, code);
      if (!t || s.world.teacherAbsent[t.id]) return;
      s.world.teacherAbsent[t.id] = true;
      toast(U.fill(e.text, { teacher: BH.NPC.name(t), subject: BH.Academics.name(s, code, true) }), 'info');
    },
    rain(s, e) {
      if (WorldSim.weather(s) === 'harmattan' || s.world.weather.rain) return;
      s.world.weather = { kind: 'rain', rain: true, until: abs(s) + U.randInt(30, 90) };
      toast(e.text, 'info');
    },
    nepa(s, e) {
      if (!s.world.power.on) return;
      s.world.power = { on: false, until: abs(s) + U.randInt(30, 150) };
      toast(`${e.text} ${BH.Inv.has(s, 'torch') ? 'Bring out your torchlight. 🔦' : 'No torchlight? Reading go hard.'}`, 'info');
    },
    raid(s, e) {
      const hostel = BH.Schedule.myHostel(s);
      toast(e.text, 'bad');
      const phone = s.phone && s.phone.has && !s.phone.confiscated && !s.phone.hidden;
      const heater = BH.Inv.has(s, 'heater');
      const found = [];
      if (phone && U.chance(0.7)) found.push('phone');
      else if (s.phone && s.phone.has && s.phone.hidden && U.chance(0.12)) found.push('phone');
      if (heater && U.chance(0.6)) found.push('heater');
      if (BH.Inv.has(s, 'examPaper') && U.chance(0.5)) found.push('examPaper');
      if (!found.length) { BH.Gist.add(s, `House master raid ${D.CAMPUS.LOCATIONS[hostel].name}. Plenty phones enter the box.`, { spread: 0.2 }); return; }
      BH.fx.begin();
      const parts = [];
      if (found.includes('phone')) { s.phone.confiscated = true; s.phone.seized++; BH.bus.emit('phone:seized', {}); parts.push('your phone'); }
      if (found.includes('heater')) { BH.Inv.take(s, 'heater', 1); parts.push('your heater'); }
      if (found.includes('examPaper')) { BH.Inv.take(s, 'examPaper', 1); parts.push('LEAKED EXAM QUESTIONS'); }
      const sev = found.includes('examPaper') ? 3 : 2;
      const p = BH.Discipline.offence(s, `Contraband found in raid (${parts.join(', ')})`, sev);
      BH.fx.end();
      BH.Gist.add(s, `Raid! House master find ${parts.join(' and ')} for ${s.player.name.split(' ')[0]}'s locker 😱`, { about: 'me', valence: -0.3, tags: ['caught'] });
      toast(`🚨 They search your locker and find ${parts.join(' and ')}! ${p}`, 'bad');
    },
    gist(s) {
      const a = BH.NPC.randomClassmate(s);
      BH.Gist.add(s, BH.Gist.filler(s).replace(/^"|"$/g, ''), { about: a.id, spread: 0.1 });
    },
    call(s) {
      const w = s.world;
      if (w.calls.length >= 2 || (w.callsToday || 0) >= C().get('missions').daily.callsPerDay + 2) return;
      // a mission offer (senior errand, sports captain…) or an NPC with something to say
      const T = C().get('missions').templates;
      const pool = Object.entries(T).filter(([id, t]) => t.offer === 'call' && (t.days || []).includes(s.time.dayType)
        && (!t.when || BH.Interaction.test(s, t.when)) && !(t.arc && s.arcs[t.arc])
        && !s.missions.some((m) => m.tpl === id && ['offered', 'active'].includes(m.status)));
      if (pool.length && U.chance(0.65)) {
        const [id] = U.weighted(pool, ([, t]) => t.weight);
        if (BH.Missions.offerCall(s, id)) w.callsToday = (w.callsToday || 0) + 1;
        return;
      }
      const ev = BH.Events.pickNpcEvent(s);
      if (ev) { BH.Events.optional(s, ev.id, ev.ctx); w.callsToday = (w.callsToday || 0) + 1; }
    },
    happening(s) {
      const ids = W().happenings.filter((id) => BH.Events.EVENTS[id] && BH.Events.eligible(s, id));
      const id = U.pick(ids);
      if (id) BH.Events.optional(s, id);
    },
  };
  WorldSim.H = H;

  BH.registerSystem('WorldSim', WorldSim);
})(window.BH);
