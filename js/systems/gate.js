/* The gate and its two keepers (content/staff.json: babamusa, sunday_nw).
   · Mallam Musa — day gateman (6 AM – 7 PM). Incorruptible: money insults him (first time a warning, then the VP).
     Respect works slowly: greet him every day (trust), bring him a kola nut. With enough trust he shares gist
     (raids, the fence hole) and on Saturdays may send you out to buy his kola — a legal hour outside.
     He prays on his mat at Zuhr (1:15) and Asr (4:15): for those minutes the gate is not watched…
   · Baba Sunday — night watchman (7 PM – 6 AM). Torch, whistle, old dog Bingo, football radio. Food softens him
     (bring him something and he "doesn't see you" tonight), ₦300 can open the gate at night (if he trusts you),
     he tells folk tales by his fire, he's scared of the old lab, and on most nights he dozes off between 1 and 3:30 AM
     — unless the house master is raiding.
   · The tuck shop at night is HIS: torch beam (longer sight), faster to raise the alarm, rounds of the tuck shop every
     half hour (sometimes he goes inside to check), and Bingo hears you in there. Food buys his blindness for wandering,
     never for theft. After a night-time theft he's on alert for three nights: no dozing, rounds every 15 minutes,
     and he comes looking.
   Each one barks his own lines when you're near, and the 3D actor kneels to pray / slumps asleep on his bench. */
