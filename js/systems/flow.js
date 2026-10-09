/* Making choices FEEL consequential (Detroit-style):
   · "💭 Dami will remember that." — whenever something that a key character (or staff member) will remember is
     written to the story ledger, and at the end of every story choice that moved a bond.
   · ⚡ turning points: beats marked `turning` say "This changed Dami's story" and show as ⚡ nodes.
   · The chapter flowchart: after each term's report card, a flowchart of that term — per character, every moment you
     found (your choice lit, the other branches locked 🔒), the moments you never discovered, and where each
     character's story is heading now (↗ / → / ↘, with ▲▼ against last term). Also in ⚙️ → 📖 Chapters. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const St = () => BH.Story;
  const N = () => BH.NPC;
  const beats = () => (BH.Content.get('arcs') || { beats: [] }).beats;
  const cast = () => ((BH.Content.get('cast') || {}).cast || []);
  const LEVEL = (stamp) => D.LEVELS.indexOf(stamp.replace(/T\d$/, '')) + 1;
  const TERM = (stamp) => Number(stamp.slice(-1));
  const hi = (r, end) => (r === undefined ? end : Array.isArray(r) ? r[1] : r);

  // ledger entries that people remember (the rest are small)
  const MEMORABLE = new Set(['snitched_on', 'defended', 'fought', 'helped', 'ignored', 'told_secret', 'kept_secret', 'lied_to', 'laughed_at',
    'apologised', 'stood_up', 'stopped_expo', 'joined_expo', 'best_friend', 'squad', 'signed_shirt', 'said_goodbye', 'caught_stealing',
    'read_notebook', 'bridged', 'night_story', 'danced', 'betrayed', 'forgave']);
  const TRAJ = { best: { icon: '↗', text: 'heading somewhere bright', cls: 'up' }, mid: { icon: '→', text: 'could go either way', cls: 'mid' }, low: { icon: '↘', text: 'drifting away from you', cls: 'down' } };
  const RANK = { low: 0, mid: 1, best: 2 };

  const Flow = {
    choosing: false,
    shown: {},

    /* ---------- 💭 "will remember that" ---------- */
    who(s, id) { const n = id && N().get(s, id); if (!n) return null; return n.key || n.type === 'staff' || n.type === 'teacher' ? n : null; },
    nameOf(n) { return n.type === 'senior' ? N().name(n) : n.type === 'staff' || n.type === 'teacher' ? N().name(n) : n.first; },
    remember(list) {
      const names = [...new Set(list.map((n) => Flow.nameOf(n)))];
      if (!names.length) return '';
      const who = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
      return `💭 ${who} will remember that.`;
    },
    onNote(e, s) {
      if (!s || Flow.choosing || (BH.Pacing && BH.Pacing.simulating) || !MEMORABLE.has(e.k)) return;
      const n = Flow.who(s, e.who);
      if (!n) return;
      const key = `${e.k}|${e.who}|${s.time.dayCount}`;
      if (Flow.shown[key]) return;
      Flow.shown[key] = true;
      if (BH.UI && BH.UI.toast) setTimeout(() => BH.UI.toast(Flow.remember([n]), 'remember'), 350);
    },
    /* the lines added under a story choice's outcome */
    outcomeLines(s, b, fx, before) {
      const out = [];
      const moved = [];
      Object.entries(before).forEach(([id, v]) => {
        const n = N().get(s, id);
        if (!n) return;
        const delta = Math.abs((n.rel || 0) - v.rel) + Math.abs((n.trust || 0) - v.trust) + Math.abs((n.rivalry || 0) - v.rivalry) + Math.abs((n.respect || 0) - v.respect);
        if (delta >= 5) moved.push(n);
      });
      const noted = (fx.note || []).map((k) => (typeof k === 'string' ? b.char : k.who === 'char' ? b.char : k.who)).filter(Boolean).map((id) => N().get(s, id)).filter(Boolean);
      const rem = Flow.remember([...moved, ...noted].filter((n) => n.key || n.type === 'staff'));
      if (rem) out.push(`_${rem}_`);
      const n = b.char && N().get(s, b.char);
      if ((b.turning || fx.end || fx.leave) && n) out.push(`⚡ _This changed ${Flow.nameOf(n)}'s story._`);
      else if (b.turning && !n && b.char) out.push('⚡ _This changed their story._');
      return out;
    },
    snapshot(s, b, fx) {
      const ids = new Set([b.char]);
      ['rel', 'trust', 'rivalry', 'respect', 'crush'].forEach((d) => { if (fx[d] && typeof fx[d] === 'object') Object.keys(fx[d]).forEach((k) => ids.add(k === 'char' ? b.char : k)); });
      const out = {};
      ids.forEach((id) => { const n = id && N().get(s, id); if (n) out[id] = { rel: n.rel || 0, trust: n.trust || 0, rivalry: n.rivalry || 0, respect: n.respect || 0 }; });
      return out;
    },

    /* ---------- trajectories ---------- */
    trajectories(s) {
      const out = {};
      if (!BH.Milestones) return out;
      cast().forEach((d) => { const e = BH.Milestones.endOf(s, d); if (e) out[d.id] = e.left ? 'left:' + e.end : e.end; });
      return out;
    },

    /* ---------- the flowchart for one chapter ---------- */
    build(s, stamp) {
      const lvl = LEVEL(stamp), term = TERM(stamp);
      const current = stamp === St().stamp(s);
      const log = (s.story.beatLog || []).filter((x) => x.at === stamp);
      const done = s.story.done || {};
      const chapter = (s.story.chapters || []).find((c) => c.id === stamp);
      const idx = (s.story.chapters || []).findIndex((c) => c.id === stamp);
      const prev = idx > 0 ? s.story.chapters[idx - 1].traj : null;
      const traj = chapter && chapter.traj ? chapter.traj : Flow.trajectories(s);
      const chars = {};
      const met = (id) => !!(N().get(s, id) || (s.npcs.left || {})[id]);
      const row = (id) => (chars[id] = chars[id] || { id, nodes: [], missed: 0 });
      // the moments you found
      log.forEach((x) => {
        const b = beats().find((y) => y.id === x.id);
        if (!b) return;
        const picked = x.choice !== undefined ? x.choice : (b.choices || []).findIndex((c) => (c.id || c.label) === done[b.id]);
        row(b.char || 'school').nodes.push({ b, title: x.title, emoji: x.emoji, picked, ignored: x.choice === -1, turning: !!b.turning });
      });
      // the ones whose window closed this chapter without you finding them
      if (!current) beats().forEach((b) => {
        if (done[b.id] || !b.char || !met(b.char)) return;
        const lastY = hi(b.year, 6), lastT = b.term === undefined ? 3 : hi(b.term, 3);
        if (lastY === lvl && lastT === term) row(b.char).missed++;
      });
      const rows = Object.values(chars).map((r) => {
        const d = cast().find((c) => c.id === r.id);
        const n = N().get(s, r.id);
        const t = traj[r.id];
        const end = t ? t.replace('left:', '') : null;
        const was = prev && prev[r.id] ? prev[r.id].replace('left:', '') : null;
        const delta = end && was ? RANK[end] - RANK[was] : 0;
        return Object.assign(r, { emoji: d ? d.emoji : '🏫', name: n ? Flow.nameOf(n) : d ? ((s.npcs.left || {})[r.id] || {}).name || d.nick : 'School', bond: n && n.key && St().bondLabel ? St().bondLabel(s, n) : '', end, delta, left: t && t.startsWith('left:') });
      });
      rows.sort((a, b) => b.nodes.length - a.nodes.length);
      const found = log.length, missed = rows.reduce((a, r) => a + r.missed, 0);
      return { stamp, title: BH.Milestones ? BH.Milestones.stampTitle(stamp) : stamp, label: `${D.LEVELS[lvl - 1]} · Term ${term}`, rows, found, missed, current };
    },
    html(s, stamp) {
      const f = Flow.build(s, stamp);
      const b2 = (b, picked) => (b.choices || []).map((c, i) => (i === picked
        ? `<span class="br on">✓ ${U.esc(BH.Arcs.fill(s, c.label, b))}</span>`
        : `<span class="br lock" title="A path you didn't take">🔒</span>`)).join('');
      const rows = f.rows.map((r) => `
        <div class="flow-char">
          <div class="fc-head"><span class="fc-em">${r.emoji}</span><b>${U.esc(r.name)}</b>
            ${r.end ? `<small class="traj ${TRAJ[r.end].cls}">${r.left ? '📦 left school · ' : ''}${TRAJ[r.end].icon} ${TRAJ[r.end].text}${r.delta > 0 ? ' <i class="up">▲</i>' : r.delta < 0 ? ' <i class="down">▼</i>' : ''}</small>` : ''}
            ${r.bond ? `<small class="muted">${U.esc(r.bond)}</small>` : ''}</div>
          <div class="fc-nodes">
            ${r.nodes.map((x) => `<div class="fnode ${x.turning ? 'turn' : ''} ${x.ignored ? 'ignored' : ''}">
              <div class="fn-title">${x.turning ? '⚡ ' : ''}${x.emoji} ${U.esc(x.title)}</div>
              <div class="branches">${x.ignored ? '<span class="br ign">🙈 You ignored this</span>' + (x.b.choices || []).map(() => '<span class="br lock">🔒</span>').join('') : b2(x.b, x.picked)}</div></div>`).join('')}
            ${r.missed ? `<div class="fnode missed"><div class="fn-title">🔒 ${r.missed} moment${r.missed > 1 ? 's' : ''} you never discovered</div></div>` : ''}
          </div>
        </div>`).join('');
      return `<div class="flow">
        <h2>🔀 ${U.esc(f.title)}</h2>
        <p class="muted">${f.label}${f.current ? ' · so far' : ''} · You found <b>${f.found}</b> moment${f.found === 1 ? '' : 's'}${f.missed ? ` · <b>${f.missed}</b> stayed hidden` : ''}</p>
        ${rows || '<p class="muted">A quiet term — nothing big happened. Talk to people; their stories find you.</p>'}
        <p class="muted tiny">🔒 = a path you didn't take. Every playthrough can unlock different branches.</p>
      </div>`;
    },
    open(stamp) {
      const s = BH.Game.s;
      if (!s || !BH.Panels) return;
      BH.Panels.open(() => `${Flow.html(s, stamp || St().stamp(s))}<button class="chunky primary" data-act="closePanel">▶ Continue</button>`, { cls: 'sheet', kind: 'flow' });
    },

    /* ---------- show the flowchart after the term's report card ---------- */
    onTermEnd(s) { s.story.flowPending = St().stamp(s); },
    poll() {
      const s = BH.Game && BH.Game.s;
      if (!s || !s.story || !s.story.flowPending || s.gameOver) return;
      if (!BH.UI || BH.UI.screen !== 'game' || BH.Panels.isOpen() || (s.queue && s.queue.length)) return;
      const stamp = s.story.flowPending;
      s.story.flowPending = null;
      if ((s.story.beatLog || []).some((x) => x.at === stamp)) Flow.open(stamp);
    },
  };

  BH.bus.on('story:note', (e, s) => Flow.onNote(e, s || BH.Game.s));
  Object.assign(BH.actions || {}, { openFlow(stamp) { Flow.open(stamp); } });
  if (typeof setInterval === 'function' && typeof document !== 'undefined') setInterval(() => { try { Flow.poll(); } catch (e) { /* never break the game */ } }, 1200);

  BH.Flow = Flow;
  BH.registerSystem('Flow', Flow);
})(window.BH);
