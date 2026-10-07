/* Writing panels: notes in class, letters home, diary, slam book, noticeboard, graffiti, debates,
   sign-out shirt + trophy room. Logic lives in js/systems/writing.js. */
(function (BH) {
  const U = BH.U;
  const P = () => BH.Panels;
  const W = () => BH.Writing;
  const s = () => BH.Game.s;
  const toast = (t, k = 'info') => BH.UI.toast(t, k);
  // panels that just closed linger for a moment, so always use the NEWEST element with an id
  const el = (id) => { const all = document.querySelectorAll(`#${id}`); return all[all.length - 1] || null; };
  const val = (id) => ((el(id) || {}).value || '').trim();
  const counter = (id, max) => `<div class="counter"><span data-count="${id}">0</span>/${max}</div>`;
  const reportBtn = (type, id, sub) => `<button class="mini-report" data-act="wReport" data-arg="${type}|${id}|${sub || ''}" title="Report">🚩</button>`;
  const offlineNote = () => (BH.AI.online() ? '' : '<p class="muted tiny">📡 Game server not reachable — shared boards are unavailable right now.</p>');

  // live character counters + stop game keys while typing
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.id) return;
    const c = document.querySelector(`[data-count="${el.id}"]`);
    if (c) c.textContent = el.value.length;
  });

  const Screen = {
    /* ---------- the writing hub (backpack) ---------- */
    hub() {
      const st = s();
      const unread = (st.letters || []).filter((l) => l.status === 'replied' && !l.read).length;
      P().open(() => `<h2>✍️ Writing</h2>
        <div class="hub-grid">
          <button class="chunky" data-act="wDiary">📔 Diary <small>private</small></button>
          <button class="chunky" data-act="wLetters">✉️ Letters${unread ? ` <b class="badge-in">${unread}</b>` : ''}</button>
          <button class="chunky" data-act="wSlam" ${BH.Inv.has(st, 'slamBook') || st.slambook ? '' : 'disabled'}>📒 Slam book${BH.Inv.has(st, 'slamBook') || st.slambook ? '' : ' <small>(buy at tuck shop)</small>'}</button>
          <button class="chunky" data-act="wSignSlam">🖊️ Sign a friend's slam book</button>
          <button class="chunky" data-act="wShirt" ${st.shirt ? '' : 'disabled'}>👕 Sign-out shirt${st.shirt ? '' : ' <small>(SS3)</small>'}</button>
          <button class="chunky" data-act="wSignShirt">🖊️ Sign a friend's shirt</button>
          <button class="chunky" data-act="wTrophies">🏆 Trophy room</button>
        </div>`, { cls: 'pop', kind: 'writing' });
    },

    /* ---------- notes in class ---------- */
    notePanel() {
      const st = s();
      const targets = W().noteTargets(st);
      if (!targets.length) { toast('Nobody near your desk to pass a note to.'); return; }
      P().open(() => `<h2>✉️ Pass a note</h2>
        <p class="muted tiny">Fold it and pass it desk to desk. Every hop, the teacher might look your way. 👀 Only you and your friend ever see what's inside.</p>
        <select id="note-to" class="write-select">${targets.slice(0, 12).map((t) => `<option value="${t.n.id}">${U.esc(t.n.first)} — ${t.hops} desk${t.hops > 1 ? 's' : ''} away</option>`).join('')}</select>
        <textarea id="note-text" class="write" maxlength="200" placeholder="Write your note…"></textarea>${counter('note-text', 200)}
        <button class="chunky primary" data-act="wPassNote">📨 Fold & pass</button>`, { cls: 'pop', kind: 'note' });
    },
    async passNote() {
      const st = s();
      const r = W().passNote(st, val('note-to'), val('note-text'));
      if (!r.ok) { toast(r.reason, 'bad'); return; }
      P().closeKind('note', true);
      BH.Save.save(st);
      if (r.caught) { BH.Dialogue.say({ portrait: { emoji: '🧑‍🏫' }, name: `${r.teacher} intercepts your note!`, sub: `${r.hops} desk${r.hops > 1 ? 's' : ''} · ${Math.round(r.chance * 100)}% risk`, text: `${r.teacher}: ${r.line}\n\nThe note is confiscated. ${r.punishment}` }); return; }
      toast(`📨 The note reaches ${r.target.first} (${r.hops} hop${r.hops > 1 ? 's' : ''}). Waiting for a reply…`, 'good');
      const reply = await W().noteReply(st, r.target, r.note);
      BH.Dialogue.say({ portrait: { emoji: '📝' }, name: `A note comes back from ${r.target.first}`, text: `_"${reply}"_` });
    },

    /* ---------- letters ---------- */
    letterForm() {
      P().open(() => `<h2>✉️ Write a letter home</h2>
        <p class="muted tiny">It goes out with the school post. A reply comes in 2–4 days — maybe with something inside. 🙏</p>
        <select id="letter-to" class="write-select"><option value="mummy">👩🏾 Mummy</option><option value="daddy">👨🏾 Daddy</option></select>
        <textarea id="letter-text" class="write" maxlength="800" placeholder="Dear Mummy,&#10;&#10;How is everybody at home?…"></textarea>${counter('letter-text', 800)}
        <button class="chunky primary" data-act="wSendLetter">📮 Seal & post</button>`, { cls: 'pop', kind: 'letter' });
    },
    sendLetter() {
      const st = s();
      const text = val('letter-text');
      if (text.length < 15) { toast('Write a proper letter — at least a couple of sentences.', 'bad'); return; }
      const r = W().sendLetter(st, val('letter-to'), text);
      if (!r.ok) { toast(r.reason, 'bad'); return; }
      P().closeKind('letter', true);
      BH.Save.save(st);
      toast(`📮 Letter posted. Expect a reply in about ${r.letter.due - st.time.dayCount} days.`, 'good');
    },
    letters() {
      const st = s();
      (st.letters || []).forEach((l) => { if (l.status === 'replied') l.read = true; });
      P().open(() => `<h2>✉️ Letters</h2>${(st.letters || []).length ? (st.letters || []).map((l) => `<div class="letter">
          <div class="muted tiny">To ${l.to === 'mummy' ? 'Mummy' : 'Daddy'} · ${U.esc(l.when)} · ${l.status === 'replied' ? '📬 replied' : '📮 waiting for reply'}</div>
          <p class="letter-text mine">${U.esc(l.text)}</p>
          ${l.reply ? `<p class="letter-text">${U.esc(l.reply)}</p>${l.gift ? `<p class="good-txt">🎁 ${l.gift.money ? U.money(l.gift.money) : ''} ${Object.entries(l.gift.items || {}).map(([id, n]) => `${n} ${BH.data.ITEMS[id] ? BH.data.ITEMS[id].emoji : ''}`).join(' ')}</p>` : ''}` : ''}
        </div>`).join('') : '<p class="muted">No letters yet. Write one from your bed (✉️ Write letter home).</p>'}
        <button class="chunky primary" data-act="wNewLetter">✍️ Write a new letter</button>`, { cls: 'sheet', kind: 'letters' });
    },

    /* ---------- diary (private) ---------- */
    diary() {
      const st = s();
      P().open(() => `<h2>📔 Diary</h2>
        <p class="muted tiny">🔒 Private. Your diary stays on this device and is never shown to anyone or sent anywhere.</p>
        <textarea id="diary-text" class="write" maxlength="1000" placeholder="Dear diary…"></textarea>${counter('diary-text', 1000)}
        <button class="chunky primary" data-act="wDiaryAdd">💾 Save entry</button>
        <div class="diary-list">${(st.diary || []).slice(0, 30).map((e) => `<div class="diary-entry"><small class="muted">${U.esc(e.when)}</small><p>${U.esc(e.text)}</p></div>`).join('')}</div>`, { cls: 'sheet', kind: 'diary' });
    },

    /* ---------- slam book ---------- */
    async slam() {
      const st = s();
      if (!st.slambook) { if (!BH.Inv.has(st, 'slamBook')) { toast('Buy a slam book at the tuck shop first.'); return; } BH.Inv.take(st, 'slamBook', 1); await W().startSlambook(st); }
      await W().refreshSlambook(st);
      const b = st.slambook;
      const friends = st.npcs.classmates.filter((c) => c.rel >= 40 && !(b.entries || []).some((e) => e.npcId === c.id)).sort((a, x) => x.rel - a.rel).slice(0, 8);
      P().open(() => `<h2>📒 Your slam book</h2>
        ${b.shared ? `<p class="muted tiny">Share code for friends who play: <b class="code">${U.esc(b.id)}</b></p>` : '<p class="muted tiny">Offline book (only classmates in your game can sign).</p>'}
        <h3 class="sec">Pass it to a friend</h3>
        <div class="hub-grid">${friends.map((f) => `<button class="chunky" data-act="wSlamNpc" data-arg="${f.id}">${BH.NPC.emoji(f)} ${U.esc(f.first)}</button>`).join('') || '<p class="muted">Make more friends (relationship 40+) to pass it around.</p>'}</div>
        <h3 class="sec">Entries (${(b.entries || []).length})</h3>
        ${(b.entries || []).map((e) => `<details class="slam-entry"><summary>${e.npc ? '🧑🏾‍🎓' : '🎮'} ${U.esc(e.name)} ${b.shared && !e.npc ? reportBtn('slambook', b.id, e.id) : ''}</summary>
          ${b.questions.map((q, i) => (e.answers[i] ? `<p><small class="muted">${U.esc(q)}</small><br>${U.esc(e.answers[i])}</p>` : '')).join('')}</details>`).join('') || '<p class="muted">Nobody has written in it yet.</p>'}`, { cls: 'sheet', kind: 'slam' });
    },
    async slamNpc(id) {
      const st = s();
      const n = BH.NPC.get(st, id);
      toast(`📒 ${n.first} is writing in your slam book…`);
      const r = await W().npcFillSlambook(st, n);
      if (!r.ok) toast(r.reason, 'bad'); else toast(`📒 ${n.first} filled your slam book! 💛`, 'good');
      P().closeKind('slam', true);
      Screen.slam();
    },
    signSlamPrompt() {
      P().open(() => `<h2>🖊️ Sign a friend's slam book</h2><p class="muted tiny">Ask your friend for their slam book code.</p>
        <input id="slam-code" class="write-input" placeholder="slam book code"><button class="chunky primary" data-act="wSlamLoad">Open</button>${offlineNote()}`, { cls: 'pop', kind: 'slamsign' });
    },
    async slamLoad() {
      const book = await W().loadSlambook(val('slam-code'));
      if (!book) { toast('No slam book with that code.', 'bad'); return; }
      Screen.slamCode = book.id;
      P().update(`<h2>📒 ${U.esc(book.owner_name)}'s slam book</h2>
        <input id="slam-name" class="write-input" maxlength="30" placeholder="Your name (first name or nickname)">
        ${book.questions.map((q, i) => `<label class="slam-q"><small>${U.esc(q)}</small><input id="slam-a${i}" class="write-input" maxlength="100"></label>`).join('')}
        <button class="chunky primary" data-act="wSlamSubmit" data-arg="${book.questions.length}">✍️ Sign it</button>`);
    },
    async slamSubmit(n) {
      const answers = {};
      for (let i = 0; i < Number(n); i++) { const v = val('slam-a' + i); if (v) answers[i] = v; }
      if (!val('slam-name') || Object.keys(answers).length < 3) { toast('Add your name and answer at least 3 questions.', 'bad'); return; }
      const r = await W().signSlambook(Screen.slamCode, val('slam-name'), answers);
      if (r && r.ok) { P().closeKind('slamsign', true); toast('📒 Signed! Your friend will see it in their slam book.', 'good'); } else toast((r && (r.reason || (r.offline && 'Needs the game server.'))) || 'Could not sign.', 'bad');
    },

    /* ---------- noticeboard (shared) ---------- */
    async board() {
      const st = s();
      const posts = await W().board(st);
      P().open(() => `<h2>📌 ${U.esc(st.player.schoolName)} — Noticeboard</h2>
        <p class="muted tiny">Posts are shared with every player at your school, checked before they appear, and reportable. Be nice. No phone numbers, socials or names of real people.</p>
        ${offlineNote()}
        <textarea id="board-text" class="write" maxlength="280" placeholder="Lost bucket? Selling chin-chin? Shout-out to Senior…"></textarea>${counter('board-text', 280)}
        <button class="chunky primary" data-act="wBoardPost" ${posts ? '' : 'disabled'}>📌 Pin it</button>
        <div class="board">${(posts || []).map((p) => `<div class="pin-note"><p>${U.esc(p.text)}</p><small class="muted">— ${U.esc(p.author)} ${reportBtn('board', p.id)}</small></div>`).join('') || '<p class="muted">Nothing pinned yet.</p>'}</div>`, { cls: 'sheet', kind: 'board' });
    },
    async boardPost() {
      const r = await W().postBoard(s(), val('board-text'));
      if (!r.ok) { toast(r.reason, 'bad'); return; }
      toast('📌 Pinned!', 'good');
      P().closeKind('board', true);
      Screen.board();
    },

    /* ---------- graffiti ---------- */
    carveForm(mapId, obj) {
      Screen.carving = { mapId, obj };
      P().open(() => `<h2>✏️ Write on the ${U.esc(obj.kind === 'behind' ? 'wall' : obj.kind.replace('my', '').toLowerCase())}</h2>
        <p class="muted tiny">It stays there for future students (across terms) — if it passes the checks. Teachers call this vandalism. 👀</p>
        <input id="carve-text" class="write-input" maxlength="80" placeholder="e.g. JSS1 RUNS THIS SCHOOL">${counter('carve-text', 80)}
        <button class="chunky primary" data-act="wCarve">✏️ Write it</button>${offlineNote()}`, { cls: 'pop', kind: 'carve' });
    },
    async carve() {
      const c = Screen.carving;
      const r = await W().carve(s(), c.mapId, c.obj.id, val('carve-text'));
      if (!r.ok) { toast(r.reason, 'bad'); return; }
      P().closeKind('carve', true);
      BH.Paths.add(s(), 'trouble', 1);
      toast('✏️ Your mark is on it now. Forever. (Or until somebody reports it.)', 'good');
    },
    showGraffiti(obj, list) {
      P().open(() => `<h2>👀 Written here</h2>${list.map((g) => `<div class="graffiti"><p>“${U.esc(g.text)}”</p><small class="muted">— ${U.esc(g.author)} ${reportBtn('graffiti', g.id)}</small></div>`).join('')}`, { cls: 'pop', kind: 'graffiti' });
    },

    /* ---------- debate society ---------- */
    debate(side) {
      const st = s();
      const m = W().motionOfDay(st);
      Screen.side = side || 'for';
      const opp = BH.NPC.byArch(st, 'brilliant') || BH.NPC.randomClassmate(st);
      P().open(() => `<h2>🎤 Debate Society</h2>
        <p><b>Motion:</b> “${U.esc(m.motion)}”</p>
        <div class="seg"><button class="${Screen.side === 'for' ? 'on' : ''}" data-act="wSide" data-arg="for">I'm FOR</button><button class="${Screen.side === 'against' ? 'on' : ''}" data-act="wSide" data-arg="against">I'm AGAINST</button></div>
        <div class="letter"><small class="muted">${U.esc(opp.first)} (${Screen.side === 'for' ? 'against' : 'for'}) argues:</small><p class="letter-text">${U.esc(Screen.side === 'for' ? m.against : m.for)}</p></div>
        <textarea id="debate-text" class="write" maxlength="1000" placeholder="Mr Chairman, panel of judges, my fellow students… I stand ${Screen.side === 'for' ? 'to support' : 'to oppose'} the motion…"></textarea>${counter('debate-text', 1000)}
        <button class="chunky primary" data-act="wDebate">🎤 Deliver your speech</button>`, { cls: 'sheet', kind: 'debate' });
    },
    async deliverDebate() {
      const text = val('debate-text');
      if (text.split(/\s+/).length < 15) { toast('Speak more! At least a few sentences.', 'bad'); return; }
      const btn = [...document.querySelectorAll('[data-act=wDebate]')].pop();
      if (btn) { btn.disabled = true; btn.textContent = '⚖️ The judges are scoring…'; }
      const r = await W().debate(s(), Screen.side, text);
      P().closeKind('debate', true);
      if (r.distress) { BH.Chat.help(); return; }
      BH.Dialogue.say({ portrait: { emoji: '⚖️' }, name: r.winner === 'player' ? '🏆 You win the debate!' : r.winner === 'tie' ? '🤝 It\'s a tie!' : 'The other side wins', sub: `You ${r.player_score}/30 · Opponent ${r.opponent_score}/30 · ${r.source === 'ai' ? '✨ AI judges' : '📜 teachers on duty'}`, text: `Chief judge: _"${r.comment}"_` });
    },

    /* ---------- sign-out shirt & trophy room ---------- */
    async shirt() {
      const st = s();
      await W().startShirt(st);
      await W().refreshShirt(st);
      const sh = st.shirt;
      P().open(() => `<h2>👕 Sign-out day</h2>
        <canvas id="shirt-canvas" width="560" height="620" class="shirt-canvas"></canvas>
        <p class="muted tiny">${sh.signatures.length} signatures${sh.shared ? ` · Code for friends who play: <b class="code">${U.esc(sh.id)}</b>` : ''}</p>
        <div class="hub-grid">
          <button class="chunky" data-act="wShirtNpc">🧑🏾‍🎓 Ask classmates to sign</button>
          <button class="chunky primary" data-act="wShirtSave">🏆 Save to trophy room</button>
        </div>
        ${sh.shared ? `<details><summary>🚩 Report a signature</summary>${sh.signatures.filter((x) => !x.npc).map((x) => `<p>${U.esc(x.name)}: ${U.esc(x.text)} ${reportBtn('shirt', sh.id, x.id)}</p>`).join('') || '<p class="muted">Only classmates have signed.</p>'}</details>` : ''}`,
      { cls: 'sheet', kind: 'shirt', mount: () => Screen.drawShirt(el('shirt-canvas'), st.shirt.signatures, st.player.name) });
    },
    drawShirt(cv, sigs, owner) {
      if (!cv) return null;
      const g = cv.getContext('2d');
      const W2 = cv.width, H2 = cv.height;
      g.fillStyle = '#d8e8f0'; g.fillRect(0, 0, W2, H2);
      // shirt body
      g.fillStyle = '#ffffff'; g.strokeStyle = '#b0bec5'; g.lineWidth = 4;
      g.beginPath();
      g.moveTo(170, 40); g.lineTo(230, 20); g.quadraticCurveTo(280, 60, 330, 20); g.lineTo(390, 40);
      g.lineTo(530, 130); g.lineTo(480, 230); g.lineTo(420, 200); g.lineTo(420, 600); g.lineTo(140, 600); g.lineTo(140, 200);
      g.lineTo(80, 230); g.lineTo(30, 130); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = '#cfd8dc'; g.lineWidth = 2; g.beginPath(); g.moveTo(280, 60); g.lineTo(280, 600); g.stroke();
      for (let y = 110; y < 600; y += 70) { g.fillStyle = '#eceff1'; g.beginPath(); g.arc(292, y, 5, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#1b2a4a'; g.font = '700 18px Nunito, sans-serif'; g.textAlign = 'center';
      g.fillText(`${owner} · Class of ${new Date().getFullYear()}`, 280, 585);
      // fixed slots so signatures never pile on top of each other: two columns down the body, then the sleeves
      const slots = [];
      for (let r = 0; r < 13; r++) { slots.push([212, 98 + r * 36]); slots.push([352, 98 + r * 36]); }
      [[95, 150], [130, 190], [465, 150], [430, 190], [230, 62], [335, 62]].forEach((p) => slots.push(p));
      const fit = (txt, max) => { let t = String(txt); while (g.measureText(t).width > max && t.length > 3) t = t.slice(0, -2); return t === String(txt) ? t : t.trim() + '…'; };
      sigs.slice(0, slots.length).forEach((sg, i) => {
        const [x, y] = slots[i];
        g.save(); g.translate(x, y); g.rotate(((sg.rot || 0) * 0.3) || (((i * 37) % 7) - 3) * 0.02);
        g.fillStyle = sg.color || '#1b2a4a'; g.font = '700 11px "Comic Sans MS", Nunito, cursive';
        // wrap the message onto at most two lines
        const words = String(sg.text).split(/\s+/); const lines = [''];
        words.forEach((w) => { const t = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w; if (g.measureText(t).width <= 128 || !lines[lines.length - 1]) lines[lines.length - 1] = t; else lines.push(w); });
        const shown = lines.slice(0, 2); if (lines.length > 2) shown[1] = fit(`${shown[1]} ${lines.slice(2).join(' ')}`, 128);
        shown.forEach((ln, k) => g.fillText(fit(ln, 128), 0, k * 12 - (shown.length - 1) * 6));
        g.font = '800 9px Nunito, sans-serif'; g.fillText(fit(`— ${sg.name}`, 120), 0, 14);
        g.restore();
      });
      if (sigs.length > slots.length) { g.fillStyle = '#546e7a'; g.font = '700 12px Nunito, sans-serif'; g.fillText(`+${sigs.length - slots.length} more signatures`, 280, 565); }
      return cv.toDataURL('image/png');
    },
    async shirtNpc() { toast('👕 Your classmates are signing…'); await W().npcSignShirt(s()); P().closeKind('shirt', true); Screen.shirt(); },
    shirtSave() {
      const st = s();
      const url = Screen.drawShirt(el('shirt-canvas'), st.shirt.signatures, st.player.name);
      toast(W().saveTrophy(st, url) ? '🏆 Saved to your trophy room — it stays even after this save ends.' : 'Could not save (storage full?).', 'good');
    },
    signShirtPrompt() {
      P().open(() => `<h2>🖊️ Sign a friend's shirt</h2><p class="muted tiny">Ask your friend for their shirt code (sign-out day, SS3).</p>
        <input id="shirt-code" class="write-input" placeholder="shirt code">
        <input id="shirt-name" class="write-input" maxlength="30" placeholder="Your name">
        <input id="shirt-msg" class="write-input" maxlength="80" placeholder="Your message (max 80)">
        <button class="chunky primary" data-act="wShirtSign">✍️ Sign</button>${offlineNote()}`, { cls: 'pop', kind: 'shirtsign' });
    },
    async signShirt() {
      if (!val('shirt-code') || !val('shirt-name') || !val('shirt-msg')) { toast('Fill in the code, your name and a message.', 'bad'); return; }
      const r = await W().signShirt(s(), val('shirt-code'), { name: val('shirt-name'), text: val('shirt-msg') });
      if (r.ok) { P().closeKind('shirtsign', true); toast('👕 Signed! ✍️', 'good'); } else toast(r.reason, 'bad');
    },
    trophies() {
      const list = W().trophies();
      P().open(() => `<h2>🏆 Trophy room</h2>${list.length ? list.map((t) => `<div class="trophy"><img src="${t.img}" alt="Signed shirt"><small class="muted">${U.esc(t.name)} · ${U.esc(t.school)} · ${t.signatures} signatures</small></div>`).join('') : '<p class="muted">Graduate from SS3 and save your sign-out shirt to see it here.</p>'}`, { cls: 'sheet', kind: 'trophies' });
    },
  };

  Object.assign(BH.actions, {
    wHub: () => Screen.hub(),
    wDiary: () => Screen.diary(),
    wDiaryAdd() { const e = W().addDiary(s(), val('diary-text')); if (e) { BH.Save.save(s()); P().closeKind('diary', true); Screen.diary(); toast('📔 Saved. Only you can read it.', 'good'); } },
    wLetters: () => Screen.letters(),
    wNewLetter() { P().closeKind('letters', true); Screen.letterForm(); },
    wSendLetter: () => Screen.sendLetter(),
    wPassNote: () => Screen.passNote(),
    wSlam: () => Screen.slam(),
    wSlamNpc: (id) => Screen.slamNpc(id),
    wSignSlam: () => Screen.signSlamPrompt(),
    wSlamLoad: () => Screen.slamLoad(),
    wSlamSubmit: (n) => Screen.slamSubmit(n),
    wBoardPost: () => Screen.boardPost(),
    wCarve: () => Screen.carve(),
    wSide(side) { P().closeKind('debate', true); Screen.debate(side); },
    wDebate: () => Screen.deliverDebate(),
    wShirt: () => Screen.shirt(),
    wShirtNpc: () => Screen.shirtNpc(),
    wShirtSave: () => Screen.shirtSave(),
    wSignShirt: () => Screen.signShirtPrompt(),
    wShirtSign: () => Screen.signShirt(),
    wTrophies: () => Screen.trophies(),
    async wReport(arg) {
      const [type, id, sub] = arg.split('|');
      const r = await BH.AI.report(type, id, sub);
      toast(r && r.ok ? '🚩 Reported. A moderator will check it — thank you.' : 'Could not report right now.', r && r.ok ? 'good' : 'bad');
    },
  });

  BH.Actions.define('notePanel', () => { Screen.notePanel(); return { noTime: true, cancel: true }; });
  BH.Screens.writing = Screen;
})(window.BH);
