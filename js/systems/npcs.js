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

    /* Story mode: the school is full. Your set = the key characters (content/cast.json) + background classmates so
       every arm of your level has ~28–30 students; key characters sit in YOUR arm. Role seniors fill the jobs the
       systems need (prefects, house captain…). Everyone else in the school is the seeded crowd (js/systems/crowd.js). */
    makeBots(s) {
      const used = NPC.usedNames(s);
      s.npcs.classmates = []; s.npcs.seniors = []; s.npcs.juniors = [];
      NPC.addCast(s, used);
      NPC.fillSet(s, used);
      NPC.fillRoleSeniors(s, used);
    },
    castGender(s, c) {
      const pg = s.player.gender, other = pg === 'm' ? 'f' : 'm';
      if (c.gender === 'player') return pg;
      if (c.gender === 'opposite') return other;
      if (c.gender === 'seed') return U.hash(c.id + (s.school ? s.school.seed : s.createdAt)) % 2 ? 'm' : 'f';
      return c.gender;
    },
    /* key characters who have arrived by now (Musa in JSS2, Yinka in SS1, your school child in SS1…) */
    addCast(s, used = NPC.usedNames(s)) {
      const cast = (BH.Content.get('cast') || { cast: [] }).cast;
      const year = s.time.year;
      const added = [];
      cast.forEach((c) => {
        if (c.joinYear > year || NPC.get(s, c.id) || (s.npcs.gone || []).includes(c.id)) return;
        const g = NPC.castGender(s, c);
        const [first, last] = c.names[g] || Object.values(c.names)[0];
        used.add(first);
        const base = { id: c.id, key: true, first, last, gender: g, tribe: c.tribe, origin: c.origin, nick: c.nick, persona: c.persona, arch: c.arch, rel: c.rel, look: c.look || null, religion: c.religion || null, joined: s.time.dayCount };
        if (c.type === 'classmate') {
          s.npcs.classmates.push(Object.assign(base, { type: 'classmate', ability: c.ability || NPC.baseAbility(c.arch, c.persona), role: c.role || null }));
        } else if (c.type === 'senior') {
          const lvl = Number(String(c.level).replace('SS', '')) + 3 + (year - c.joinYear);
          if (lvl > 6) return; // already graduated
          s.npcs.seniors.push(Object.assign(base, { type: 'senior', role: c.role, level: 'SS' + (lvl - 3) }));
        } else if (c.type === 'junior') {
          s.npcs.juniors = s.npcs.juniors || [];
          s.npcs.juniors.push(Object.assign(base, { type: 'junior', level: c.level || 1, schoolChild: !!c.schoolChild }));
          if (c.schoolChild && s.senior) s.senior.schoolChild = c.id;
        }
        added.push(c.id);
      });
      return added;
    },
    /* background classmates: fill every arm of your level */
    fillSet(s, used = NPC.usedNames(s)) {
      const me = BH.School && s.school && BH.School.student(s, 'player');
      const myArm = me ? me.arm : 'A';
      const L = (BH.Content.get('school').levels || []).find((x) => x.n === s.time.year) || { arms: ['A', 'B', 'C'] };
      const extra = ['gossip', 'gossip', 'thief', 'fine', 'sporty', 'churchy', 'hustler'];
      let i = s.npcs.classmates.filter((c) => !c.key).length;
      L.arms.forEach((arm) => {
        const want = arm === myArm ? 30 : 27;
        let have = s.npcs.classmates.filter((c) => (c.key ? myArm : c.arm) === arm).length;
        while (have < want) {
          const gender = U.chance(0.5) ? 'm' : 'f';
          const p = makePerson(gender, used);
          const arch = i < extra.length ? extra[i] : 'regular';
          const persona = U.pick(D.PERSONAS).key;
          s.npcs.classmates.push(Object.assign(p, { id: 'c' + i, type: 'classmate', arch, persona, arm, rel: U.randInt(30, 50), ability: NPC.baseAbility(arch, persona) }));
          i++; have++;
        }
      });
      s.npcs.classmates.forEach((c) => { if (c.key) c.arm = myArm; });
    },
    /* the seniors the school systems rely on (prefects, house captain…) when no key senior holds the job */
    fillRoleSeniors(s, used = NPC.usedNames(s)) {
      const pg = s.player.gender, other = pg === 'm' ? 'f' : 'm';
      const defs = [['labourPrefect', pg, 6], ['diningPrefect', U.pick([pg, other]), 6], ['houseCaptain', pg, 6], ['greedy', pg, 4], ['chill', pg, 5]];
      defs.forEach(([role, g, lvl]) => {
        if (lvl <= s.time.year || s.npcs.seniors.some((x) => x.role === role)) return;
        s.npcs.seniors.push(Object.assign(makePerson(g, used), { id: 's' + U.uid(), type: 'senior', role, level: 'SS' + (lvl - 3), persona: U.pick(D.PERSONAS).key, rel: U.randInt(28, 45) }));
      });
    },
    /* a key character leaves school (transfer, expelled, withdrawn) — remembered for the ending */
    leave(s, id, why) {
      const n = NPC.get(s, id);
      if (!n) return;
      ['classmates', 'seniors', 'juniors'].forEach((k) => { s.npcs[k] = (s.npcs[k] || []).filter((x) => x.id !== id); });
      s.npcs.gone = [...new Set([...(s.npcs.gone || []), id])];
      s.npcs.left = s.npcs.left || {};
      s.npcs.left[id] = { name: NPC.fullName(n), why, year: s.time.year, term: s.time.term, rel: n.rel, nick: n.nick };
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
        if (next > 6) {
          graduated.push(x);
          if (x.key) { s.npcs.left = s.npcs.left || {}; s.npcs.left[x.id] = { name: NPC.fullName(x), why: 'graduated', graduated: true, year: s.time.year - 1, term: 3, rel: x.rel, nick: x.nick }; }
          return false;
        }
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
      // new faces this year (Musa in JSS2, Yinka in SS1, your school child…)
      NPC.addCast(s, used).forEach((id) => { const n = NPC.get(s, id); if (n) BH.log(s, `🆕 ${NPC.name(n)} ${n.type === 'junior' ? 'arrives in JSS1' : 'joins your class'}.`, 'info'); });
    },

    all(s) { return [...s.npcs.classmates, ...s.npcs.seniors, ...s.npcs.teachers, ...(s.npcs.juniors || []), ...(s.npcs.staff || [])]; },
    students(s) { return [...s.npcs.classmates, ...s.npcs.seniors, ...(s.npcs.juniors || [])]; },
    get(s, id) { if (id && id[0] === 'x' && BH.Crowd) return BH.Crowd.get(s, id); return NPC.all(s).find((n) => n.id === id); },
    byArch(s, arch) { return s.npcs.classmates.find((c) => c.arch === arch); },
    byRole(s, role) { return s.npcs.classmates.find((c) => c.role === role) || s.npcs.seniors.find((x) => x.role === role); },
    senior(s, role) { return s.npcs.seniors.find((x) => x.role === role) || s.npcs.classmates.find((c) => c.prefect === role); },
    /* the teacher who teaches YOU this subject (from your class timetable) */
    teacher(s, code) { return BH.School && s.school ? BH.School.teacherFor(s, 'player', code) : s.npcs.teachers.find((t) => t.subjects && t.subjects.includes(code)); },
    randomClassmate(s, exceptId) { const pool = s.npcs.classmates.filter((c) => c.id !== exceptId); return pool.length ? U.pick(pool) : null; },
    crush(s) {
      const tams = NPC.get(s, 'k_tams');
      if (tams) return tams;
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
      if (n.key) { const c = NPC.castDef(n.id); if (c) return c.label + (n.type === 'senior' ? ` · ${n.level}` : ''); }
      if (n.crowd) return n.type === 'junior' ? `Junior · ${D.LEVELS[n.level - 1]}${n.arm}` : n.type === 'senior' ? `Senior · ${n.level}${n.arm}` : `Coursemate · ${n.arm}`;
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
      if (n.key) { const c = NPC.castDef(n.id); if (c) return c.emoji; }
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
    castDef(id) { return ((BH.Content.get('cast') || { cast: [] }).cast).find((c) => c.id === id) || null; },
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
      if (n.crowd) { s.npcs.crowdRel = s.npcs.crowdRel || {}; s.npcs.crowdRel[n.id] = n.rel; }
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
