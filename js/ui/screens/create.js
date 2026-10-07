/* Character creation.
   Step 1: who YOU are (name, gender, personality).
   Step 2: the dice of life — family, state, religion and school are rolled by pure luck. No rerolls. */
(function (BH) {
  const U = BH.U;
  const D = BH.data;

  const FAMILY_FLAVOUR = {
    struggling: ['Mummy sell pepper for market, Daddy dey drive okada. Money no dey, but love full ground.', 'Your parents don borrow money from three church members to pay your fees. No disgrace them o.'],
    middle: ['Daddy na civil servant, Mummy get small provision shop. Milo dey, but na measured Milo.', 'Your parents na teachers. Expectations: very high. Pocket money: average.'],
    bigman: ['Daddy na Honourable. Una get generator wey dey on by itself. Seniors go love your chop box.', 'Your Mummy na big businesswoman for Lekki. The driver go drop you for school.'],
  };

  const Create = {
    slot: 1,
    form: null,
    life: null,   // rolled circumstances (step 2)

    reset() {
      Create.form = { name: '', gender: 'm', traits: [], avatar: D.defaultAvatar('m') };
      Create.life = null;
    },

    render() {
      if (!Create.form) Create.reset();
      return Create.life ? Create.renderReveal() : Create.renderForm();
    },

    renderForm() {
      const f = Create.form;
      const opt = (group, key, label, sel) => `<button class="pill ${sel ? 'on' : ''}" data-act="cf" data-arg="${group}:${key}">${label}</button>`;
      return `<div class="create">
        <header class="create-head"><button class="btn ghost sm" data-act="toTitle">← Back</button><h1>New Student</h1><span class="muted">Slot ${Create.slot}</span></header>

        <section class="card">
          <label class="lbl">Your name</label>
          <input id="cf-name" class="input" maxlength="24" placeholder="e.g. Chukwuemeka Adebayo" value="${U.esc(f.name)}" autocomplete="off">
          <label class="lbl">Gender</label>
          <div class="pills">${opt('gender', 'm', '👦🏾 Boy', f.gender === 'm')}${opt('gender', 'f', '👧🏾 Girl', f.gender === 'f')}</div>
        </section>

        <section class="card"><h3>Your look</h3>
          ${BH.AvatarUI.editorHtml(f.avatar, f.gender, 'create')}
        </section>

        <section class="card"><h3>Personality <small class="muted">— pick 2 (${f.traits.length}/2)</small></h3>
          <div class="trait-grid">${Object.entries(D.TRAITS).map(([k, t]) => `
            <button class="trait ${f.traits.includes(k) ? 'on' : ''}" data-act="cf" data-arg="trait:${k}">
              <span class="tr-emoji">${t.emoji}</span><b>${t.label}</b><small>${t.desc}</small></button>`).join('')}
          </div>
        </section>

        <section class="card note-card">
          <p>🎲 <b>You no fit choose your family.</b> Your parents, state of origin, religion and the school dem fit afford go be by pure luck — just like real life.</p>
        </section>

        <div class="create-go"><button class="btn primary big" data-act="rollLife">🎲 Roll your life</button></div>
      </div>`;
    },

    renderReveal() {
      const f = Create.form, L = Create.life;
      const bg = D.BACKGROUNDS[L.background];
      const sc = D.SCHOOLS[L.school];
      const rel = D.RELIGIONS[L.religion];
      const odds = D.FAMILY_ODDS[L.background];
      const rarity = odds <= 15 ? '<span class="tag good">RARE · ' + odds + '%</span>' : '<span class="tag">' + odds + '% of students</span>';
      const card = (i, emoji, title, body, extra = '') => `
        <div class="reveal-card" style="animation-delay:${0.25 + i * 0.45}s">
          <span class="pc-emoji">${emoji}</span>
          <span class="pc-text"><small class="reveal-k">${title}</small>${body}${extra}</span>
        </div>`;
      return `<div class="create">
        <header class="create-head"><span></span><h1>Your Life Don Roll 🎲</h1><span class="muted">Slot ${Create.slot}</span></header>
        <section class="card">
          <div class="av-stage small" id="av-stage-reveal"></div>
          <h2 class="center">${U.esc(f.name)}</h2>
          <p class="muted tiny center">In your ${sc.short} uniform 👆 drag to spin</p>
          <div class="traits">${f.traits.map((t) => `<span class="tag">${D.TRAITS[t].emoji} ${D.TRAITS[t].label}</span>`).join('')}</div>
          <div class="reveal-list">
            ${card(0, bg.emoji, 'Born into', `<b>${bg.label} family</b> ${rarity}<small>${U.seedPick(FAMILY_FLAVOUR[L.background], f.name)}</small>`, `<small class="pc-meta">Pocket money: ${U.money(bg.money)}</small>`)}
            ${card(1, '📍', 'From', `<b>${L.origin} State</b><small>Your Nigerian language subject: ${D.LANGUAGES[L.lang]}</small>`)}
            ${card(2, rel.emoji, 'Raised', `<b>${rel.label}</b><small>You go take ${rel.rs} and attend ${rel.fellowship}.</small>`)}
            ${card(3, sc.emoji, L.scholarship ? 'Scholarship! 🎉 Your parents could never afford it, but you won a place at' : 'Your parents send you to', `<b>${sc.label}</b><small>${sc.desc}</small>`, `<small class="pc-meta">Food ${'🍛'.repeat(sc.food)} · Water ${'💧'.repeat(sc.water)} · Strict ${Math.round(sc.strict * 10)}/10</small>`)}
          </div>
        </section>
        <div class="create-go reveal-go"><button class="btn primary big" data-act="startGame">🚌 Resume School!</button>
          <p class="muted tiny center">No rerolls. Na the life wey God give you be this. 😅</p></div>
      </div>`;
    },

    mount() {
      const name = document.getElementById('cf-name');
      name && name.addEventListener('input', (e) => { Create.form.name = e.target.value; });
      const f = Create.form;
      if (Create.life) {
        BH.Avatar3D.viewer(document.getElementById('av-stage-reveal'), f.avatar, { school: Create.life.school, level: 1, gender: f.gender, house: '#c0392b' });
      } else {
        BH.AvatarUI.mountViewer('create', f.avatar, { school: 'fgc', level: 1, gender: f.gender, house: '#c0392b' });
      }
    },
  };

  Object.assign(BH.actions, {
    cf(arg) {
      const [group, key] = arg.split(':');
      const f = Create.form;
      if (group === 'trait') {
        if (f.traits.includes(key)) f.traits = f.traits.filter((t) => t !== key);
        else if (f.traits.length < 2) f.traits.push(key);
        else { f.traits.shift(); f.traits.push(key); }
      } else {
        f[group] = key;
        if (group === 'gender') {
          const ok = D.AVATAR.hair[key].some((h) => h.id === f.avatar.hair);
          if (!ok) f.avatar.hair = D.defaultAvatar(key).hair;
        }
      }
      const y = window.scrollY;
      BH.UI.render();
      window.scrollTo(0, y);
    },
    rollLife() {
      const f = Create.form;
      if (!f.name.trim()) { BH.UI.toast('Abeg, write your name first ✍️', 'bad'); document.getElementById('cf-name').focus(); return; }
      if (f.traits.length !== 2) { BH.UI.toast('Pick exactly 2 personality traits', 'bad'); return; }
      Create.life = BH.rollLife();
      BH.UI.render();
      window.scrollTo(0, 0);
      if (Create.life.background === 'bigman' || Create.life.scholarship) setTimeout(() => BH.UI.burst(['💎', '🎉', '✨']), 900);
    },
    startGame() {
      if (!Create.life) return;
      BH.Game.newGame(Object.assign({ slot: Create.slot }, Create.form, Create.life));
      Create.reset();
    },
  });

  BH.Screens.create = Create;
})(window.BH);
