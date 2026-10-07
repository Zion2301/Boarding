/* Typed conversations. Every AI-capable conversation has: a transcript, quick-option chips (the old preset
   choices, still one tap away), a text box (always), and "🚶 Walk away".
   BH.Chat.open({ npc, name, sub, portrait, situation, vars, ctx, intro, quick, onResult, onWalkAway, walkLabel, maxTurns })
     quick: [{ label, text }]  → sends `text` as if typed      |  [{ label, run }] → runs a preset handler
     onResult(res) → return 'end' to finish the conversation (shows Continue)
   BH.Chat.help() opens the help-resources panel (also used whenever distress is detected). */
(function (BH) {
  const U = BH.U;
  const P = () => BH.Panels;

  const Chat = {
    st: null,

    open(opts) {
      const s = BH.Game.s;
      Chat.st = Object.assign({ history: [], busy: false, ended: false, turns: 0, max: 300, note: '' }, opts);
      if (opts.intro) Chat.st.history.push({ who: 'npc', text: opts.intro });
      if (P().isOpenKind('chat')) P().closeKind('chat', true);
      P().open(() => Chat.render(), { cls: 'dialogue', kind: 'chat', locked: true, mount: () => Chat.mount() });
      BH.AI.check().then(() => { if (Chat.st) { Chat.refresh(); } });
      return s;
    },

    render() {
      const c = Chat.st;
      if (!c) return '';
      const portrait = c.portrait && c.portrait.img ? `<img src="${c.portrait.img}" alt="">` : `<span>${(c.portrait && c.portrait.emoji) || '💬'}</span>`;
      const mode = BH.AI.available() ? '<span class="ai-badge on" title="Replies are written by AI on the game server">✨ AI</span>' : `<span class="ai-badge" title="${BH.AI.playerOn() ? 'Game server/AI unavailable — using preset replies' : 'AI conversations are switched off in ⚙️'}">📜 preset</span>`;
      const bubbles = c.history.map((h) => `<div class="bubble ${h.who}${h.sys ? ' sys' : ''}">${h.who === 'npc' && h.emotion && h.emotion !== 'neutral' ? `<small class="emo">${EMO[h.emotion] || ''}</small>` : ''}${U.esc(h.text)}${h.notes && h.notes.length ? `<div class="fx">${h.notes.map((n) => `<span class="chip up">${U.esc(n)}</span>`).join('')}</div>` : ''}</div>`).join('');
      const quick = !c.ended && (c.quick || []).length ? `<div class="quick">${c.quick.map((q, i) => `<button class="qchip" data-act="chatQuick" data-arg="${i}" ${c.busy ? 'disabled' : ''}>${U.esc(q.label)}</button>`).join('')}</div>` : '';
      const input = c.ended
        ? `<button class="dlg-choice primary" data-act="chatDone"><span class="c-label">Continue ▶</span></button>`
        : `<form class="chat-input" onsubmit="return false"><input id="chat-text" type="text" maxlength="${c.max}" autocomplete="off" placeholder="${U.esc(c.placeholder || 'Type what you want to say…')}" ${c.busy ? 'disabled' : ''}>
           <button class="chunky primary" data-act="chatSend" ${c.busy ? 'disabled' : ''}>Say</button></form>
           ${c.note ? `<div class="chat-note">${U.esc(c.note)}</div>` : ''}
           <button class="dlg-choice ghost" data-act="chatWalk"><span class="c-label">${U.esc(c.walkLabel || '🚶 Walk away')}</span>${c.walkSub ? `<span class="c-sub">${U.esc(c.walkSub)}</span>` : ''}</button>`;
      return `<div class="dlg chat">
        <div class="dlg-head"><div class="dlg-portrait ${c.portrait && c.portrait.img ? 'img' : ''}">${portrait}</div>
          <div class="dlg-name"><b>${U.esc(c.name || '')}</b><small>${U.esc(c.sub || '')} ${mode}</small></div></div>
        <div class="transcript" id="chat-log">${bubbles}${c.busy ? '<div class="bubble npc typing">…</div>' : ''}</div>
        ${quick}${input}</div>`;
    },
    mount() {
      const last = (id) => { const a = document.querySelectorAll(`#${id}`); return a[a.length - 1] || null; };
      const log = last('chat-log');
      if (log) log.scrollTop = log.scrollHeight;
      const inp = last('chat-text');
      if (inp) {
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); BH.actions.chatSend(); } });
        if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) setTimeout(() => inp.focus(), 30);
      }
    },
    refresh() { if (P().isOpenKind('chat')) P().refresh(); },

    async send(text) {
      const c = Chat.st;
      if (!c || c.busy || c.ended) return;
      text = String(text || '').trim();
      if (!text) return;
      c.note = '';
      c.history.push({ who: 'me', text });
      c.turns++;
      c.busy = true;
      Chat.refresh();
      const res = await BH.AI.chat({ npc: c.npc, situation: c.situation, vars: c.vars, ctx: c.ctx, history: c.history.slice(0, -1).slice(-12), text, factsExtra: c.factsExtra });
      if (Chat.st !== c) return; // closed meanwhile
      c.busy = false;
      if (res.distress) {
        c.history.push({ who: 'npc', sys: true, text: res.reply || 'Let\'s step out of the game for a second. What you wrote sounds really hard, and it matters. Please talk to a trusted adult today, and contact emergency services if you are in danger right now.' });
        Chat.refresh();
        Chat.help();
        return;
      }
      if (res.blocked) {
        c.history.pop(); c.turns--;
        c.note = `That one no fit go — it has ${res.explain}. Try saying it another way.`;
        Chat.refresh();
        return;
      }
      const s = BH.Game.s;
      BH.fx.begin();
      const notes = BH.AI.apply(s, c.npc, res);
      BH.fx.end();
      c.history.push({ who: 'npc', text: res.reply, emotion: res.emotion, notes });
      const verdict = c.onResult ? c.onResult(res, c) : null;
      if (verdict === 'end' || (res.effects && res.effects.end)) c.ended = true;
      else if (c.maxTurns && c.turns >= c.maxTurns && c.onTimeout) { const t = c.onTimeout(c); if (t) c.history.push({ who: 'npc', text: t }); c.ended = true; }
      BH.Save.save(s);
      Chat.refresh();
    },

    close() { const c = Chat.st; Chat.st = null; P().closeKind('chat', true); BH.Store.changed(); return c; },

    /* Help resources (content/help.json). Always available, AI or not. */
    help() {
      const h = BH.Content.get('help') || {};
      P().open(`<div class="help-panel">
          <h2>💛 ${U.esc(h.title || 'You\'re not alone')}</h2>
          <p>${U.esc(h.intro || '')}</p>
          <ul>${(h.steps || []).map((x) => `<li>${U.esc(x)}</li>`).join('')}</ul>
          ${(h.links || []).map((l) => `<p><a href="${U.esc(l.url)}" target="_blank" rel="noopener">${U.esc(l.label)} ↗</a></p>`).join('')}
          <p class="muted">${U.esc(h.footer || '')}</p>
          <button class="chunky primary" data-act="closePanel">OK</button>
        </div>`, { cls: 'pop', kind: 'help' });
    },
  };

  const EMO = { happy: '😊', amused: '😄', annoyed: '😒', angry: '😠', sad: '😢', suspicious: '🤨', impressed: '😮', worried: '😟' };

  Object.assign(BH.actions, {
    chatSend() { const all = document.querySelectorAll('#chat-text'); const el = all[all.length - 1]; if (el) Chat.send(el.value); },
    chatQuick(i) {
      const c = Chat.st;
      const q = c && c.quick[Number(i)];
      if (!q) return;
      if (q.text) Chat.send(q.text);
      else if (q.run) q.run(c);
    },
    chatWalk() { const c = Chat.close(); if (c && c.onWalkAway) c.onWalkAway(c); },
    chatDone() { const c = Chat.close(); if (c && c.onDone) c.onDone(c); },
    openHelp() { Chat.help(); },
  });

  /* While a text box has focus, the game's keyboard controls step aside (so W/A/S/D/E/space type normally). */
  const isText = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range'].includes(el.type)));
  document.addEventListener('focusin', (e) => {
    if (!isText(e.target)) return;
    const sc = BH.World && BH.World.scene;
    if (sc && sc.input && sc.input.keyboard) { sc.input.keyboard.enabled = false; sc.input.keyboard.disableGlobalCapture(); }
  });
  document.addEventListener('focusout', (e) => {
    if (!isText(e.target)) return;
    const sc = BH.World && BH.World.scene;
    if (sc && sc.input && sc.input.keyboard) { sc.input.keyboard.enabled = true; sc.input.keyboard.enableGlobalCapture(); }
  });

  BH.Chat = Chat;
})(window.BH);