(function (BH) {
  const U = BH.U;
  const MUSA = 'babamusa', SUNDAY = 'sunday_nw';
  const BENCH = { x: 1150, y: 1600 }; // the watchman's bench, just inside the gate
  const SNACKS = ['gala', 'bread', 'biscuits', 'chinchin', 'plantainChips', 'groundnut', 'kuli', 'sardine'];
  const first = (s) => s.player.name.split(' ')[0];
  const mins = (s) => BH.Clock.mod(s);
  const say = (a, t, ms) => { if (BH.SimNPC) BH.SimNPC.say(a, t, ms); };
  /* talk options can't pass time themselves: spend it here and return the text */
  const timed = (s, r) => { if (r && typeof r === 'object' && r.mins) { if (BH.Activities && BH.Activities.busy) BH.Activities.busy(s, r.mins, '⏳ …'); return r.text; } return r; };
  const nightKey = (s) => (mins(s) < 6 * 60 ? s.time.dayCount - 1 : s.time.dayCount); // a night belongs to the evening it started

  const LINES = {
    musa: {
      idle: ['"Sannu, sannu."', '"Allah ya kiyaye."', '"Who dey come, who dey go — I see am."', '"Uniform! Tuck your shirt!"', '"Twenty years I dey this gate. Twenty."', '📻 "…labarai daga Abuja…"'],
      friend: ['"Ah, my good pikin! Sannu!"', '"You greet me every day. Allah go bless your exam."', '"See this one — respect dey your blood."'],
      cold: ['"Hmm. Na you be the one wey want buy me with money."', '"I dey watch you o."'],
      pray: ['🤲 "Allahu akbar…"', '🤲 (praying quietly on his mat)'],
    },
    sunday: {
      idle: ['"WHO DEY THERE?!"', '📻 "GOOOAL! …ah, na replay."', '"Bingo! Come here!" 🐕', '"Night no be for small pikin. Go sleep!"', '"Abasi mi… this cold."', '🔦 (sweeps his torch across the fence)'],
      friend: ['"My pikin! You bring my chop?"', '"You be correct person. No tell anybody I talk am."'],
      ghost: ['"I no dey go near that old lab after twelve o. Na there the thing dey waka."', '"You hear that noise? …Na cat. Na cat."'],
      alert: ['"Tuck shop thief, I dey wait for you!"', '🔦 "I no go sleep this week. Try me."', '"Bingo, smell am! Find the thief!" 🐕', '"Whoever touch Mama Tuck-shop goods — your time don reach."'],
      doze: ['💤 Zzz…', '💤 (snoring loudly on his bench)', '💤 "…offside…" (talking in his sleep)'],
    },
  };
  const TALES = [
    'He pokes the fire. "Tortoise wanted to go to the feast in the sky. He borrowed one feather from every bird, then said his name was ALL OF YOU…" By the end you are laughing so hard Bingo barks.',
    'He lowers his voice. "Before una come, one student enter the old lab for night to read. In the morning, the Bunsen burner was still burning — and nobody was there." He looks over his shoulder. Twice.',
    '"When I was your age in Ikot Ekpo, my mama send me to fetch water for night. I meet one masquerade for road…" The story takes forty minutes and ends with him winning a wrestling match against a spirit.',
    '"Why the hen dey scratch the ground? Because Hawk lend her one razor, and she lose am. Till today she dey find am." He nods slowly, like that explains everything.',
  ];
  const SCORES = ['"Enyimba 2, Rangers 1 — that last goal na witchcraft!"', '"Super Eagles draw. Our defence dey sleep pass me."', '"Kano Pillars lose AGAIN. I don vex."', '"Na derby tonight! If you hear me shout, na goal, no be thief."'];

  const Gate = {
    MUSA, SUNDAY, LINES,
    onNewGame(s) { Gate.ensure(s); },
    onLoad(s) { Gate.ensure(s); },
    ensure(s) {
      s.gate = s.gate || {};
      s.gate.trust = Object.assign({ [MUSA]: 30, [SUNDAY]: 30 }, s.gate.trust || {});
      s.gate.greeted = s.gate.greeted || {};
      s.gate.bribes = s.gate.bribes || 0;
      return s.gate;
    },
    trust(s, id) { return Gate.ensure(s).trust[id] || 0; },
    addTrust(s, id, n) { const g = Gate.ensure(s); g.trust[id] = U.clamp((g.trust[id] || 0) + n, 0, 100); },
    npc(s, id) { return BH.NPC.get(s, id); },
    actor(id) { if (!BH.Actors) return null; for (const a of BH.Actors.list.values()) if (a.kind === 'npc' && a.npcId === id) return a; return null; },

    /* ---------- who is watching the gate right now? ---------- */
    onDuty(s) { const m = mins(s); return m >= 6 * 60 && m < 19 * 60 ? MUSA : SUNDAY; },
    praying(s) {
      const m = mins(s);
      if (s.time.dow === 4 && m >= 13 * 60 && m < 13 * 60 + 45) return 'Jumat'; // Friday prayers take longer
      if (m >= 13 * 60 + 15 && m < 13 * 60 + 30) return 'Zuhr';
      if (m >= 16 * 60 + 15 && m < 16 * 60 + 30) return 'Asr';
      return null;
    },
    raidTonight(s) { return !!(s.world && (s.world.raid || (s.today && s.today.flags && s.today.flags.raid))); },
    dozing(s) {
      const m = mins(s);
      if (!(m >= 60 && m < 3 * 60 + 30)) return false;
      if (Gate.raidTonight(s) || Gate.alert(s)) return false;
      const g = Gate.ensure(s);
      if (g.woke === nightKey(s)) return false; // Bingo woke him tonight
      return U.hash('doze' + nightKey(s)) % 10 < 5; // about half the nights
    },
    fedTonight(s) { return Gate.ensure(s).fed === nightKey(s) && !Gate.alert(s); },
    alert(s) { return (Gate.ensure(s).alertUntil || 0) > s.time.dayCount; },
    night(s) { const m = mins(s); return m >= 19 * 60 + 30 || m < 6 * 60; },
    /* detect.js asks this: is this watcher looking at all right now? (a fed watchman still sees thieves) */
    notWatching(s, npcId, broken) {
      if (npcId === MUSA) return !!Gate.praying(s);
      if (npcId === SUNDAY) {
        if (Gate.dozing(s)) return true;
        const theft = (broken || []).some((r) => r === 'stealing' || r === 'afterHours');
        return Gate.fedTonight(s) && !theft;
      }
      return false;
    },
    /* his torch: he sees further at night, and further still on alert nights */
    rangeMul(s, npcId, dark) { return npcId === SUNDAY && dark ? (Gate.alert(s) ? 1.9 : 1.55) : 1; },
    strict(s, npcId, base) { return npcId === SUNDAY && Gate.night(s) ? Math.max(base, Gate.alert(s) ? 0.95 : 0.8) : base; },
    gateOpen(s) { const who = Gate.onDuty(s); return who === MUSA ? !!Gate.praying(s) : Gate.dozing(s); },

    onNewDay(s) {
      const g = Gate.ensure(s);
      if (g.theftNight === s.time.dayCount - 1 && g.reported !== g.theftNight) { g.reported = g.theftNight; BH.Gist.add(s, 'Mama Tuck-shop dey cry — somebody thief from her shelf for night. Baba Sunday don swear say he go catch the person 🔦', { valence: -0.2, tags: ['stealing'] }); BH.UI.toast('🛒 Mama Tuck-shop discovered the theft. Baba Sunday is on ALERT for 3 nights. 🔦', 'bad'); }
      if (U.hash('ghost' + s.time.dayCount) % 6 === 0) BH.Gist.add(s, 'Baba Sunday run comot from near the old lab last night — he swear say he see something wey get white cloth 👻', { valence: 0 });
    },

    /* ---------- the living part: poses + barks ---------- */
    onMinute(s) {
      if (BH.Pacing && BH.Pacing.simulating) return;
      Gate.pose(s, MUSA, Gate.praying(s) ? 'kneel' : null);
      Gate.pose(s, SUNDAY, Gate.dozing(s) ? 'sit' : null);
      Gate.rounds(s);
      if (s.clock % 3) return;
      const pl = BH.Actors && BH.Actors.player();
      if (!pl) return;
      [MUSA, SUNDAY].forEach((id) => {
        const a = Gate.actor(id);
        if (!a || a.map !== pl.map || (a.bubble && a.bubble.until > performance.now())) return;
        const d = Math.hypot(a.x - pl.x, a.y - pl.y);
        if (d > 340) return;
        const t = Gate.trust(s, id);
        let pool;
        if (id === MUSA) pool = Gate.praying(s) ? LINES.musa.pray : t >= 60 ? LINES.musa.friend.concat(LINES.musa.idle) : s.gate.bribes ? LINES.musa.cold : LINES.musa.idle;
        else pool = Gate.dozing(s) ? LINES.sunday.doze : Gate.alert(s) ? LINES.sunday.alert : mins(s) >= 22 * 60 || mins(s) < 4 * 60 ? LINES.sunday.idle.concat(LINES.sunday.ghost) : t >= 60 ? LINES.sunday.friend.concat(LINES.sunday.idle) : LINES.sunday.idle;
        if (d < 140 || U.chance(0.35)) say(a, U.pick(pool), 3800);
      });
    },
    /* ---------- the tuck shop at night ---------- */
    inShop(s) { return (s.world.map || '') === 'tuckshop'; },
    rounds(s) {
      if (Gate.onDuty(s) !== SUNDAY || !Gate.night(s) || Gate.dozing(s)) return;
      const g = Gate.ensure(s);
      const m = BH.Clock.abs(s);
      const ov = s.world.overrides && s.world.overrides[SUNDAY];
      const busy = ov && ov.until > m;
      // Bingo hears someone inside the tuck shop
      if (Gate.inShop(s) && !busy && U.chance(Gate.alert(s) ? 0.12 : 0.06)) { Gate.bingo(s); return; }
      if (busy) return;
      const every = Gate.alert(s) ? 15 : 30;
      if (m - (g.lastRound || 0) < every) return;
      g.lastRound = m;
      // check the padlock outside — or go in with the torch
      const inside = Gate.alert(s) || U.chance(0.45);
      BH.Schedule.override(s, SUNDAY, inside ? { key: 'tuckshop', map: 'tuckshop', seek: Gate.alert(s) } : { key: 'tuckshop', map: 'campus' }, inside ? 8 : 6);
      if (Gate.inShop(s) && inside) BH.UI.toast('🔦 A torch beam sweeps across the window… footsteps at the door!', 'bad');
    },
    bingo(s) {
      const g = Gate.ensure(s);
      g.woke = nightKey(s);
      BH.Schedule.override(s, SUNDAY, { key: 'tuckshop', map: 'tuckshop', seek: true }, 15);
      BH.UI.toast('🐕 Bingo is barking outside the tuck shop… "WHO DEY INSIDE?!" 🔦 Hide — or run!', 'bad');
      if (BH.Sound) BH.Sound.play('bad');
    },
    pose(s, id, pose) {
      const a = Gate.actor(id);
      if (!a) return;
      if (pose) {
        if (a.pose === pose) return;
        if (a.patrolPts) { a._patrol = a.patrolPts; a.patrolPts = null; }
        // Baba Sunday shuffles back to his bench by the gate before he nods off
        if (id === SUNDAY && a.map === 'campus' && Math.hypot(a.x - BENCH.x, a.y - BENCH.y) > 45) {
          if (!a._toBench && BH.Intents) { a._toBench = true; a.path = []; BH.Intents.push(a.id, { type: 'moveTo', x: BENCH.x, y: BENCH.y }); }
          return;
        }
        a._toBench = false; a.path = []; a.pose = pose;
      } else {
        a._toBench = false;
        if (a.pose === 'kneel' || a.pose === 'sit') a.pose = null;
        if (a._patrol) { a.patrolPts = a._patrol; a._patrol = null; }
      }
    },

    /* ---------- conversations ---------- */
    talkOptions(s, n) {
      if (!n || (n.id !== MUSA && n.id !== SUNDAY)) return [];
      Gate.ensure(s);
      const once = (k) => s.gate.greeted[n.id + k] === s.time.dayCount;
      const mark = (k) => { s.gate.greeted[n.id + k] = s.time.dayCount; };
      const out = [];
      if (n.id === MUSA) {
        out.push({ label: '👋 "Sannu, Mallam!"', sub: 'Greet him (once a day)', disabled: once('greet') ? 'Greeted today' : null, run: () => {
          mark('greet'); const streak = s.gate.greeted.lastMusa === s.time.dayCount - 1;
          s.gate.greeted.lastMusa = s.time.dayCount;
          Gate.addTrust(s, MUSA, streak ? 6 : 4); BH.NPC.rel(s, n, 2); BH.Stats.change(s, { morale: 1 });
          const t = Gate.trust(s, MUSA);
          return t >= 70 ? '"Yauwa! My good pikin. Every day you greet me. Your papa train you well." He smiles properly.' : t >= 45 ? '"Sannu kadai. You dey try." He nods — warmer than yesterday.' : '"Sannu." He looks you up and down. Respect is built one day at a time.';
        } });
        out.push({ label: '🌰 Give him a kola nut', sub: BH.Inv.has(s, 'kola') ? 'He loves kola' : 'Buy one at the tuck shop (₦50)', disabled: !BH.Inv.has(s, 'kola') ? 'No kola nut' : once('kola') ? 'Given today' : null, run: () => {
          mark('kola'); BH.Inv.take(s, 'kola', 1); s.gate.kolaDay = s.time.dayCount;
          Gate.addTrust(s, MUSA, 10); BH.NPC.rel(s, n, 5);
          return '"Ah! Goro!" He splits it with his thumb and chews slowly. "Allah ya saka da alheri. You get sense pass your age."';
        } });
        if (Gate.trust(s, MUSA) >= 40) out.push({ label: '🗞️ "Mallam, any gist?"', sub: 'He sees everything', disabled: once('gist') ? 'Told you today' : null, run: () => { mark('gist'); return Gate.musaGist(s); } });
        out.push({ label: '🚪 "Mallam, abeg make I go out small"', sub: BH.Inv.has(s, 'exeat') ? 'You have an exeat — show it' : 'No exeat…', run: () => timed(s, Gate.askOut(s, n)) });
        if (s.money >= 500) out.push({ label: '💸 Offer him ₦500', sub: s.gate.bribes ? '⚠️ He warned you already' : 'Risky — he is known to be incorruptible', run: () => Gate.bribeMusa(s, n) });
      } else {
        const night = Gate.onDuty(s) === SUNDAY;
        const snack = SNACKS.find((it) => BH.Inv.has(s, it));
        out.push({ label: '🍞 Give him some chop', sub: snack ? `${(BH.data.ITEMS[snack] || {}).name || snack} — he won't "see" you tonight` : 'You have no snack', disabled: !snack ? 'No snack' : Gate.fedTonight(s) ? 'Already fed him tonight' : null, run: () => {
          if (Gate.alert(s)) { BH.Inv.take(s, snack, 1); Gate.addTrust(s, SUNDAY, 2); return '"Thank you, my pikin." He eats it — and keeps his torch on you. "But hear me: since that tuck shop wahala, my eye open. Nobody dey waka for night this week."'; }
          BH.Inv.take(s, snack, 1); s.gate.fed = nightKey(s); Gate.addTrust(s, SUNDAY, 8); BH.NPC.rel(s, n, 5);
          return '"Abasi mi! My pikin get heart!" He eats it in two bites and taps his nose. "Tonight… my eye no too sharp. Na our secret o." 🤫';
        } });
        out.push({ label: '📻 "Baba, who dey win?"', sub: 'Football gist', disabled: once('ball') ? 'Already asked today' : null, run: () => {
          mark('ball'); Gate.addTrust(s, SUNDAY, 2); BH.Stats.change(s, { morale: 2 });
          return `He turns the radio up. ${U.pick(SCORES)}`;
        } });
        if (night) out.push({ label: '🔥 "Tell me a story, Baba"', sub: Gate.fedTonight(s) || Gate.trust(s, SUNDAY) >= 45 ? 'Sit by his fire (20 min)' : 'He wants small chop first', disabled: !(Gate.fedTonight(s) || Gate.trust(s, SUNDAY) >= 45) ? 'Bring him food first' : once('tale') ? 'One story a night' : null, run: () => {
          mark('tale'); BH.Stats.change(s, { morale: 7, rest: -5 }); Gate.addTrust(s, SUNDAY, 3);
          if (BH.Story) BH.Story.note(s, 'night_story', SUNDAY);
          return timed(s, { text: U.pick(TALES), mins: 20 });
        } });
        if (night && s.money >= 300) out.push({ label: '💸 "₦300 — open the gate small?"', sub: 'Night market… if he trusts you', run: () => timed(s, Gate.bribeSunday(s, n)) });
      }
      return out;
    },

    musaGist(s) {
      if (Gate.alert(s)) return '"Somebody thief tuck shop for night. Baba Sunday don swear — him no go sleep until he catch the person." He looks at you a little too long.';
      if (Gate.raidTonight(s)) return '"Hmm. House master ask me for extra torch battery today. Make I just talk am like that." He looks away. (A raid is coming tonight.)';
      if (!s.flags.knowsFenceHole && Gate.trust(s, MUSA) >= 55) { s.flags.knowsFenceHole = true; return '"Behind the dining hall, near the big bush — the fence don tear. I know. Everybody think say I no know." He chuckles. "I know everything. Don\'t use it."'; }
      return U.pick([
        '"Two SS2 boys try to climb the fence yesterday. One of them leave him trouser for the barbed wire." He laughs into his sleeve.',
        '"The new Maths teacher? Every day him come late. I write am down." He taps a small notebook.',
        '"Visiting day, one mummy bring cooler wey big pass her car. Na jollof for whole hostel."',
        '"Baba Sunday? He fear that old lab like fire. Don\'t tell him I talk am."',
      ]);
    },
    askOut(s, n) {
      if (BH.Inv.has(s, 'exeat')) return BH.Actions.get('useExeat')(s, { npc: n });
      const t = Gate.trust(s, MUSA);
      const sat = s.time.dow === 5 && ['freetime', 'afternoon', 'sundayPm'].includes(BH.Time.blockId(s));
      if (t >= 75 && sat && s.gate.kolaDay === s.time.dayCount && s.gate.errandWeek !== s.time.week + '|' + s.time.term) {
        s.gate.errandWeek = s.time.week + '|' + s.time.term;
        BH.Stats.change(s, { hunger: 25, morale: 14 }); BH.Paths.add(s, 'popular', 1);
        BH.Gist.add(s, `Mallam Musa send ${first(s)} go buy kola for junction — nobody else get that kind privilege 👀`, { about: 'me', valence: 0.5 });
        return { text: '"You know what? My kola don finish. Go to the junction, buy me five. Thirty minutes — not one minute more." He opens the small gate. Puff-puff, suya smoke, freedom — and back before he finishes his tea. 🚶🏾', mins: 40 };
      }
      if (t >= 75 && !sat) return '"For Saturday, maybe. Today? Haba. Go back inside."';
      if (t >= 50) return '"No exeat, no outside. Na the rule, my pikin. I like you — that\'s why I no go report this one."';
      return '"Ina zuwa? Without exeat? Go back inside before I write your name!"';
    },
    bribeMusa(s, n) {
      s.gate.bribes++;
      if (s.gate.bribes === 1) { Gate.addTrust(s, MUSA, -15); BH.NPC.rel(s, n, -8); return '"Haba! Money? Na me you wan buy?!" He pushes your hand away. "Twenty years — nobody don buy me. Go. This one, I go forget. Next time, VP office."'; }
      Gate.addTrust(s, MUSA, -25); BH.NPC.rel(s, n, -12);
      return '"I warn you." He walks you straight to the VP. ' + BH.Discipline.offence(s, 'Trying to bribe the gateman', 2);
    },
    bribeSunday(s, n) {
      const t = Gate.trust(s, SUNDAY);
      BH.Stats.money(s, -300);
      if (U.chance(0.35 + t / 150 + (Gate.fedTonight(s) ? 0.15 : 0))) {
        Gate.addTrust(s, SUNDAY, 2);
        BH.Stats.change(s, { hunger: 35, morale: 15, rest: -10 }); BH.Paths.add(s, 'trouble', 3); BH.Stats.rep(s, 3);
        BH.Gist.add(s, `${first(s)} go night market for midnight — come back with suya and gist 🌙`, { about: 'me', valence: 0.4, tags: ['sneaking'] });
        if (U.chance(0.2)) return '"Quick quick!" Night market: suya, roasted corn, a radio blasting highlife… You sneak back — and the house master\'s torch is on your empty bed. ' + BH.Discipline.offence(s, 'Out of the hostel after lights out', 2);
        return { text: '"Quick quick! Before Bingo bark!" He unlocks the small gate. Night market: suya, roasted corn, a radio blasting highlife. You\'re back in your bunk by 1 AM, smelling of pepper. 🌙🍢', mins: 75 };
      }
      Gate.addTrust(s, SUNDAY, -8);
      return '"You wan put me for trouble?!" FWEEEEE! — he blows his whistle. Lights come on in the hostel. ' + BH.Discipline.offence(s, 'Trying to sneak out at night', 2);
    },

    /* ---------- slipping out while nobody watches the gate ---------- */
    actionsFor(s, target) {
      if (!target || !target.obj || target.obj.kind !== 'gateBooth') return [];
      const who = Gate.onDuty(s);
      const out = [];
      if (Gate.gateOpen(s)) out.push({ id: 'slipOut', label: who === MUSA ? `Slip out (Mallam is praying ${Gate.praying(s)})` : 'Slip out (Baba Sunday is snoring)', emoji: '🏃🏾', do: 'gateSlip', crime: 'outOfBounds', prio: 0 });
      else out.push({ id: 'whoGate', label: who === MUSA ? 'Mallam Musa is watching' : 'Baba Sunday is on duty', emoji: who === MUSA ? '💂🏾' : '🔦', do: 'gateWho', prio: 1 });
      return out;
    },
  };

  BH.Actions.define('gateWho', (s) => {
    const who = Gate.onDuty(s);
    if (who === MUSA) return `💂🏾 Mallam Musa watches the gate 6 AM – 7 PM. He never takes money, but he prays at 1:15 and 4:15…`;
    return `🔦 Baba Sunday watches at night with his torch and whistle. Rumour says he dozes off after 1 AM — and that he loves small chop.`;
  });
  BH.Actions.define('gateSlip', (s) => {
    const who = Gate.onDuty(s);
    const noticed = U.chance(who === MUSA ? 0.3 - Gate.trust(s, MUSA) / 500 : 0.22);
    BH.Stats.change(s, { hunger: 35, thirst: 10, morale: 14 }); BH.Paths.add(s, 'trouble', 3); BH.Stats.rep(s, 3);
    if (BH.Story) BH.Story.note(s, 'sneaked_out', null);
    if (noticed) {
      if (who === MUSA) { Gate.addTrust(s, MUSA, -20); return { text: 'Suya, cold mineral, an hour of freedom… You slip back in — and Mallam Musa is standing right there, prayer beads in hand. "I finish my prayer. I count my students. One was missing." ' + BH.Discipline.offence(s, 'Sneaking out of school', 2), mins: 60 }; }
      return { text: 'Bingo barks. Baba Sunday jerks awake: "WHO DEY THERE?!" FWEEEE! ' + BH.Discipline.offence(s, 'Sneaking out at night', 2), mins: 30 };
    }
    BH.Gist.add(s, `${first(s)} waka comot through the gate and come back like say nothing happen 😮`, { about: 'me', valence: 0.4, tags: ['sneaking'] });
    return { text: who === MUSA ? 'You tiptoe past Mallam Musa\'s prayer mat. Suya, cold mineral and an hour of freedom — back before he rolls up his mat. 🍢' : 'Baba Sunday snores like a generator. Bingo just watches you. Night market, suya, back in your bunk before he wakes. 🌙', mins: 60 };
  });

  // a theft from the tuck shop at night puts him on alert for three nights
  BH.bus.on('interact', (p, s) => {
    if (!s || !p || p.map !== 'tuckshop' || !Gate.night(s) || !s.world.crime || s.world.crime.rule !== 'stealing') return;
    const g = Gate.ensure(s);
    if (g.theftNight !== nightKey(s)) { g.theftNight = nightKey(s); g.alertUntil = s.time.dayCount + 3 + (mins(s) < 6 * 60 ? 0 : 1); g.thefts = (g.thefts || 0) + 1; }
    if (U.chance(0.25)) Gate.bingo(s); // shelves rattle
  });
  // Sunday's whistle when he catches someone — at the tuck shop it costs you the loot and his trust
  BH.bus.on('caught', (p, s) => {
    if (!p || p.npc !== SUNDAY || !s) return;
    const a = Gate.actor(SUNDAY);
    if (a) say(a, '🔊 FWEEEEEE! "I DON CATCH YOU!"', 3000);
    if (p.rule === 'stealing' || p.rule === 'afterHours') {
      const c = s.world.crime;
      if (c && c.item && BH.Inv.has(s, c.item)) BH.Inv.take(s, c.item, c.n || 1);
      Gate.addTrust(s, SUNDAY, Gate.ensure(s).fed === nightKey(s) ? -35 : -20);
      Gate.ensure(s).alertUntil = Math.max(Gate.ensure(s).alertUntil || 0, s.time.dayCount + 2);
      if (BH.Story) BH.Story.note(s, 'caught_stealing', SUNDAY);
      BH.UI.toast(Gate.ensure(s).fed === nightKey(s) ? '🔦 "I chop your food and you still go thief?! Shame!" He hands back what you took to Mama Tuck-shop.' : '🔦 Baba Sunday drags you out by the ear and puts the goods back on the shelf.', 'bad');
    }
  });

  BH.Gate = Gate;
  BH.registerSystem('Gate', Gate);
})(window.BH);
