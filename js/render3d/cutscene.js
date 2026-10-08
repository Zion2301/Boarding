/* Resumption-day cutscene (~13 s, skippable): your parents' car pulls up to a crowded school gate — other cars,
   parents dragging chop boxes and buckets, hawkers, Mallam Musa checking names, students hugging, somebody's mum
   crying — then the camera hands you control just inside the gate. Extras are ordinary actors (kind 'extra'). */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3));

  const Cutscene = {
    active: false, t: 0, cues: [], car: null, root: null,

    play(E) {
      const s = BH.Game.s;
      if (Cutscene.active) return;
      Cutscene.active = true; Cutscene.t = 0; Cutscene.E = E;
      const T = THREE, S = E.S;
      const root = new T.Group(); root.name = 'cutscene';
      E.mapRoot.add(root); Cutscene.root = root;
      // the road outside the gate
      const road = new T.Mesh(new T.BoxGeometry(60, 0.05, 3.2), new T.MeshLambertMaterial({ color: '#a85f36' }));
      road.position.set(1200 * S, 0.03, 1880 * S); road.receiveShadow = true; root.add(road);
      const car = (color, x, y, rot = 0) => {
        const g = new T.Group();
        const body = new T.Mesh(new T.BoxGeometry(1.8, 0.6, 4.1), new T.MeshLambertMaterial({ color }));
        body.position.y = 0.55; body.castShadow = true;
        const cab = new T.Mesh(new T.BoxGeometry(1.6, 0.55, 2.1), new T.MeshLambertMaterial({ color: '#cfd8dc' }));
        cab.position.set(0, 1.1, -0.2);
        g.add(body, cab);
        [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]].forEach(([wx, wz]) => { const w = new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.25, 10), new T.MeshLambertMaterial({ color: '#212121' })); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.33, wz); g.add(w); });
        g.position.set(x * S, 0, y * S); g.rotation.y = rot;
        root.add(g); return g;
      };
      // parked cars and the danfo bus everybody's sister came in
      car('#c62828', 860, 1905, Math.PI / 2); car('#fafafa', 1010, 1912, Math.PI / 2); car('#1565c0', 1420, 1905, Math.PI / 2); car('#ffb300', 1560, 1910, Math.PI / 2);
      Cutscene.car = car(['#2e7d32', '#37474f', '#6a1b9a', '#8d6e63'][U.hash(s.player.name) % 4], 420, 1868, Math.PI / 2);
      // the crowd
      const mk = (id, look, x, y, h = -Math.PI / 2, extra = {}) => BH.Actors.make('x:' + id, Object.assign({ kind: 'extra', map: 'campus', x, y, h, look, maxSpeed: 55 }, extra));
      const student = (id, g, lvl, x, y, h, extra) => mk(id, { av: D.npcAvatar({ id, first: id, gender: g, tribe: ['Yoruba', 'Igbo', 'Hausa', 'Edo'][U.hash(id) % 4] }), outfit: { kind: 'student', school: s.player.school, level: lvl, gender: g, style: 'casual', seed: id } }, x, y, h, extra);
      const adult = (id, g, role, x, y, h, extra) => mk(id, { av: D.npcAvatar({ id, first: id, gender: g, tribe: ['Yoruba', 'Igbo', 'Hausa'][U.hash(id) % 3] }), outfit: { kind: 'adult', gender: g, role, seed: id } }, x, y, h, extra);
      const pg = U.hash(s.player.name) % 2 ? 'f' : 'm';
      Cutscene.cast = {
        gate: adult('musa', 'm', 'gateman', 1200, 1792, Math.PI / 2),
        hawker1: adult('hawk1', 'f', null, 980, 1850, 0, { carry: 'box' }),
        hawker2: adult('hawk2', 'f', null, 1470, 1852, Math.PI, { carry: 'box' }),
        dad1: adult('par1', 'm', null, 900, 1868, 0, { carry: 'box' }),
        mum1: adult('par2', 'f', null, 1500, 1872, Math.PI, { carry: 'bucket' }),
        cry: adult('cry', 'f', null, 1280, 1838, Math.PI, { pose: 'kneel' }),
        kid: student('kid', 'm', 1, 1262, 1836, 0, {}),
        hug1: student('hug1', 'f', 3, 1100, 1822, 0, {}),
        hug2: student('hug2', 'f', 3, 1122, 1822, Math.PI, {}),
        walk1: student('walk1', 'm', 2, 1000, 1880, 0, { carry: 'bucket' }),
        walk2: student('walk2', 'f', 4, 1380, 1885, Math.PI, { carry: 'box' }),
        parent: adult('mine', pg, null, 1130, 1860, -Math.PI / 2, { hidden: true }),
      };
      const pl = BH.Actors.player();
      if (pl) { pl.hidden = true; Object.assign(pl, { x: 1150, y: 1858, path: [], move: null }); }
      // the script
      const say = (who, text, ms = 3200) => { const a = Cutscene.cast[who] || BH.Actors.player(); if (a) a.bubble = { text, until: performance.now() + ms }; };
      const walk = (who, pts) => { const a = Cutscene.cast[who]; if (a) BH.Intents.push(a.id, { type: 'path', path: pts.map(([x, y]) => ({ x, y })) }); };
      const bg = D.BACKGROUNDS[s.player.background];
      Cutscene.cues = [
        [0, () => { Cutscene.caption(`${s.player.schoolName}`, 'Resumption Day · Sunday, 2 PM'); Cutscene.cam({ x: 520, y: 1868 }, -1.15, 0.32, 13); walk('dad1', [[1050, 1840], [1150, 1815]]); walk('mum1', [[1350, 1845], [1250, 1818]]); walk('walk1', [[1120, 1830], [1180, 1815]]); walk('walk2', [[1280, 1835], [1215, 1815]]); }],
        [1.5, () => say('hawker1', '"Pure water! Gala! Buy your Gala! 🥤"')],
        [3.2, () => { say('hawker2', '"Chin-chin! Plantain chips! Last-last provision!"'); say('hug1', '"Na YOU?! Welcome back!!" 🤗'); }],
        [4.5, () => { say('gate', '"Name? … Which class? … Oya, enter! NEXT!"', 3500); Cutscene.cam({ x: 1200, y: 1820 }, -0.35, 0.42, 12); }],
        [6.3, () => { say('cry', '"😭 My baby! Make you bathe every day o! Don\'t forget to eat!"', 3800); say('kid', '"Mummy stop, people dey look!" 😩'); }],
        [7.4, () => { const p = Cutscene.cast.parent; p.hidden = false; if (pl) { pl.hidden = false; pl.h = -Math.PI / 2; } Cutscene.cam({ x: 1160, y: 1850 }, 0.3, 0.38, 7.5); }],
        [8.2, () => say('parent', `"${U.fill(bg.parentLine, { money: U.money(s.money) }).replace(/^[^:]*:\s*"?|"$/g, '').slice(0, 120)}"`, 4300)],
        [10.5, () => { if (pl) BH.Intents.push('player', { type: 'path', path: [{ x: 1190, y: 1810 }, { x: 1200, y: 1745 }] }); Cutscene.cam({ x: 1200, y: 1760 }, 0.15, 0.55, 10); Cutscene.caption('Welcome to boarding house.', 'Three months. No parents. Let\'s go. 🎒'); }],
        [13, () => Cutscene.finish()],
      ];
      Cutscene.overlay(true);
    },

    cam(p, yaw, pitch, dist) {
      const r = Cutscene.E.rig, S = Cutscene.E.S;
      r.mode = 'cine';
      r.focusGoal.set(p.x * S, 1, p.y * S);
      r.yawGoal = yaw; r.pitchGoal = pitch; r.distGoal = dist;
    },
    caption(title, sub) { const el = document.getElementById('cine-cap'); if (el) el.innerHTML = `<b>${U.esc(title)}</b>${sub ? `<small>${U.esc(sub)}</small>` : ''}`; },
    overlay(on) {
      let el = document.getElementById('cine');
      if (on && !el) {
        el = document.createElement('div'); el.id = 'cine';
        el.innerHTML = '<div class="cine-bar top"></div><div class="cine-bar bot"><div id="cine-cap"></div><button class="chunky small ghost" data-act="cineSkip">Skip ⏭</button></div>';
        document.body.appendChild(el);
        Cutscene.caption(BH.Game.s.player.schoolName, 'Resumption Day');
      }
      if (!on && el) el.remove();
      document.body.classList.toggle('cinematic', on);
    },

    update(dt) {
      if (!Cutscene.active) return;
      Cutscene.t += dt;
      const t = Cutscene.t, S = Cutscene.E.S;
      while (Cutscene.cues.length && Cutscene.cues[0][0] <= t) Cutscene.cues.shift()[1]();
      // the family car drives up and parks by the gate
      if (Cutscene.car) {
        const k = ease((t - 0.3) / 6.2);
        const x = 420 + (1110 - 420) * k;
        Cutscene.car.position.x = x * S;
        if (t < 4.5) Cutscene.cam({ x: x + 60, y: 1868 }, -1.15 + k * 0.6, 0.32, 13 - k * 2);
      }
      // huggers bounce, the crowd keeps busy
      const c = Cutscene.cast;
      if (c && Math.floor(t * 2) % 3 === 0) { [c.hug1, c.hug2].forEach((a) => { a.emote = { anim: 'cheer', until: performance.now() + 600 }; }); }
    },

    finish() {
      if (!Cutscene.active) return;
      Cutscene.active = false;
      Cutscene.cues = [];
      Cutscene.overlay(false);
      const pl = BH.Actors.player();
      if (pl) { pl.hidden = false; BH.World.snap({ x: 1200, y: 1690 }); }
      // the family car drives off; the crowd stays for the afternoon
      if (Cutscene.car) Cutscene.car.visible = false;
      if (Cutscene.cast) { Cutscene.cast.parent.hidden = true; Cutscene.cast.cry.pose = 'kneel'; }
      const r = Cutscene.E.rig;
      r.mode = 'follow'; r.yawGoal = 0.6; r.pitchGoal = 0.72; r.distGoal = 14;
      BH.Onboarding && BH.Onboarding.cutsceneDone(BH.Game.s);
    },
  };

  Object.assign(BH.actions, { cineSkip() { Cutscene.finish(); } });
  BH.Cutscene = Cutscene;
})(window.BH);
