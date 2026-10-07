/* Title screen, save-slot picker, how-to-play, game over */
(function (BH) {
  const U = BH.U;
  const UI = () => BH.UI;

  function slotList(mode) {
    return BH.Save.allMeta().map((m) => {
      if (m.empty) {
        return `<div class="slot empty"><div class="slot-info"><b>Slot ${m.slot}</b><span class="muted">Empty</span></div>
          ${mode === 'new' ? `<button class="btn primary sm" data-act="pickSlot" data-arg="${m.slot}">Start here</button>` : ''}</div>`;
      }
      if (m.corrupt) return `<div class="slot"><div class="slot-info"><b>Slot ${m.slot}</b><span class="muted">Corrupt save</span></div><button class="btn ghost sm" data-act="deleteSlot" data-arg="${m.slot}">🗑️</button></div>`;
      const when = new Date(m.updatedAt).toLocaleString();
      return `<div class="slot"><div class="slot-info"><b>Slot ${m.slot}: ${U.esc(m.name)}</b>
          <span class="muted">${m.gameOver ? '🏁 Finished · ' : ''}${m.level} · Term ${m.term} · Wk ${m.week} · ${m.day} · ${m.school}</span>
          <span class="muted tiny">Saved ${when}</span></div>
        <div class="slot-btns">
          ${mode === 'new' ? `<button class="btn warn sm" data-act="pickSlot" data-arg="${m.slot}">Overwrite</button>` : `<button class="btn primary sm" data-act="loadSlot" data-arg="${m.slot}">Load</button>`}
          <button class="btn ghost sm" data-act="deleteSlot" data-arg="${m.slot}" aria-label="Delete">🗑️</button>
        </div></div>`;
    }).join('');
  }

  BH.Screens.title = {
    render() {
      const last = BH.Save.lastSlot();
      const lastMeta = last && BH.Save.meta(last);
      return `<div class="title-screen">
        <div class="title-card">
          <div class="crest">🏫</div>
          <h1>BOARDING<br>HOUSE</h1>
          <p class="tagline">JSS1 to SS3. Garri, wahala, and growing up.</p>
          <div class="title-btns">
            ${lastMeta && !lastMeta.empty && !lastMeta.corrupt ? `<button class="btn primary big" data-act="loadSlot" data-arg="${last}">▶ Continue as ${U.esc(lastMeta.name)}<small>${lastMeta.level} · Term ${lastMeta.term} · ${lastMeta.day}</small></button>` : ''}
            <button class="btn ${lastMeta && !lastMeta.empty ? 'secondary' : 'primary'} big" data-act="newGameMenu">✏️ New Student</button>
            <button class="btn secondary" data-act="loadMenu">📂 Load Game</button>
            <button class="btn ghost" data-act="howTo">❓ How to Play</button>
            <button class="btn ghost" data-act="wTrophies">🏆 Trophy room</button>
          </div>
          <p class="muted tiny">Works offline · Saves on this device</p>
        </div>
      </div>`;
    },
  };

  BH.Screens.gameover = {
    render() {
      const s = BH.Game.s;
      const g = s.gameOver;
      const grad = g.kind === 'graduated';
      const h = s.stats_history;
      return `<div class="title-screen">
        <div class="title-card">
          <div class="crest">${grad ? '🎓' : '📜'}</div>
          <h1 class="${grad ? '' : 'bad'}">${grad ? 'GRADUATED!' : 'EXPELLED'}</h1>
          <p>${UI().md(g.text)}</p>
          <div class="card summary">
            <div><b>${U.esc(s.player.name)}</b> · ${U.esc(s.player.schoolName)}</div>
            <div class="muted">${g.when}</div>
            <div class="grid2">
              <span>📅 Days: ${h.daysPlayed}</span><span>🍛 Meals: ${h.meals}</span>
              <span>📝 Quizzes: ${h.quizzes}</span><span>✅ Correct: ${h.correct}</span>
              <span>🎯 Missions: ${h.missionsDone}</span><span>😖 Punished: ${h.punished}</span>
            </div>
          </div>
          ${grad && s.certificates ? `<div class="card certs left">${BH.Screens.me.certHtml(s)}</div>` : ''}
          ${s.reports && s.reports.length ? `<button class="btn secondary" data-act="viewReport" data-arg="${s.reports.length - 1}">📜 View final report card</button>` : ''}
          <button class="btn primary big" data-act="toTitle">🏠 Back to title</button>
        </div>
      </div>`;
    },
  };

  Object.assign(BH.actions, {
    newGameMenu() {
      UI().modal(`<h2>Choose a save slot</h2><p class="muted">Your new student will live here.</p>${slotList('new')}`);
    },
    loadMenu() {
      UI().modal(`<h2>Load game</h2>${slotList('load')}`);
    },
    pickSlot(slot) {
      BH.Screens.create.slot = Number(slot);
      UI().go('create');
    },
    loadSlot(slot) {
      if (!BH.Game.load(Number(slot))) UI().toast('Could not load that save 😢', 'bad');
    },
    deleteSlot(slot) {
      const m = BH.Save.meta(Number(slot));
      if (!confirm(`Delete slot ${slot}${m && m.name ? ` (${m.name})` : ''}? This cannot be undone.`)) return;
      BH.Save.remove(Number(slot));
      UI().closeModal(true);
      if (UI().screen === 'title') UI().render();
      UI().toast('Save deleted', 'info');
    },
    toTitle() { BH.Game.s = null; UI().go('title'); },
    howTo() {
      UI().modal(`<h2>How to play</h2>
        <ul class="howto">
          <li><b>🗺️ Free roam</b> — walk anywhere (joystick / WASD / tap). Walk into a door to go inside; every building has its own interior. Nothing forces you — the game reacts.</li>
          <li><b>⌨️ Interact</b> — near something, a prompt pops up: <b>E</b> / tap for the main action, <b>F</b> for the second, <b>⋯</b> / hold E / long-press / Q for everything else.</li>
          <li><b>⏰ The world runs on a clock</b> — bells ring and everybody moves to class, dining, prep, bed. The HUD tells you where you're expected. Not there = absent; late = late. Teachers and prefects may notice.</li>
          <li><b>🎯 Missions have deadlines</b> — people call you with errands; accept, refuse or ignore them (all have consequences). Solve them any way you like. Tap a mission for a 📍 waypoint.</li>
          <li><b>👁️ Rules & getting caught</b> — prefects, teachers and the house master have vision cones. Break a rule in their sight and the 👁️ meter fills. Hide in toilets, under bunks, in bushes.</li>
          <li><b>📝 Classes</b> — sit at your desk during class to attend. Tests in weeks 4 & 8, exams in week 10; preparation gives hints. Study in the library, at prep, with friends, with notes or paid lessons.</li>
          <li><b>😴 Sleep & wait</b> — sleep in your bed at night for proper rest (or anywhere, riskily). ⏳ fast-forwards time.</li>
          <li><b>🗣️ Gist</b> — people talk about what you do. Ask for gist, or stand near people chatting to overhear secrets.</li>
          <li><b>🏆 Many ways to win</b> — scholar, sports star, prefect, hustler, celebrity or troublemaker legend.</li>
          <li><b>💾 Saving</b> — autosaves when you enter/leave a building and at the end of each day. Game speed is in ⚙️.</li>
        </ul>`);
    },
  });
})(window.BH);
