/* Traits: what you can learn about a student beyond the relationship bar — their sport, how easily they're bribed,
   their schoolwork habits and how they feel about you to begin with — plus the favours that build a friendship
   (do their assignment, do their chores, play their sport with them, settle them with money).
   Everything is derived from the NPC's id (nothing new is saved) except which favours you did today (s.today.talked). */
(function (BH) {
  const U = BH.U;
  const D = BH.data;

  const SPORTS = [
    { key: 'football', label: 'Football', emoji: '⚽', w: 5 },
    { key: 'athletics', label: 'Athletics', emoji: '🏃🏾', w: 3 },
    { key: 'basketball', label: 'Basketball', emoji: '🏀', w: 2 },
    { key: 'volleyball', label: 'Volleyball', emoji: '🏐', w: 2 },
    { key: 'tableTennis', label: 'Table tennis', emoji: '🏓', w: 2 },
    { key: 'handball', label: 'Handball', emoji: '🤾🏾', w: 1 },
    { key: 'chess', label: 'Chess & Ludo', emoji: '♟️', w: 1 },
    { key: 'none', label: 'No sports', emoji: '🛋️', w: 3 },
  ];
  const SPORT_LEVELS = ['Plays for fun', 'Plays for the house', 'School team star'];
  const BRIBE = [
    { label: 'Cannot be bought', emoji: '🙅🏾' },
    { label: 'Hard to bribe', emoji: '🤨' },
    { label: 'Can be persuaded', emoji: '🤔' },
    { label: 'Collects anything', emoji: '🤑' },
  ];
  const ATTITUDE = {
    warm: { label: 'Warm to you', emoji: '😊', mult: 1.25, note: 'Easy to befriend.' },
    neutral: { label: 'Neutral', emoji: '😐', mult: 1, note: 'Treat them well and they will come around.' },
    cold: { label: 'Cold to you', emoji: '🥶', mult: 0.6, note: 'Friendship comes slowly until they warm up (50+).' },
    hostile: { label: 'Can\'t stand you', emoji: '😠', mult: 0.35, note: 'They don\'t like you. Favours barely move them until 50+.' },
  };
  // key characters: hand-picked, so the story cast keeps its shape
  const CAST_ATTITUDE = { k_dami: 'warm', k_emeka: 'warm', k_esther: 'warm', k_chuka: 'warm', k_chisom: 'warm', k_dera: 'cold', k_jide: 'hostile', k_bisola: 'cold', k_zara: 'cold', k_commander: 'hostile', k_halima: 'neutral', k_yinka: 'cold' };
  const CHORES = ['wash their plate and cup', 'fetch two buckets of water for them', 'iron their uniform for tomorrow', 'sweep and mop their corner', 'wash their socks and singlet', 'make their bed and tuck the mosquito net'];

  const student = (n) => n && ['classmate', 'senior', 'junior'].includes(n.type);
  const seed = (n, salt) => U.hash(`${n.id}|${n.first || ''}|${salt}`);
  const once = (s, k, n) => s.today.talked[`fav_${k}_${n.id}`];
  const mark = (s, k, n) => { s.today.talked[`fav_${k}_${n.id}`] = true; };

  const Traits = {
    student,
    attitudeKey(n) {
      if (!student(n)) return 'neutral';
      if (CAST_ATTITUDE[n.id]) return CAST_ATTITUDE[n.id];
      if (n.arch === 'bully' || ['bully', 'greedy'].includes(n.role)) return 'hostile';
      if (n.arch === 'snitch' || n.persona === 'proud') return seed(n, 'att') % 3 ? 'cold' : 'hostile';
      if (n.role === 'schoolParent' || n.role === 'bunkmate' || n.schoolChild || n.persona === 'kind') return 'warm';
      const r = seed(n, 'att') % 100;
      // seniors look down on juniors more often than coursemates do
      const hostile = n.type === 'senior' ? 18 : 10, cold = n.type === 'senior' ? 45 : 32;
      return r < hostile ? 'hostile' : r < cold ? 'cold' : r < 75 ? 'neutral' : 'warm';
    },
    attitude(n) { return ATTITUDE[Traits.attitudeKey(n)]; },
    /* positive relationship changes scale with how they feel about you, until they've warmed up */
    relMult(n) { return student(n) && n.rel < 50 ? Traits.attitude(n).mult : 1; },
    /* a starting relationship that matches the attitude (new bot students / crowd) */
    startRel(n, base) {
      const k = Traits.attitudeKey(n);
      return k === 'hostile' ? Math.min(base, 12 + (seed(n, 'r') % 14)) : k === 'cold' ? Math.min(base, 24 + (seed(n, 'r') % 12)) : k === 'warm' ? Math.max(base, 45 + (seed(n, 'r') % 10)) : base;
    },

    sport(n) {
      const star = n.arch === 'sporty';
      let sp;
      if (star) sp = SPORTS[seed(n, 'sp') % 3];
      else {
        let roll = seed(n, 'sp') % SPORTS.reduce((a, x) => a + x.w, 0);
        sp = SPORTS.find((x) => (roll -= x.w) < 0);
      }
      const level = sp.key === 'none' ? null : star ? 2 : (n.arch === 'brilliant' || n.persona === 'bookish') ? 0 : seed(n, 'lv') % 3 === 2 ? 1 : 0;
      return Object.assign({}, sp, { level, levelLabel: level === null ? '' : SPORT_LEVELS[level] });
    },

    bribe(n) {
      let b;
      if (['hustler', 'thief'].includes(n.arch) || n.role === 'greedy') b = 3;
      else if (['churchy', 'captain'].includes(n.arch) || n.persona === 'churchy') b = 0;
      else if (['snitch', 'brilliant'].includes(n.arch) || n.role === 'headPrefect') b = 1;
      else b = [1, 2, 2, 3][seed(n, 'br') % 4];
      return Object.assign({ n: b }, BRIBE[b]);
    },

    /* best & worst subject among YOUR subjects, and how they handle assignments */
    school(s, n) {
      const codes = BH.Academics.codes(s);
      const best = codes[seed(n, 'best') % codes.length];
      let worst = codes[seed(n, 'worst') % codes.length];
      if (worst === best) worst = codes[(codes.indexOf(best) + 1) % codes.length];
      const a = n.ability || (n.type === 'senior' ? 55 : 50) + (seed(n, 'ab') % 25) - 12;
      const habit = a >= 75 ? 'Does assignments early (everybody copies theirs)' : a >= 58 ? 'Does assignments, sometimes late' : a >= 42 ? 'Copies assignments in the morning before class' : 'Never does assignments, always looking for who will do theirs';
      return { best, worst, habit, ability: a };
    },
    /* the assignment they need done today, if any (more often for the ones who never do theirs) */
    assignmentToday(s, n) {
      if (!student(n) || !s.academics) return null;
      const sc = Traits.school(s, n);
      const every = sc.ability < 42 ? 2 : sc.ability < 58 ? 3 : 5;
      return seed(n, 'asg' + s.time.dayCount) % every === 0 ? sc.worst : null;
    },
    choreToday(s, n) {
      if (!['classmate', 'senior'].includes(n.type)) return null;
      if (n.type === 'senior' || seed(n, 'ch' + s.time.dayCount) % 3 === 0) return CHORES[seed(n, 'cw' + s.time.dayCount) % CHORES.length];
      return null;
    },

    /* ---------- favours (conversation options) ---------- */
    talkOptions(s, n) {
      if (!student(n)) return [];
      const out = [];
      const inClass = ['class', 'prep', 'register'].includes(BH.Time.block(s).kind);
      const busy = inClass ? 'Not during class' : null;
      const who = BH.NPC.name(n), first = n.first;
      const att = Traits.attitudeKey(n);
      const me = s.time.year;
      const lvl = n.type === 'senior' ? Number(String(n.level).replace('SS', '')) + 3 : n.type === 'junior' ? n.level : me;

      // 📝 their assignment
      const code = Traits.assignmentToday(s, n);
      if (code && s.academics.subjects[code]) {
        const helping = lvl < me;
        out.push({
          label: `📝 ${helping ? 'Help with' : 'Do'} their ${BH.Academics.name(s, code, true)} assignment`, sub: '40 min · tiring · they will owe you',
          disabled: busy || (once(s, 'asg', n) ? 'Done today' : null),
          run() {
            mark(s, 'asg', n);
            BH.Activities.busy(s, 40, `📝 Doing ${first}'s assignment…`);
            BH.Stats.change(s, { rest: -6 });
            BH.Academics.study(s, code, lvl > me ? 2 : 3);
            const k = s.academics.subjects[code].knowledge;
            if (U.chance(0.12) && !helping) {
              const t = BH.NPC.teacher(s, code);
              if (t) BH.NPC.rel(s, t, -4);
              BH.NPC.rel(s, n, 3);
              return `${t ? BH.NPC.name(t) : 'The teacher'} look at two exercise books with the same handwriting. "Who wrote this?!" You both kneel down for the whole period. 😬 ${first} still thank you after.`;
            }
            BH.NPC.rel(s, n, k >= 55 ? 11 : 7);
            if (n.type === 'senior') BH.Stats.favour(s, 3);
            if (att === 'hostile') return `${who} collect the book without looking at you: "Hmph. Na wetin you suppose do." …but they didn't send you away. 📝`;
            if (lvl > me) return `${who}'s ${BH.Academics.name(s, code, true)} is ${lvl - me} years ahead of you. You copy from their textbook and pray. ${k >= 55 ? `"Ah, junior, you get sense!" 🙌` : '"…Is this how they write it? Okay, thank you." 😅'}`;
            if (helping) return `You sit with ${first} and work through it together. "Senior, thank you! I understand now." 🥹`;
            return k >= 55 ? `You do ${first}'s ${BH.Academics.name(s, code, true)} assignment, neat and correct. "You be correct person! I owe you one." 📝` : `You do ${first}'s assignment… some answers na guess work. "Ehn, at least I go submit something. Thank you!" 📝`;
          },
        });
      }

      // 🧹 their chores (you can't do a junior's chores when you're the senior — they'd die of shock)
      const chore = lvl >= me ? Traits.choreToday(s, n) : null;
      if (chore) out.push({
        label: '🧹 Do a chore for them', sub: `30 min · −Rest · ${chore}`,
        disabled: busy || (once(s, 'chore', n) ? 'Done today' : null),
        run() {
          mark(s, 'chore', n);
          BH.Activities.busy(s, 30, `🧹 Doing ${first}'s chore…`);
          BH.Stats.change(s, { rest: -8 });
          BH.NPC.rel(s, n, 8);
          if (n.type === 'senior') BH.Stats.favour(s, 3);
          if (att === 'hostile') return `You ${chore}. ${who} inspect am like soldier: "You missed a spot." But their face soften small. 🧹`;
          return U.pick([`You ${chore}. ${who}: "Ah! Thank you o. I no go forget this one." 🧹`, `You ${chore}. ${first} looks at you like you're their new favourite person. ✨`]);
        },
      });

      // ⚽ their sport
      const sp = Traits.sport(n);
      if (sp.key !== 'none') out.push({
        label: `${sp.emoji} Play ${sp.label.toLowerCase()} with them`, sub: '45 min · −Rest · +Morale',
        disabled: busy || (once(s, 'sport', n) ? 'Done today' : null),
        run() {
          mark(s, 'sport', n);
          BH.Activities.busy(s, 45, `${sp.emoji} Playing ${sp.label.toLowerCase()} with ${first}…`);
          BH.Stats.change(s, { rest: -10, morale: 6 });
          if (att === 'hostile' && U.chance(0.4)) { BH.NPC.rel(s, n, -2); return `${who}: "Me? Play with you? Go and find your mates." They turn their back. 🙄`; }
          BH.NPC.rel(s, n, sp.level === 2 ? 9 : 7);
          return sp.level === 2 ? `${first} is a beast at ${sp.label.toLowerCase()} and runs you around for 45 minutes. "You no bad sha. Come again tomorrow." ${sp.emoji}` : `You and ${first} play ${sp.label.toLowerCase()} until you're both soaked in sweat. Na so friendship dey start. ${sp.emoji}`;
        },
      });

      // 💸 settle them
      const price = n.type === 'senior' ? 300 : 200;
      const br = Traits.bribe(n);
      out.push({
        label: `💸 Settle them (${U.money(price)})`, sub: 'Money talks… sometimes',
        disabled: s.money < price ? `You need ${U.money(price)}` : once(s, 'bribe', n) ? 'Done today' : null,
        run() {
          mark(s, 'bribe', n);
          if (br.n === 0) {
            BH.NPC.rel(s, n, -8); BH.Stats.change(s, { morale: -3 });
            return `${who} push your hand back: "You want to buy me? I am not for sale!" Now they think less of you. 🙅🏾`;
          }
          if (br.n === 1 && U.chance(0.55)) {
            BH.NPC.rel(s, n, -3);
            return `${who} look at the money, look at you: "Keep your money." Awkward. 🤨`;
          }
          BH.Stats.money(s, -price);
          BH.NPC.rel(s, n, [0, 5, 8, 13][br.n]);
          if (n.type === 'senior') BH.Stats.favour(s, br.n);
          return br.n === 3 ? `${who} collect am sharp sharp: "Ehen! Now we're talking. Anything you need, just call me." 🤑` : `${who} hesitate, then pocket it: "I'm not doing this because of money o." (They're doing it because of money.) 🤔`;
        },
      });
      return out;
    },

    /* a cold opener for the ones who don't like you (in place of the friendly greeting) */
    greet(s, n) {
      const k = Traits.attitudeKey(n);
      if (n.rel >= 50 || !['cold', 'hostile'].includes(k)) return null;
      const lines = k === 'hostile'
        ? ['"What do you want? Talk fast."', '"Na you again? Abeg free me."', '"I don\'t have time for you today."', '"Mtchew. Wetin?"']
        : ['"Hm. Hi."', '"Yes? …What is it?"', '"Oh. It\'s you."', '"I\'m busy, but okay. Talk."'];
      return U.seedPick(lines, n.id + s.time.dayCount);
    },

    /* the "More about them" block on the profile card */
    profileHtml(s, n) {
      if (!student(n)) return '';
      const sp = Traits.sport(n), br = Traits.bribe(n), sc = Traits.school(s, n), at = Traits.attitude(n);
      const asg = Traits.assignmentToday(s, n), chore = Traits.choreToday(s, n);
      const sub = (c) => `${D.SUBJECTS[c] ? D.SUBJECTS[c].emoji + ' ' : ''}${BH.Academics.name(s, c, true)}`;
      const rows = [
        ['Attitude', `${at.emoji} ${at.label}`, at.note],
        ['Sport', `${sp.emoji} ${sp.label}`, sp.levelLabel],
        ['Bribes', `${br.emoji} ${br.label}`, ''],
        ['Best subject', sub(sc.best), ''],
        ['Weakest', sub(sc.worst), ''],
        ['Schoolwork', '📒', sc.habit],
      ];
      const today = [asg ? `📝 Needs their ${BH.Academics.name(s, asg, true)} assignment done` : '', chore ? `🧹 Has chores: ${chore}` : ''].filter(Boolean);
      return `<div class="traits">${rows.map(([k, v, small]) => `<div class="tr-row"><span class="tr-k">${k}</span><span class="tr-v">${U.esc(v)}${small ? `<small>${U.esc(small)}</small>` : ''}</span></div>`).join('')}</div>
        ${today.length ? `<p class="tiny"><b>Today:</b> ${today.map(U.esc).join(' · ')}</p>` : ''}
        <p class="muted tiny">💡 Talk to them to do their assignment, help with chores, play ${sp.key === 'none' ? 'games' : sp.label.toLowerCase()} or settle them. Each one works once a day.</p>`;
    },
  };

  BH.registerSystem('Traits', Traits);
})(window.BH);
