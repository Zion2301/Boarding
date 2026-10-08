/* Story — the memory of YOUR story (GAME_DESIGN.md §5–6).
   · The ledger: what you did, to whom, when ("snitched_on k_jide @ JSS2T1"). Arcs read it; characters bring it up
     years later; the AI gets it as facts; the yearbook is written from it.
   · Bonds: friendship is n.rel; key characters also have trust, rivalry, respect and crush (PG).
   · Doing things with NPCs: best friend (you can always find them), your squad, call someone over, sit together,
     play Whot / Ayo / Draughts with them. Same shapes as the multiplayer social layer, so a real friend can take an
     NPC's place in a private school later. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const N = () => BH.NPC;
  const toast = (t, k = 'info') => BH.UI && BH.UI.toast && BH.UI.toast(t, k);

  /* how the ledger reads out loud ("…in JSS2") */
  const PHRASE = {
    snitched_on: 'you snitched on them', shared_food: 'you shared food with them', gisted: 'you gisted together',
    played: 'you played {game} together', beat_them: 'you beat them at {game}', lost_to: 'they beat you at {game}',
    defended: 'you defended them', fought: 'you fought them', helped: 'you helped them', ignored: 'you ignored them when they needed you',
    best_friend: 'you became best friends', squad: 'they joined your squad', called_over: 'you called them over',
    sat_together: 'you sat together', told_secret: 'you told their secret', kept_secret: 'you kept their secret',
    lied_to: 'you lied to them', laughed_at: 'you laughed at them', apologised: 'you apologised to them',
  };
  const stamp = (s) => `${D.LEVELS[s.time.year - 1]}T${s.time.term}`;
  const clamp = (v) => Math.max(0, Math.min(100, v));

  const Story = {
    PHRASE,
    onNewGame(s) { Story.ensure(s); },
    onLoad(s) { Story.ensure(s); },
    ensure(s) {
      s.story = Object.assign({ ledger: [], arcs: {}, milestones: [], chapters: [], squad: null, bestie: null, choices: 0 }, s.story || {});
      // key characters get their extra bond dimensions
      N().all(s).forEach((n) => { if (n.key && n.trust === undefined) Object.assign(n, { trust: n.type === 'senior' && n.role === 'bully' ? 10 : 35, rivalry: n.id === 'k_dera' ? 30 : 0, respect: 30, crush: 0 }); });
    },
    stamp,

    /* ---------- the ledger ---------- */
    note(s, k, who = null, data = {}) {
      Story.ensure(s);
      const at = stamp(s);
      const L = s.story.ledger;
      const same = L.find((e) => e.k === k && e.who === who && e.at === at && JSON.stringify(e.data || {}) === JSON.stringify(data));
      if (same) { same.n = (same.n || 1) + 1; same.d = s.time.dayCount; return same; }
      const e = { k, who, at, d: s.time.dayCount, data: Object.keys(data).length ? data : undefined };
      L.push(e);
      if (L.length > 600) L.splice(0, L.length - 600);
      BH.bus.emit('story:note', e);
      return e;
    },
    has(s, k, who) { return (s.story ? s.story.ledger : []).some((e) => e.k === k && (who === undefined || e.who === who)); },
    count(s, k, who) { return (s.story ? s.story.ledger : []).filter((e) => e.k === k && (who === undefined || e.who === who)).reduce((a, e) => a + (e.n || 1), 0); },
    first(s, k, who) { return (s.story ? s.story.ledger : []).find((e) => e.k === k && (who === undefined || e.who === who)) || null; },
    /* "in JSS2" / "this term" */
    when(s, e) { if (!e) return ''; return e.at === stamp(s) ? 'this term' : `in ${e.at.replace(/T(\d)$/, ' (term $1)')}`; },
    /* what this character remembers about you, as short lines (sent to the AI, used in callbacks) */
    memoryOf(s, id, max = 6) {
      return (s.story ? s.story.ledger : []).filter((e) => e.who === id && PHRASE[e.k]).slice(-max)
        .map((e) => `${U.fill(PHRASE[e.k], Object.assign({ game: 'a game' }, e.data || {}))}${e.n > 1 ? ` (${e.n}×)` : ''} ${Story.when(s, e)}`);
    },

    /* a key character brings up something you did (once in a while) */
    callback(s, n) {
      if (!n.key || U.hash(n.id + s.time.dayCount) % 4) return null;
      const say = (e, lines) => (e ? `"${U.fill(U.pick(lines), { when: Story.when(s, e) })}"` : null);
      return say(Story.first(s, 'snitched_on', n.id), ['You remember {when}? You sold me out. I never forget.', 'Snitch. {when}. Don\'t think I forgot.'])
        || say(Story.first(s, 'told_secret', n.id), ['I told you one thing {when}. One thing. And you told everybody.'])
        || say(Story.first(s, 'defended', n.id), ['Since {when} when you stood up for me… I owe you.', 'My guy! The one wey defend me {when}!'])
        || (Story.count(s, 'shared_food', n.id) >= 5 ? say(Story.first(s, 'shared_food', n.id), ['My provision partner! Since {when}, you never dull me.']) : null)
        || say(Story.first(s, 'fought', n.id), ['We don fight before. {when}. Make we no repeat am.'])
        || (Story.count(s, 'played', n.id) >= 3 ? say(Story.first(s, 'played', n.id), ['Rematch? You still owe me since {when}. 🃏']) : null);
    },

    /* ---------- bonds ---------- */
    bond(s, n, d = {}) {
      if (!n) return;
      if (d.rel) N().rel(s, n, d.rel);
      ['trust', 'rivalry', 'respect', 'crush'].forEach((k) => { if (d[k]) n[k] = clamp((n[k] || 0) + d[k]); });
    },
    bondLabel(n) {
      if (!n.key) return '';
      const bits = [];
      if (n.trust >= 70) bits.push('trusts you'); else if (n.trust <= 15) bits.push('doesn\'t trust you');
      if (n.rivalry >= 50) bits.push('rival');
      if (n.respect >= 70) bits.push('respects you');
      if (n.crush >= 50) bits.push('😳 has a crush on you');
      return bits.join(' · ');
    },
    isBestie(s, id) { return !!(s.story && s.story.bestie === id); },
    inSquad(s, id) { return !!(s.story && s.story.squad && s.story.squad.members.includes(id)); },

    /* ---------- doing things with NPCs ---------- */
    talkOptions(s, n) {
      if (!['classmate', 'senior', 'junior'].includes(n.type)) return [];
      const out = [];
      const bf = Story.isBestie(s, n.id);
      if (n.type === 'classmate' && !bf) out.push({
        label: '💛 "You be my best friend?"', sub: n.rel >= 70 ? 'You two are close…' : 'You\'re not that close yet',
        run() {
          if (n.rel >= 70 && (n.trust === undefined || n.trust >= 40 || n.rel >= 85)) {
            const old = s.story.bestie && N().get(s, s.story.bestie);
            s.story.bestie = n.id;
            Story.note(s, 'best_friend', n.id);
            Story.bond(s, n, { rel: 8, trust: 15 });
            if (old) { Story.bond(s, old, { rel: -10, trust: -10 }); return `${n.first}'s face lights up: "My person! Na you be my best friend since!" 💛\n\n(${old.first} will notice…)`; }
            return `${n.first} hugs you: "Ah! I been wan ask you the same thing!" 💛 You can always find them now (👥).`;
          }
          Story.bond(s, n, { rel: -2 });
          return `${n.first} laughs awkwardly: "Best friend? Ehn… make we first be friends, abeg." 😅`;
        },
      });
      if (s.story.squad && !Story.inSquad(s, n.id) && n.rel >= 55) out.push({
        label: `🏴 Invite to [${s.story.squad.tag}]`, sub: s.story.squad.name,
        run() { s.story.squad.members.push(n.id); Story.note(s, 'squad', n.id); Story.bond(s, n, { rel: 4 }); return `${n.first}: "[${s.story.squad.tag}]? I dey! Who else dey inside?" 🏴`; },
      });
      if (!BH.Lessons || !BH.Lessons.here(s)) out.push({
        label: '🃏 "Make we play Whot"', sub: 'Quick game — friendship +',
        run() { setTimeout(() => BH.Games.whot.startOffline(2, [n]), 50); return `${n.first} pulls out a squeezed pack of Whot cards: "Oya, I go show you pepper." 🃏`; },
      });
      out.push({
        label: '🪑 "Come sit with me"', sub: 'They come and sit beside you',
        run() { Story.sitWith(s, n); return `${n.first}: "Shift make I siddon." 🪑`; },
      });
      return out;
    },

    /* someone comes to you (call over from anywhere: People / 👥 panel) */
    callOver(s, n, sit) {
      const map = s.world.map || 'campus';
      BH.Schedule.override(s, n.id, { key: s.world.area || map, map, seek: true, sitWith: !!sit }, 30);
      Story.note(s, sit ? 'sat_together' : 'called_over', n.id);
      return `📣 You call ${n.first} — they're coming${sit ? ' to sit with you' : ''}.`;
    },
    sitWith(s, n) { Story.callOver(s, n, true); Story.bond(s, n, { rel: 1 }); },

    /* ---------- squad ---------- */
    makeSquad(s, name, tag) {
      const mod = window.BHModeration ? window.BHModeration.moderate(`${name} ${tag}`, { context: 'public', max: 40 }) : { verdict: 'ok' };
      if (mod.verdict === 'blocked') return { error: 'Pick another name.' };
      s.story.squad = { name: String(name).slice(0, 28), tag: String(tag).toUpperCase().slice(0, 5), members: s.story.bestie ? [s.story.bestie] : [], made: stamp(s) };
      Story.note(s, 'made_squad', null, { name: s.story.squad.name });
      return { ok: true };
    },

    /* ---------- the 👥 panel in story mode ---------- */
    openPanel() {
      const s = BH.Game.s;
      BH.Panels.open(() => {
        Story.ensure(s);
        const all = [...N().students(s)];
        const bf = s.story.bestie && N().get(s, s.story.bestie);
        const close = all.filter((n) => n.id !== (bf && bf.id)).sort((a, b) => b.rel - a.rel).slice(0, 6);
        const foes = all.filter((n) => n.rel < 25 || (n.rivalry || 0) >= 50).sort((a, b) => a.rel - b.rel).slice(0, 4);
        const where = (n) => U.esc(BH.Schedule.placeLabel(s, n));
        const row = (n, extra = '') => `<div class="person"><span class="p-emoji">${N().emoji(n)}</span><span class="p-text"><b>${U.esc(N().name(n))}</b><small>📍 ${where(n)} · ${N().relLabel(n)}${extra}</small></span>
          <button class="btn sm" data-act="storyCall" data-arg="${n.id}">📣 Call</button><button class="btn sm" data-act="storyFind" data-arg="${n.id}">📍</button></div>`;
        const sq = s.story.squad;
        return `<h2>👥 Your people</h2>
          <div class="card"><h3>💛 Best friend</h3>${bf ? row(bf, Story.bondLabel(bf) ? ' · ' + Story.bondLabel(bf) : '') : '<p class="muted">Nobody yet. Get close to someone (friendship 70+), then ask them in conversation.</p>'}</div>
          <div class="card"><h3>🏴 Squad</h3>${sq ? `<p><b>[${U.esc(sq.tag)}] ${U.esc(sq.name)}</b> · since ${U.esc(sq.made)}</p>${sq.members.map((id) => N().get(s, id)).filter(Boolean).map((n) => row(n)).join('') || '<p class="muted">Invite people in conversation (friendship 55+).</p>'}`
            : `<p class="muted">Start a squad — a name and a tag over your heads.</p><input id="sq-name" maxlength="28" placeholder="e.g. Back Bench Republic"><input id="sq-tag" maxlength="5" placeholder="e.g. BBR"><button class="chunky primary" data-act="storySquad">Create squad</button>`}</div>
          <div class="card"><h3>🤝 Closest</h3>${close.map((n) => row(n)).join('')}</div>
          ${foes.length ? `<div class="card"><h3>😤 Watch out for</h3>${foes.map((n) => row(n, (n.rivalry || 0) >= 50 ? ' · rival' : '')).join('')}</div>` : ''}
          ${BH.Net && BH.Net.available() ? '<p class="muted tiny">🌐 Real friends: Private School mode (coming soon) — <button class="btn ghost sm" data-act="openLobby">lobby</button></p>' : ''}`;
      }, { cls: 'sheet', kind: 'social' });
    },
  };

  /* ---------- automatic notes from what you do ---------- */
  BH.bus.on('snitch', (p, s) => { s = s || BH.Game.s; Story.note(s, 'snitched_on', p.npc, { what: p.what }); Story.bond(s, N().get(s, p.npc), { trust: -30, rel: -5 }); });
  BH.bus.on('npc:share', (p, s) => { s = s || BH.Game.s; Story.note(s, 'shared_food', p.id); Story.bond(s, N().get(s, p.id), { trust: 4 }); });
  BH.bus.on('npc:interact', (p, s) => { s = s || BH.Game.s; if (p.kind === 'gist') Story.note(s, 'gisted', p.id); });
  BH.bus.on('minigame', (p, s) => {
    s = s || BH.Game.s;
    (p.with || []).forEach((id) => { const n = N().get(s, id); if (!n) return; Story.note(s, 'played', id, { game: p.kind }); Story.bond(s, n, { rel: 3, trust: 2, rivalry: p.won && n.rivalry !== undefined ? 3 : 0 }); });
  });

  Object.assign(BH.actions, {
    storyCall(id) { const s = BH.Game.s; const n = N().get(s, id); if (n) toast(Story.callOver(s, n, false), 'info'); BH.Panels.closeKind('social', true); },
    storyFind(id) {
      const s = BH.Game.s; const n = N().get(s, id); if (!n) return;
      const pl = BH.Schedule.where(s, n);
      if (!pl.map) { toast(`${n.first} is off campus right now.`, 'info'); return; }
      const L = D.CAMPUS.LOCATIONS[pl.key];
      if (BH.Net) BH.Net.waypoint = { map: pl.map, x: L ? L.door.x : 1200, y: L ? L.door.y : 1200, actor: 'npc:' + n.id, until: Date.now() + 180000 };
      BH.Panels.closeKind('social', true);
      toast(`📍 ${n.first} is at the ${BH.Schedule.placeLabel(s, n)} — follow the blue marker.`, 'info');
    },
    storySquad() { const s = BH.Game.s; const r = Story.makeSquad(s, document.getElementById('sq-name').value || 'The Squad', document.getElementById('sq-tag').value || 'SQD'); if (r.error) toast(r.error, 'bad'); BH.Panels.refresh(); },
  });

  BH.registerSystem('Story', Story);
})(window.BH);
