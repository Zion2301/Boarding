/* People tab: coursemates, seniors, teachers + profile modal with interactions */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const UI = () => BH.UI;
  const N = () => BH.NPC;

  let seg = 'classmates';

  function row(s, n) {
    const talked = !N().canTalk(s, n);
    return `<button class="person" data-act="profile" data-arg="${n.id}">
      <span class="p-emoji">${N().emoji(n)}</span>
      <span class="p-text"><b>${U.esc(N().fullName(n))}</b><small>${U.esc(N().label(n))}${n.tribe && n.type !== 'teacher' ? ' · ' + n.tribe : ''}</small></span>
      <span class="p-rel">${UI().relBar(n.rel)}<small>${N().relLabel(n)}${talked ? ' · ✓' : ''}</small></span>
    </button>`;
  }

  BH.Screens.people = {
    render(s) {
      const segs = [['classmates', 'Coursemates'], ['seniors', 'Seniors'], ['teachers', 'Teachers'], ['staff', 'Staff']];
      if ((s.npcs.juniors || []).length) segs.splice(2, 0, ['juniors', 'Juniors']);
      if (!s.npcs[seg]) seg = 'classmates';
      let list = s.npcs[seg].slice();
      const tabs = `<div class="seg">${segs.map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="seg" data-arg="${k}">${l}</button>`).join('')}</div>`;
      if (['classmates', 'seniors'].includes(seg) && !BH.School.botsOn(s)) {
        const c = BH.School.myClass(s);
        return `${tabs}<section class="card"><p>🧑🏾‍🎓 Students are <b>real players</b>. When your coursemates join, they show up here.</p>
          <p class="muted">You're in <b>${c ? c.id : '—'}</b> · Form teacher: <b>${c && c.form ? U.esc(N().name(N().get(s, c.form))) : '—'}</b> · Captain: <b>${U.esc(BH.School.nameOf(s, c && c.captain))}</b></p>
          <p class="muted tiny">Testing alone? ⚙️ Menu → 🧪 Bot students fills the empty desks.</p></section>`;
      }
      if (seg === 'teachers') { const mine = new Set(BH.School.weekFor(s).flat().filter(Boolean).map((L) => L.t)); list.sort((a, b) => (mine.has(b.id) ? 1 : 0) - (mine.has(a.id) ? 1 : 0) || a.last.localeCompare(b.last)); }
      if (seg === 'juniors') list.sort((a, b) => (b.schoolChild ? 1 : 0) - (a.schoolChild ? 1 : 0) || a.level - b.level);
      if (seg === 'seniors' && !list.length) return `${tabs}<section class="card"><p>Nobody dey above you again. You be the oldest for this school now. 👑</p></section>`;
      if (seg === 'classmates') list.sort((a, b) => (b.role ? 1 : 0) - (a.role ? 1 : 0) || (a.arch === 'regular') - (b.arch === 'regular') || b.rel - a.rel);
      return `${tabs}
        ${!N().blockAllowsSocial(s) ? '<div class="warn">You dey ' + BH.Time.block(s).title + ' now — you fit only look, no gist.</div>' : ''}
        <section class="people-list">${list.map((n) => row(s, n)).join('')}</section>`;
    },
  };

  function profileHtml(s, n, msg) {
    const can = N().canTalk(s, n) && N().blockAllowsSocial(s);
    const why = !N().blockAllowsSocial(s) ? 'Not now — you dey ' + BH.Time.block(s).title : 'You don interact with am today';
    const persona = D.PERSONAS.find((p) => p.key === n.persona);
    let desc = '';
    if (n.type === 'classmate') desc = (n.role === 'seatmate' ? 'Sits next to you in class. ' : n.role === 'bunkmate' ? 'Sleeps on the bunk above you. ' : '') + D.ARCHETYPES[n.arch].desc;
    else if (n.type === 'senior') desc = { bully: 'Collects provisions as "tax". Avoid or appease.', schoolParent: 'Your assigned school parent. Keep this relationship strong — protection na everything.', labourPrefect: 'Lives to find free hands for grass cutting.', diningPrefect: 'Guards the dining hall like Aso Rock.', headPrefect: 'The most powerful student in school.', houseCaptain: `Runs ${s.player.house.name}.`, chill: 'One of the nice ones. Rare species.', greedy: 'Has never bought Strongman with their own money.' }[n.role];
    else if (n.type === 'junior') desc = n.schoolChild ? 'Your school child. They look up to you for everything.' : 'One of the younger students. How you treat them go define your legacy.';
    else {
      // staff & teachers: personality and quirks from content/staff.json
      const def = BH.School.staffDef(n.id) || {};
      const quirks = (def.quirks || []).slice(0, 2).map((q) => `“${q}”`).join(' · ');
      desc = n.type === 'staff' ? `${n.label}.${n.authority ? ' Catches rule-breakers.' : ''}` : `${N().label(n)}. ${n.nick ? 'Nickname: ' + n.nick + '. ' : ''}Strictness: ${Math.round(n.strict * 10)}/10.`;
      if (def.personality) desc += ` ${def.personality}`;
      if (quirks) desc += ` ${quirks}`;
    }

    const btn = (act, label, extra = '') => `<button class="btn primary" data-act="${act}" data-arg="${n.id}" ${can ? '' : 'disabled'} ${extra}>${label}</button>`;
    let actions = '';
    if (n.type === 'classmate') actions = btn('pGist', '💬 Gist') + btn('pShare', '🎁 Share provisions') + btn('pHelp', '📚 Ask for help');
    else if (n.type === 'senior') actions = btn('pGreetSenior', '🙇 Greet') + btn('pShare', '🎁 Give provisions');
    else if (n.type === 'junior') actions = btn('pEncourage', '😇 Encourage') + btn('pSend', '🫵 Send on errand') + btn('pShare', '🎁 Give provisions');
    else actions = btn('pGreetTeacher', '👋 Greet');

    return `<div class="profile">
      <div class="profile-head"><span class="big-emoji">${N().emoji(n)}</span>
        <div><h2>${U.esc(N().fullName(n))}</h2><div class="muted">${U.esc(N().label(n))}</div>
        ${n.type !== 'teacher' && n.type !== 'staff' ? `<div class="muted tiny">${n.tribe} · from ${n.origin}${persona ? ' · ' + persona.label : ''}</div>` : ''}</div></div>
      <p>${U.esc(desc)}</p>
      <div class="rel-row"><span>Relationship</span>${UI().relBar(n.rel, 'wide')}<b>${Math.round(n.rel)}</b></div>
      <div class="muted">${N().relLabel(n)}</div>
      ${BH.Traits ? BH.Traits.profileHtml(s, n) : ''}
      ${msg ? `<div class="note">${UI().md(msg)}</div>` : ''}
      <p class="muted tiny">📍 Right now: <b>${U.esc(BH.Schedule.placeLabel(s, n))}</b>. To talk, find them and walk up (E / tap). You fit follow them from the radial menu.</p>
    </div>`;
  }

  function act(id, fn) {
    const s = BH.Game.s;
    const n = N().get(s, id);
    BH.fx.begin();
    const text = fn(s, n);
    const fx = BH.fx.end();
    UI().updateModal(profileHtml(s, n, text) + UI().fxChips(fx));
    BH.Save.save(s);
  }

  Object.assign(BH.actions, {
    seg(k) { seg = k; UI().render(); },
    profile(id) {
      const s = BH.Game.s;
      UI().modal(profileHtml(s, N().get(s, id)), { onClose: () => UI().refresh() });
    },
    pGist(id) { act(id, (s, n) => N().gist(s, n)); },
    pHelp(id) { act(id, (s, n) => N().askHelp(s, n)); },
    pGreetSenior(id) { act(id, (s, n) => N().greetSenior(s, n)); },
    pGreetTeacher(id) { act(id, (s, n) => N().greetTeacher(s, n)); },
    pEncourage(id) { act(id, (s, n) => N().encourageJunior(s, n)); },
    pSend(id) { act(id, (s, n) => N().sendJunior(s, n)); },
    pShare(id) {
      const s = BH.Game.s;
      const n = N().get(s, id);
      const food = BH.Inv.foodList(s);
      if (!food.length) { UI().updateModal(profileHtml(s, n, 'You no get anything to share. Your chop box don empty. 🫙')); return; }
      UI().updateModal(`<h2>🎁 Give ${U.esc(N().name(n))} what?</h2>
        <div class="shop-list">${food.map((it) => `<div class="shop-row"><span class="si-emoji">${it.emoji}</span><span class="si-text"><b>${it.name}</b><small class="muted">You get: ${it.qty}</small></span>
          <button class="btn sm primary" data-act="pShareItem" data-arg="${id}|${it.id}">Give 1</button></div>`).join('')}</div>
        <button class="btn ghost" data-act="profile" data-arg="${id}">← Back</button>`);
    },
    pShareItem(arg) {
      const [id, item] = arg.split('|');
      act(id, (s, n) => N().share(s, n, item));
    },
  });
})(window.BH);
