/* Seniority: the junior → senior flip. What kind of senior you are (kind vs wicked),
   your school child, prefect appointment in SS3 and prefect duties. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const N = () => BH.NPC;
  const S = () => BH.Stats;

  /* Prefect posts. elig(s) decides who the principal considers. role = matching NPC role it replaces. */
  const POSTS = {
    head:    { label: (s) => BH.gendered(s, 'Head Boy', 'Head Girl'), emoji: '🎖️', role: 'headPrefect',
               elig: (s) => s.reputation >= 50 && s.discipline.points <= 8 && BH.Academics.avgKnowledge(s) >= 45,
               perk: 'Lead assembly every morning. Clout every day.' },
    labour:  { label: () => 'Labour Prefect', emoji: '🧹', role: 'labourPrefect',
               elig: (s) => s.reputation >= 28 && s.discipline.points <= 15,
               perk: 'No more cutting grass — you supervise.' },
    dining:  { label: () => 'Dining Hall Prefect', emoji: '🍽️', role: 'diningPrefect',
               elig: (s) => s.reputation >= 28 && s.discipline.points <= 15,
               perk: 'Prefect\'s portion at every meal.' },
    social:  { label: () => 'Social Prefect', emoji: '🪩', elig: (s) => s.reputation >= 40 || BH.Stats.has(s, 'clown'),
               perk: 'MC the Saturday Social Night.' },
    sports:  { label: () => 'Sports Prefect', emoji: '🏅', elig: (s) => BH.Stats.has(s, 'sporty') || s.reputation >= 50,
               perk: 'Train the house team in the afternoons.' },
    library: { label: () => 'Library Prefect', emoji: '📚', elig: (s) => BH.Academics.avgKnowledge(s) >= 50 || BH.Stats.has(s, 'bookworm'),
               perk: 'Private reading in the library during prep.' },
    chapel:  { label: (s) => (s.player.religion === 'muslim' ? 'Mosque Prefect (Amir)' : 'Chapel Prefect'), emoji: '🛐',
               elig: (s) => BH.Stats.has(s, 'prayer') || (s.flags.blessed || 0) >= 3,
               perk: 'Lead worship on Sundays.' },
  };

  const Seniority = {
    POSTS,

    onNewGame(s) { s.senior = { style: 0, prefect: null, appointed: false, stripped: false, schoolChild: null }; },

    isSenior(s) { return s.time.year >= 4; },
    adjust(s, d) {
      s.senior.style = U.clamp(s.senior.style + d, -20, 20);
      BH.fx.push(d > 0 ? '😈' : '😇', Math.abs(d), d > 0 ? 'Wicked senior' : 'Kind senior');
      BH.bus.emit('action', { tag: d > 0 ? 'wicked' : 'kind' });
    },
    label(s) {
      const st = s.senior.style;
      if (!Seniority.isSenior(s) && st === 0) return null;
      if (st >= 8) return '😈 Wicked senior (juniors hide when you pass)';
      if (st >= 3) return '😤 Strict senior';
      if (st <= -8) return '😇 Kind senior (juniors\' hero)';
      if (st <= -3) return '🙂 Nice senior';
      return '😐 Balanced senior';
    },
    postLabel(s) { const p = POSTS[s.senior.prefect]; return p ? `${p.emoji} ${p.label(s)}` : null; },
    is(s, post) { return s.senior.prefect === post; },

    eligible(s) {
      return Object.keys(POSTS).filter((k) => POSTS[k].elig(s));
    },
    appoint(s, key) {
      s.senior.prefect = key;
      s.senior.appointed = true;
      const role = POSTS[key].role;
      if (role) s.npcs.classmates.forEach((c) => { if (c.prefect === role) delete c.prefect; });
      S().rep(s, 10);
      S().change(s, { morale: 15 });
      BH.log(s, `${POSTS[key].emoji} Appointed ${POSTS[key].label(s)}!`, 'good');
    },

    onDayEnd(s) {
      if (s.senior.prefect === 'head') S().rep(s, 1);
    },

    /* Senior life in conversations: check on your school child (prefect duties are world actions — see actions.js prefectDuty) */
    talkOptions(s, n) {
      if (!Seniority.isSenior(s) || n.id !== s.senior.schoolChild || s.today.flags.duty_child) return [];
      return [{
        label: `🐣 Check on ${n.first}`, sub: 'Kind senior · costs a little rest',
        run() {
          s.today.flags.duty_child = true;
          Seniority.adjust(s, -1); N().rel(s, n, 6); S().change(s, { rest: -3, morale: 5 });
          BH.bus.emit('action', { tag: 'kind' });
          if (BH.Inv.valuables(s).length && U.chance(0.5)) { BH.Inv.loseRandom(s, 1); return `${n.first} dey cry because senior collect their provisions. You give am some of your own. "Na my child be this!" 🛡️`; }
          return `You check ${n.first}'s locker, help with homework, and ask if anybody dey disturb am. "Thank you Senior!" 🥹`;
        },
      }];
    },
  };

  // Prefects caught in serious offences can lose their post
  BH.bus.on('discipline', (p, s) => {
    if (!s || !s.senior || !s.senior.prefect || p.severity < 2) return;
    if (U.chance(0.5)) {
      const label = POSTS[s.senior.prefect].label(s);
      s.senior.prefect = null;
      s.senior.stripped = true;
      BH.Stats.rep(s, -10);
      BH.log(s, `🚫 You have been stripped of your post as ${label}!`, 'bad');
      BH.UI && BH.UI.toast(`🚫 Stripped of your post as ${label}!`, 'bad');
    }
  });

  /* ---------- events ---------- */
  const E = BH.Events.EVENTS;
  const jn = (s, c) => N().get(s, c.j);
  const hasJuniors = (s) => Seniority.isSenior(s) && (s.npcs.juniors || []).length > 0;
  const kind = (b) => D.BLOCKS[b].kind;

  E.prefectAppointment = {
    forced: true, emoji: '🎖️', title: 'Prefect Appointment Day',
    text(s) {
      const el = Seniority.eligible(s);
      return `SS3 don start! For assembly, the Principal bring out the list of new prefects. Everybody hold breath. Your heart dey beat like talking drum...\n\n${el.length ? `Your name dey the list! The Principal call you to office: "Based on your conduct and record, we are considering you for:"` : `Name after name… your own no come out. Your reputation (${Math.round(s.reputation)}) and discipline record (${s.discipline.points} pts) no reach.`}`;
    },
    choices(s) {
      const el = Seniority.eligible(s);
      if (!el.length) return [{ label: '👏 Clap for your coursemates', sub: 'No post this time', run(s) { s.senior.appointed = true; S().change(s, { morale: -8 }); return 'You clap with plastic smile. E pain you, but SS3 still sweet. Make you just pass WAEC well. 🙂'; } }];
      const order = ['head', 'library', 'labour', 'dining', 'social', 'sports', 'chapel'];
      const picks = order.filter((k) => el.includes(k)).slice(0, 3);
      return [
        ...picks.map((k) => ({ label: `${POSTS[k].emoji} Accept: ${POSTS[k].label(s)}`, sub: POSTS[k].perk, run(s) { Seniority.appoint(s, k); return `The Principal pin the badge on your uniform. "Congratulations, ${POSTS[k].label(s)}." Your coursemates dey hail you. Mummy cry for phone when she hear. 🥹`; } })),
        { label: '🙅 Decline — I want face my WAEC', sub: 'No duties, no perks', run(s) { s.senior.appointed = true; return 'The Principal raise eyebrow: "Interesting." You don choose peace and books.'; } },
      ];
    },
  };

  E.schoolChild = {
    weight: 3, emoji: '🐣', title: 'You Don Get School Child',
    when: (s) => hasJuniors(s) && !s.senior.schoolChild,
    ctx: (s) => {
      const fresh = s.npcs.juniors.filter((j) => j.level === 1 && j.gender === s.player.gender);
      return { j: U.pick(fresh.length ? fresh : s.npcs.juniors).id };
    },
    text: (s, c) => `The House Master call you: "${s.player.name}, you are now a senior. Take care of this new JSS1 student, ${jn(s, c).first} ${jn(s, c).last}." The small pikin dey look you with eyes like Puss in Boots.`,
    choices: (s, c) => [
      { label: '🤗 "No worry, I go take care of you"', sub: 'Kind senior', run(s) { const j = jn(s, c); j.schoolChild = true; s.senior.schoolChild = j.id; Seniority.adjust(s, -2); N().rel(s, j, 20); return `${j.first} hold your hand. You remember your own first day. Full circle. 🥹`; } },
      { label: '😒 "I no get time for small pikin"', sub: 'Strict senior', run(s) { const j = jn(s, c); j.schoolChild = true; s.senior.schoolChild = j.id; Seniority.adjust(s, 1); N().rel(s, j, -5); return `${j.first} look down. "Okay Senior." Na your school child still — whether you like am or not.`; } },
    ],
  };

  E.juniorErrand = {
    weight: 2.5, emoji: '🧒🏾', title: 'Junior Dey Pass',
    when: (s, b) => hasJuniors(s) && ['hostel', 'free'].includes(kind(b)),
    ctx: (s) => ({ j: N().randomJunior(s).id }),
    text: (s, c) => `${jn(s, c).first}, one ${D.LEVELS[jn(s, c).level - 1]} student, dey pass with bucket. Your locker dey dirty, your plate never wash, and you dey tired...`,
    choices: (s, c) => [
      { label: '🫵 "Junior! Come wash my plates"', sub: 'Wicked +1 · + Rest', run(s) { Seniority.adjust(s, 1); N().rel(s, jn(s, c), -6); S().change(s, { rest: 6 }); return `${jn(s, c).first} wash am sharp sharp. Shining plates. This is what you suffered for. 😎`; } },
      { label: '👋 Greet am and let am go', sub: 'Kind +1', run(s) { Seniority.adjust(s, -1); N().rel(s, jn(s, c), 4); return `${jn(s, c).first}: "Good afternoon Senior!" and waka with relief. You wash your own plates.`; } },
      { label: '🪣 Help am carry the bucket', sub: 'Kind +2 · clout', run(s) { Seniority.adjust(s, -2); N().rel(s, jn(s, c), 10); S().rep(s, 2); S().change(s, { rest: -4 }); return 'An SS student carrying bucket for a junior?! The whole hostel dey whisper. Legend behaviour. 🫶'; } },
    ],
  };

  E.juniorTax = {
    weight: 2, emoji: '🫗', title: 'Junior Chop Box Full',
    when: (s, b) => hasJuniors(s) && ['hostel', 'sleep', 'free'].includes(kind(b)),
    ctx: (s) => ({ j: N().randomJunior(s).id }),
    text: (s, c) => `${jn(s, c).first}'s chop box open: Milo, Peak, Cornflakes, even Pringles. Mummy pack am like Shoprite. Other seniors don dey circle like vulture...`,
    choices: (s, c) => [
      { label: '😈 Collect "senior tax"', sub: 'Wicked +2 · free provisions · risky', run(s) {
        Seniority.adjust(s, 2); N().rel(s, jn(s, c), -12);
        BH.Inv.add(s, U.pick(['milo', 'milk', 'cornflakes', 'gala']), 2);
        if (BH.Discipline.caught(s, 0.2)) return `You collect am... but ${jn(s, c).first} report you to the House Master. ` + BH.Discipline.offence(s, 'Extorting a junior', 2);
        return `"Borrow." You know you no go return am. The circle of life don complete. 🫗`;
      } },
      { label: '🛡️ Warn other seniors to leave am', sub: 'Kind +2 · clout', run(s) { Seniority.adjust(s, -2); N().rel(s, jn(s, c), 12); S().rep(s, 3); S().favour(s, -3); return `"Nobody touch this one provision." The vultures scatter. ${jn(s, c).first} go remember you forever. 🛡️`; } },
      { label: '🤷 Mind your business', sub: 'Neutral', run() { return 'You no see anything. The vultures descend. Na so life be.'; } },
    ],
  };

  E.juniorNoise = {
    weight: 1.8, emoji: '📢', title: 'Juniors Dey Make Noise',
    when: (s, b) => hasJuniors(s) && kind(b) === 'sleep',
    text: () => 'After lights out, the JSS1 corner dey shout and laugh like say na party. You get Physics test tomorrow.',
    choices: () => [
      { label: '🐸 "Everybody come out! Frog jump!"', sub: 'Wicked +1 · quiet night', run(s) { Seniority.adjust(s, 1); s.npcs.juniors.forEach((j) => { j.rel = U.clamp(j.rel - 2); }); S().change(s, { rest: 6 }); return 'Ten minutes of frog jump. Silence for the rest of the night. You sleep like king. 😴'; } },
      { label: '🤫 Warn them gently', sub: 'Kind +1', run(s) { Seniority.adjust(s, -1); S().change(s, { rest: 2 }); return '"Abeg una, make una sleep." Dem quiet small… then start again after 20 minutes. Kindness get price.'; } },
      { label: '🙉 Cover ear and sleep', sub: 'Neutral', run(s) { S().change(s, { rest: -4 }); return 'You put pillow on your head. E no work.'; } },
    ],
  };

  E.juniorGift = {
    weight: 1.5, emoji: '🎁', title: 'Gift From a Junior',
    when: (s, b) => hasJuniors(s) && s.senior.style <= -4 && ['hostel', 'free'].includes(kind(b)),
    ctx: (s) => ({ j: N().randomJunior(s).id }),
    text: (s, c) => `${jn(s, c).first} shyly bring you something wrapped in nylon: "Senior, my mummy say make I give you this. Thank you for protecting us."`,
    choices: (s, c) => [{ label: '🥹 Collect with joy', sub: 'Kind seniors get blessed', run(s) { BH.Inv.add(s, U.pick(['chinchin', 'plantainChips', 'gala']), 3); S().change(s, { morale: 10 }); S().rep(s, 2); return 'Homemade chin chin! You don become the senior you wished you had. ❤️'; } }],
  };

  E.juniorReport = {
    weight: 1.5, emoji: '📝', title: 'Parent Complaint',
    when: (s, b) => hasJuniors(s) && s.senior.style >= 6 && ['hostel', 'free', 'class'].includes(kind(b)) && s.time.dayCount - (s.flags.lastJuniorReport || -99) >= 14,
    ctx: (s) => ({ j: N().randomJunior(s).id }),
    text: (s, c) => `${jn(s, c).first}'s parents come school on visiting day and report you to the Principal: "This senior dey maltreat my child!"`,
    choices: () => [
      { label: '🙇 Apologise', sub: 'Accept the punishment', run(s) { s.flags.lastJuniorReport = s.time.dayCount; s.senior.style = Math.max(0, s.senior.style - 4); return BH.Discipline.offence(s, 'Maltreating a junior', 2) + ' You promise to change your ways.'; } },
      { label: '😤 Deny everything', sub: 'Risky', run(s) {
        s.flags.lastJuniorReport = s.time.dayCount;
        if (U.chance(0.4 + BH.Stats.mod(s, 'dodge'))) return 'The Principal no fit prove anything. You escape — this time. 😬';
        return 'Three juniors testify against you. ' + BH.Discipline.offence(s, 'Maltreating a junior (and lying)', 3);
      } },
    ],
  };

  BH.registerSystem('Seniority', Seniority);
})(window.BH);
