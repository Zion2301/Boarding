/* Client side of the AI layer. The browser never talks to Anthropic — only to the game server's /api.
   - BH.AI.chat(): NPC conversation turn → { reply, emotion, action, relationship_change, effects } (validated by the server)
   - falls back to an offline intent matcher when the server/AI is off, rate-limited or unreachable
   - BH.AI.apply(): applies the SERVER-validated effects through the normal game systems
   Settings: Prefs.aiOn (player toggle), Prefs.aiServer (server URL when the game is opened from file://). */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const M = () => window.BHModeration;

  const AI = {
    status: null,
    lastCheck: 0,

    base() {
      const b = BH.Server && BH.Server.base();
      if (b) return b === location.origin ? '' : b;
      return 'http://localhost:8787';
    },
    playerOn() { return BH.Prefs.v.aiOn !== false; },

    async request(path, body, timeout = 15000) {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = ctl && setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(AI.base() + path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: ctl && ctl.signal });
        if (!r.ok) return { fallback: true, why: `http_${r.status}` };
        return await r.json();
      } catch (e) {
        return { fallback: true, why: 'offline' };
      } finally { if (t) clearTimeout(t); }
    },
    /* Is the AI available right now? (cached for 60 s) */
    async check(force) {
      if (!force && AI.status && Date.now() - AI.lastCheck < 60000) return AI.status;
      AI.lastCheck = Date.now();
      const s = BH.Game.s;
      const r = await AI.request(`/api/status?playerId=${encodeURIComponent((s && s.player.playerId) || '')}`, null, 4000);
      AI.status = r && r.ok ? r : { ok: false };
      return AI.status;
    },
    online() { return !!(AI.status && AI.status.ok); },
    available() { return AI.playerOn() && AI.online() && AI.status.ai; },

    /* ---------- facts the server needs (it builds the character from content/characters.json) ---------- */
    npcFacts(s, n) {
      if (!n) return {};
      if (n.contact) return { id: n.contact, contact: n.contact, name: n.name, rel: n.rel ?? 60 };
      const f = { id: n.id, type: n.type, role: n.role || null, name: BH.NPC.name(n), gender: n.gender, rel: Math.round(n.rel ?? 50) };
      if (n.type === 'teacher') Object.assign(f, { subjectName: (n.subjects || [n.subject]).map((c) => BH.Academics.name(s, c)).join(' and '), style: n.style || (n.strict >= 0.7 ? 'strict' : n.strict <= 0.4 ? 'kind' : 'default'), formClass: n.formClass || null });
      if (n.type === 'senior') Object.assign(f, { level: String(n.level).replace('SS', ''), roleLabel: D.SENIOR_ROLES[n.role] && D.SENIOR_ROLES[n.role].label });
      if (n.type === 'classmate') { const a = D.ARCHETYPES[n.arch]; Object.assign(f, { archLabel: BH.NPC.label(n), archDesc: a ? a.desc : '', prefect: n.prefect || null }); }
      if (n.type === 'junior') f.level = n.level;
      // key characters: the server adds their personality, voice, goal (and their secret once trust is high) from content/cast.json
      if (n.key) Object.assign(f, { key: true, trust: Math.round(n.trust || 0), rivalry: Math.round(n.rivalry || 0), respect: Math.round(n.respect || 0), bestie: !!(BH.Story && BH.Story.isBestie(s, n.id)), arc: s.story && s.story.arcs[n.id] ? s.story.arcs[n.id].state : null });
      return f;
    },
    playerFacts(s, extra = '') {
      const st = s.stats;
      const low = Object.keys(st).filter((k) => st[k] < 25).map((k) => BH.Stats.LABELS[k].toLowerCase());
      return {
        name: s.player.name.split(' ')[0], level: BH.Time.levelName(s), gender: s.player.gender, house: s.player.house.name,
        background: D.BACKGROUNDS[s.player.background].label,
        facts: [`It is ${BH.Clock.label(s)} (${BH.Time.block(s).title}).`, low.length ? `They look ${low.join(', ')}-deprived.` : '', s.discipline.points >= 10 ? 'They have a thick discipline file.' : '', s.today.flags.excused ? 'The nurse excused them earlier today.' : '', extra].filter(Boolean).join(' '),
      };
    },

    /* ---------- a conversation turn ---------- */
    async chat({ npc, situation, vars = {}, ctx = {}, history = [], text, factsExtra }) {
      const s = BH.Game.s;
      const mod = M() ? M().moderate(text, { context: 'private', max: 500 }) : { verdict: 'ok', text };
      if (mod.distress) return { distress: true, reply: null };
      if (mod.verdict === 'blocked') return { blocked: true, explain: M().explain(mod.reasons) };
      if (AI.available()) {
        const r = await AI.request('/api/npc/chat', {
          playerId: s.player.playerId, npc: AI.npcFacts(s, npc), player: AI.playerFacts(s, [factsExtra, BH.NPC.memories && npc && npc.id ? BH.NPC.memories(s, npc).slice(-4).map((m) => `You remember (${m}).`).join(' ') : '', BH.Story && npc && npc.id ? BH.Story.memoryOf(s, npc.id).map((m) => `Between you: ${m}.`).join(' ') : ''].filter(Boolean).join(' ')), situation, vars, ctx,
          history: history.map((h) => ({ role: h.who === 'me' ? 'user' : 'npc', text: h.text })), text: mod.text,
        });
        if (r && !r.fallback) return Object.assign(r, { source: r.cached ? 'cache' : 'ai' });
        if (r && r.why === 'daily_budget') BH.UI.toast('🧠 AI chat limit reached for today — NPCs go use their old lines.', 'info');
      }
      return Object.assign(AI.offline(situation, mod.text, { npc, vars, ctx }), { source: 'offline' });
    },

    /* Offline "intent matcher": keywords → a sensible preset outcome (same shape as the server's answer) */
    offline(situation, text, { npc, vars }) {
      const t = String(text).toLowerCase();
      const out = (reply, action = 'none', extra = {}) => Object.assign({ reply, emotion: 'neutral', action, relationship_change: 0, effects: { money: 0, items: {}, discountPct: 0, punish: null, excuse: null, mission: null, knowledge: 0, end: false } }, extra);
      const name = npc && (npc.contact ? npc.name : BH.NPC.name(npc));
      const has = (re) => re.test(t);
      if (situation === 'excuse') {
        const sev = (vars && vars.maxSeverity) || 1;
        const luck = Math.random();
        if (has(/\b(sick|nurse|matron|sick ?bay|vomit|malaria|headache|stomach)\b/)) return luck < 0.6 ? out('"Sick bay? Hmm. I will confirm with Matron. Go, and don\'t let it happen again."', 'accept_excuse', { emotion: 'suspicious', effects: Object.assign(out('').effects, { excuse: 'accepted' }) }) : out('"Matron did not mention you. Kneel down there."', 'reject_excuse', { emotion: 'suspicious', effects: Object.assign(out('').effects, { excuse: 'rejected', punish: { severity: sev } }) });
        if (has(/\b(sorry|forgive|my fault|overslept|i slept|i'?m late|apolog)/)) return out('"At least you are honest. This is a warning — next time you kneel."', 'warn', { emotion: 'annoyed', effects: Object.assign(out('').effects, { excuse: 'warned' }) });
        if (has(/\b(teacher|sir sent|ma sent|principal|helping|carry|errand)\b/)) return luck < 0.5 ? out('"Which teacher? …Fine. Go. I will ask."', 'accept_excuse', { effects: Object.assign(out('').effects, { excuse: 'accepted' }) }) : out('"Every day one teacher sent you. Stand on one leg."', 'reject_excuse', { effects: Object.assign(out('').effects, { excuse: 'rejected', punish: { severity: sev } }) });
        if (has(/\b(stupid|shut up|nonsense|mumu|idiot|who are you)\b/)) return out('"You dare talk to me like that?!"', 'punish', { emotion: 'angry', relationship_change: -6, effects: Object.assign(out('').effects, { excuse: 'rejected', punish: { severity: Math.min(3, sev + 1) } }) });
        return out('"Is that so? I have heard that one before."', 'reject_excuse', { emotion: 'suspicious', effects: Object.assign(out('').effects, { excuse: 'rejected', punish: { severity: sev } }) });
      }
      if (situation === 'haggle') {
        if (has(/\b(please|abeg|my customer|loyal|mama|discount|reduce|last price)\b/) && Math.random() < 0.6) return out('"Because you get sweet mouth, I go remove small."', 'discount', { emotion: 'amused', effects: Object.assign(out('').effects, { discountPct: 10 }) });
        return out('"Price na price. Buy or comot."', 'refuse');
      }
      if (situation === 'ask_subject') return out(`${name}: "Good question. Come to the staff room after class and I will explain it properly." (AI is off — no answer this time.)`);
      if (situation === 'letter' || situation === 'text_reply') return out(U.pick(['"My dear, we are praying for you. Read your books and eat well."', '"Ehen! Behave yourself o. We miss you."', '"Your cousin Chidinma came first in her class. What about you?"']));
      // a bigger offline reply bank: topic → what this kind of person would say back
      const grp = !npc ? 'student' : npc.type === 'teacher' ? 'teacher' : npc.type === 'staff' ? 'staff' : npc.type === 'senior' && BH.Game.s.time.year <= 3 ? 'senior' : npc.type === 'junior' ? 'junior' : 'student';
      const me = BH.Game.s.player.name.split(' ')[0];
      if (/\b(what('?s| is) the time|wetin be the time|what time)\b/.test(t)) return out(`${name}: "${U.pick(['E don reach', 'Na', 'My watch say'])} ${BH.Clock.label(BH.Game.s)}. ${BH.Clock.info(BH.Game.s).next ? `Next bell: ${BH.Clock.info(BH.Game.s).next.title}.` : ''}"`);
      for (const [re, by, rc] of AI.TOPICS) {
        if (!re.test(t)) continue;
        const pool = by[grp] || by.any || by.student;
        if (!pool) continue;
        return out(`${name}: "${U.pick(pool).replace(/\{me\}/g, me)}"`, 'none', { relationship_change: rc || 0, emotion: rc < 0 ? 'angry' : rc > 0 ? 'happy' : 'neutral' });
      }
      const fallback = { student: ['Hmm. Okay o.', 'I hear you.', 'Wetin you mean?', 'Na so.', 'True talk.', 'Ehen? Continue.', 'You no serious.'], senior: ['Junior, talk straight.', 'Hmm. Go and read your book.', 'Is that so?'], junior: ['Yes, Senior!', 'Okay, Senior.', 'I understand, Senior.'], teacher: ['Hmm. Speak clearly.', 'I see. Go back to class.', 'Is that a question or a statement?'], staff: ['Okay, my pikin.', 'Hmm. Go well.', 'I hear you.'] };
      return out(`${name}: "${U.pick(fallback[grp] || fallback.student)}"`);
    },

    /* [pattern, {student|senior|junior|teacher|staff|any: replies}, relationship change] — first match wins */
    TOPICS: [
      [/\b(how far|hello|hi+|hey|good (morning|afternoon|evening)|sup|wassup)\b/, { student: ['How far!', 'I dey o. You nko?', 'Ehen, {me}! Wetin dey?', 'My person!'], senior: ['Junior. You greet?', 'Hmm. Good afternoon to you too.', 'Yes, junior?'], junior: ['Good afternoon, Senior!', 'Senior! How are you?', 'Senior, welcome!'], teacher: ['Good day. Is your homework done?', 'Hello. Walk, don\'t run.', 'Good day, {me}.'], staff: ['My pikin! How you dey?', 'Sannu. Go well.', 'Ehen, my child. How body?'] }, 1],
      [/\b(how are you|how you dey|how body|you dey alright|are you ok)\b/, { student: ['I dey manage. This school no easy.', 'Hungry but alive.', 'I dey kampe. You?'], senior: ['I\'m fine. Why are you asking?', 'WAEC is killing me but I\'m fine.'], junior: ['I\'m fine, Senior! Thank you for asking!'], teacher: ['I\'m well, thank you. And your studies?'], staff: ['God dey. My back dey pain, but God dey.', 'I thank God, my pikin.'] }, 1],
      [/\b(thank|thanks|thank you|tanx|god bless)\b/, { any: ['No wahala.', 'Anytime!', 'Na nothing.', 'You\'re welcome.'], junior: ['Thank YOU, Senior!'], teacher: ['You\'re welcome. Use it well.'] }, 1],
      [/\b(sorry|my bad|forgive|apolog)/, { student: ['It\'s fine. Just don\'t do am again.', 'I forgive you. Small small.', 'Okay. We dey.'], senior: ['Hmm. Next time, think first.', 'Sorry is accepted. This time.'], junior: ['It\'s okay, Senior!'], teacher: ['Apology accepted. Now show me with your actions.'], staff: ['No wahala, my pikin.'] }, 2],
      [/\b(hungry|food|chop|eat|rice|beans|garri|jollof|bread|meat)\b/, { student: ['Don\'t talk about food, my stomach go hear you.', 'If you see food, call me first.', 'The beans today get stone inside.', 'I fit kill for jollof right now.'], senior: ['Bring me some if you see.', 'Go to the dining hall, not to me.'], junior: ['Senior, I have biscuit, you want?'], teacher: ['Eat well. A hungry brain learns nothing.'], staff: ['Go dining hall quick before the food finish.', 'You never chop? Haba!'] }],
      [/\b(home|mum|mom|mummy|mother|dad|daddy|father|family|miss)\b/, { student: ['I miss home too. Every night.', 'Visiting Day go soon come.', 'My mama dey call me "my baby" for phone. Embarrassing but sweet.'], senior: ['Everybody misses home. You\'ll survive.', 'Write them a letter. It helps.'], junior: ['I miss my mummy, Senior…'], teacher: ['Your family is proud of you. Make it worth it.'], staff: ['My pikin, them dey pray for you. Hold your head.'] }, 1],
      [/\b(exam|test|waec|bece|jamb|neco|read|study|homework|assignment|note)\b/, { student: ['Abeg no remind me. I never read anything.', 'Make we read together after prep.', 'I don pray. Na reading remain.'], senior: ['Read now, thank me later.', 'WAEC is no joke. Start early.'], junior: ['Senior, help me with my assignment please!'], teacher: ['Have you started reading? Start today.', 'Past questions are in the library. Use them.'], staff: ['Read your book, my pikin. Na your future be that.'] }],
      [/\b(football|ball|match|goal|chelsea|arsenal|barca|madrid|eagles|sport|race|run)\b/, { student: ['Football after siesta! You dey?', 'Our house go carry the cup this year.', 'I fit run pass you any day.'], senior: ['Join the house team if you can run.', 'Football is my medicine.'], junior: ['Senior, can I play in your team?'], teacher: ['Sports are good. After your homework.'], staff: ['Baba Sunday dey listen the match for his radio. Ask am the score.'] }, 1],
      [/\b(joke|funny|laugh|lol|lmao|haha)/, { student: ['Why did the JSS1 boy carry ladder to class? E hear say na HIGH school!', 'You don hear the one about the beans and the weevil?', 'Your face sef na joke.'], senior: ['Junior, this is not comedy hour.', 'Ha. Okay, that was small funny.'], junior: ['Hahaha Senior, you\'re funny!'], teacher: ['Laughter is good. Not in my class.'], staff: ['You this pikin! You wan kill me with laugh?'] }, 1],
      [/\b(love|crush|like you|like me|girlfriend|boyfriend|date|kiss|marry)\b/, { student: ['Abeg! Focus on your books.', 'Love? For this school? With this beans?', 'Ehn, I no dey that kind gist. Mind your business.'], senior: ['Junior, focus on your books.', 'Love can wait. WAEC cannot.'], junior: ['Senior?! 😳 I\'m going to class!'], teacher: ['Focus on your studies, please.'], staff: ['My pikin, book first. Everything else later.'] }],
      [/\b(money|borrow|lend|naira|cash|broke)\b/, { student: ['Money? Me sef dey find money.', 'I fit lend you ₦50, but you go pay o.', 'Na Osas get money. Ask am.'], senior: ['Junior, do I look like a bank?', 'Go and ask your parents.'], junior: ['Senior, I only have ₦20…'], teacher: ['Speak to the bursar if there is a fees issue.'], staff: ['Money no dey grow for tree, my pikin.'] }],
      [/\b(ghost|haunted|spirit|witch|old lab)\b/, { student: ['Abeg no talk ghost for night!', 'I hear the old lab ghost get white cloth.', 'Ghost no dey. …Right?'], senior: ['Ghost story na for JSS1. Grow up.', 'Don\'t go near the old lab at night. Just saying.'], junior: ['Senior, you\'re scaring me!'], teacher: ['There are no ghosts. Only students who don\'t read.'], staff: ['Baba Sunday fear that old lab pass anything.'] }],
      [/\b(bored|boring|nothing to do|tired|sleepy|sleep)\b/, { student: ['Same. Make we play Ayo.', 'Siesta never reach? I wan sleep.', 'Boredom go kill me before WAEC.'], senior: ['Bored? Go and sweep then.', 'Sleep is a luxury, junior.'], junior: ['Senior, you want to play ten-ten?'], teacher: ['Boredom is a choice. Open a book.'], staff: ['Go sleep small, my pikin. Your eye don red.'] }],
      [/\b(sad|cry|lonely|alone|upset|depressed|stressed|scared)\b/, { student: ['You no dey alone. I dey here.', 'Come sit with me at dinner.', 'E go better. I promise you.'], senior: ['Talk to me, junior. What happened?', 'It gets lighter. Trust me.'], junior: ['Senior, are you okay? You can talk to me.'], teacher: ['My door is open. Come and talk to me after class.'], staff: ['Come, my pikin. Sit down. Talk to me.', 'Nurse Grace and the chaplain/imam are there for you too.'] }, 1],
      [/\b(teacher|principal|vp|house ?master|matron|nurse|bursar)\b/, { student: ['That one? Strict no be small.', 'Shhh, them fit hear you.', 'I hear say e dey kind sha, inside inside.'], senior: ['Respect the teachers. Mostly.'], junior: ['Senior, which teacher is the nicest?'], teacher: ['Speak respectfully about your teachers.'], staff: ['Hmm. I no dey talk about oga for back.'] }],
      [/\b(gist|news|what happen|wetin happen|rumou?r|tell me)\b/, { student: ['Ehen! You hear say somebody see ghost for toilet?', 'They say two people dey write each other letters. I no fit talk who.', 'Mama Tuck-shop don increase price again!'], senior: ['Gist? Mind your own business, junior.', 'Somebody\'s going to be expelled soon. That\'s all I\'ll say.'], junior: ['Senior! They said the new JSS1 boy cried for three hours!'], teacher: ['Gossip is not a subject. Read.'], staff: ['I see everything. I talk nothing.'] }],
      [/\b(music|song|sing|dance|afrobeats|dj|social night)\b/, { student: ['Social Night this Saturday! You dey come?', 'Sing me something.', 'That song wey dem play last week? Fire!'], senior: ['Social Night is for those who finished their assignment.'], junior: ['Senior, can you dance?'], teacher: ['Music is good for the soul. And for memory.'], staff: ['Na Baba Sunday radio dey give us music for night.'] }, 1],
      [/\b(pray|god|church|mosque|allah|jesus|fellowship|amen)\b/, { student: ['Amen o! Pray for me too.', 'We dey pray for this exam.', 'God go see us through.'], senior: ['Pray and read. Both.'], junior: ['Amen, Senior!'], teacher: ['Faith and hard work. Both are needed.'], staff: ['Amen. God dey with you.', 'Allah ya kiyaye.'] }, 1],
      [/\b(help|assist|abeg)\b/, { student: ['Wetin you need? Talk am.', 'If I fit help, I go help.'], senior: ['What do you need, junior?'], junior: ['I\'ll help you, Senior!'], teacher: ['Come to the staff room after class.'], staff: ['Wetin happen, my pikin? Talk.'] }, 1],
      [/\b(stupid|mumu|idiot|ugly|shut up|fool|dumb|olodo)\b/, { student: ['Who you dey call that one?!', 'Your papa!', 'Better watch your mouth.'], senior: ['Junior, you\'re finished. Frog jump. Now.', 'Say that again. I dare you.'], junior: ['Senior… why?'], teacher: ['That is disrespectful. Out of my sight.'], staff: ['Haba! Na so dem train you?'] }, -4],
      [/\b(bye|goodbye|see you|later|good ?night)\b/, { any: ['Later!', 'Go well.', 'See you.'], junior: ['Bye, Senior!'], teacher: ['Go and read.'], staff: ['Go well, my pikin.', 'Sai anjima.'] }],
      [/\?$/, { student: ['Hmm. Good question. I no know.', 'Why you dey ask me?', 'Na God know.'], senior: ['Why are you asking me questions?'], junior: ['I don\'t know, Senior!'], teacher: ['Look it up in your textbook.'], staff: ['I no sabi, my pikin.'] }],
    ],

    /* Apply server-validated (or offline) effects to the game. Returns notes for the UI. */
    apply(s, npc, r) {
      const notes = [];
      if (!r || !r.effects) return notes;
      const fx = r.effects;
      if (r.relationship_change && npc && !npc.contact) BH.NPC.rel(s, npc, r.relationship_change);
      if (npc && npc.contact && r.relationship_change && s.family) s.family[npc.contact === 'mummy' ? 'mummy' : npc.contact === 'daddy' ? 'daddy' : 'sibling'] = U.clamp((s.family[npc.contact] || 50) + r.relationship_change);
      if (fx.money) { BH.Stats.money(s, fx.money); notes.push(`+${U.money(fx.money)}`); }
      Object.entries(fx.items || {}).forEach(([id, n]) => { if (D.ITEMS[id]) { BH.Inv.add(s, id, n); notes.push(`+${n} ${D.ITEMS[id].emoji}`); } });
      if (fx.discountPct) { s.today.flags.discount = { pct: fx.discountPct, uses: 3 }; notes.push(`🏷️ ${fx.discountPct}% off your next buys`); }
      if (fx.mission) { const m = BH.Missions.assign(s, fx.mission, { vars: { giver: npc && npc.id } }); if (m) notes.push(`📜 ${m.title}`); }
      if (fx.knowledge && npc && npc.subject) { BH.Academics.study(s, BH.NPC.subjectFor(s, npc), fx.knowledge * 2, true); notes.push(`📖 +knowledge`); }
      return notes;
    },

    /* ---------- grading & debates ---------- */
    async grade(question, answer) {
      const s = BH.Game.s;
      const mod = M().moderate(answer, { context: 'private', max: 1200 });
      if (mod.distress) return { distress: true };
      if (AI.available()) {
        const r = await AI.request('/api/grade', { playerId: s.player.playerId, questionId: question.id, level: BH.Time.levelName(s), answer: mod.text }, 40000);
        if (r && !r.fallback && !r.error) return Object.assign(r, { source: 'ai' });
        if (r && r.distress) return r;
      }
      return Object.assign(AI.offlineGrade(question, mod.text), { source: 'offline' });
    },
    offlineGrade(Q, answer) {
      const a = String(answer).toLowerCase();
      const words = a.split(/\W+/).filter(Boolean).length;
      const hit = Q.keyPoints.filter((k) => k.toLowerCase().split(/\W+/).filter((w) => w.length > 4 && !['their', 'which', 'about', 'other', 'gives'].includes(w)).some((w) => a.includes(w)));
      let score = Math.round((hit.length / Q.keyPoints.length) * Q.marks);
      if (words < 8) score = Math.min(score, 1);
      score = Math.max(0, Math.min(Q.marks, score));
      return { score, out_of: Q.marks, comment: `(Marked by hand) ${score >= Q.marks * 0.7 ? 'Good. You covered the main points.' : score >= Q.marks * 0.4 ? 'Fair. Some key points are missing.' : 'Weak. Read your notes again.'}`, strengths: hit.slice(0, 2), improvements: Q.keyPoints.filter((k) => !hit.includes(k)).slice(0, 2) };
    },
    async debate(motion, side, argument) {
      const s = BH.Game.s;
      const mod = M().moderate(argument, { context: 'private', max: 1200 });
      if (mod.distress) return { distress: true };
      if (AI.available()) {
        const r = await AI.request('/api/debate', { playerId: s.player.playerId, motionId: motion.id, side, argument: mod.text }, 40000);
        if (r && !r.fallback && !r.error) return Object.assign(r, { source: 'ai' });
      }
      const len = mod.text.split(/\W+/).filter(Boolean).length;
      const reasons = (mod.text.match(/\b(because|firstly|secondly|for example|therefore|however|in conclusion|also)\b/gi) || []).length;
      const p = Math.max(4, Math.min(28, Math.round(len / 6) + reasons * 2 + U.randInt(-2, 2)));
      const o = U.randInt(14, 20);
      return { player_score: p, opponent_score: o, winner: p > o ? 'player' : p < o ? 'opponent' : 'tie', comment: '(Judged by the teachers on duty) ' + (p > o ? 'A convincing performance!' : 'Good effort — give more reasons and examples.'), source: 'offline' };
    },

    /* ---------- shared text (noticeboard, graffiti, shirts, slam books) ---------- */
    async post(path, body) {
      const s = BH.Game.s;
      if (!AI.online()) return { offline: true };
      return AI.request(path, Object.assign({ playerId: s.player.playerId, schoolId: s.player.schoolName, author: s.player.name.split(' ')[0] }, body));
    },
    async get(path) { if (!AI.online()) return { offline: true }; return AI.request(path); },
    report(itemType, itemId, subId, reason) { return AI.post('/api/report', { itemType, itemId, subId, reason: reason || 'reported in game' }); },

    /* game lifecycle */
    onNewGame(s) { s.player.playerId = s.player.playerId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : U.uid() + U.uid() + U.uid()); AI.check(true); },
    onLoad(s) { AI.onNewGame(s); },
  };

  BH.registerSystem('AI', AI);
})(window.BH);
