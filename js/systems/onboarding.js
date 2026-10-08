/* Resumption day — the first-minute experience. The tutorial is the story (no tutorial screens):
     cutscene at the gate (js/render3d/cutscene.js) → register at the Admin Block (house + class arm) → carry your chop
     box to the hostel → choose your bunk → meet your bunkmate (a real player from your arrival group if possible) →
     a senior "checks" your provisions → free time → first dinner → lights out: the first-night ghost story.
   New players who arrive close together are one cohort (server): same arm, same house, same-gender bunkmates.
   s.onboard = { step, mate, t } · finished → s.flags.onboarded */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast(t, k);

  const STEPS = {
    cutscene: { text: 'Arriving at school…' },
    register: { text: 'Register at the Admin Block', hint: 'Walk there (WASD / joystick / tap the ground). Follow the gold arrow.', key: 'admin', map: 'admin', obj: ['officeDesk', 'principalDesk'] },
    box: { text: 'Carry your chop box to your hostel', hint: 'Hold Shift (or push the stick all the way) to run.', hostel: true },
    bunk: { text: 'Choose your bunk', hint: 'Walk up to any free bunk and press Space (or tap the button).', hostel: true, obj: ['bunk', 'myBed'] },
    mate: { text: 'Meet your bunkmate', hint: 'Say hi! Press C (or 💬) to talk, or wave with an emote.' },
    senior: { text: 'Uh-oh… a senior is coming' },
    free: { text: 'Free time until dinner — explore, or play Last Card with your bunkmate (🎲)' },
    dinner: { text: 'First dinner in the dining hall', hint: 'Collect your plate at the counter, then eat at your house table.', key: 'dining', map: 'dining' },
    night: { text: 'Lights out — get into your bunk', hint: 'Go to your hostel and sleep in your bunk before 10:15 PM.', hostel: true },
  };

  const Onboarding = {
    STEPS,
    onNewGame(s) {
      s.onboard = { step: 'cutscene', t: 0, mate: null };
      s.flags.onboarded = false;
      // opened a friend's invite link: join their class arm + house (the server also groups you with them)
      if (BH.Invite && BH.Invite.from) { s.onboard.inviteFrom = BH.Invite.from; s.onboard.invite = BH.Invite.info; BH.Invite.used(); }
    },
    onLoad(s) { if (!s.onboard && !s.flags.onboarded) s.flags.onboarded = true; },
    active(s) { return !!(s.onboard && !s.flags.onboarded); },
    /* still arriving (before free time): the school timetable doesn't apply yet, nobody marks you absent */
    settling(s) { return Onboarding.active(s) && ['cutscene', 'register', 'box', 'bunk', 'mate', 'senior'].includes(s.onboard.step); },
    step(s) { return Onboarding.active(s) ? s.onboard.step : null; },
    go(s, step) {
      s.onboard.step = step; s.onboard.t = 0;
      const st = STEPS[step];
      if (st && st.hint) toast(`💡 ${st.hint}`, 'info');
      BH.Store && BH.Store.changed();
      BH.bus.emit('onboard', { step });
    },

    /* the HUD objective + where the marker points */
    objective(s) {
      if (!Onboarding.active(s)) return null;
      const st = STEPS[s.onboard.step];
      if (!st) return null;
      const hostel = BH.Schedule.myHostel(s);
      const map = st.hostel ? hostel : st.map || null;
      return { text: st.text, map, key: st.hostel ? hostel : st.key, obj: st.obj || null };
    },

    /* ---------- the cutscene ends → the parent's goodbye, then go register ---------- */
    cutsceneDone(s) {
      if (!Onboarding.active(s) || s.onboard.step !== 'cutscene') return;
      Onboarding.go(s, 'register');
      if (!s.flags.parentBye) { s.flags.parentBye = true; s.queue.push({ id: 'arrivalParent', ctx: {} }); } // the goodbye, right there at the car
    },

    /* ---------- cohort (multiplayer) ---------- */
    cohort(s, c) {
      s.onboard = s.onboard || { step: 'register', t: 0 };
      s.onboard.cohort = { id: c.id, arm: c.arm, house: c.house, members: (c.members || []).map((m) => m.name) };
      if (c.bunkmate) s.onboard.mate = c.bunkmate;
    },
    bunkmate(s, m) {
      if (!s.onboard) return;
      s.onboard.mate = m;
      if (Onboarding.active(s)) BH.Social && BH.Social.chip(`🛏️ Your bunkmate ${m.name} just arrived! Go and say hi.`, 'callGo', m.pid, 120);
    },

    /* ---------- actions offered on objects during the story ---------- */
    actionsFor(s, target) {
      if (!Onboarding.active(s) || !target || target.type !== 'object') return [];
      const step = s.onboard.step, k = target.obj.kind;
      if (step === 'register' && ['officeDesk', 'principalDesk'].includes(k)) return [{ id: 'register', label: 'Register for school', emoji: '📝', do: 'onboardRegister', prio: -1 }];
      if (step === 'bunk' && ['bunk', 'myBed'].includes(k) && target.obj.map === BH.Schedule.myHostel(s)) return [{ id: 'chooseBunk', label: 'Choose this bunk', emoji: '📦', do: 'onboardBunk', prio: -1 }];
      return [];
    },
    register(s) {
      let c = s.onboard.cohort;
      const st = BH.School.student(s, 'player');
      // offline fallback for an invite: the inviter's class arm + house (same year only)
      const inv = s.onboard.invite;
      if (!c && inv && inv.arm && Number(inv.level || 1) === s.time.year) c = { arm: inv.arm, house: Math.max(0, D.HOUSES.findIndex((h) => h.tag === inv.house)), members: [inv.name, s.player.name] };
      if (c) {
        st.arm = c.arm;
        s.player.house = D.HOUSES[c.house % D.HOUSES.length];
        st.house = s.player.house.tag;
        BH.School.ensureSeating(s, BH.School.myClass(s).id);
        BH.School.ensureLeaders(s);
      }
      const cls = BH.School.myClass(s);
      const form = cls.form && BH.NPC.get(s, cls.form);
      const vp = BH.Schedule.staff(s, 'vp');
      s.flags.carryBox = true;
      Onboarding.go(s, 'box');
      const mates = c && c.members.length > 1 ? `\n\nYou arrived with: **${c.members.filter((n) => n !== s.player.name).join(', ')}** — same class, same house. 🤝` : '';
      return {
        text: `${vp ? BH.NPC.name(vp) : 'The VP'} looks up from a pile of forms: "Name? … ${s.player.name}. Receipt? … Good."\n\n📋 Class: **${cls.id}** — form teacher **${form ? BH.NPC.name(form) : '—'}**\n🏠 House: **${s.player.house.name}** (${s.player.house.tag})\n🛏️ Hostel: **${D.CAMPUS.LOCATIONS[BH.Schedule.myHostel(s)].name}**${mates}\n\n"Carry your box to the hostel. NEXT!"`,
        good: true, noTime: true,
      };
    },
    chooseBunk(s, obj) {
      s.world.myBunk = { map: obj.map, id: obj.id };
      s.flags.carryBox = false;
      BH.World.snap && obj.seats && obj.seats[0] && BH.World.snap({ x: obj.x, y: obj.y + 40 });
      Onboarding.go(s, 'mate');
      const m = s.onboard.mate;
      const online = m && BH.Net && BH.Net.byPid(m.pid);
      if (online) { BH.Net.waypoint = { map: online.map, x: online.tx, y: online.ty, actor: 'r:' + online.sid, until: Date.now() + 120000 }; toast(`🛏️ Your bunkmate is **${m.name}** — go say hi! (C to talk, or wave)`, 'good'); }
      else { const bot = BH.NPC.byRole(s, 'bunkmate'); if (bot) toast(`🛏️ Your bunkmate is ${bot.first}. Go and greet them!`, 'good'); }
      return { text: '📦 You drop your chop box under the bunk and spread your bedsheet. Home sweet home… for the next three months. 🛏️', good: true, noTime: true };
    },

    /* ---------- progress from things you do ---------- */
    onMinute(s) {
      if (!Onboarding.active(s)) return;
      const ob = s.onboard;
      ob.t++;
      const map = s.world.map || 'campus';
      if (ob.step === 'box' && map === BH.Schedule.myHostel(s)) Onboarding.go(s, 'bunk');
      if (ob.step === 'mate') {
        // met them? (near your real bunkmate, or after a short while if they haven't arrived yet)
        const m = ob.mate && BH.Net && BH.Net.byPid(ob.mate.pid);
        const a = m && BH.Actors && BH.Actors.get('r:' + m.sid), pl = BH.Actors && BH.Actors.player();
        const near = a && pl && a.map === pl.map && Math.hypot(a.x - pl.x, a.y - pl.y) < 140;
        if (near && ob.greeted) { toast(`🤝 You and ${m.name.split(' ')[0]} are bunkmates now.`, 'good'); BH.Net.send('friend', { to: m.pid }); return Onboarding.go(s, 'senior'); }
        if (!m && ob.t >= 3) {
          const bot = BH.NPC.byRole(s, 'bunkmate');
          toast(bot ? `🛏️ ${bot.first} waves from the top bunk: "Bunkie! Welcome!"` : '🛏️ Your bunkmate never reach — late resumption. They go come tomorrow.', 'info');
          return Onboarding.go(s, 'senior');
        }
        if (ob.t >= 25) return Onboarding.go(s, 'senior');
      }
      if (ob.step === 'senior' && ob.t >= 2 && !s.queue.length) { s.queue.push({ id: 'provisionCheck', ctx: {} }); Onboarding.go(s, 'free'); }
      if (ob.step === 'free' && BH.Time.block(s).kind === 'meal') Onboarding.go(s, 'dinner');
      if (ob.step === 'dinner' && s.today.meals.dinner) Onboarding.go(s, 'night');
      if (['free', 'dinner'].includes(ob.step) && BH.Time.blockId(s) === 'lightsout') Onboarding.go(s, 'night');
      if (ob.step === 'night' && ((s.act && s.act.type === 'sleep') || (BH.Clock.mod(s) >= 22 * 60 + 20 && map === BH.Schedule.myHostel(s)))) {
        if (s.act && s.act.type === 'sleep') BH.Activities.wake(s, 'event');
        s.queue.push({ id: 'ghostStory', ctx: {} });
        s.flags.onboarded = true;
        BH.bus.emit('onboard', { step: 'done' });
      }
    },
  };

  /* chat / wave near your bunkmate counts as meeting them */
  BH.bus.on('net:chat', () => { const s = BH.Game.s; if (s && Onboarding.step(s) === 'mate') s.onboard.greeted = true; });
  const origEmote = () => { const s = BH.Game.s; if (s && Onboarding.step(s) === 'mate') s.onboard.greeted = true; };
  BH.bus.on('emote', origEmote);

  /* ---------- the two story scenes ---------- */
  const E = BH.Events.EVENTS;
  E.provisionCheck = {
    forced: true, emoji: '📦', title: 'Provisions "Inspection"',
    text(s) {
      const bully = BH.NPC.senior(s, 'bully');
      const who = bully ? BH.NPC.name(bully) : 'Senior Bobo (SS3)';
      return `${who} strolls into the dormitory with two friends, hands behind back like a customs officer.\n\n"New students! Line up beside your chop box. This is the **Provisions Inspection Committee**. Some items are… illegal for juniors."\n\nHe picks up your tin of Strongman and squints at it. "Hmm. Strongman. Very dangerous substance. Too sweet for JSS1."`;
    },
    choices: () => [
      { label: '🥛 "Senior, please collect one Strongman"', sub: 'Lose a little, gain favour', run(s) { BH.Inv.take(s, 'milk', 1) || BH.Inv.loseRandom(s, 1); BH.Stats.favour(s, 6); return '"Good junior. You have passed inspection." He walks off shaking the Strongman like maracas. Your bunkmate whispers: "Na so e dey do everybody." 😂'; } },
      { label: '😇 "Na my mummy pack am, she said na for medicine"', sub: 'Funny excuse — 50/50', run(s) { if (U.chance(0.5)) { BH.Stats.rep(s, 3); return 'The seniors burst into laughter. "Medicine?! This one get sense." They move to the next bed. You keep your Strongman. Legend. 😎'; } BH.Inv.loseRandom(s, 2); return '"Medicine abi? Then I go take am for my headache." He takes the Strongman AND your Sunrise milk. 💀'; } },
      { label: '🙈 Pretend you\'re asleep', sub: 'Cheeky', run(s) { BH.Stats.change(s, { morale: 2 }); BH.Inv.loseRandom(s, 1); return 'You snore loudly at 4 PM. Everyone laughs. The senior takes a sachet of something "for the road" and leaves you alone. 😴'; } },
    ],
  };
  E.ghostStory = {
    forced: true, emoji: '👻', title: 'First Night: The Story',
    text(s) {
      const tale = U.seedPick([
        'the **Headless Prefect of Block C**, who still patrols at 2 AM asking for your exeat card',
        'the **girl in white by the water tank**, who asks for "small water" — and if you give her, you wake up in the bush',
        'the **JSS1 boy who went to the toilet at night in 1997** — they found only his slippers',
      ], s.player.name);
      return `The light goes off. NEPA. 🕯️ Somebody switches on a torch under their chin.\n\n"You new people… make I tell una about ${tale}…"\n\nThe whole dormitory goes silent. A cockroach flies past. Somebody screams.`;
    },
    choices: () => [
      { label: '🙈 Hide under your blanket', sub: 'Safe, but you no go sleep well', run(s) { BH.Stats.change(s, { rest: -6, morale: 2 }); return 'You sleep with your eyes half open. Every sound na ghost. Welcome to boarding house. 👻 (Resumption day complete!)'; } },
      { label: '😂 Laugh: "Na lie!"', sub: '+ clout', run(s) { BH.Stats.rep(s, 3); BH.Stats.change(s, { morale: 4 }); return 'You laugh loud. Then something knocks on the window. You stop laughing. 😶 (Resumption day complete!)'; } },
      { label: '🕯️ "Tell another one!"', sub: 'Storytime with your dorm', run(s) { BH.Stats.change(s, { morale: 6, rest: -4 }); return 'Three stories later, half the dorm is hugging pillows and laughing. Best night ever. 🌙 (Resumption day complete!)'; } },
    ],
  };

  Object.assign(BH.Actions.H, {
    onboardRegister: (s) => Onboarding.register(s),
    onboardBunk: (s, c) => Onboarding.chooseBunk(s, c.obj),
  });

  BH.registerSystem('Onboarding', Onboarding);
})(window.BH);
