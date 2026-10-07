/* Avatar editor: spinning 3D preview + options. Used at character creation and in the Me tab ("Change look"). */
(function (BH) {
  const D = BH.data;
  const UI = () => BH.UI;

  const AvatarUI = {
    draft: null,      // avatar being edited in the Me-tab modal

    /* target: 'create' | 'me' */
    editorHtml(av, gender, target) {
      const A = D.AVATAR;
      const row = (field, items, swatch) => `<div class="av-row">${items.map((it) => {
        const on = av[field] === it.id;
        return swatch
          ? `<button class="swatch ${on ? 'on' : ''}" style="background:${it.hex}" title="${it.label}" data-act="avOpt" data-arg="${target}|${field}|${it.id}"></button>`
          : `<button class="pill sm ${on ? 'on' : ''}" data-act="avOpt" data-arg="${target}|${field}|${it.id}">${it.label}</button>`;
      }).join('')}</div>`;
      const hairs = A.hair[gender === 'f' ? 'f' : 'm'];
      return `<div class="av-editor">
        <div class="av-stage" id="av-stage-${target}"></div>
        <p class="muted tiny center">👆 Drag to spin</p>
        <label class="lbl">Skin tone</label>${row('skin', A.skins, true)}
        <label class="lbl">Hair</label>${row('hair', hairs)}
        ${av.hair === 'bald' ? '' : `<label class="lbl">Hair colour</label>${row('hairColor', A.hairColors, true)}`}
        <label class="lbl">Build</label>${row('build', A.builds)}
        <label class="lbl">Height</label>${row('height', A.heights)}
        <div class="av-row"><button class="pill sm ${av.glasses ? 'on' : ''}" data-act="avOpt" data-arg="${target}|glasses|toggle">👓 Glasses</button></div>
      </div>`;
    },

    mountViewer(target, av, outfit) {
      return BH.Avatar3D.viewer(document.getElementById('av-stage-' + target), av, outfit);
    },
  };

  Object.assign(BH.actions, {
    avOpt(arg) {
      const [target, field, value] = arg.split('|');
      const av = target === 'create' ? BH.Screens.create.form.avatar : AvatarUI.draft;
      if (!av) return;
      if (field === 'glasses') av.glasses = !av.glasses; else av[field] = value;
      if (target === 'create') {
        const y = window.scrollY; UI().render(); window.scrollTo(0, y);
      } else {
        const s = BH.Game.s;
        UI().updateModal(BH.actions._meEditorHtml());
        BH.Avatar3D.sweep();
        AvatarUI.mountViewer('me', av, BH.Avatar3D.outfitFor(s));
      }
    },
    editLook() {
      const s = BH.Game.s;
      AvatarUI.draft = Object.assign({}, s.player.avatar || D.defaultAvatar(s.player.gender, s.player.religion));
      UI().modal(BH.actions._meEditorHtml(), { onClose: () => { BH.Avatar3D.sweep(); UI().refresh(); } });
      AvatarUI.mountViewer('me', AvatarUI.draft, BH.Avatar3D.outfitFor(s));
    },
    _meEditorHtml() {
      const s = BH.Game.s;
      return `<h2>✂️ Change your look</h2><p class="muted tiny">New term, new hairstyle. (Inspection prefect go still judge you.)</p>
        ${AvatarUI.editorHtml(AvatarUI.draft, s.player.gender, 'me')}
        <button class="btn primary big" data-act="saveLook">💾 Save look</button>`;
    },
    saveLook() {
      const s = BH.Game.s;
      s.player.avatar = Object.assign({}, AvatarUI.draft);
      BH.Save.save(s);
      BH.World && BH.World.refreshPlayer();
      BH.Sprites && BH.Sprites.clearPortraits();
      UI().closeModal();
      UI().toast('Fresh look! 😎', 'good');
    },
  });

  BH.AvatarUI = AvatarUI;
})(window.BH);
