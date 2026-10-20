/* Action handlers — the verbs of the world. Interactables (content/interactables.json), NPC prompts and
   dialogue options name a handler with `do`; it gets (s, ctx) where ctx = { obj, npc, map, args, action, mine }
   and returns text, { text, good|bad }, { noTime } (handler manages time / opened a menu) or { cancel }.
   Time costs (`mins` on the action) are applied by the InteractionSystem as a visible fast-forward. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const S = () => BH.Stats;
  const I = () => BH.Inv;
  const N = () => BH.NPC;
  const A = () => BH.Academics;
  const Act = () => BH.Activities;
  const good = (text, extra) => Object.assign({ text, good: true }, extra);
  const bad = (text, extra) => Object.assign({ text, bad: true }, extra);
  const first = (s) => s.player.name.split(' ')[0];
  const abs = (s) => BH.Clock.abs(s);
  const staffHere = (s, role) => BH.Interaction.staffHere(s, role);

  const H = {};
  const Actions = { get: (name) => H[name], define: (name, fn) => { H[name] = fn; }, H };

  /* ---------- generic ---------- */
  H.say = (s, c) => {
    if (c.args.flag) s.today.flags[c.args.flag] = true;
    if (c.args.unlock) BH.Missions.unlock(s, c.args.unlock);
    return U.pick(c.args.text || ['…']);
  };
  H.stat = (s, c) => {
    if (c.args.once && s.today.flags['once_' + c.args.once]) return { text: 'You don do am today already.', cancel: true };
    if (c.args.stats) S().change(s, c.args.stats);
    if (c.args.money) S().money(s, c.args.money);
    if (c.args.tag) BH.bus.emit('action', { tag: c.args.tag });
    return good(U.pick(c.args.text || ['Done.']), { mins: c.args.mins });
  };
  H.useItem = (s, c) => { const r = I().use(s, c.args.item); return r.bad ? bad(r.text) : good(r.text); };
  H.enter = (s, c) => { if (c.target.room) BH.SceneManager.enterRoom(c.target.room); else BH.SceneManager.enter(c.target.key); return { noTime: true, cancel: true }; };

  /* ---------- rest & hiding ---------- */
  H.sleep = (s, c) => Act().sleep(s, c.args.where || 'bed', c.obj);
  H.nap = (s, c) => Act().nap(s, c.args, c.obj);
  H.hide = (s, c) => Act().hide(s, c.obj);
  H.standUp = (s) => Act().stand(s);

  /* ---------- searching: mission items, secrets, small finds ---------- */
  H.search = (s, c) => {
    const obj = c.obj;
    const key = c.map + '|' + obj.id;
    s.found = s.found || {};
    const planted = BH.Missions.takePlanted(s, c.map, obj.id);
    if (planted) return good(`You search… and find ${D.ITEMS[planted].name}! ${D.ITEMS[planted].emoji}`, { mins: 3 });
    if (obj.secret && !s.found[key]) {
      s.found[key] = true;
      const sec = BH.Content.get('world').secrets[obj.secret];
      if (sec) {
        const j = N().randomJunior(s) || N().randomClassmate(s);
        const text = U.fill(sec.text, { junior: j ? j.first : 'Tunde', character: s.discipline.points >= 10 ? 'Troublesome' : s.reputation >= 50 ? 'Popular' : 'Quiet', points: s.discipline.points });
        BH.Consequences.apply(s, { money: sec.money, items: sec.items, stats: sec.stats, rumour: sec.rumour, unlock: sec.unlock, flag: sec.flag });
        BH.bus.emit('secret', { id: obj.secret, map: c.map });
        BH.Paths.add(s, 'popular', 0.5);
        return good(`✨ ${text}`, { mins: 3 });
      }
    }
    const dk = 'srch_' + key;
    if (s.today.flags[dk]) return { text: 'You don search here already today. Nothing new.', cancel: true };
    s.today.flags[dk] = true;
    if (U.chance(0.12)) { const it = U.pick(['biscuits', 'pureWater', 'groundnut', 'sugar']); I().add(s, it, 1); return good(`You find ${D.ITEMS[it].name} wey somebody forget. Finders keepers. ${D.ITEMS[it].emoji}`, { mins: 2 }); }
    if (U.chance(0.06)) { S().money(s, 50); return good('₦50 squeeze inside the corner! 💵', { mins: 2 }); }
    return { text: U.pick(['Nothing here except dust and one old biro.', 'You find… cockroach. 🪳', 'Empty. Somebody don search here before you.']), mins: 2 };
  };

  /* ---------- hostel ---------- */
  H.stash = (s) => { s.phone.hidden = true; return good('You push the phone deep inside the mattress foam. Raid-proof… hopefully. 📱'); };
  H.unstash = (s) => { s.phone.hidden = false; return good('You fish the phone out of the mattress. Careful now. 📱'); };
  H.writeLetter = (s) => {
    BH.bus.emit('action', { tag: 'contactHome' });
    S().change(s, { morale: 7 });
    if (s.family) { if (s.family.letterDue === null) s.family.letterDue = s.time.dayCount + 7; s.family.mummy = U.clamp(s.family.mummy + 2); }
    return good('"Dear Mummy, I am fine. The food is good. (It is not.) Please send Strongman and money." ✉️');
  };
  H.openBag = (s, c) => { BH.actions.openBag(c.args.tab); return { noTime: true }; };
  H.lockLocker = (s) => { s.flags.padlocked = true; return good('Click! Your locker don lock. Thieves go cry today. 🔒'); };
  H.stealFrom = (s, c) => {
    const owner = BH.Schedule.owner(s, c.map, c.obj.id);
    const key = 'stole_' + c.obj.id;
    if (s.today.flags[key]) return { text: 'You don already "inspect" this one today.', cancel: true };
    s.today.flags[key] = true;
    const loot = U.pick(['milo', 'indomie', 'biscuits', 'sugar', 'gala', 'milk', 'groundnut', 'garri']);
    const n = U.randInt(1, 2);
    I().add(s, loot, n);
    BH.Paths.add(s, 'trouble', 1);
    if (owner) BH.Gist.add(s, `Somebody thief ${owner.first}'s ${D.ITEMS[loot].name}. ${owner.first} dey cry for corridor 😢`, { about: owner.id, valence: -0.2, tags: ['stealing'] });
    return good(`You open ${owner ? owner.first + "'s" : 'the'} ${c.obj.kind === 'chopBox' ? 'chop box' : 'locker'} and carry ${n} ${D.ITEMS[loot].name}. Quick quick! 🫳`, { crimeItem: loot, crimeN: n, mins: 2 });
  };
  H.recoverPhone = (s) => { s.phone.confiscated = false; s.phone.hidden = false; return good('You dip hand inside the confiscation box and carry your phone back. Mission Impossible. 📱'); };
  H.choreAction = (s, c) => {
    if (c.args.use && !I().has(s, c.args.use)) return { text: `You need ${D.ITEMS[c.args.use].name} first.`, cancel: true };
    if (c.args.use) I().take(s, c.args.use, 1);
    if (c.args.stats) S().change(s, c.args.stats);
    return good(c.args.text || 'Done.');
  };
  H.sweep = (s) => { S().change(s, { rest: -4, hygiene: -2 }); BH.Stats.favour(s, 1); return good('You sweep the corridor from one end to the other. Dust everywhere, but e clean. 🧹'); };
  H.mirror = (s) => {
    const h = s.stats.hygiene;
    return h >= 70 ? good('You dey shine! Inspection go be easy. ✨') : h >= 45 ? 'You fit pass inspection… if the prefect no look too close.' : bad('Your collar don brown and your hair don bush. Inspection go catch you. 😬');
  };
  H.notices = (s) => {
    const map = s.world.map || 'campus';
    const cid = BH.School.classIdOfMap(map);
    const cm = BH.Content.compile(map);
    if (cid) {
      // class noticeboard: form teacher, captains, this class's timetable, homework, class notices
      const st = BH.School.student(s, 'player');
      const mine = BH.School.myClass(s);
      const pseudo = mine && mine.id === cid ? 'player' : null;
      const P = BH.Content.get('school').periodsPerDay;
      const row = (dow) => Array.from({ length: P }, (_, p) => {
        const e = BH.School.entry(s, cid, dow, p);
        const L = pseudo ? BH.School.lessonFor(s, 'player', dow, p) : e && !e.parts ? e : null;
        if (!L) return e && e.parts ? (e.line !== null && e.line !== undefined ? 'Dept' : 'Split') : '—';
        return `${A().name(s, L.code, true)}${L.t ? '' : '*'}`;
      }).join(' · ');
      const days = s.time.dow <= 4 ? [s.time.dow, (s.time.dow + 1) % 5] : [0];
      const tt = days.map((d) => `**${D.DAYS[d]}:** ${row(d)}`).join('\n');
      const att = pseudo ? BH.School.attendance(s, cid, 'player') : null;
      const notes = BH.School.notices(s, cid).map((n) => `• ${n.text}`).join('\n');
      BH.Dialogue.say({ portrait: { emoji: '📌' }, name: `${cid} noticeboard`, sub: `${st && st.dept && cid.startsWith('SS') ? D.DEPARTMENTS[st.dept].label + ' · ' : ''}${BH.Time.dateLabel(s)}`,
        text: `${notes}\n\n**Timetable**\n${tt}${att && att.days ? `\n\n**Your register:** ${att.present} present · ${att.late} late · ${att.absent} absent` : ''}` });
      return { noTime: true };
    }
    if (cm && cm.src.hallway) {
      const rooms = (cm.doors || []).map((d) => d.to);
      const b = BH.Time.block(s);
      const lines = rooms.map((cid) => {
        const c = s.school.classes[cid];
        const e = b.kind === 'class' && s.time.dow <= 4 ? BH.School.entry(s, cid, s.time.dow, b.period) : null;
        const now = e ? (e.parts ? 'department / split lesson' : `${A().name(s, e.code, true)}${e.t ? ' — ' + BH.NPC.name(BH.NPC.get(s, e.t)) : ' (no teacher)'}`) : '';
        return `**${cid}** · Form: ${c.form ? BH.NPC.name(BH.NPC.get(s, c.form)) : '—'}${now ? ` · Now: ${now}` : ''}`;
      }).join('\n');
      BH.Dialogue.say({ portrait: { emoji: '📌' }, name: `${cm.src.name} noticeboard`, sub: BH.Time.dateLabel(s), text: lines });
      return { noTime: true };
    }
    const sched = BH.Time.schedule(s).map((id, i) => `${BH.Clock.timeLabel(BH.Clock.blockStart(s, i))} ${D.BLOCKS[id].emoji} ${D.BLOCKS[id].title}${D.BLOCKS[id].kind === 'class' ? ` (${A().name(s, A().periodSubject(s, D.BLOCKS[id].period) || 'ENG', true)})` : ''}`).join('\n');
    const gist = BH.Gist.known(s).slice(0, 4).map((r) => `• ${r.text}`).join('\n');
    BH.Dialogue.say({ portrait: { emoji: '📌' }, name: 'Notice board', sub: BH.Time.dateLabel(s), text: `**Today's timetable**\n${sched}${gist ? `\n\n**Scribbled gist**\n${gist}` : ''}` });
    return { noTime: true };
  };

  /* ---------- washing & water ---------- */
  H.drinkTap = (s) => {
    if (s.world.waterOut && s.world.waterOut > abs(s)) return bad('Tap dry. No water. 🚱 Check the hostel drum or buy pure water.');
    if (s.today.flags.tapAt && abs(s) - s.today.flags.tapAt < 20) return { text: 'You just drink. No be fish you be.', cancel: true };
    s.today.flags.tapAt = abs(s);
    return good(I().drinkTap(s));
  };
  H.fetchWater = (s) => {
    if (s.world.waterOut && s.world.waterOut > abs(s)) return bad('No water for borehole today. 🚱');
    if (I().count(s, 'water') >= 2) return { text: 'Your bucket don full already.', cancel: true };
    I().add(s, 'water', 1);
    S().change(s, { rest: -3 });
    return good('You fill your bucket and carry am on your head. Water dey splash your uniform. 🪣', { mins: 10 });
  };
  H.quickWash = (s) => {
    const soap = I().has(s, 'soap'); if (soap) I().take(s, 'soap', 1);
    S().change(s, { hygiene: soap ? 16 : 7 });
    return good(soap ? 'Face, armpit, leg — with soap. Fresh small. 🧼' : 'Only water. E better pass nothing.');
  };
  H.bathe = (s, c) => {
    const m = BH.Clock.mod(s);
    const rush = m >= 5 * 60 + 45 && m <= 7 * 60;
    const scarce = s.world.waterOut && s.world.waterOut > abs(s);
    if (scarce && !c.args.bucket) return bad('Shower dry. No water. Fetch water from the drum or tap first. 🚱');
    if (c.args.bucket) I().take(s, 'water', 1);
    const soap = I().has(s, 'soap'); if (soap) I().take(s, 'soap', 1);
    const queue = c.args.bucket ? 5 : rush ? U.randInt(15, 30) - BH.Stats.school(s).water * 2 : 6;
    S().change(s, { hygiene: soap ? 42 : 18, morale: 2 });
    BH.bus.emit('action', { tag: 'bathe' });
    const t = c.args.bucket ? 'Bucket bath in peace — no queue, no wahala. 🪣' : rush ? `The queue long (${queue} min). Finally, cold water hit your back like slap from God. 🚿` : 'Bathroom free. You baff like king. 🚿';
    return good(t + (soap ? '' : ' (No soap — na only water.)'), { mins: Math.max(5, queue) });
  };
  H.laundry = (s) => {
    if (s.today.flags.laundry) return { text: 'Your clothes don dey line already.', cancel: true };
    s.today.flags.laundry = true;
    if (I().has(s, 'detergent')) { I().take(s, 'detergent', 1); S().change(s, { hygiene: 14, morale: 3, rest: -5 }); return good('Uniform and socks don wash with Washwell. Pray say nobody "mistakenly" carry am. 🧺'); }
    S().change(s, { hygiene: 5, rest: -5 }); return 'No detergent — water alone. The collar still brown. 😬';
  };

  /* ---------- school ---------- */
  H.sit = (s, c) => Act().sit(s, c.obj);
  H.lessonMode = (s, c) => { if (s.act) s.act.mode = c.args.mode; return { text: { focus: 'You sit up and face the board. 📖', doze: 'Your head drop small small… 😴', gist: 'You lean to your seatmate and start to whisper. 💬', novel: 'Novel open under the desk. Teacher no go see… abi? 📗' }[c.args.mode], noTime: true }; };
  H.pickStudy = (s) => { BH.actions.pickSubject((code) => { if (s.act) { s.act.code = code; s.act.type = 'prep'; } BH.Store.changed(); }); return { noTime: true }; };
  H.study = (s, c) => {
    const go = (code) => {
      BH.fx.begin();
      const g = Act().studyNow(s, code, c.args.amount || 5, c.args);
      const fx = BH.fx.end();
      Act().busy(s, c.args.mins || 30, `📖 Reading ${A().name(s, code, true)}…`);
      BH.UI.toast(`📖 ${A().name(s, code, true)} (+${g} knowledge)${fx.length ? '' : ''}`, 'good');
      BH.Save.save(s);
    };
    if (c.args.science) {
      const sci = A().codes(s).filter((x) => ['BSC', 'PHY', 'CHE', 'BIO', 'AGR'].includes(x));
      if (!sci.length) return { text: 'Nothing here for your subjects.', cancel: true };
      if (sci.length === 1) { go(sci[0]); return { noTime: true }; }
    }
    BH.actions.pickSubject(go);
    return { noTime: true };
  };
  H.doAssignment = (s) => {
    const m = BH.Missions.active(s).find((x) => x.tpl === 'assignment');
    if (!m) return { text: 'No assignment dey.', cancel: true };
    const lib = (s.world.map || '') === 'library';
    A().study(s, m.vars.subject, lib ? 5 : 3, true);
    S().change(s, { rest: -3 });
    m.vars.quality = (lib ? 12 : 0) + (I().has(s, 'lessonNotes') ? 8 : 0);
    return good(`You finish the ${A().name(s, m.vars.subject, true)} assignment${lib ? ' in the quiet library' : ''}. Handwriting rough, answers dey there. ✅`);
  };
  H.readBoard = (s) => {
    const L = BH.Lessons && BH.Lessons.here(s);
    if (L && L.kind === 'lesson' && L.board.length > 2) {
      if (s.today.flags['copied_' + L.room + L.start]) return { text: 'You don copy everything wey dey the board already. ✍🏾', cancel: true };
      s.today.flags['copied_' + L.room + L.start] = true;
      const g = A().study(s, L.code, 2 + Math.min(3, L.board.length - 2));
      return good(`You copy the ${A().name(s, L.code, true)} notes: “${L.board.slice(2).join(' / ').slice(0, 160)}…” (+${g} knowledge) 📝`);
    }
    const last = s.today.flags.lastLesson;
    if (!last) return 'The board get yesterday notes wey half don clean. Nothing useful.';
    const g = A().study(s, last, 2);
    return good(`You copy the ${A().name(s, last, true)} notes from the board. (+${g} knowledge) 📝`);
  };
  H.prankBoard = (s) => {
    const t = U.pick(s.npcs.teachers);
    BH.Gist.add(s, `Somebody write "${t.last.toUpperCase()} NA LION KING 🦁" for the board. The whole school dey laugh.`, { about: 'me', valence: 0.4, tags: ['prank'] });
    S().rep(s, 2); BH.Paths.add(s, 'trouble', 2); BH.Paths.add(s, 'popular', 1);
    return good('You draw the teacher with big head and write the caption. Art. 😈');
  };
  H.peekMarkbook = (s) => { s.flags.testHint = (s.flags.testHint || 0) + 1; BH.Paths.add(s, 'trouble', 1); return good('You see the marking scheme for the next test. Your brain dey snap picture. (+1 hint next test) 👀', { mins: 2 }); };
  H.steal = (s, c) => {
    const n = c.args.n || 1;
    I().add(s, c.args.item, n);
    BH.Paths.add(s, 'trouble', 1);
    return good(c.args.text || `You pocket ${D.ITEMS[c.args.item].name}. 🫳`, { crimeItem: c.args.item, crimeN: n });
  };
  H.stealExam = (s) => {
    if (s.time.week < D.CONFIG.TERM_WEEKS - 3) return { text: 'Na only old papers dey inside. The new exam questions never print. Come back near exam week.', mins: 3 };
    if (I().has(s, 'examPaper')) return { text: 'You get am already.', cancel: true };
    I().add(s, 'examPaper', 1);
    BH.Paths.add(s, 'trouble', 4);
    return good('Your hands dey shake as you fold the exam questions into your sock. 📄 (+2 hints in every exam this term)', { crimeItem: 'examPaper', mins: 4 });
  };
  H.peekFiles = (s) => {
    const d = s.discipline;
    const rep = BH.Consequences;
    BH.Dialogue.say({ portrait: { emoji: '📁' }, name: 'Your file', sub: 'Principal\'s cabinet',
      text: `**${s.player.name}** — ${BH.Time.levelName(s)}, ${s.player.house.name}\nDiscipline: **${d.points} points** (${BH.Discipline.status(s).label})\nTeachers' view: **${rep.repLabel(rep.group(s, 'teachers'))}**\nRemark: _${d.points >= 15 ? '"Watch this one closely."' : s.reputation >= 60 ? '"Popular. Possible prefect material."' : '"Quiet student."'}_` });
    return { noTime: true, mins: 3 };
  };

  /* ---------- dining ---------- */
  H.collectFood = (s) => Act().collectFood(s);
  H.eatPlate = (s, c) => Act().eatPlate(s, c.args, c.obj);
  H.begFood = (s) => {
    if (s.today.flags.begged) return { text: 'Mama Iyabo: "You again? Comot!"', cancel: true };
    s.today.flags.begged = true;
    const cook = BH.Schedule.staff(s, 'cook');
    if (!staffHere(s, 'cook')) return { text: 'Nobody dey the counter to beg.', cancel: true };
    if (U.chance(0.35 + (cook ? cook.rel / 200 : 0) + S().mod(s, 'luck'))) { I().add(s, 'bread', 1); if (cook) N().rel(s, cook, 2); return good('Mama Iyabo hiss, then wrap one bread for nylon: "Go. And no tell anybody." 🍞'); }
    return bad('"Bread? For who? Go and wait for dinner like everybody." 😒');
  };
  H.prefectPortion = (s) => {
    if (s.today.flags.duty_dining) return { text: 'You don take your portion.', cancel: true };
    s.today.flags.duty_dining = true;
    S().change(s, { hunger: 40, thirst: 10, morale: 4 });
    const meal = BH.Time.block(s).meal;
    if (meal && !s.today.meals[meal]) { s.today.meals[meal] = true; BH.bus.emit('meal', { meal }); }
    return good('The cooks dish your own from the special pot — the one with actual meat. Dining Hall Prefect life. 🍗');
  };
  H.kitchenHelp = (s) => {
    const cook = BH.Schedule.staff(s, 'cook');
    S().change(s, { hunger: 22, rest: -6, hygiene: -4 }); if (cook) N().rel(s, cook, 5);
    return good('You peel onions till your eyes cry rivers. Mama Iyabo give you one full plate as pay. 🧅', { mins: 30 });
  };

  /* ---------- tuck shop ---------- */
  H.shop = (s) => {
    if (!staffHere(s, 'keeper')) return { text: 'Nobody dey the counter. The window lock. 🔒 (You fit "serve yourself" from the shelves… 👀)', cancel: true };
    BH.actions.openShop(); return { noTime: true };
  };
  H.hustle = (s) => {
    const buyers = BH.Schedule.npcsIn(s, s.world.map || 'campus').filter((n) => n.type !== 'teacher' && n.type !== 'staff').length;
    if (buyers < 2) return { text: 'No customers around here. Go where students dey — tuck shop at break, hostel at siesta, field in the afternoon.', cancel: true };
    BH.actions.openHustle(); return { noTime: true };
  };
  H.askCredit = (s) => {
    const k = BH.Schedule.staff(s, 'keeper');
    if (!staffHere(s, 'keeper')) return { text: 'Mama no dey.', cancel: true };
    if (s.today.flags.credit) return { text: '"Credit? Again? Go pay the first one."', cancel: true };
    s.today.flags.credit = true;
    if (k.rel >= 55 || U.chance(0.25)) { I().add(s, 'bread', 1); I().add(s, 'pureWater', 1); N().rel(s, k, -2); s.flags.debt = (s.flags.debt || 0) + 120; return good('Mama write your name for her book: "Bread and pure water. You go pay me Friday." 📒'); }
    return bad('"No credit today. Come back when you get money." 🙅🏾‍♀️');
  };
  H.stealShop = (s) => {
    const it = U.pick(['gala', 'biscuits', 'chinchin', 'plantainChips', 'pureWater', 'milo']);
    I().add(s, it, 1); BH.Paths.add(s, 'trouble', 1);
    return good(`You slide one ${D.ITEMS[it].name} into your pocket from the shelf. 🫳`, { crimeItem: it });
  };
  H.buyContraband = (s, c) => { if (s.money < c.args.price) return bad('You no get enough money.'); S().money(s, -c.args.price); I().add(s, c.args.item, 1); return good(`Mama wrap the ${D.ITEMS[c.args.item].name} inside black nylon. "You no buy am from me o." 🔌`); };

  /* ---------- library, sick bay, admin ---------- */
  H.borrowNovel = (s) => {
    if (!staffHere(s, 'librarian')) return { text: 'The librarian no dey. You no fit borrow.', cancel: true };
    if (I().has(s, 'novel')) return { text: '"Return the one you have first."', cancel: true };
    I().add(s, 'novel', 1);
    return good(`Mr. Okon stamp the card: "${U.pick(['Mark of the Cobra', 'Without a Silver Spoon', 'The Drummer Boy', 'Eze Goes to School'])}. Two weeks." 📗`);
  };
  H.giveItem = (s, c) => {
    if (c.args.once && s.today.flags['once_' + c.args.once]) return { text: '"I don give you already today."', cancel: true };
    if (c.args.once) s.today.flags['once_' + c.args.once] = true;
    I().add(s, c.args.item, c.args.n || 1);
    return good(c.args.text || 'Here.');
  };
  H.nurseTreat = (s) => {
    if (s.stats.health < 70 || s.stats.rest < 20) {
      S().change(s, { health: 14, rest: 6 });
      s.today.flags.excused = abs(s) + 120;
      return good('Matron check your temperature, give you paracetamol and ORS: "Lie down for that bed. I go write you excuse for class." 💊 (Excused for 2 hours)');
    }
    return bad('Matron look you up and down: "You no sick. Go back to where you suppose dey!" 😒');
  };
  H.fakeSick = (s) => {
    if (s.today.flags.faked) return { text: 'Matron: "You again? Out!"', cancel: true };
    s.today.flags.faked = true;
    if (U.chance(0.35 + S().mod(s, 'dodge') + S().mod(s, 'luck'))) {
      s.today.flags.excused = abs(s) + 150;
      BH.Paths.add(s, 'trouble', 1);
      return good('You hold your head and shiver like Oscar winner. Matron: "Malaria. Rest here." 🏆 (Excused for 2½ hours)');
    }
    S().change(s, { morale: -5 });
    return bad('Matron give you one cup of bitter Chloroquine: "Drink it and go back to class." The bitterness reach your soul. 🤢 ' + BH.Discipline.minor(s, 'Faking sickness'));
  };
  H.callHome = (s) => {
    S().money(s, -100); BH.bus.emit('action', { tag: 'contactHome' });
    if (s.family) s.family.mummy = U.clamp(s.family.mummy + 3);
    S().change(s, { morale: 12 });
    if (U.chance(0.35 + S().mod(s, 'luck'))) {
      const amt = { struggling: 500, middle: 2000, bigman: 5000 }[s.player.background];
      S().money(s, amt);
      return good(`Mummy: "Are you eating well? Did you finish the Strongman already?!" …She send ${U.money(amt)} through the Bursar. 💸`, { mins: 10 });
    }
    return good('Mummy: "Are you reading your books? Your cousin Chidinma come first for her class o." The call end before you fit defend yourself. 📞', { mins: 10 });
  };
  H.snitchMenu = (s, c) => { BH.Dialogue.snitchMenu(c.npc ? c.npc.id : null); return { noTime: true }; };
  H.begPhone = (s) => {
    const fine = 1000;
    if (s.discipline.points >= 15) return bad('"Your file thick like Bible and you dey ask for phone? Get out!"');
    if (s.money < fine) return bad(`"Pay ₦${fine} fine first."`);
    S().money(s, -fine); s.phone.confiscated = false; s.phone.hidden = false;
    return good(`"Take. If I see am again, e go remain with me till you graduate." (−₦${fine}) 📱`);
  };
  H.useExeat = (s) => { I().take(s, 'exeat', 1); return H.outsideTrip(s, 'Mallam Musa reads the exeat, looks at you, looks at the paper again… and opens the gate. "Back before six." FREEDOM! 🚪'); };
  H.bribeGate = (s) => {
    S().money(s, -500);
    if (U.chance(0.6 + S().mod(s, 'luck'))) return H.outsideTrip(s, 'Mallam Musa pocket the ₦500 and look the other side. 🤫');
    return bad('Mallam Musa collect the money… then report you to the VP. ' + BH.Discipline.offence(s, 'Trying to bribe the gateman', 2));
  };
  H.outsideTrip = (s, intro) => {
    S().change(s, { hunger: 40, thirst: 15, morale: 15 }); S().rep(s, 3); BH.Paths.add(s, 'trouble', 2); BH.Paths.add(s, 'popular', 1);
    BH.Gist.add(s, `${first(s)} go outside school and come back with suya smell 😮`, { about: 'me', valence: 0.4 });
    return good(`${intro} Suya, cold mineral and freedom for one hour. You sneak back before anybody notice. 🍢`, { mins: 60 });
  };

  /* ---------- worship ---------- */
  H.worship = (s) => {
    if (BH.Time.block(s).kind === 'worship') {
      if (s.today.flags.worshipped) return { text: 'You don participate well well today.', cancel: true };
      s.today.flags.worshipped = true;
      S().change(s, { morale: S().has(s, 'prayer') ? 14 : 8 });
      return good(s.player.religion === 'muslim' ? 'Your recitation clear and sweet. Even the MSSN Amir nod. Peace dey your heart. 🤲' : 'You sing "Mighty Fortress" like say you wan collect award. Your spirit don recharge. 🙌', { mins: 30 });
    }
    if (s.today.flags.once_pray) return { text: 'You don pray today already.', cancel: true };
    s.today.flags.once_pray = true;
    S().change(s, { morale: 4 });
    return good('You pray quietly. Your heart settle. 🙏', { mins: 10 });
  };
  H.giveOffering = (s) => { S().money(s, -50); S().change(s, { morale: 6 }); s.flags.blessed = (s.flags.blessed || 0) + 1; return good('You give with cheerful heart. You feel say something good go happen this week. ✨'); };
  H.stealOffering = (s) => {
    const amt = U.randInt(80, 260); S().money(s, amt); BH.Paths.add(s, 'trouble', 3); S().change(s, { morale: -4 });
    return good(`You collect ${U.money(amt)} from the offering box. Your conscience dey shout. 😬`, { crimeItem: null });
  };

  /* ---------- prefect duties ---------- */
  H.prefectDuty = (s, c) => {
    const k = 'duty_' + c.args.duty;
    if (s.today.flags[k]) return { text: 'You don do this duty today.', cancel: true };
    s.today.flags[k] = true;
    BH.Paths.add(s, 'leader', 3);
    BH.bus.emit('action', { tag: 'prefectDuty', duty: c.args.duty });
    switch (c.args.duty) {
      case 'assembly': S().rep(s, 3); S().change(s, { morale: 6 }); S().favour(s, 2); return good('You stand for the podium: "Students, ATTENTION!" 1,200 people obey you. You lead the anthem and dismiss everybody like President. 🎖️', { mins: 15 });
      case 'labour': BH.bus.emit('action', { tag: 'labourHard' }); S().change(s, { rest: -3 }); S().rep(s, 2); return good('You waka up and down with exercise book and pen. "You! That plot never clean!" The juniors now fear YOUR name. 📋', { mins: 30 });
      case 'social': BH.bus.emit('action', { tag: 'dance' }); S().rep(s, 5); S().change(s, { morale: 12, rest: -6 }); return good('"Make some noise for SS3!!!" You run the whole show. The school go remember this night. 🪩', { mins: 40 });
      case 'sports': S().rep(s, 3); S().change(s, { rest: -8, health: 4, morale: 6, hygiene: -10 }); BH.Paths.add(s, 'sports', 2); return good(`You blow whistle and make ${s.player.house.name} athletes run 10 laps. Trophy dey come home this year! 🏆`, { mins: 30 });
      case 'worship': S().rep(s, 2); S().change(s, { morale: 12 }); return good('You lead the whole school in worship. Even the most stubborn SS2 boy close eyes. 🙏', { mins: 30 });
      default: return 'Duty done.';
    }
  };

  /* ---------- outdoors ---------- */
  H.playBall = (s) => {
    if (['class', 'assembly', 'prep'].includes(BH.Time.block(s).kind)) return bad('Field empty — everybody dey class. You kick ball alone like mumu. 😅', { mins: 10 });
    const mud = BH.WorldSim.raining(s);
    S().change(s, { morale: 7, rest: -7, thirst: -6, hygiene: mud ? -14 : -6, health: 2 }); S().rep(s, 1); BH.Paths.add(s, 'sports', 1);
    return good(mud ? 'Mud football! You slide, you fall, you score. Your uniform don finish. ⚽🟫' : 'You join one "set" — tennis ball, two stones as goal post. You score! ⚽');
  };
  H.train = (s) => {
    const sporty = S().has(s, 'sporty');
    S().change(s, { rest: sporty ? -8 : -12, thirst: -8, hygiene: -8, health: 3, morale: 3 });
    BH.Paths.add(s, 'sports', sporty ? 3 : 2);
    s.flags.training = (s.flags.training || 0) + 1;
    return good(U.pick(['You run 10 laps round the field. Your legs dey vibrate. 🏃', 'Sprints, push-ups, frog jumps. Coach for your head dey shout "AGAIN!" 💪']));
  };
  H.clearGrass = (s) => {
    const cut = I().has(s, 'cutlass');
    const mud = BH.WorldSim.raining(s) ? 1.6 : 1;
    S().change(s, { rest: -Math.round((cut ? 7 : 11) * mud), hygiene: -8, thirst: -6 });
    s.today.flags.plots = (s.today.flags.plots || 0) + 1;
    BH.bus.emit('action', { tag: 'labourHard' });
    return good(cut ? 'Your cutlass dey sing "swish swish". Plot cleared. 🪓' : 'No cutlass — you uproot grass with hand. Slow, painful, done. 🌾', { mins: Math.round((cut ? 20 : 35) * mud) });
  };
  H.compete = (s) => {
    const train = s.flags.training || 0;
    const score = train * 8 + s.stats.rest * 0.3 + s.stats.health * 0.2 + (S().has(s, 'sporty') ? 20 : 0) + U.randInt(-10, 10);
    S().change(s, { rest: -18, thirst: -12, hygiene: -14 });
    if (score >= 60) { BH.Consequences.repChange(s, 'house', 10); S().rep(s, 8); BH.Paths.add(s, 'sports', 10); BH.Gist.add(s, `${first(s)} win GOLD for ${s.player.house.name} at inter-house sports! 🥇`, { about: 'me', valence: 0.8 }); return good('You fly past everybody. GOLD MEDAL! The whole house lift you up! 🥇🎉'); }
    if (score >= 40) { BH.Consequences.repChange(s, 'house', 4); S().rep(s, 3); BH.Paths.add(s, 'sports', 5); return good('Silver! Your house dey proud. 🥈'); }
    BH.Paths.add(s, 'sports', 2); return 'You try your best… last position. But you finish the race. 🫡';
  };
  H.standLine = (s) => Act().inspect(s, true);
  H.dance = (s) => {
    BH.bus.emit('action', { tag: 'dance' });
    S().change(s, { morale: 12, rest: -8, thirst: -6 }); S().rep(s, U.chance(0.5) ? 4 : 1); BH.Paths.add(s, 'popular', 2);
    return good(U.pick(['You do "Zanku" so well that SS3 people clap for you! 🔥', 'You dance "Shaku Shaku". Your leg get mind of its own. The crowd hail you.', 'You try "Gwara Gwara" and fall. People laugh, but you laugh pass them. Vibes!']));
  };
  H.jumpFence = (s) => {
    S().money(s, -400);
    S().change(s, { hunger: 40, thirst: 10, morale: 14 }); S().rep(s, 4); BH.Paths.add(s, 'trouble', 3); BH.Paths.add(s, 'popular', 1);
    BH.Gist.add(s, `${first(s)} jump fence go Mama Put and come back like Spider-Man 🕷️`, { about: 'me', valence: 0.5 });
    return good('Rice, stew, dodo and ONE big meat. You chop am for the bush and climb back. 🍛🕷️', { mins: 40 });
  };
  H.gistTree = (s) => {
    const c = N().randomClassmate(s); S().change(s, { morale: 6 }); N().rel(s, c, 3);
    return good(`You join ${c.first} and others under the mango tree. ${BH.Gist.line(s, c)}`);
  };

  /* ---------- people ---------- */
  H.talk = (s, c) => { BH.Dialogue.npc(c.npc.id); return { noTime: true, cancel: true }; };
  H.quickGist = (s, c) => {
    const n = c.npc;
    if (s.today.talked['g' + n.id]) return { text: `${n.first}: "I don tell you everything I know today."`, cancel: true };
    s.today.talked['g' + n.id] = true;
    N().rel(s, n, 2); S().change(s, { morale: 2 });
    BH.bus.emit('npc:talk', { npc: n.id });
    return `${n.first}: ${BH.Gist.line(s, n)}`;
  };
  H.quickGreet = (s, c) => {
    const n = c.npc;
    if (s.today.talked['h' + n.id]) return { text: 'You don greet already.', cancel: true };
    s.today.talked['h' + n.id] = true;
    BH.bus.emit('npc:talk', { npc: n.id });
    if (n.type === 'senior') return N().greetSenior(s, n);
    N().rel(s, n, 2); if (n.type === 'teacher') BH.Consequences.repChange(s, 'teachers', 0.5);
    return `${N().name(n)}: ${U.pick(['"Good. Greeting is a sign of good home training."', '"Mm. How are your studies?"', '"Good day."'])}`;
  };
  H.sendJunior = (s, c) => {
    if (s.time.year <= 3) return { text: 'You no be senior. Who you wan send?', cancel: true };
    if (s.today.talked['e' + c.npc.id]) return { text: `${c.npc.first} still dey do your last errand.`, cancel: true };
    s.today.talked['e' + c.npc.id] = true;
    BH.bus.emit('action', { tag: 'wicked' });
    return N().sendJunior(s, c.npc);
  };
  H.giveMenu = (s, c) => { BH.Dialogue.shareMenu(c.npc.id); return { noTime: true, cancel: true }; };
  H.follow = (s, c) => { BH.World.follow(c.npc.id); return { text: `👣 Following ${N().name(c.npc)}. Move to stop.`, noTime: true }; };
  H.pickpocket = (s, c) => {
    const key = 'pp_' + c.npc.id;
    if (s.today.flags[key]) return { text: 'You don try am already. E dey suspect.', cancel: true };
    s.today.flags[key] = true;
    if (U.chance(0.3 - S().mod(s, 'dodge'))) { N().rel(s, c.npc, -15); BH.Gist.add(s, `${first(s)} try pickpocket ${c.npc.first}! 🫳`, { about: 'me', valence: -0.6, tags: ['stealing'] }); return bad(`${c.npc.first} catch your hand inside their pocket: "THIEF!!!" Everybody turn. 😳`); }
    const amt = U.randInt(30, 150); S().money(s, amt); BH.Paths.add(s, 'trouble', 1);
    return good(`Smooth. ${U.money(amt)} don change pocket. ${c.npc.first} no feel anything. 🫳`);
  };

  /* real players (multiplayer) — BH.Social does the work */
  H.fbJoinHere = () => { if (!BH.Games.football.active()) BH.Games.football.join(); return { noTime: true, cancel: true }; };
  H.fbKick = (s, c) => { BH.Games.football.kick(c.args.power); return { noTime: true, cancel: true }; };
  H.socialMenu = (s, c) => { BH.Social.openPlayer(c.target.pid); return { noTime: true, cancel: true }; };
  H.socialDo = (s, c) => { BH.Social.act(c.args.op, c.target.pid); return { noTime: true, cancel: true }; };

  BH.Actions = Actions;
})(window.BH);
