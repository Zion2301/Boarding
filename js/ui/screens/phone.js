/* Phone tab: contact list → chat thread with reply choices. Only shown when you have a phone. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const UI = () => BH.UI;
  const P = () => BH.Phone;

  let open = null; // contact key of the open thread

  function battery(s) {
    const b = Math.round(s.phone.battery);
    return `<span class="battery ${b < 20 ? 'low' : ''}">${b < 20 ? '🪫' : '🔋'} ${b}%</span>`;
  }

  function list(s) {
    const keys = Object.keys(D.CONTACTS).filter((k) => s.phone.threads[k]);
    keys.sort((a, b) => (s.phone.threads[b].slice(-1)[0].t) - (s.phone.threads[a].slice(-1)[0].t));
    const risk = P().risk(s);
    return `<section class="card phone">
      <div class="phone-top"><b>📱 Messages</b>${battery(s)}</div>
      <div class="${risk >= 0.2 ? 'warn' : 'note'}">${risk >= 0.2 ? `🚨 You dey ${BH.Time.block(s).title}! Pressing phone now get ${Math.round(risk * 100)}% risk of seizure.` : `🤫 Low risk right now (${Math.round(risk * 100)}%). Still, hide am well.`}</div>
      ${keys.length ? keys.map((k) => {
        const last = s.phone.threads[k].slice(-1)[0];
        const un = s.phone.unread[k] || 0;
        const waiting = s.phone.pending.some((p) => p.from === k);
        return `<button class="chat-row" data-act="openChat" data-arg="${k}">
          <span class="p-emoji">${D.CONTACTS[k].emoji}</span>
          <span class="p-text"><b>${U.esc(P().contactName(s, k))}</b><small>${last.who === 'me' ? 'You: ' : ''}${U.esc(last.text.slice(0, 60))}</small></span>
          ${un ? `<span class="badge static">${un}</span>` : waiting ? '<span class="tag bad">reply</span>' : ''}
        </button>`;
      }).join('') : '<p class="muted">No messages yet. Mummy go soon text.</p>'}
      <div class="phone-actions">
        <button class="btn secondary" data-act="chargePhone" ${P().canCharge(s) && s.phone.battery < 100 ? '' : 'disabled'}>🔌 Charge secretly</button>
      </div>
      <p class="muted tiny">Unanswered texts expire after a while — and people notice. Using the phone in class, assembly or prep is very risky.</p>
    </section>`;
  }

  function thread(s, k) {
    const msgs = s.phone.threads[k] || [];
    const pend = s.phone.pending.map((p, i) => ({ p, i })).filter((x) => x.p.from === k);
    const replies = pend.map(({ p, i }) => {
      const tpl = D.MESSAGES.find((m) => m.id === p.tpl);
      return tpl ? tpl.replies.map((r, j) => `<button class="choice" data-act="phoneReply" data-arg="${i}|${j}">${U.esc(U.fill(r.label, P().vars(s)))}</button>`).join('') : '';
    }).join('');
    return `<section class="card phone">
      <div class="phone-top"><button class="btn ghost sm" data-act="closeChat">←</button><b>${D.CONTACTS[k].emoji} ${U.esc(P().contactName(s, k))}</b>${battery(s)}</div>
      <div class="bubbles">${msgs.map((m) => `<div class="bubble ${m.who}">${U.esc(m.text)}</div>`).join('')}</div>
      ${replies ? `<div class="choices reply-box">${replies}</div>` : ''}
      ${k !== 'gc' ? `<form class="chat-input" onsubmit="return false"><input id="phone-text" type="text" maxlength="300" autocomplete="off" placeholder="Type a message…"><button class="chunky primary" data-act="phoneType" data-arg="${k}">Send</button></form>` : ''}
    </section>`;
  }

  BH.Screens.phone = {
    render(s) {
      if (!s.phone.has) return '<section class="card"><h2>📱 No phone</h2><p>You no get phone. Use the phone booth on Sunday or write letters.</p></section>';
      if (s.phone.confiscated) return '<section class="card"><h2>📵 Phone seized</h2><p>The House Master get your phone for his drawer. You fit collect am back at the end of term — if your discipline record no too bad.</p></section>';
      if (open) { s.phone.unread[open] = 0; return thread(s, open); }
      return list(s);
    },
  };

  Object.assign(BH.actions, {
    openChat(k) { open = k; UI().render(); },
    closeChat() { open = null; UI().render(); },
    phoneReply(arg) {
      const s = BH.Game.s;
      const [i, j] = arg.split('|').map(Number);
      BH.fx.begin();
      const r = P().reply(s, i, j);
      const fx = BH.fx.end();
      BH.Save.save(s);
      if (r.caught) { open = null; BH.Panels.closeKind('phone', true); BH.Dialogue.say({ portrait: { emoji: '📵' }, name: 'Phone Seized!', text: r.text }); return; }
      if (fx.length) UI().toast(fx.map((f) => `${f.amount > 0 ? '+' : ''}${Math.round(f.amount)}${f.icon}`).join('  '), 'info');
      UI().render();
    },
    async phoneType(k) {
      const s = BH.Game.s;
      const el = document.getElementById('phone-text');
      const text = el ? el.value.trim() : '';
      if (!text) return;
      if (el) { el.value = ''; el.disabled = true; }
      const r = await BH.Writing.textReply(s, k, text);
      if (r.caught) { open = null; BH.Panels.closeKind('phone', true); BH.Dialogue.say({ portrait: { emoji: '📵' }, name: 'Phone Seized!', text: r.text }); return; }
      if (!r.ok) { UI().toast(r.reason, 'bad'); if (el) el.disabled = false; return; }
      if (r.distress) BH.Chat.help();
      if (r.notes && r.notes.length) UI().toast(r.notes.join('  '), 'good');
      BH.Panels.refresh();
    },
    chargePhone() {
      const s = BH.Game.s;
      BH.fx.begin();
      const r = P().charge(s);
      const fx = BH.fx.end();
      BH.Save.save(s);
      if (r.caught) { open = null; BH.Panels.closeKind('phone', true); BH.Dialogue.say({ portrait: { emoji: '📵' }, name: 'Phone Seized!', text: r.text }); return; }
      UI().toast(r.text, 'good');
      UI().render();
    },
  });
})(window.BH);
