/* NPCs: coursemates (stay with you all 6 years), seniors, teachers. Relationships & interactions. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;

  const TRIBE_STATES = {
    Yoruba: ['Lagos', 'Oyo', 'Ogun', 'Osun', 'Ondo', 'Ekiti', 'Kwara'], Igbo: ['Anambra', 'Imo', 'Enugu', 'Abia', 'Ebonyi'],
    Hausa: ['Kano', 'Kaduna', 'Katsina', 'Sokoto', 'Bauchi', 'Jigawa'], Edo: ['Edo'], 'Efik/Ibibio': ['Cross River', 'Akwa Ibom'],
    Ijaw: ['Bayelsa', 'Rivers'], Tiv: ['Benue'], Urhobo: ['Delta'], Idoma: ['Benue'],
  };
  const TRIBE_WEIGHT = { Yoruba: 6, Igbo: 6, Hausa: 5, Edo: 2, 'Efik/Ibibio': 2, Ijaw: 2, Tiv: 1.5, Urhobo: 2, Idoma: 1.5 };

  function makePerson(gender, used) {
    for (let tries = 0; tries < 50; tries++) {
      const tribe = U.weighted(Object.keys(D.TRIBES), (t) => TRIBE_WEIGHT[t] || 1);
      const T = D.TRIBES[tribe];
      const first = U.pick(T[gender]);
      const last = U.pick(T.last);
      if (used.has(first)) continue;
      used.add(first);
      return { first, last, tribe, gender, origin: U.pick(TRIBE_STATES[tribe]) };
    }
    return { first: 'Kola' + used.size, last: 'Bello', tribe: 'Yoruba', gender, origin: 'Lagos' };
  }

  const NPC = {
    /* Students are real players. Bot students (coursemates, seniors, juniors) only exist when the dev/test setting
       fill_with_bot_students is on — BH.School.syncBots calls makeBots then. Staff come from content/staff.json. */
    onNewGame(s) {
      s.npcs = { classmates: [], seniors: [], teachers: [], juniors: [], staff: [] };
    },

    makeBots(s) {
      const used = NPC.usedNames(s);
      const pg = s.player.gender;
      const other = pg === 'm' ? 'f' : 'm';

      // ---- 30 coursemates (your set, spread across the arms of your level) ----
      const archList = [];
      Object.entries(D.ARCHETYPES).forEach(([k, a]) => { for (let i = 0; i < a.count; i++) archList.push(k); });
      const classmates = archList.map((arch, i) => {
        let gender = U.chance(0.5) ? 'm' : 'f';
        if (arch === 'fine') gender = i % 2 ? 'm' : 'f';
        const p = makePerson(gender, used);
        const persona = U.pick(D.PERSONAS).key;
        return Object.assign(p, {
          id: 'c' + i, type: 'classmate', bot: true, arch, persona,
          rel: U.randInt(30, 52),
          ability: NPC.baseAbility(arch, persona),
        });
      });
      // a seatmate and a bunkmate — your first padis
      const regulars = U.shuffle(classmates.filter((c) => c.arch === 'regular'));
      const seat = regulars[0]; seat.role = 'seatmate'; seat.rel = 55;
      const bunk = regulars.find((c) => c.gender === pg && c !== seat) || regulars[1];
      bunk.role = 'bunkmate'; bunk.rel = 55;

      // ---- seniors: hostel ones share your gender ----
      const lvl = s.time.year;
      const seniorDefs = [
        ['bully', pg, 'SS2'], ['schoolParent', pg, 'SS3'], ['labourPrefect', pg, 'SS3'], ['greedy', pg, 'SS1'],
        ['chill', pg, 'SS2'], ['houseCaptain', pg, 'SS3'], ['diningPrefect', U.pick([pg, other]), 'SS3'], ['headPrefect', U.pick([pg, other]), 'SS3'],
      ].filter(([, , L]) => Number(L.replace('SS', '')) + 3 > lvl);
      const seniors = seniorDefs.map(([role, g, level], i) => Object.assign(makePerson(g, used), {
        id: 's' + i, type: 'senior', bot: true, role, level,
        persona: U.pick(D.PERSONAS).key,
        rel: role === 'schoolParent' ? 62 : role === 'bully' ? 18 : role === 'chill' ? 50 : U.randInt(28, 45),
      }));
      // ---- juniors (only once you're past JSS1) ----
      const juniors = [];
      for (let L = 1; L < lvl; L++) for (let k = 0; k < 3; k++) {
        const g = U.chance(0.75) ? pg : other;
        juniors.push(Object.assign(makePerson(g, used), { id: 'j' + U.uid(), type: 'junior', bot: true, level: L, persona: U.pick(D.PERSONAS).key, rel: U.randInt(35, 55) }));
      }
      Object.assign(s.npcs, { classmates, seniors, juniors });
    },

    baseAbility(arch, persona) {
      const a = { brilliant: 88, captain: 70, churchy: 62, snitch: 60, gossip: 50, fine: 55, hustler: 48, comedian: 45, bully: 38, thief: 42, sporty: 46 }[arch];
      return U.clamp((a || U.randInt(40, 68)) + (persona === 'bookish' ? 12 : 0) + U.randInt(-5, 5));
    },

    usedNames(s) { return new Set([s.player.name.split(' ')[0], ...NPC.all(s).map((n) => n.first)]); },

    /* Teachers are the fixed staff from content/staff.json (BH.School.ensureStaff); kept for old callers. */
    ensureTeachers(s) { if (BH.School && s.school) BH.School.ensureStaff(s); },

    /* A new school year: seniors move up or graduate, new juniors arrive, coursemates grow */
    onNewYear(s) {
      if (!(s.npcs.classmates.length + s.npcs.seniors.length)) return; // no bot students this school
      const pYear = s.time.year;
      const lvl = (L) => Number(L.replace('SS', '')) + 3; // 'SS2' -> 5
      const used = NPC.usedNames(s);
      const pg = s.player.gender;
      // seniors move up; SS3s graduate
      const graduated = [];
      s.npcs.seniors = s.npcs.seniors.filter((x) => {
        const next = lvl(x.level) + 1;
        if (next > 6) { graduated.push(x); return false; }
        x.level = 'SS' + (next - 3);
        return true;
      });
      graduated.forEach((x) => BH.log(s, `🎓 ${NPC.name(x)} (${D.SENIOR_ROLES[x.role].label}) don graduate.`, 'info'));
      // refill roles with students above you
      const above = [];
      for (let L = Math.max(4, pYear + 1); L <= 6; L++) above.push(L);
      const prefectRoles = ['schoolParent', 'labourPrefect', 'diningPrefect', 'headPrefect', 'houseCaptain'];
      Object.keys(D.SENIOR_ROLES).forEach((role) => {
        if (s.npcs.seniors.some((x) => x.role === role)) return;
        if (role === 'schoolParent' && pYear >= 4) return;
        if (!above.length) return;
        const L = prefectRoles.includes(role) ? Math.max(...above) : U.pick(above);
        const hostel = !['diningPrefect', 'headPrefect'].includes(role);
        const g = hostel ? pg : U.pick(['m', 'f']);
        const p = makePerson(g, used);
        const n = Object.assign(p, { id: 's' + U.uid(), type: 'senior', bot: true, role, level: 'SS' + (L - 3), persona: U.pick(D.PERSONAS).key, rel: role === 'bully' ? 22 : U.randInt(30, 48) });
        s.npcs.seniors.push(n);
        if (role === 'schoolParent') BH.log(s, `🤝 Your new school ${BH.gendered(s, 'father', 'mother')} na ${NPC.name(n)}.`, 'good');
      });
      // In SS3, the school prefects come from YOUR class
      if (pYear === 6) {
        const pool = U.shuffle(s.npcs.classmates.filter((c) => !c.prefect));
        ['headPrefect', 'labourPrefect', 'diningPrefect', 'houseCaptain'].forEach((role, i) => { if (pool[i]) pool[i].prefect = role; });
      }
      // juniors: everyone below you moves up a class, a fresh JSS1 set arrives
      s.npcs.juniors = (s.npcs.juniors || []).filter((j) => { j.level++; return j.level < pYear && j.level <= 6; });
      if (pYear >= 2) {
        while (s.npcs.juniors.filter((j) => j.level === 1).length < 4) {
          const g = U.chance(0.75) ? pg : (pg === 'm' ? 'f' : 'm');
          s.npcs.juniors.push(Object.assign(makePerson(g, used), { id: 'j' + U.uid(), type: 'junior', bot: true, level: 1, persona: U.pick(D.PERSONAS).key, rel: U.randInt(35, 55) }));
        }
      }
      // coursemates grow up
      s.npcs.classmates.forEach((c) => { c.ability = U.clamp((c.ability || 50) + U.randInt(-3, 5)); });
    },

    all(s) { return [...s.npcs.classmates, ...s.npcs.seniors, ...s.npcs.teachers, ...(s.npcs.juniors || []), ...(s.npcs.staff || [])]; },
    students(s) { return [...s.npcs.classmates, ...s.npcs.seniors, ...(s.npcs.juniors || [])]; },
    get(s, id) { return NPC.all(s).find((n) => n.id === id); },
    byArch(s, arch) { return s.npcs.classmates.find((c) => c.arch === arch); },
    byRole(s, role) { return s.npcs.classmates.find((c) => c.role === role) || s.npcs.seniors.find((x) => x.role === role); },
    senior(s, role) { return s.npcs.seniors.find((x) => x.role === role) || s.npcs.classmates.find((c) => c.prefect === role); },
    /* the teacher who teaches YOU this subject (from your class timetable) */
    teacher(s, code) { return BH.School && s.school ? BH.School.teacherFor(s, 'player', code) : s.npcs.teachers.find((t) => t.subjects && t.subjects.includes(code)); },
    randomClassmate(s, exceptId) { const pool = s.npcs.classmates.filter((c) => c.id !== exceptId); return pool.length ? U.pick(pool) : null; },
    crush(s) {
      const fines = s.npcs.classmates.filter((c) => c.arch === 'fine');
      return fines.find((c) => c.gender !== s.player.gender) || fines[0];
    },
    // pick a hostel senior who might send you on errands
    errandSenior(s) {
      const pool = s.npcs.seniors.filter((x) => ['bully', 'greedy', 'chill', 'houseCaptain', 'labourPrefect'].includes(x.role));
      return pool.length ? U.pick(pool) : null;
    },
    randomJunior(s) { const j = (s.npcs.juniors || []); return j.length ? U.pick(j) : null; },

    name(n) {
      if (!n) return 'Somebody';
      if (n.type === 'senior') return 'Senior ' + n.first;
      if (n.type === 'teacher' || n.type === 'staff') return n.call || `${n.title} ${n.last}`;
      return n.first;
    },
    fullName(n) { return n.type === 'teacher' || n.type === 'staff' ? `${n.title} ${n.first ? n.first + ' ' : ''}${n.last}` : `${n.first} ${n.last}`; },
    label(n) {
      if (n.type === 'staff') return n.label;
      if (n.type === 'classmate') {
        if (n.prefect) return `${D.SENIOR_ROLES[n.prefect].label} (coursemate)`;
        if (n.role) return n.role === 'seatmate' ? 'Your seatmate' : 'Your bunkmate';
        if (n.arch === 'fine') return n.gender === 'f' ? 'Fine Girl' : 'Fine Boy';
        return D.ARCHETYPES[n.arch].label;
      }
      if (n.type === 'senior') return `${D.SENIOR_ROLES[n.role].label} · ${n.level}`;
      if (n.type === 'junior') return `Junior · ${D.LEVELS[n.level - 1]}${n.schoolChild ? ' · your school child' : ''}`;
      const subs = (n.subjects || [n.subject]).map((c) => (c === 'RS' ? (n.group === 'muslim' ? 'IRS' : 'CRS') : c === 'NLG' ? ({ yoruba: 'Yoruba', igbo: 'Igbo', hausa: 'Hausa' }[n.group] || 'Language') : D.SUBJECTS[c].short)).join(' & ');
      return `${subs} teacher${n.formClass ? ` · Form teacher ${n.formClass}` : ''}${n.house ? ` · ${n.house} House master` : ''}`;
    },
    emoji(n) {
      if (n.type === 'staff') return n.emoji;
      if (n.type === 'senior') return D.SENIOR_ROLES[n.role].emoji;
      if (n.type === 'teacher') return n.gender === 'f' ? '👩🏾‍🏫' : '👨🏾‍🏫';
      if (n.type === 'junior') return n.schoolChild ? '🐣' : '🧒🏾';
      if (n.prefect) return D.SENIOR_ROLES[n.prefect].emoji;
      if (n.role === 'seatmate') return '🪑';
      if (n.role === 'bunkmate') return '🛏️';
      return D.ARCHETYPES[n.arch].emoji;
    },
    relLabel(n) {
      const r = n.rel;
      if (n.type === 'senior') return r < 20 ? 'Wants your head' : r < 40 ? 'Watching you' : r < 60 ? 'Neutral' : r < 80 ? 'Likes you' : 'Guardian angel';
      if (n.type === 'teacher' || n.type === 'staff') return r < 30 ? 'Has marked you' : r < 55 ? 'Knows your face' : r < 75 ? 'Likes you' : 'Favourite student';
      if (n.type === 'junior') return r < 25 ? 'Fears you' : r < 45 ? 'Respects you' : r < 70 ? 'Likes you' : 'Looks up to you';
      return r < 20 ? 'Enemy' : r < 40 ? 'Coursemate' : r < 60 ? 'Padi' : r < 80 ? 'Close padi' : 'Ride or die';
    },

    /* What an NPC remembers about you (shown to the AI as facts; the server keeps its own conversation memory) */
    /* the subject this teacher teaches YOU (a teacher may teach several), else their main one */
    subjectFor(s, n) {
      if (!n || n.type !== 'teacher') return null;
      const mine = BH.School && s.school ? BH.School.weekFor(s).flat().find((L) => L && L.t === n.id) : null;
      return mine ? mine.code : (n.subjects || []).find((c) => s.academics && s.academics.subjects[c]) || n.subject;
    },
    remember(s, n, text) {
      if (!n) return;
      n.mem = (n.mem || []).filter((m) => m.text !== text);
      n.mem.push({ d: s.time.dayCount, text });
      if (n.mem.length > 8) n.mem.shift();
    },
    memories(s, n) { return (n && n.mem ? n.mem : []).map((m) => `${s.time.dayCount - m.d === 0 ? 'today' : s.time.dayCount - m.d === 1 ? 'yesterday' : `${s.time.dayCount - m.d} days ago`}: ${m.text}`); },

    rel(s, n, delta) {
      if (!n) return;
      if (delta > 0) delta *= BH.Stats.mod(s, 'rel');
      const before = n.rel;
      n.rel = U.clamp(n.rel + delta);
      BH.fx.push('🤝', n.rel - before, NPC.name(n));
    },

    /* ---------- interactions (one per NPC per day) ---------- */
    canTalk(s, n) { return !s.today.talked[n.id]; },
    blockAllowsSocial(s) { return true; },
    /* House colour tag an NPC belongs to (stable per NPC) */
    house(n) { return D.HOUSES[U.hash(n.id + (n.first || n.last)) % D.HOUSES.length]; },

    gist(s, n) {
      s.today.talked[n.id] = true;
      const persona = D.PERSONAS.find((p) => p.key === n.persona) || D.PERSONAS[0];
      const sen = NPC.errandSenior(s);
      let text = U.fill(U.pick(persona.gist), { n: n.first, s: sen ? sen.first : 'Tunde' });
      NPC.rel(s, n, U.randInt(4, 7));
      BH.Stats.change(s, { morale: 4 });
      if (n.arch === 'gossip') text += ` Then ${n.first} whisper: "${NPC.gossipLine(s)}"`;
      if (n.arch === 'bully' && n.rel < 35) { text = `${n.first}: "Who you be wey dey greet me anyhow? Comot!" Hmm.`; NPC.rel(s, n, -3); }
      BH.bus.emit('npc:interact', { id: n.id, kind: 'gist' });
      return text;
    },
    gossipLine(s) {
      const a = NPC.randomClassmate(s), b = a && NPC.randomClassmate(s, a.id);
      if (!a || !b) return U.pick(['The Maths teacher and the Agric teacher dey fight over one parking space.', 'They say the bursar dey count school fees for night with torchlight.', 'Mama Joy the cleaner know everybody secret. Everybody.']);
      return U.pick([
        `${a.first} and ${b.first} dey write each other letters. Na so e dey start.`,
        `${a.first} cry for house master office because Senior collect their Milo.`,
        `They say ${a.first} papa na Senator. I no believe.`,
        `${a.first} see ghost for toilet last night. Na wetin dem dey talk o.`,
        `The Maths teacher and the Agric teacher dey fight over one parking space.`,
      ]);
    },
    share(s, n, itemId) {
      s.today.talked[n.id] = true;
      BH.Inv.take(s, itemId, 1);
      const it = D.ITEMS[itemId];
      const gain = it.price >= 300 ? 14 : 9;
      NPC.rel(s, n, gain);
      BH.Stats.change(s, { morale: 3 });
      BH.bus.emit('npc:share', { id: n.id, item: itemId });
      if (n.type === 'senior') {
        BH.Stats.favour(s, 4);
        return `${NPC.name(n)} collect the ${it.name}: "You get sense. If anybody disturb you, call my name."`;
      }
      return U.pick([`${n.first} collect the ${it.name} with two hands: "Ah! You be correct person!"`, `${n.first}: "God go bless you! I never chop since morning."`, `${n.first} don add you for their "people wey I go remember when I make it" list.`]);
    },
    askHelp(s, n) {
      s.today.talked[n.id] = true;
      const subs = BH.Academics.quizzable(s);
      const code = U.pick(subs);
      if (n.arch === 'brilliant' || n.rel >= 60 || n.persona === 'bookish') {
        BH.Academics.study(s, code, 6, true);
        NPC.rel(s, n, 2);
        return `${n.first} explain ${D.SUBJECTS[code].short} to you slowly. E make sense now! 💡`;
      }
      NPC.rel(s, n, -1);
      return `${n.first}: "Me? Help you? I never even understand am myself." 😂`;
    },
    greetSenior(s, n) {
      s.today.talked[n.id] = true;
      const r = n.role;
      if (r === 'bully' && U.chance(0.5)) {
        BH.Stats.change(s, { rest: -5, morale: -3 });
        return `${NPC.name(n)}: "Ehen, you dey greet me? Oya go and wash my plate." You don carry yourself enter wahala.`;
      }
      NPC.rel(s, n, 4);
      BH.Stats.favour(s, 2);
      return U.pick([`"Good afternoon Senior ${n.first}!" — ${n.first} nod small. Progress.`, `${NPC.name(n)}: "Junior, you dey try. Go and read your book."`]);
    },
    sendJunior(s, n) {
      s.today.talked[n.id] = true;
      BH.Seniority.adjust(s, 1);
      NPC.rel(s, n, -6);
      BH.Stats.change(s, { rest: 6 });
      return U.pick([`"${n.first}! Go fetch me water. Sharp sharp!" ${n.first} run like bullet. You relax. 😎`, `You send ${n.first} to buy you pure water and wash your plate. Senior life sweet.`]);
    },
    encourageJunior(s, n) {
      s.today.talked[n.id] = true;
      BH.Seniority.adjust(s, -1);
      NPC.rel(s, n, 7);
      BH.Stats.change(s, { morale: 4 });
      return U.pick([`You tell ${n.first}: "No fear. JSS1 no dey last forever." ${n.first} smile for the first time this week.`, `You show ${n.first} where to hide provisions from greedy seniors. Legend.`]);
    },
    greetTeacher(s, n) {
      s.today.talked[n.id] = true;
      NPC.rel(s, n, 3);
      return U.pick([`${NPC.name(n)}: "Good. Greeting is a sign of good home training."`, `${NPC.name(n)} smile: "How is your ${D.SUBJECTS[NPC.subjectFor(s, n)].short} going?"`]);
    },
  };

  BH.registerSystem('NPC', NPC);
})(window.BH);
