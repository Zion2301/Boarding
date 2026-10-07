/* Phone (contraband!), family relationships, parcels from home and letters.
   Texts arrive during blocks; replies have consequences; ignored texts expire after ~10 blocks.
   Using the phone in class/prep risks seizure. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const N = () => BH.NPC;
  const S = () => BH.Stats;

  const EXPIRE = 10;           // blocks before an unanswered text counts as ignored
  const MAX_PENDING = 3;
  const INCOMING = 0.2;
  const FAMILY = ['mummy', 'daddy', 'sibling', 'friend'];

  const Phone = {
    onNewGame(s) {
      Phone.ensure(s);
    },
    /* also used to upgrade old saves */
    ensure(s) {
      if (!s.phone) s.phone = { has: false, confiscated: false, battery: 100, threads: {}, unread: {}, pending: [], hidden: false, seized: 0 };
      if (!s.family) {
        const T = D.TRIBES[U.pick(Object.keys(D.TRIBES))];
        s.family = {
          mummy: 65, daddy: 55, sibling: 60, friend: 60,
          sibName: U.pick(T[U.pick(['m', 'f'])]),
          friendName: U.pick(T[U.pick(['m', 'f'])]),
          parcels: [], letterDue: null,
        };
      }
    },

    stamp(s) { return s.time.dayCount * 20 + s.time.block; },
    usable(s) { return s.phone.has && !s.phone.confiscated; },
    vars(s) {
      const crush = N().crush(s), bunk = N().byRole(s, 'bunkmate');
      return {
        name: s.player.name.split(' ')[0], sib: s.family.sibName, friend: s.family.friendName,
        crush: crush ? crush.first : 'Crush', bunk: bunk ? bunk.first : 'Bunkmate',
        gb: BH.gendered(s, 'Guy', 'Babe'), pikin: BH.gendered(s, 'son', 'daughter'),
      };
    },
    contactName(s, key) { return U.fill(D.CONTACTS[key].name, Phone.vars(s)); },
    contactNpc(s, key) {
      if (key === 'crush') return N().crush(s);
      if (key === 'bunkmate') return N().byRole(s, 'bunkmate');
      return null;
    },

    give(s, battery = 80) {
      s.phone.has = true;
      s.phone.confiscated = false;
      s.phone.battery = battery;
      BH.log(s, '📱 You now get phone. Hide am well!', 'good');
      Phone.receive(s, 'mummy', 'Did you reach school safely? Call me o. And DON\'T let them see this phone!! ❤️');
    },

    receive(s, from, text, tpl) {
      const th = (s.phone.threads[from] = s.phone.threads[from] || []);
      th.push({ who: 'them', text: U.fill(text, Phone.vars(s)), t: Phone.stamp(s) });
      if (th.length > 40) th.shift();
      s.phone.unread[from] = (s.phone.unread[from] || 0) + 1;
      if (tpl) s.phone.pending.push({ tpl, from, t: Phone.stamp(s) });
    },
    unreadTotal(s) { return Object.values(s.phone.unread || {}).reduce((a, b) => a + b, 0); },

    onBlockStart(s) {
      if (!Phone.usable(s)) return;
      s.phone.battery = Math.max(0, s.phone.battery - 2.5);
      // expire ignored texts
      const now = Phone.stamp(s);
      s.phone.pending.filter((p) => now - p.t > EXPIRE).forEach((p) => {
        const tpl = D.MESSAGES.find((m) => m.id === p.tpl);
        s.phone.pending = s.phone.pending.filter((x) => x !== p);
        if (tpl) Phone.applyOutcome(s, p.from, tpl.ignore || {}, true);
        BH.log(s, `📵 You ignored ${Phone.contactName(s, p.from)}'s text`, 'bad');
      });
      if (s.phone.battery <= 0 || s.phone.pending.length >= MAX_PENDING || !U.chance(INCOMING)) return;
      const pendingIds = s.phone.pending.map((p) => p.tpl);
      const eligible = D.MESSAGES.filter((m) => !pendingIds.includes(m.id) && (!D.CONTACTS[m.from].npc || Phone.contactNpc(s, m.from)) && (!m.when || m.when(s)));
      const tpl = U.weighted(eligible, (m) => m.weight || 1);
      if (!tpl) return;
      const text = typeof tpl.text === 'function' ? tpl.text(s) : tpl.text;
      Phone.receive(s, tpl.from, text, tpl.id);
      BH.UI && BH.UI.toast(`📱 ${Phone.contactName(s, tpl.from)}: ${U.fill(text, Phone.vars(s)).slice(0, 48)}…`, 'info');
    },

    /* Risk of being caught using the phone right now — depends on who can SEE you.
       (The scene reports the closest watcher with a clear view; hiding makes you safe.) */
    risk(s) {
      if (s.act && s.act.type === 'hide') return 0.01;
      const w = BH.World && BH.World.watcherNear ? BH.World.watcherNear(260) : null;
      const strict = BH.Discipline.strict(s);
      if (w) return Math.min(0.9, 0.35 + strict * 0.3 + (w.dist < 120 ? 0.2 : 0));
      const k = BH.Time.block(s).kind;
      if (['class', 'assembly', 'worship'].includes(k) && BH.Activities.present(s)) return 0.25 + strict * 0.2;
      return 0.03;
    },

    reply(s, pendingIdx, replyIdx) {
      const p = s.phone.pending[pendingIdx];
      if (!p) return { text: 'Message don expire.' };
      const tpl = D.MESSAGES.find((m) => m.id === p.tpl);
      const r = tpl && tpl.replies[replyIdx];
      if (!r) return { text: '...' };
      if (s.phone.battery <= 0) return { text: 'Your phone don die. 🪫 Charge am first.' };
      if (BH.Discipline.caught(s, Phone.risk(s))) {
        return { text: Phone.seize(s, `Caught pressing phone during ${BH.Time.block(s).title}`), caught: true };
      }
      s.phone.pending.splice(pendingIdx, 1);
      const th = s.phone.threads[p.from];
      th.push({ who: 'me', text: r.label, t: Phone.stamp(s) });
      if (r.reply) th.push({ who: 'them', text: U.fill(r.reply, Phone.vars(s)), t: Phone.stamp(s) });
      const extra = Phone.applyOutcome(s, p.from, r, false);
      if (extra) th.push({ who: 'them', text: extra, t: Phone.stamp(s) });
      BH.bus.emit('phone:reply', { from: p.from });
      return { text: 'Sent ✓✓' };
    },

    applyOutcome(s, from, o, ignored) {
      if (o.fam && FAMILY.includes(from)) s.family[from] = U.clamp(s.family[from] + o.fam);
      if (o.rel) N().rel(s, Phone.contactNpc(s, from), o.rel);
      if (o.fx) S().change(s, o.fx);
      if (o.money > 0) S().money(s, o.money);
      if (o.money < 0) { if (s.money >= -o.money) S().money(s, o.money); else s.family.sibling = U.clamp(s.family.sibling - 5); }
      if (o.parcel) s.family.parcels.push(o.parcel);
      return o.effect ? Phone.effect(s, o.effect, ignored) : null;
    },

    effect(s, key) {
      switch (key) {
        case 'mumComplain': {
          const bully = N().senior(s, 'bully');
          S().favour(s, -8); S().rep(s, -2);
          if (bully) N().rel(s, bully, -10);
          BH.log(s, `📞 Mummy call the House Master. ${bully ? N().name(bully) + ' collect 6 strokes. ' : ''}Seniors don dey call you "Mummy's pikin".`, 'bad');
          return null;
        }
        case 'mumCalls':
          if (U.chance(0.35)) { BH.Events.queue(s, 'phoneRaid'); BH.log(s, '📞 Mummy call the House Master 5 times looking for you. He don dey suspect say you get phone...', 'bad'); }
          return null;
        case 'mumLie':
          S().money(s, 2000);
          if (U.chance(0.4)) { S().money(s, 2000); return 'Ahn ahn, sorry o. I don send another ₦2,000. 🙏'; }
          s.family.mummy = U.clamp(s.family.mummy - 12);
          return 'The Bursar say you collect am YESTERDAY. So you dey lie to your own mother?! 😡';
        case 'dadTutor': BH.Academics.study(s, 'MTH', 3, true); return null;
        case 'dadMoney':
          if (s.family.daddy >= 50) { const amt = { struggling: 500, middle: 1500, bigman: 5000 }[s.player.background]; S().money(s, amt); return `Sent ${U.money(amt)}. Don't waste it.`; }
          return 'On second thought, no. Learn to manage.';
        case 'sibSnitch':
          if (U.chance(0.4)) {
            s.family.mummy = U.clamp(s.family.mummy - 8);
            BH.Events.queue(s, 'phoneRaid');
            BH.log(s, `😈 ${s.family.sibName} don tell Mummy say you get phone. Mummy call the school...`, 'bad');
          }
          return null;
        case 'hideWell': s.phone.hidden = true; return null;
        case 'tutorCrush': BH.Academics.study(s, 'MTH', 2, true); return null;
        case 'shareFree': S().rep(s, 3); s.npcs.classmates.forEach((c) => { c.rel = U.clamp(c.rel + 1); }); return null;
        default: return null;
      }
    },

    seize(s, reason) {
      s.phone.confiscated = true;
      s.phone.pending = [];
      s.phone.seized++;
      BH.bus.emit('phone:seized', {});
      const p = BH.Discipline.offence(s, reason, 2, 'The House Master seize your phone and hold am up for everybody to see: "CONTRABAND!" Then two strokes for your back.');
      BH.log(s, '📵 Phone seized!', 'bad');
      return `📵 Wahala! ${p}`;
    },

    canCharge(s) { return ['hostel', 'free', 'sleep', 'prep', 'meal'].includes(BH.Time.block(s).kind) && !s.today.flags.charged; },
    charge(s) {
      s.today.flags.charged = true;
      const base = BH.Time.block(s).kind === 'prep' ? 0.3 : 0.12;
      if (BH.Discipline.caught(s, base)) return { text: Phone.seize(s, 'Charging a phone in the hostel'), caught: true };
      s.phone.battery = Math.min(100, s.phone.battery + 65);
      return { text: U.pick(['You plug am for the socket behind the House Master\'s notice board. 🔌 Battery up!', 'Your bunkmate "guard" the socket while you charge. Teamwork. 🔌']) };
    },

    /* Parcels from home arrive at the weekend; letters get replies a week later */
    onNewDay(s) {
      Phone.ensure(s);
      const f = s.family;
      if (s.time.dow === 5 && f.parcels.length) {
        const merged = {};
        f.parcels.forEach((p) => Object.entries(p).forEach(([k, v]) => { merged[k] = (merged[k] || 0) + v; }));
        f.parcels = [];
        BH.Events.queue(s, 'parcel', { items: merged });
      }
      if (f.letterDue !== null && s.time.dayCount >= f.letterDue) {
        f.letterDue = null;
        BH.Events.queue(s, 'letterReply');
      }
    },
    onTermEnd(s) {
      if (s.phone.confiscated && s.discipline.points < 15) {
        s.phone.confiscated = false;
        s.phone.battery = 100;
        BH.log(s, '📱 House Master give you back your phone for holiday — with long lecture.', 'info');
      } else if (s.phone.confiscated) {
        s.phone.has = false;
        s.phone.confiscated = false;
        BH.log(s, '📵 Your seized phone no come back. E don join the House Master\'s collection.', 'bad');
      }
    },
  };

  /* ---------- events ---------- */
  const E = BH.Events.EVENTS;
  const kind = (b) => D.BLOCKS[b].kind;

  E.phoneRaid = {
    weight: 1, emoji: '🚨', title: 'PHONE RAID!',
    when: (s, b) => Phone.usable(s) && ['hostel', 'sleep', 'free'].includes(kind(b)),
    text: (s) => `House Master and three prefects burst into the hostel with torchlight: "EVERYBODY STAND BY YOUR LOCKER! We are looking for PHONES!"${s.phone.hidden ? '\n\nYou don hide your phone well since your bunkmate warn you. 😏' : ''}`,
    choices: (s) => [
      { label: '🛏️ Hide am inside your pillow', sub: 'Classic move', run(s) {
        const ok = U.chance(0.5 + (s.phone.hidden ? 0.3 : 0) + S().mod(s, 'dodge'));
        s.phone.hidden = false;
        if (ok) return 'Prefect press your pillow… and move on. Your heart nearly comot from your chest. 😮‍💨';
        return 'Prefect squeeze the pillow: "Ehen! Wetin be this?" ' + Phone.seize(s, 'Phone found during hostel raid');
      } },
      { label: '🕳️ Hide am inside the ceiling', sub: 'Safer, but someone fit find am', run(s) {
        s.phone.hidden = false;
        S().change(s, { rest: -3 });
        if (U.chance(0.12)) { s.phone.has = false; return 'Raid pass. But when you check the ceiling later… phone don disappear. Somebody see you hide am. 💔'; }
        if (U.chance(0.15)) return 'Prefect climb the bunk and check the ceiling! ' + Phone.seize(s, 'Phone found during hostel raid');
        return 'You push am inside ceiling board sharp sharp. Raid pass. Survived. 😎';
      } },
      { label: '🙋 Surrender am', sub: 'No offence, but phone gone till end of term', run(s) {
        s.phone.confiscated = true; s.phone.pending = [];
        S().favour(s, 2);
        return 'You bring am out yourself. House Master: "At least you are honest." Phone seized, but no punishment.';
      } },
    ],
  };

  E.phoneSale = {
    weight: 0.8, emoji: '📱', title: 'Phone For Sale',
    when: (s, b) => !s.phone.has && s.money >= 3500 && ['free', 'hostel'].includes(kind(b)),
    ctx: (s) => ({ npc: N().byArch(s, 'hustler').id }),
    text: (s, c) => `${N().name(N().get(s, c.npc))} the hustler pull you aside and open handkerchief: one small "touchlight" phone with SIM. "₦3,500. E dey work well. No ask me where e come from."`,
    choices: (s, c) => [
      { label: '💸 Buy am (₦3,500)', sub: 'Contraband — hide am well', run(s) { S().money(s, -3500); Phone.give(s, 60); N().rel(s, N().get(s, c.npc), 5); return 'You hide the phone inside your sock. You don join the "phone people". Mummy go hear from you now. 📱'; } },
      { label: '🙅 No, I no want wahala', sub: 'Stay safe', run() { return '"Your loss," the hustler says, and goes to sell it to the next person.'; } },
    ],
  };

  E.parcel = {
    forced: true, emoji: '📦', title: 'Parcel From Home!',
    text: (s, c) => `The gate man call your name: parcel! Mummy send ${Object.entries(c.items).map(([k, v]) => `${v} ${D.ITEMS[k].name}`).join(', ')} through your uncle.`,
    choices: () => [{ label: '🥹 Collect am with joy', sub: 'Provisions!', run(s, c) {
      Object.entries(c.items).forEach(([k, v]) => BH.Inv.add(s, k, v));
      S().change(s, { morale: 8 });
      return 'You carry the parcel like trophy. Before you reach hostel, five "friends" don appear. 😂';
    } }],
  };

  E.letterReply = {
    forced: true, emoji: '📬', title: 'Letter From Home',
    text: (s) => (s.family.mummy >= 60
      ? 'The House Master hand you an envelope with Mummy\'s handwriting. "My dear, I read your letter three times and cried. I am proud of you. Inside is something small. Read your books and pray. Mummy." ❤️'
      : 'A short letter from home: "We received your letter. Your father says you should focus on your studies. Your results better be good. Mummy."'),
    choices: (s) => [{ label: '✉️ Open am', sub: s.family.mummy >= 60 ? 'Something inside!' : 'Hmm', run(s) {
      s.family.mummy = U.clamp(s.family.mummy + 3);
      if (s.family.mummy >= 60) {
        const amt = { struggling: 500, middle: 1000, bigman: 3000 }[s.player.background];
        S().money(s, amt); S().change(s, { morale: 12 });
        return `${U.money(amt)} fold inside the letter, plus one picture of the family. You keep the picture inside your Bible/Qur'an. 🥹`;
      }
      S().change(s, { morale: 3 });
      return 'Short and straight to the point. Still, e sweet to hear from home.';
    } }],
  };

  BH.registerSystem('Phone', Phone);
})(window.BH);
