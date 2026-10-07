/* Writing as game objects — the logic (UI lives in js/ui/screens/writing.js).
   Private (never leaves this device): diary, notes you pass in class, letters' text (only sent to the server to get the reply).
   Shared (server, moderated, reportable): noticeboard posts, graffiti, slam book answers, sign-out shirt signatures.
   Everything typed goes through BHModeration first; public text is also AI-moderated on the server. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const N = () => BH.NPC;
  const Mod = () => window.BHModeration;
  const abs = (s) => BH.Clock.abs(s);

  const NOTE_LINES = [
    '"Ehen! What is so interesting that you are passing letters in my class? Love letter? Shopping list?" The whole class laughs. 😂',
    '"Let me guess — \'Do you like me? Tick yes or no.\' Bring it here!" The note goes into the drawer of no return.',
    '"So we have a postman in this class? Is this NIPOST?" Everybody dies with laughter.',
    '"I will read this at assembly tomorrow." (They won\'t. But you will lose sleep.) 😰',
    '"Is this an important message from the President? No? Then it belongs to me now."',
  ];

  const Writing = {
    graffiti: {},   // mapId -> [{ id, spot, author, text }]
    boardCache: null,

    onNewGame(s) { Writing.ensure(s); },
    onLoad(s) { Writing.ensure(s); },
    ensure(s) {
      s.diary = s.diary || [];
      s.notes = s.notes || [];
      s.letters = s.letters || [];
      s.slambook = s.slambook || null;
      s.shirt = s.shirt || null;
    },
    check(text, ctx = 'private', max = 400) {
      const r = Mod().moderate(text, { context: ctx, max });
      if (r.distress) BH.Chat.help();
      return r;
    },

    /* ---------- diary (private: stored only in this save) ---------- */
    addDiary(s, text) {
      text = String(text || '').slice(0, 1000).trim();
      if (!text) return null;
      if (Mod().distress(text)) BH.Chat && BH.Chat.help();
      const e = { id: U.uid(), when: BH.Time.dateLabel(s), at: abs(s), text };
      s.diary.unshift(e);
      if (s.diary.length > 200) s.diary.length = 200;
      BH.Stats.change(s, { morale: 2 });
      return e;
    },

    /* ---------- notes in class ---------- */
    noteTargets(s) {
      const sc = BH.World.scene;
      if (!sc || !s.act || s.act.type !== 'lesson') return [];
      const me = { x: sc.player.x, y: sc.player.y };
      return [...sc.npcs.values()].filter((o) => o.n.type === 'classmate' && o.seat && !o.leaving).map((o) => {
        const tiles = Math.hypot(o.spr.x - me.x, o.spr.y - me.y) / sc.cm.T;
        return { n: o.n, hops: Math.max(1, Math.round(tiles / 1.6)), y: o.spr.y };
      }).sort((a, b) => a.hops - b.hops);
    },
    /* pass a folded note seat-to-seat; each hop risks the teacher noticing */
    passNote(s, targetId, text) {
      const chk = Writing.check(text, 'private', 200);
      if (chk.verdict === 'blocked') return { ok: false, reason: `You crumple it up — it has ${Mod().explain(chk.reasons)}.` };
      const t = Writing.noteTargets(s).find((x) => x.n.id === targetId);
      if (!t) return { ok: false, reason: 'They are not in class right now.' };
      const sc = BH.World.scene;
      const code = s.act.code;
      const teacher = code && N().teacher(s, code);
      const present = teacher && !BH.Activities.freePeriod(s) && BH.Schedule.where(s, teacher).map === s.world.map;
      const alert = present ? (teacher.strict || 0.5) : 0;
      const board = sc.cm.spots.teacher ? sc.cm.spots.teacher.y : 0;
      const front = 1.35 - Math.min(1, Math.max(0, ((sc.player.y + t.y) / 2 - board) / (sc.cm.H - board))) * 0.7; // rows near the front are watched more
      const pHop = present ? 0.04 + 0.13 * alert * front : 0;
      const pCaught = 1 - Math.pow(1 - pHop, t.hops);
      const note = { id: U.uid(), to: t.n.id, toName: t.n.first, text: chk.text, at: abs(s), when: BH.Time.dateLabel(s), status: 'passing' };
      s.notes.unshift(note);
      if (s.notes.length > 40) s.notes.length = 40;
      if (Math.random() < pCaught) {
        note.status = 'confiscated';
        BH.fx.begin();
        const p = BH.Discipline.minor(s, 'Passing notes in class');
        BH.fx.end();
        if (teacher) N().rel(s, teacher, -2);
        BH.Gist.add(s, `${s.player.name.split(' ')[0]} got caught passing a note in ${BH.Academics.name(s, code, true)} 😂`, { about: 'me', valence: 0.1 });
        // the teacher never reads the real text — a generic funny line instead
        return { ok: true, caught: true, teacher: teacher ? N().name(teacher) : 'The teacher', line: U.pick(NOTE_LINES), punishment: p, hops: t.hops, chance: pCaught };
      }
      note.status = 'delivered';
      return { ok: true, caught: false, note, target: t.n, hops: t.hops, chance: pCaught };
    },
    async noteReply(s, n, note) {
      const r = await BH.AI.chat({ npc: n, situation: 'note_reply', text: note.text });
      let reply = r && !r.blocked && !r.distress && r.reply ? String(r.reply).replace(/^[^:]{1,25}:\s*/, '').replace(/^"|"$/g, '').slice(0, 140) : null;
      if (!reply || r.source === 'offline') reply = U.pick(['😂😂 You no well', 'Abeg focus, teacher dey look', 'Meet me for break', 'LOL yes o', 'Who wrote this?? 👀', '✅']);
      note.reply = reply;
      BH.NPC.rel(s, n, 2 + (r && r.relationship_change > 0 ? 1 : 0));
      BH.Save.save(s);
      return reply;
    },

    /* ---------- letters home (AI reply a few in-game days later) ---------- */
    sendLetter(s, to, text) {
      const chk = Writing.check(text, 'private', 800);
      if (chk.verdict === 'blocked') return { ok: false, reason: `Rewrite it — it has ${Mod().explain(chk.reasons)}.` };
      const l = { id: U.uid(), to, text: chk.text, sentDay: s.time.dayCount, due: s.time.dayCount + U.randInt(2, 4), when: BH.Time.dateLabel(s), status: 'sent' };
      s.letters.unshift(l);
      BH.bus.emit('action', { tag: 'contactHome' });
      BH.Stats.change(s, { morale: 4 });
      if (s.family) s.family[to] = U.clamp((s.family[to] || 50) + 2);
      return { ok: true, letter: l };
    },
    onNewDay(s) {
      Writing.ensure(s);
      s.letters.filter((l) => l.status === 'sent' && l.due <= s.time.dayCount).forEach((l) => { l.status = 'writing'; Writing.replyLetter(s, l); });
      // SS3 sign-out day: Friday of the last week of the last term
      if (s.time.year === 6 && s.time.term === 3 && s.time.week === D.CONFIG.TERM_WEEKS && s.time.dow === 4 && !s.flags.signOut) {
        s.flags.signOut = true;
        BH.WorldSim.call(s, { kind: 'signout', text: '👕 SIGN-OUT DAY! White shirts and markers out', minutes: 900 });
      }
    },
    async replyLetter(s, l) {
      const fam = s.family || {};
      const npc = { contact: l.to, name: l.to === 'mummy' ? 'Mummy' : 'Daddy', rel: fam[l.to] || 60 };
      const last = (s.reports || [])[s.reports.length - 1];
      const r = await BH.AI.chat({
        npc, situation: 'letter', text: l.text,
        vars: { moneyCap: l.to === 'mummy' ? 2000 : 2000, context: last ? `last report card average ${last.average}%, position ${last.position}` : 'no report card yet this year' },
      });
      if (BH.Game.s !== s) return;
      let money = 0; const items = {};
      if (r.source === 'offline' || !r.reply) {
        r.reply = U.pick(['My dear, we received your letter. We are praying for you. Read your books and eat well.', 'Ehen! Your letter made us happy. Behave yourself o. We miss you.', 'Your Daddy said you should focus on your books. We will see you at visiting day.']);
        if (/money|send|milo|provision/i.test(l.text) && Math.random() < 0.5) money = { struggling: 300, middle: 1000, bigman: 2000 }[s.player.background];
      } else { money = r.effects.money || 0; Object.assign(items, r.effects.items || {}); }
      BH.fx.begin();
      if (money) BH.Stats.money(s, money);
      Object.entries(items).forEach(([id, n]) => D.ITEMS[id] && BH.Inv.add(s, id, n));
      BH.fx.end();
      l.reply = String(r.reply).replace(/^[^:]{1,20}:\s*/, '').slice(0, 900);
      l.gift = money || Object.keys(items).length ? { money, items } : null;
      l.status = 'replied';
      l.source = r.source;
      BH.Save.save(s);
      BH.UI.toast(`📬 A letter from ${npc.name}!${money ? ` (+${U.money(money)})` : ''} Read it in 🎒 → ✉️ Letters.`, 'good', !!money);
    },

    /* ---------- typed text replies on the phone ---------- */
    async textReply(s, contactKey, text) {
      const th = (s.phone.threads[contactKey] = s.phone.threads[contactKey] || []);
      const chk = Writing.check(text, 'private', 300);
      if (chk.verdict === 'blocked') return { ok: false, reason: `Not sent — it has ${Mod().explain(chk.reasons)}.` };
      if (BH.Discipline.caught(s, BH.Phone.risk(s))) return { ok: true, caught: true, text: BH.Phone.seize(s, 'Caught pressing phone') };
      th.push({ who: 'me', text: chk.text, t: BH.Phone.stamp(s) });
      s.phone.battery = Math.max(0, s.phone.battery - 2);
      const C = D.CONTACTS[contactKey];
      const npc = C && C.npc ? (C.npc === 'crush' ? N().crush(s) : N().byRole(s, C.npc)) : { contact: contactKey === 'friend' ? 'friendHome' : contactKey, name: BH.Phone.contactName(s, contactKey), rel: (s.family && s.family[contactKey]) || 60 };
      const hist = th.slice(-10, -1).map((m) => ({ who: m.who === 'me' ? 'me' : 'npc', text: m.text }));
      const r = await BH.AI.chat({ npc, situation: 'text_reply', text: chk.text, history: hist, vars: { context: 'texting from boarding school on a hidden phone' } });
      if (BH.Game.s !== s) return { ok: true };
      if (r.distress) return { ok: true, distress: true };
      BH.fx.begin();
      const notes = BH.AI.apply(s, npc.contact ? npc : npc, r);
      BH.fx.end();
      th.push({ who: 'them', text: String(r.reply || '👍').replace(/^[^:]{1,25}:\s*/, '').replace(/^"|"$/g, ''), t: BH.Phone.stamp(s) });
      BH.bus.emit('phone:reply', { from: contactKey, typed: true });
      BH.Save.save(s);
      return { ok: true, notes };
    },

    /* ---------- slam book ---------- */
    async startSlambook(s) {
      if (s.slambook) return s.slambook;
      const qs = BH.Content.get('slambook').questions;
      const r = await BH.AI.post('/api/slambook', { ownerName: s.player.name.split(' ')[0] });
      s.slambook = r && r.ok ? { id: r.book.id, shared: true, questions: r.book.questions, entries: [] } : { id: 'local-' + U.uid(), shared: false, questions: qs, entries: [] };
      BH.Save.save(s);
      return s.slambook;
    },
    async refreshSlambook(s) {
      const b = s.slambook;
      if (!b || !b.shared) return b;
      const r = await BH.AI.get(`/api/slambook?id=${encodeURIComponent(b.id)}`);
      if (r && r.book) { b.entries = r.book.entries || []; BH.Save.save(s); }
      return b;
    },
    /* a classmate fills it in (presets + one AI answer for "What do you think of me?") */
    async npcFillSlambook(s, n) {
      const b = s.slambook;
      const SB = BH.Content.get('slambook');
      const key = 'slam_' + n.id;
      if ((b.entries || []).some((e) => e.npcId === n.id)) return { ok: false, reason: `${n.first} don already write for your slam book.` };
      if (s.today.flags[key]) return { ok: false, reason: 'Wait small.' };
      s.today.flags[key] = true;
      const answers = {};
      const subj = BH.Academics.name(s, U.pick(BH.Academics.codes(s)), true);
      b.questions.forEach((q, i) => {
        if (i === 0) { answers[i] = `${n.first} ${n.last}`; return; }
        const opts = SB.npcAnswers[q];
        if (opts) answers[i] = U.fill(U.pick(opts), { house: N().house(n).name, subject: subj });
      });
      const qi = b.questions.indexOf('What do you think of me?');
      if (qi >= 0) {
        const r = await BH.AI.chat({ npc: n, situation: 'slambook', text: '(hands you the slam book)', vars: { question: 'What do you think of me?' } });
        if (r && r.reply && r.source !== 'offline' && !r.blocked) answers[qi] = String(r.reply).replace(/^[^:]{1,25}:\s*/, '').replace(/^"|"$/g, '').slice(0, 100);
      }
      BH.NPC.rel(s, n, 3);
      return Writing.addSlamEntry(s, { name: n.first, npc: true, npcId: n.id, answers });
    },
    async addSlamEntry(s, entry) {
      const b = s.slambook;
      if (b.shared) {
        const r = await BH.AI.post('/api/slambook/answer', { id: b.id, name: entry.name, npc: !!entry.npc, answers: entry.answers });
        if (r && r.ok) { b.entries = r.book.entries; const last = b.entries[b.entries.length - 1]; if (entry.npcId && last) last.npcId = entry.npcId; BH.Save.save(s); return { ok: true }; }
        if (r && r.reason) return { ok: false, reason: r.reason };
      }
      // local (offline) book: filter locally
      for (const v of Object.values(entry.answers)) { const c = Mod().moderate(v, { context: 'public' }); if (c.verdict === 'blocked') return { ok: false, reason: `Not allowed: ${Mod().explain(c.reasons)}.` }; }
      b.entries.push(Object.assign({ id: U.uid(), at: new Date().toISOString() }, entry));
      BH.Save.save(s);
      return { ok: true };
    },
    /* signing a REAL friend's slam book by its code */
    async loadSlambook(code) { const r = await BH.AI.get(`/api/slambook?id=${encodeURIComponent(code)}`); return r && r.book ? r.book : null; },
    async signSlambook(code, name, answers) { return BH.AI.post('/api/slambook/answer', { id: code, name, answers }); },

    /* ---------- noticeboard (per school, moderated) ---------- */
    async board(s) { const r = await BH.AI.get(`/api/board?schoolId=${encodeURIComponent(s.player.schoolName)}`); Writing.boardCache = r && r.posts ? r.posts : null; return Writing.boardCache; },
    async postBoard(s, text) {
      const chk = Writing.check(text, 'public', 280);
      if (chk.verdict === 'blocked') return { ok: false, reason: `Not allowed: ${Mod().explain(chk.reasons)}.` };
      const r = await BH.AI.post('/api/board', { text: chk.text });
      if (r.offline) return { ok: false, reason: 'The noticeboard needs the game server (it\'s shared with other players).' };
      return r.ok ? { ok: true } : { ok: false, reason: r.reason || 'Not posted.' };
    },

    /* ---------- graffiti (desks & walls; persists across terms, moderated) ---------- */
    async loadGraffiti(s, mapId) {
      const r = await BH.AI.get(`/api/graffiti?schoolId=${encodeURIComponent(s.player.schoolName)}&mapId=${encodeURIComponent(mapId)}`);
      Writing.graffiti[mapId] = r && r.items ? r.items : (Writing.graffiti[mapId] || []);
      return Writing.graffiti[mapId];
    },
    graffitiAt(mapId, objId) { return (Writing.graffiti[mapId] || []).filter((g) => g.spot === objId); },
    async carve(s, mapId, objId, text) {
      const chk = Writing.check(text, 'public', 80);
      if (chk.verdict === 'blocked') return { ok: false, reason: `Not allowed: ${Mod().explain(chk.reasons)}.` };
      const r = await BH.AI.post('/api/graffiti', { mapId, spot: objId, text: chk.text });
      if (r.offline) return { ok: false, reason: 'Graffiti is shared with other players, so it needs the game server.' };
      if (!r.ok) return { ok: false, reason: r.reason || 'Not allowed.' };
      (Writing.graffiti[mapId] = Writing.graffiti[mapId] || []).unshift(r.item);
      return { ok: true };
    },
    /* interactables get "read / write graffiti" actions */
    actionsFor(s, target) {
      if (!target || target.type !== 'object') return [];
      const o = target.obj;
      if (!['desk', 'myDesk', 'labBench', 'diningTable', 'behind', 'bunk', 'pew'].includes(o.kind)) return [];
      const out = [];
      const g = Writing.graffitiAt(o.map, o.id);
      if (g.length) out.push({ id: 'readGraffiti', label: `Read the writing (${g.length})`, emoji: '👀', do: 'readGraffiti', prio: 2 });
      if (['desk', 'myDesk', 'labBench', 'behind', 'bunk'].includes(o.kind)) out.push({ id: 'graffiti', label: 'Write on it 👀', emoji: '✏️', do: 'writeGraffiti', crime: 'vandalism', prio: 7 });
      return out;
    },

    /* ---------- sign-out day shirt (SS3) ---------- */
    async startShirt(s) {
      if (s.shirt) return s.shirt;
      const r = await BH.AI.post('/api/shirt', { ownerName: s.player.name.split(' ')[0] });
      s.shirt = r && r.ok ? { id: r.shirt.id, shared: true, signatures: [] } : { id: 'local-' + U.uid(), shared: false, signatures: [] };
      BH.Save.save(s);
      return s.shirt;
    },
    async refreshShirt(s) {
      const sh = s.shirt;
      if (!sh || !sh.shared) return sh;
      const r = await BH.AI.get(`/api/shirt?id=${encodeURIComponent(sh.id)}`);
      if (r && r.shirt) { sh.signatures = r.shirt.signatures || []; BH.Save.save(s); }
      return sh;
    },
    async signShirt(s, shirtId, sig, local) {
      const chk = Writing.check(sig.text, 'public', 80);
      if (chk.verdict === 'blocked') return { ok: false, reason: `Not allowed: ${Mod().explain(chk.reasons)}.` };
      const place = { x: Math.random(), y: Math.random(), rot: (Math.random() - 0.5) * 0.6, color: U.pick(['#1b2a4a', '#0f5c3f', '#b71c1c', '#4a148c', '#e65100', '#01579b']) };
      if (local) { s.shirt.signatures.push(Object.assign({ id: U.uid() }, place, sig, { text: chk.text })); BH.Save.save(s); return { ok: true }; }
      const r = await BH.AI.post('/api/shirt/sign', Object.assign({ id: shirtId }, place, sig, { text: chk.text }));
      if (r.offline) return { ok: false, reason: 'Signing other players\' shirts needs the game server.' };
      if (!r.ok) return { ok: false, reason: r.reason || 'Not allowed.' };
      if (s.shirt && s.shirt.id === shirtId) s.shirt.signatures = r.shirt.signatures;
      BH.Save.save(s);
      return { ok: true };
    },
    /* classmates sign: AI for your three closest friends, preset lines for the rest */
    async npcSignShirt(s) {
      const sh = await Writing.startShirt(s);
      const friends = s.npcs.classmates.filter((c) => c.rel >= 35 && !sh.signatures.some((x) => x.npcId === c.id)).sort((a, b) => b.rel - a.rel).slice(0, 14);
      const PRESET = ['Six years! We made it 🎓', 'No forget your padi o', 'From garri to graduation!', 'See you at the top 🚀', 'Remember labour day 😂', 'God bless you, my guy', 'Stay humble, stay hungry', 'Senior no more! 😎'];
      for (const [i, n] of friends.entries()) {
        let text = U.pick(PRESET);
        if (i < 3) {
          const r = await BH.AI.chat({ npc: n, situation: 'shirt', text: '(holds out the marker)' });
          if (r && r.reply && r.source !== 'offline' && !r.blocked) text = String(r.reply).replace(/^[^:]{1,25}:\s*/, '').replace(/^"|"$/g, '').slice(0, 80);
        }
        const res = await Writing.signShirt(s, sh.id, { name: n.first, text, npc: true }, !sh.shared);
        if (res.ok) { const last = s.shirt.signatures[s.shirt.signatures.length - 1]; if (last) last.npcId = n.id; }
      }
      BH.Save.save(s);
      return s.shirt;
    },
    /* trophy room: survives across saves (localStorage), one entry per graduation */
    trophies() { try { return JSON.parse(localStorage.getItem('bh_trophies') || '[]'); } catch (e) { return []; } },
    saveTrophy(s, dataUrl) {
      const list = Writing.trophies().filter((t) => t.id !== s.shirt.id);
      list.unshift({ id: s.shirt.id, name: s.player.name, school: s.player.schoolName, when: BH.Time.dateLabel(s), img: dataUrl, signatures: s.shirt.signatures.length });
      try { localStorage.setItem('bh_trophies', JSON.stringify(list.slice(0, 12))); } catch (e) { return false; }
      s.flags.trophySaved = true;
      return true;
    },

    /* ---------- debate society ---------- */
    motionOfDay(s) { const m = BH.Content.get('debates').motions; return m[s.time.dayCount % m.length]; },
    async debate(s, side, argument) {
      const m = Writing.motionOfDay(s);
      s.today.flags.debated = true;
      const r = await BH.AI.debate(m, side, argument);
      if (r.distress) return r;
      BH.fx.begin();
      if (r.winner === 'player') { BH.Stats.rep(s, 4); BH.Consequences.repChange(s, 'house', 3); BH.Paths.add(s, 'popular', 2); BH.Paths.add(s, 'leader', 2); BH.Stats.change(s, { morale: 8 }); BH.Gist.add(s, `${s.player.name.split(' ')[0]} won the debate on "${m.motion}" 🎤🔥`, { about: 'me', valence: 0.7 }); }
      else if (r.winner === 'tie') { BH.Stats.rep(s, 1); BH.Paths.add(s, 'leader', 1); }
      else BH.Stats.change(s, { morale: -2 });
      BH.Paths.add(s, 'scholar', 1);
      r.fx = BH.fx.end();
      BH.Save.save(s);
      return r;
    },
  };

  /* action handlers used by interactables */
  BH.Actions.define('readGraffiti', (s, c) => {
    const g = Writing.graffitiAt(c.map, c.obj.id);
    BH.Screens.writing.showGraffiti(c.obj, g);
    return { noTime: true, cancel: true };
  });
  BH.Actions.define('writeGraffiti', (s, c) => { BH.Screens.writing.carveForm(c.map, c.obj); return { noTime: true, cancel: true }; });
  BH.Actions.define('writeLetter', () => { BH.Screens.writing.letterForm(); return { noTime: true, cancel: true }; });
  BH.Actions.define('boardPlayers', () => { BH.Screens.writing.board(); return { noTime: true, cancel: true }; });
  BH.Actions.define('debate', (s) => {
    if (s.today.flags.debated) return { text: 'The Debate Society don meet today. Come back tomorrow.', cancel: true };
    BH.Screens.writing.debate();
    return { noTime: true, cancel: true };
  });

  BH.registerSystem('Writing', Writing);
})(window.BH);
