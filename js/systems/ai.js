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
      if (BH.Prefs.v.aiServer) return BH.Prefs.v.aiServer.replace(/\/$/, '');
      return /^https?:/.test(location.protocol) ? '' : 'http://localhost:8787';
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
          playerId: s.player.playerId, npc: AI.npcFacts(s, npc), player: AI.playerFacts(s, [factsExtra, BH.NPC.memories && npc && npc.id ? BH.NPC.memories(s, npc).slice(-4).map((m) => `You remember (${m}).`).join(' ') : ''].filter(Boolean).join(' ')), situation, vars, ctx,
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
      if (has(/\b(how far|hello|hi|good (morning|afternoon|evening))\b/)) return out(`${name}: "${U.pick(['How far!', 'I dey o.', 'Good day.'])}"`);
      if (has(/\b(thank|thanks|god bless)\b/)) return out(`${name}: "No wahala."`, 'none', { relationship_change: 1 });
      if (has(/\b(stupid|mumu|idiot|ugly|shut up)\b/)) return out(`${name}: "Who you dey call that one?!"`, 'none', { emotion: 'angry', relationship_change: -4 });
      return out(`${name}: ${U.pick(['"Hmm. Okay o."', '"I hear you."', '"Wetin you mean?"', '"Na so."'])}`);
    },

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
