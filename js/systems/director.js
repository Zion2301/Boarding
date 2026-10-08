/* Director — the school's life without a fixed storyline.
   · Weekly calendar (content/calendar.json): Jumat, inter-house practice, visiting day, Social Night, class captain
     nominations + election, inter-house sports day. Announced when they start (📢 chip → walk there), each with
     something to do: a race, a dance battle, your parents' cooler of jollof…
   · Random world events (content/world.json → BH.WorldSim): fights, thefts, NEPA, rain, raids, a teacher absent —
     plus a SNAKE in the hostel and SURPRISE INSPECTIONS (handlers here).
   · Story arcs (missions.json) start from what you do: s.flags.did_<thing> (robbed, sports, whot, election…). */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast(t, k);
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const cal = () => (BH.Content.get('calendar') || { events: [] }).events;

  const Director = {
    onNewGame(s) { s.world.cal = {}; },
    onLoad(s) { s.world.cal = s.world.cal || {}; },
    did(s, what) { s.flags['did_' + what] = (s.flags['did_' + what] || 0) + 1; },

    /* events on today's calendar for you */
    today(s) {
      return cal().filter((e) => e.dow === s.time.dow && (!e.weeks || e.weeks.includes(s.time.week)) && (!e.who || Object.entries(e.who).every(([k, v]) => s.player[k] === v)) && s.time.dayType !== 'resumption');
    },
    /* what's on right now (for the HUD and the minigame offers) */
    current(s) {
      const m = BH.Clock.mod(s);
      return Director.today(s).filter((e) => m >= toMin(e.at) && m < toMin(e.until));
    },
    isOn(s, id) { return Director.current(s).some((e) => e.id === id); },
    key(s, e) { return `${e.id}|${s.time.dayCount}`; },

    onMinute(s) {
      if (!s.world.cal) s.world.cal = {};
      const m = BH.Clock.mod(s);
      Director.today(s).forEach((e) => {
        const k = Director.key(s, e);
        if (m >= toMin(e.at) && m < toMin(e.until) && !s.world.cal[k]) {
          s.world.cal[k] = { started: true };
          Director.start(s, e);
        }
        // being there while it's on = taking part
        if (s.world.cal[k] && !s.world.cal[k].joined && m < toMin(e.until) && e.place && Director.atPlace(s, e.place)) {
          s.world.cal[k].joined = true;
          Director.arrive(s, e);
        }
      });
    },
    atPlace(s, key) {
      const L = D.CAMPUS.LOCATIONS[key];
      if (!L) return false;
      const map = s.world.map || 'campus';
      return L.kind === 'b' ? map === (L.interior || key) : map === 'campus' && s.world.area === key;
    },

    start(s, e) {
      BH.Sound && BH.Sound.play && BH.Sound.play('notify');
      toast(`📢 ${e.emoji} ${e.title}! ${e.text}`, 'good');
      if (e.place && BH.Social) BH.Social.chip(`${e.emoji} ${e.title} — now at the ${D.CAMPUS.LOCATIONS[e.place].name}. Tap to go.`, 'eventGo', e.place, 25 * 60);
      if (e.id === 'election') Director.election(s);
      BH.log(s, `${e.emoji} ${e.title}`, 'info');
    },
    arrive(s, e) {
      if (e.reward) BH.Stats.change(s, e.reward);
      if (e.id === 'jumat') { BH.Stats.favour(s, 1); toast('🕌 You pray Jumat with your brothers and sisters. Peace of mind. (+morale)', 'good'); }
      if (e.id === 'visitingDay') s.queue.push({ id: 'visitingDay', ctx: {} });
      if (e.game === 'race') BH.Social && BH.Social.chip('🏃🏾 Race starting! Tap to line up for the 100m.', 'raceJoin', e.id, 20 * 60);
      if (e.game === 'dance') BH.Social && BH.Social.chip('🪩 DANCE BATTLE! Tap to challenge the floor.', 'danceJoin', e.id, 20 * 60);
      Director.did(s, e.id);
    },

    /* ---------- player-driven: class captain election ---------- */
    runForCaptain(s) {
      if (s.flags.runningCaptain) return { text: 'Your name don already dey the list. Campaign!', cancel: true };
      s.flags.runningCaptain = s.time.dayCount;
      Director.did(s, 'campaign');
      if (BH.Net && BH.Net.online) BH.Net.say(`Vote ${s.player.name.split(' ')[0]} for class captain! 🗳️`, true);
      return { text: '🗳️ You write your name on the nominations list. Now campaign — gist with people, help your classmates, stay out of trouble. Votes are counted on Monday at register.', good: true, noTime: true };
    },
    election(s) {
      const c = BH.School.myClass(s);
      if (!c) return;
      const mem = BH.School.members(s, c.id);
      if (!s.flags.runningCaptain) {
        // someone else wins (a real player who ran, or the most popular bot)
        BH.School.ensureLeaders(s);
        toast(`🗳️ ${c.id} election: ${BH.School.nameOf(s, c.captain)} is class captain.`, 'info');
        return;
      }
      const friends = BH.Social ? BH.Social.state.friends.filter((f) => mem.some((m) => m.id === 'r:' + f.pid)).length : 0;
      const chance = U.clamp(0.25 + (s.reputation || 0) / 120 + (BH.Consequences.group(s, 'coursemates') - 50) / 150 + friends * 0.12 - (s.discipline.points || 0) / 60, 5, 95) / 100;
      const others = Math.max(0, mem.length - 1);
      const won = others === 0 || Math.random() < chance;
      s.flags.runningCaptain = 0;
      if (won) {
        c.assistant = c.captain && c.captain !== 'player' ? c.captain : c.assistant;
        c.captain = 'player';
        BH.Stats.rep(s, 6); BH.Paths && BH.Paths.add(s, 'leader', 4);
        Director.did(s, 'captain');
        toast(`🎖️ ELECTION RESULT: You are the new class captain of ${c.id}! ${others ? `(${Math.round(chance * 100)}% of the class voted for you)` : '(unopposed 😅)'}`, 'good');
        BH.Gist.add(s, `${s.player.name.split(' ')[0]} don win class captain election for ${c.id}! 🗳️`, { about: 'me', valence: 0.5 });
      } else {
        BH.Stats.change(s, { morale: -4 });
        toast(`🗳️ You lost the ${c.id} election to ${BH.School.nameOf(s, c.captain)}. There's always next term.`, 'info');
      }
    },
  };

  /* ---------- random events (world.json "do") ---------- */
  const H = BH.WorldSim.H;
  H.snake = (s, e) => {
    const inHostel = /Hostel$/.test(s.world.map || '');
    if (inHostel || BH.Clock.isNight(s)) { s.queue.push({ id: 'snake', ctx: {} }); return; }
    BH.Gist.add(s, `Snake enter the ${U.pick(['boys\'', 'girls\''])} hostel! Mallam Shehu kill am with one stick 🐍`, { spread: 0.3 });
    toast(`${e.text} (Not your hostel — you hear the screams from here 😂)`, 'info');
  };
  H.inspection = (s, e) => {
    if (s.time.dayType === 'resumption') return;
    toast(e.text, 'bad');
    s.queue.push({ id: 'inspection', ctx: {} });
  };

  const E = BH.Events.EVENTS;
  E.snake = {
    forced: true, emoji: '🐍', title: 'SNAKE IN THE HOSTEL!',
    text: () => 'Somebody screams. A long black snake is sliding under the bunks! Half the dormitory is standing on lockers; somebody is praying in tongues; one boy is already outside in only his singlet.',
    choices: () => [
      { label: '🧹 Grab a broom and face it', sub: 'Brave… or foolish', run(s) {
        Director.did(s, 'snake');
        if (U.chance(0.75)) { BH.Stats.rep(s, 6); BH.Stats.change(s, { morale: 6 }); BH.Gist.add(s, `${s.player.name.split(' ')[0]} kill snake with broom!!! Legend 🐍🧹`, { about: 'me', valence: 0.7, spread: 0.5 }); return 'WHACK! WHACK! The snake is defeated. The whole hostel carries you shoulder-high. You are a LEGEND. 🐍🧹'; }
        BH.Stats.change(s, { health: -15, morale: -4 }); s.today.flags.excused = BH.Clock.abs(s) + 120; BH.World.escort && BH.World.escort('sickbay');
        return 'The snake bites your toe before Mallam Shehu finishes it. Nurse Grace says it wasn\'t poisonous — just dramatic. Sick bay for you. 🤕';
      } },
      { label: '🏃🏾 Run outside screaming', sub: 'Safe, embarrassing', run(s) { BH.Stats.change(s, { morale: -2 }); return 'You are out of the door before the snake moves an inch. Somebody filmed it (on a phone they shouldn\'t have). 😂'; } },
      { label: '📣 Call Mallam Shehu', sub: 'Sensible', run(s) { BH.Stats.change(s, { morale: 2 }); return 'Mallam Shehu arrives with a long stick and zero fear. Done in five seconds. "Una dey fear small worm?" 🐍'; } },
    ],
  };
  E.inspection = {
    forced: true, emoji: '🧐', title: 'Surprise Inspection',
    text: (s) => `The VP appears out of nowhere with the house master and a ruler. "Everybody LINE UP! Nails out! Collars up!"\n\nYour hygiene: **${Math.round(s.stats.hygiene)}%**.${s.phone && s.phone.has && !s.phone.hidden && !s.phone.confiscated ? ' Your phone is in your pocket… 😬' : ''}`,
    choices: () => [
      { label: '🧍🏾 Stand straight and pray', sub: 'Depends how clean you are', run(s) {
        let out = '';
        if (s.phone && s.phone.has && !s.phone.hidden && !s.phone.confiscated && U.chance(0.6)) { s.phone.confiscated = true; s.phone.seized++; BH.bus.emit('phone:seized', {}); out = '📱 The VP pats your pocket. PHONE! Seized. '; }
        if (s.stats.hygiene >= 55) { BH.Stats.rep(s, 1); return out + '"Very neat. See this one — everybody should look like this." ✨'; }
        return out + '"Look at your collar! Brown like akara!" ' + BH.Discipline.minor(s, 'Failed surprise inspection');
      } },
      { label: '🫣 Hide behind the tall boy', sub: 'Might work', run(s) {
        if (BH.Discipline.caught(s, 0.45)) return '"YOU! Hiding behind your classmate? Come out!" ' + BH.Discipline.minor(s, 'Dodging inspection');
        return 'You shrink behind Emeka (6 foot 2 in JSS3). The VP passes right by. 😮‍💨';
      } },
    ],
  };
  E.visitingDay = {
    forced: true, emoji: '🧺', title: 'Visiting Day',
    text: (s) => {
      const bg = s.player.background;
      if (bg === 'struggling' && !s.flags.visitedOnce) return 'You wait under the mango tree, watching other families arrive with coolers… Then you see your uncle walking from the gate with a nylon bag and a tired smile. "Your mummy said to bring this. She dey pray for you."';
      return `Your ${BH.gendered(s, 'mum', 'mum')} is under the trees with a cooler the size of a fridge. Jollof, fried chicken, moi-moi, a crate of malt, and a bag of provisions. "Have you been eating?! You've lost weight!" 😭`;
    },
    choices: () => [
      { label: '🍗 Eat everything right now', sub: 'Hunger + morale', run(s) { s.flags.visitedOnce = true; BH.Stats.change(s, { hunger: 40, thirst: 20, morale: 12 }); BH.Inv.add(s, 'milk', 1); BH.Inv.add(s, 'biscuits', 2); BH.Stats.money(s, s.player.background === 'bigman' ? 3000 : s.player.background === 'middle' ? 1500 : 500); return 'You eat like a lion. They leave you with provisions and some money. "Read your books!" 💛'; } },
      { label: '🤝 Share with your friends', sub: 'Clout + friendship', run(s) { s.flags.visitedOnce = true; BH.Stats.change(s, { hunger: 25, morale: 10 }); BH.Stats.rep(s, 5); BH.Consequences.repChange(s, 'coursemates', 4); BH.Stats.money(s, 800); if (BH.Net && BH.Net.online) BH.Net.say('Visiting day jollof dey here! Come chop! 🍗', true); return 'You call your padi over. The cooler empties in ten minutes. Everybody will remember this jollof. 🍛'; } },
    ],
  };

  /* behaviour → arcs */
  BH.bus.on('provisions:lost', (p, s) => Director.did(s || BH.Game.s, 'robbed'));
  BH.bus.on('minigame', (p, s) => { const st = s || BH.Game.s; Director.did(st, p.kind === 'whot' ? 'whot' : 'sports'); });
  BH.bus.on('interact', (p, s) => { if (p.action === 'train' || p.action === 'compete') Director.did(s || BH.Game.s, 'sports'); });

  Object.assign(BH.Actions.H, { runForCaptain: (s) => Director.runForCaptain(s) });
  Object.assign(BH.actions, {
    eventGo(place, el) {
      const L = D.CAMPUS.LOCATIONS[place];
      if (!L || !BH.Net) return;
      BH.Net.waypoint = { map: L.kind === 'b' ? (L.interior || place) : 'campus', x: L.door.x, y: L.door.y, until: Date.now() + 20 * 60000 };
      if (el && el.dataset.chip) BH.Social.dropChip(el.dataset.chip);
      toast(`📍 Follow the blue marker to the ${L.name}.`, 'info');
    },
    raceJoin(id, el) { if (el && el.dataset.chip) BH.Social.dropChip(el.dataset.chip); BH.Games.race.start(id); },
    danceJoin(id, el) { if (el && el.dataset.chip) BH.Social.dropChip(el.dataset.chip); BH.Games.dance.start(); },
  });

  BH.registerSystem('Director', Director);
})(window.BH);
