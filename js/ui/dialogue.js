/* RPG dialogue box (bottom of screen): portrait + name + text + choices.
   Choices only appear inside real conversations — talking to NPCs, answering someone who called you,
   forced life events (collapsing, report card). Every conversation has a way to walk away. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const P = () => BH.Panels;
  const UI = () => BH.UI;

  const portraitOf = (s, n) => (n.type === 'staff' ? { emoji: n.emoji } : { img: BH.Sprites.portrait(BH.Sprites.npcLook(s, n), n.id) });

  const Dialogue = {
    st: null,
    SKIP: { skip: true },

    show(st) {
      Dialogue.st = st;
      if (P().isOpenKind('dialogue')) P().refresh();
      else P().open(() => Dialogue.render(), { cls: 'dialogue', kind: 'dialogue', locked: true });
    },

    render() {
      const d = Dialogue.st;
      if (!d) return '';
      const portrait = d.portrait && d.portrait.img ? `<img src="${d.portrait.img}" alt="">` : `<span>${(d.portrait && d.portrait.emoji) || '💬'}</span>`;
      const choices = (d.choices || []).map((c, i) => `
        <button class="dlg-choice ${c.ghost ? 'ghost' : ''} ${c.primary ? 'primary' : ''}" data-act="dlgPick" data-arg="${i}" ${c.disabled ? 'disabled' : ''}>
          <span class="c-label">${U.esc(c.label)}</span>${c.sub ? `<span class="c-sub">${U.esc(c.sub)}</span>` : ''}
        </button>`).join('');
      return `<div class="dlg ${d.mode === 'outcome' ? 'is-outcome' : ''} ${d.cinematic ? 'cinematic' : ''}">
        <div class="dlg-head">
          <div class="dlg-portrait ${d.portrait && d.portrait.img ? 'img' : ''}">${portrait}</div>
          <div class="dlg-name"><b>${U.esc(d.name || '')}</b>${d.sub ? `<small>${U.esc(d.sub)}</small>` : ''}</div>
        </div>
        <div class="dlg-text">${UI().md(d.text || '')}</div>
        ${d.fx ? UI().fxChips(d.fx) : ''}
        <div class="dlg-choices">${choices}</div>
      </div>`;
    },

    pick(i) { const c = Dialogue.st && Dialogue.st.choices[i]; if (!c || c.disabled) return; c.onPick(); },
    close() { document.body.classList.remove('letterbox'); Dialogue.st = null; P().closeKind('dialogue', true); BH.Store.changed(); },

    outcome({ text, fx, then, label }) {
      const d = Dialogue.st || {};
      if (fx && fx.some((f) => f.icon === '₦' && f.amount > 0)) BH.Sound.play('coin');
      if (fx && fx.some((f) => f.amount < 0 && ['❤️', '😎'].includes(f.icon) && f.amount <= -5)) BH.Sound.play('bad');
      Dialogue.show(Object.assign({}, d, { mode: 'outcome', text: text || '…', fx, choices: [{ label: label || 'Continue ▶', primary: true, onPick: then }] }));
    },
    say({ portrait, name, sub, text, label, then }) {
      Dialogue.show({ portrait, name, sub, text, mode: 'outcome', choices: [{ label: label || 'OK ▶', primary: true, onPick: () => { Dialogue.close(); then && then(); } }] });
    },
    /* run something that changes state, show the result, then continue */
    act(fn, then) {
      const s = BH.Game.s;
      BH.fx.begin();
      let r = fn();
      const fx = BH.fx.end();
      if (r === Dialogue.SKIP) return;
      if (r && r.offer) { Dialogue.offer(r.offer); return; }
      if (r && typeof r === 'object') r = r.text;
      BH.Save.save(s);
      if (s.gameOver) { Dialogue.close(); UI().go('gameover'); return; }
      Dialogue.outcome({ text: r || 'Done.', fx, then: then || (() => Dialogue.close()) });
    },

    /* ---------- forced events (body collapses, report cards, big school decisions) ---------- */
    event() {
      const s = BH.Game.s;
      const v = BH.Events.view(s);
      if (!v || P().isOpen()) return;
      const npc = v.q.ctx && (v.q.ctx.npc || v.q.ctx.j) && BH.NPC.get(s, v.q.ctx.npc || v.q.ctx.j);
      BH.Sound.play('notify');
      document.body.classList.toggle('letterbox', !!v.e.cinematic);
      Dialogue.show({
        portrait: npc ? portraitOf(s, npc) : { emoji: v.e.emoji }, name: v.e.title, sub: npc ? `${BH.NPC.name(npc)} · ${BH.NPC.label(npc)}` : v.e.cinematic ? '✨ A moment you will remember' : '⚡ Something don happen',
        text: v.text, mode: 'choices', cinematic: !!v.e.cinematic,
        choices: v.choices.map((c, i) => ({
          label: c.label, sub: c.sub,
          onPick: () => {
            BH.fx.begin();
            const res = BH.Events.resolve(s, i);
            const fx = BH.fx.end();
            BH.Save.save(s);
            Dialogue.outcome({
              text: res && typeof res === 'object' ? res.text : res, fx,
              then: () => {
                Dialogue.close();
                if (s.gameOver) { UI().go('gameover'); return; }
                if (res && typeof res === 'object' && res.report !== undefined) setTimeout(() => BH.actions.viewReport(res.report), 200);
              },
            });
          },
        })),
      });
    },

    /* ---------- optional events: answering someone who called you, or a happening ---------- */
    callEvent(call) {
      const s = BH.Game.s;
      const v = BH.Events.viewCall(s, call);
      if (!v) return;
      const npc = call.npc && BH.NPC.get(s, call.npc);
      const choices = v.choices.map((c, i) => ({
        label: c.label, sub: c.sub,
        onPick: () => Dialogue.act(() => BH.Events.resolveCall(s, call, i), () => Dialogue.close()),
      }));
      choices.push({ label: '🚶 Walk away', sub: 'Ignore it — and live with it', ghost: true, onPick: () => Dialogue.close() });
      Dialogue.show({ portrait: npc ? portraitOf(s, npc) : { emoji: v.e.emoji }, name: v.e.title, sub: npc ? `${BH.NPC.name(npc)} · ${BH.NPC.label(npc)}` : `⏱ ${BH.Clock.until(call.expires - BH.Clock.abs(s))} to deal with it`, text: v.text, choices, mode: 'choices' });
    },

    /* ---------- a mission someone offers you ---------- */
    offer(m) {
      const s = BH.Game.s;
      const giver = BH.NPC.get(s, m.vars.giver);
      const t = BH.Missions.tpl(m.tpl);
      const due = BH.Missions.deadline(s, t.deadline);
      const back = () => (giver ? Dialogue.npc(giver.id) : Dialogue.close());
      Dialogue.show({
        portrait: giver ? portraitOf(s, giver) : { emoji: m.emoji }, name: `${m.emoji} ${m.title}`, sub: `⏱ Due ${BH.Clock.timeLabel(due % 1440)}${due - BH.Clock.abs(s) > 1440 ? ` (in ${BH.Clock.until(due - BH.Clock.abs(s))})` : ''}`,
        text: `${m.desc}${m.hints.length ? `\n\n💡 ${m.hints.join(' · ')}` : ''}`, mode: 'choices',
        choices: [
          { label: '✅ "No wahala, I go do am"', primary: true, onPick: () => { BH.Missions.accept(s, m); BH.WorldSim.dropCall(s, m.id); BH.HUD.waypoint = m.id; Dialogue.close(); } },
          { label: '🙅 Refuse', sub: 'They will remember', onPick: () => Dialogue.act(() => { BH.Missions.refuse(s, m); return giver ? `${BH.NPC.name(giver)}: "${U.pick(['You get mind o.', 'Ehen? Okay. I go remember this.', 'No problem. I go find another person.'])}"` : 'You refuse.'; }, back) },
          { label: '🚶 Walk away (decide later)', sub: m.status === 'offered' ? 'Ignoring them has consequences too' : '', ghost: true, onPick: () => Dialogue.close() },
        ],
      });
    },

    /* ---------- talking to an NPC ---------- */
    npc(id) {
      const s = BH.Game.s;
      const N = BH.NPC;
      const n = N.get(s, id);
      if (!n) return;
      BH.bus.emit('npc:talk', { npc: n.id });
      const call = BH.WorldSim.callFrom(s, id);
      if (call && call.kind === 'event') return Dialogue.callEvent(call);
      if (call && call.kind === 'mission') { const m = s.missions.find((x) => x.id === call.mid && x.status === 'offered'); if (m) return Dialogue.offer(m); }
      if (call && call.kind === 'excuse') return BH.Excuse.fromCall(s, call);
      if (n.type === 'staff' && n.dialogue && BH.Content.get('dialogue').trees[n.dialogue]) return Dialogue.tree(n, 'start');
      if (n.type === 'staff' && n.role === 'houseMaster') return Dialogue.tree(n, 'start', 'houseMaster');
      const lines = BH.Content.get('dialogue').greet;
      const greetKey = n.type === 'senior' && s.time.year >= 4 ? 'seniorAsSenior' : n.type;
      const greet = U.fill(U.seedPick(lines[greetKey] || ['"Hello."'], n.id + s.time.block), { me: s.player.name.split(' ')[0] });
      const can = N.canTalk(s, n);
      const why = 'You don yarn with am today';
      const act = (fn) => () => Dialogue.act(() => fn(s, n), () => Dialogue.npc(id));
      const choices = [];
      if (n.type === 'classmate') {
        choices.push({ label: '💬 Gist', disabled: !can, sub: can ? 'Morale & friendship' : why, onPick: act(N.gist) });
        choices.push({ label: '📚 Ask for help', disabled: !can, sub: can ? 'Brilliant ones fit help' : why, onPick: act(N.askHelp) });
      } else if (n.type === 'senior') {
        if (s.time.year <= 3) choices.push({ label: '🙇 Greet', disabled: !can, sub: can ? 'Small favour' : why, onPick: act(N.greetSenior) });
        else choices.push({ label: '💬 Gist', disabled: !can, sub: can ? '' : why, onPick: act(N.gist) });
      } else if (n.type === 'junior') {
        choices.push({ label: '😇 Encourage', disabled: !can, sub: can ? 'Kind senior' : why, onPick: act(N.encourageJunior) });
        choices.push({ label: '🫵 Send on errand', disabled: !can, sub: can ? 'Wicked senior · + Rest' : why, onPick: act(N.sendJunior) });
      } else if (n.type === 'teacher') {
        choices.push({ label: '👋 Greet', disabled: !can, sub: can ? 'Teachers like respect' : why, onPick: act(N.greetTeacher) });
        choices.push({ label: '🗣️ Report something', sub: 'Snitch to a teacher', onPick: () => Dialogue.snitchMenu(id) });
      }
      if (n.type !== 'teacher') choices.push({ label: '🎁 Give something', onPick: () => Dialogue.shareMenu(id) });
      BH.collect('talkOptions', s, n).forEach((o) => choices.push({
        label: o.label, sub: o.disabled || o.sub, disabled: !!o.disabled,
        onPick: () => Dialogue.act(() => o.run(), () => Dialogue.npc(id)),
      }));
      // free typing (AI) for the people who matter: key characters, seniors, teachers & staff — background students keep preset chat
      if (n.key || ['teacher', 'staff'].includes(n.type) || (n.type === 'senior' && !n.crowd)) choices.push(...Dialogue.freeText(s, n));
      choices.push({ label: 'ℹ️ About', ghost: true, onPick: () => { Dialogue.close(); BH.actions.profile(id); } });
      choices.push({ label: '🚶 Walk away', ghost: true, onPick: () => Dialogue.close() });
      const where = BH.Schedule.placeLabel(s, n);
      const memo = BH.Story && BH.Story.callback(s, n); // "You remember JSS2? You sold me out."
      const bond = BH.Story ? BH.Story.bondLabel(n) : '';
      Dialogue.show({ portrait: portraitOf(s, n), name: `${BH.Story && BH.Story.isBestie(s, n.id) ? '💛 ' : ''}${N.fullName(n)}${n.nick && n.key ? ` "${n.nick.replace(/^.*"(.*)"$/, '$1')}"` : ''}`, sub: `${N.label(n)} · ${N.relLabel(n)} · ${Math.round(n.rel)}/100${bond ? ' · ' + bond : ''}`, text: `${n.type === 'teacher' ? N.name(n) : n.first}: ${memo || greet}\n\n_${where}_`, choices, mode: 'choices' });
    },

    /* staff conversation trees from content/dialogue.json */
    tree(n, nodeId, treeId) {
      const s = BH.Game.s;
      const tree = BH.Content.get('dialogue').trees[treeId || n.dialogue];
      const node = tree[nodeId];
      const back = () => Dialogue.tree(n, 'start', treeId);
      const choices = node.options.filter((o) => BH.Interaction.test(s, o.when)).map((o) => ({
        label: o.label,
        disabled: o.once && s.today.flags['once_' + o.once] ? 'Done today' : null,
        onPick: () => {
          if (o.goto) return Dialogue.tree(n, o.goto, treeId);
          Dialogue.act(() => {
            if (o.once) s.today.flags['once_' + o.once] = true;
            const notes = o.cons ? BH.Consequences.apply(s, o.cons) : [];
            if (o.do) {
              const h = BH.Actions.get(o.do);
              const r = h ? h(s, { npc: n, map: s.world.map, args: o.args || {}, action: { id: o.do } }) : null;
              if (r && r.noTime && !r.text) return Dialogue.SKIP;
              if (r && r.mins && !r.noTime) BH.Activities.busy(s, r.mins, '⏳ …');
              return r && typeof r === 'object' ? r.text : r;
            }
            return [o.text, ...notes].filter(Boolean).join(' ');
          }, back);
        },
      }));
      BH.collect('talkOptions', s, n).forEach((o) => choices.push({ label: o.label, sub: o.disabled || o.sub, disabled: !!o.disabled, onPick: () => Dialogue.act(() => o.run(), back) }));
      if (nodeId === 'start') choices.push(...Dialogue.freeText(s, n));
      if (nodeId !== 'start') choices.push({ label: '↩ Back', ghost: true, onPick: back });
      choices.push({ label: '🚶 Walk away', ghost: true, onPick: () => Dialogue.close() });
      Dialogue.show({ portrait: portraitOf(s, n), name: BH.NPC.name(n), sub: n.label, text: U.seedPick(node.text, s.time.dayCount + nodeId), choices, mode: 'choices' });
    },

    /* ✍️ Typing your own words: always offered in conversations (AI when available, preset replies otherwise) */
    freeText(s, n) {
      const out = [];
      const portrait = portraitOf(s, n);
      const open = (situation, intro, extra = {}) => () => {
        Dialogue.close();
        BH.Chat.open(Object.assign({ npc: n, name: BH.NPC.fullName(n), sub: BH.NPC.label(n), portrait, situation, intro, quick: [] }, extra));
      };
      const hi = { teacher: '"Yes? What is it?"', staff: '"Yes, my child?"', senior: '"Junior, talk."', junior: '"Senior, good afternoon!"', classmate: '"How far?"' }[n.type] || '"Yes?"';
      out.push({ label: '✍️ Say something…', sub: 'Type your own words', onPick: open('chat', `${BH.NPC.name(n)}: ${hi}`, { vars: { context: `talking near the ${BH.Schedule.placeLabel(s, n)}` } }) });
      if (n.type === 'teacher') out.push({ label: `❓ Ask about ${BH.Academics.name(s, BH.NPC.subjectFor(s, n), true)}`, sub: 'Type your question', onPick: open('ask_subject', `${BH.NPC.name(n)}: "Ask your question. Quickly."`, { vars: { subject: BH.Academics.name(s, BH.NPC.subjectFor(s, n)), level: BH.Time.levelName(s) }, placeholder: 'e.g. What is photosynthesis?' }) });
      if (n.type === 'staff' && n.role === 'keeper') out.push({ label: '🏷️ Price talk (haggle)', sub: 'Talk the price down', onPick: open('haggle', `${BH.NPC.name(n)}: "Wetin you wan buy? Price na price o."`, { vars: { item: 'provisions', price: 'shop prices' }, quick: [{ label: '🙏 "Mama abeg, reduce am"', text: 'Mama abeg, reduce the price for me, I be your regular customer.' }] }) });
      if (n.role === 'schoolParent' && s.time.year <= 3) out.push({ label: '🫂 Talk to your school parent', sub: 'Advice, protection, gist', onPick: open('chat', `${BH.NPC.name(n)}: "My pikin! How you dey? Anybody disturb you?"`, { vars: { context: 'the junior came to their school parent for advice or help' } }) });
      return out;
    },

    shareMenu(id) {
      const s = BH.Game.s;
      const n = BH.NPC.get(s, id);
      const items = BH.Inv.list(s).filter((it) => !it.tool || it.quest).slice(0, 10);
      const choices = items.map((it) => ({
        label: `${it.emoji} ${it.name} (${it.qty})`,
        onPick: () => Dialogue.act(() => {
          const r = BH.NPC.share(s, n, it.id);
          BH.bus.emit('npc:give', { npc: n.id, item: it.id, n: 1 });
          return r;
        }, () => Dialogue.npc(id)),
      }));
      choices.push({ label: '↩ Back', ghost: true, onPick: () => Dialogue.npc(id) });
      Dialogue.show(Object.assign({}, Dialogue.st, { mode: 'choices', fx: null, text: items.length ? 'Wetin you wan give?' : 'Your bag empty. 🫙', choices }));
    },

    /* Snitching: report someone you know did something */
    snitchMenu(toId) {
      const s = BH.Game.s;
      const to = toId && BH.NPC.get(s, toId);
      const now = BH.Clock.abs(s);
      const seen = (s.world.witnessed || []).filter((w) => now - w.at < 3 * 1440);
      const uniq = [];
      seen.forEach((w) => { if (!uniq.some((u) => u.npc === w.npc)) uniq.push(w); });
      const bully = BH.NPC.byArch(s, 'bully');
      if (bully && !uniq.some((u) => u.npc === bully.id)) uniq.push({ npc: bully.id, what: 'bullying juniors' });
      const choices = uniq.slice(0, 5).map((w) => {
        const n = BH.NPC.get(s, w.npc);
        return { label: `🐀 ${BH.NPC.name(n)} — ${w.what}`, sub: 'Teachers +, students −', onPick: () => Dialogue.act(() => {
          BH.Consequences.snitch(s, n, w.what);
          s.world.witnessed = s.world.witnessed.filter((x) => x.npc !== w.npc);
          return `${to ? BH.NPC.name(to) : 'The teacher'} write am down: "Thank you. We go handle it." Later, ${n.first} dey kneel for the assembly ground. Somebody go talk say na you. 🤐`;
        }, () => Dialogue.close()) };
      });
      choices.push({ label: '↩ Never mind', ghost: true, onPick: () => (to ? Dialogue.npc(to.id) : Dialogue.close()) });
      Dialogue.show(Object.assign({}, Dialogue.st, { mode: 'choices', fx: null, text: uniq.length ? 'Who you wan report?' : 'You no get anything to report.', choices }));
    },

    /* Pick a subject (study, prep) */
    pickSubject(cb) {
      const s = BH.Game.s;
      const codes = BH.Academics.codes(s);
      const choices = codes.map((c) => ({ label: `${BH.Academics.emoji(c)} ${BH.Academics.name(s, c, true)}`, sub: `Knowledge ${Math.round(s.academics.subjects[c].knowledge)}`, onPick: () => { Dialogue.close(); cb(c); } }));
      choices.push({ label: '🚶 Cancel', ghost: true, onPick: () => Dialogue.close() });
      Dialogue.show({ portrait: { emoji: '📚' }, name: 'Which subject?', sub: '', text: 'Pick what to read.', choices, mode: 'choices' });
    },
  };

  BH.actions.dlgPick = (i) => Dialogue.pick(Number(i));
  BH.actions.pickSubject = (cb) => Dialogue.pickSubject(cb);
  // a test starts when you sit down in class during test/exam week
  BH.bus.on('test:start', (p, s) => {
    if (!s || !BH.Quiz) return;
    const pre = p.mode === 'exam' ? '📝 EXAM' : '📝 Test';
    const open = () => BH.Quiz.open(s, { code: p.code, mode: p.mode }, '', [], (o) => Dialogue.say({ portrait: { emoji: '📝' }, name: `${pre}: ${BH.Academics.name(s, p.code)}`, text: o.text }));
    if (BH.Panels.isOpen()) setTimeout(open, 600); else open();
  });
  BH.Dialogue = Dialogue;
})(window.BH);
