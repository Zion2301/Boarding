/* Procedural placeholder art: top-down characters drawn from avatar data (front + back views),
   and RPG portraits for the dialogue box. Replace with real sheets via BH.data.SPRITES later. */
(function (BH) {
  const D = BH.data;
  const find = (list, id) => list.find((x) => x.id === id) || list[0];
  const TEACHER_TOPS = ['#3f51b5', '#8d6e63', '#00897b', '#6a1b9a', '#c62828', '#ef6c00', '#2e7d32'];
  const portraits = {};

  /* outfit: { school, level, gender, house, kind: 'student'|'teacher', top?, bottom? } */
  function draw(g, av, o, facing) {
    const A = D.AVATAR;
    const skin = find(A.skins, av.skin).hex;
    const hair = find(A.hairColors, av.hairColor).hex;
    const teacher = o.kind === 'teacher';
    const uni = teacher ? { top: o.top, bottom: o.bottom, socks: o.bottom, shoes: '#2b1a10' } : (D.UNIFORMS[o.school] || D.UNIFORMS.fgc);
    const W = find(A.builds, av.build).w;
    const girl = o.gender === 'f';
    const juniorBoy = !girl && !teacher && (o.level || 1) <= 3;
    const cx = 16;
    const front = facing !== 'back';
    const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const circ = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    const rr = (x, y, w, h, r, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill(); };
    const outline = 'rgba(30,20,10,.55)';

    // shadow
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(cx, 43, 9 * W, 3, 0, 0, Math.PI * 2); g.fill();
    // legs, socks, shoes
    const legC = girl || juniorBoy ? skin : uni.bottom;
    rect(cx - 5 * W, 30, 4, 10, legC); rect(cx + W, 30, 4, 10, legC);
    rect(cx - 5 * W, 37, 4, 2, uni.socks); rect(cx + W, 37, 4, 2, uni.socks);
    rect(cx - 5.5 * W, 39, 5, 3, uni.shoes); rect(cx + W - 0.5, 39, 5, 3, uni.shoes);
    // lower garment
    if (girl) {
      g.fillStyle = teacher ? uni.top : uni.bottom;
      g.beginPath(); g.moveTo(cx - 6 * W, 24); g.lineTo(cx + 6 * W, 24); g.lineTo(cx + 8.5 * W, teacher ? 38 : 33); g.lineTo(cx - 8.5 * W, teacher ? 38 : 33); g.closePath(); g.fill();
    } else {
      rect(cx - 6.5 * W, 24, 13 * W, juniorBoy ? 7 : 8, uni.bottom);
    }
    // arms
    [-1, 1].forEach((sg) => {
      const ax = sg < 0 ? cx - 10 * W : cx + 6.5 * W;
      rect(ax, 16, 3.5, 11, skin);
      rect(ax, 16, 3.5, 4.5, uni.top);
    });
    // torso
    rr(cx - 7 * W, 14, 14 * W, 12, 3, uni.top);
    g.strokeStyle = outline; g.lineWidth = 0.6; g.stroke();
    if (front && !teacher) {
      rect(cx - 0.9, 15, 1.8, 8.5, o.house || '#c0392b');
      if (girl) { rect(cx - 5.5 * W, 14, 1.6, 10, uni.bottom); rect(cx + 3.9 * W, 14, 1.6, 10, uni.bottom); }
    }
    if (teacher && front) { rect(cx - 4, 15, 8, 1.4, 'rgba(255,255,255,.35)'); }
    // hair behind head
    const style = av.hair;
    if (style === 'afro') circ(cx, 7.5, 10, hair);
    if (style === 'braids') { for (let i = 0; i < 6; i++) rect(cx - 8 + i * 3.2, 9, 1.6, 12, hair); }
    if (style === 'hijab') {
      g.fillStyle = hair === '#141414' ? '#263238' : hair;
      g.beginPath(); g.moveTo(cx - 9, 11); g.lineTo(cx + 9, 11); g.lineTo(cx + 10 * W, 20); g.lineTo(cx - 10 * W, 20); g.closePath(); g.fill();
      circ(cx, 9, 9, g.fillStyle);
    }
    // head
    if (style !== 'hijab') circ(cx, 9, 7.5, skin);
    else if (front) { g.fillStyle = skin; g.beginPath(); g.ellipse(cx, 9.6, 5.4, 6, 0, 0, Math.PI * 2); g.fill(); }
    if (style !== 'hijab') { circ(cx - 7.4, 9.5, 1.6, skin); circ(cx + 7.4, 9.5, 1.6, skin); }
    // hair on top
    const cap = (cover) => {
      g.save(); g.beginPath(); g.rect(0, 0, 32, cover); g.clip(); circ(cx, 8.6, 8, hair); g.restore();
    };
    if (!front && style !== 'bald' && style !== 'hijab') {
      circ(cx, 8.8, 7.9, hair); // back of the head is all hair
    } else {
      switch (style) {
        case 'lowcut': case 'waves': cap(5.6); if (style === 'waves') { g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 0.5; [2.5, 4].forEach((y) => { g.beginPath(); g.arc(cx, 9, 7 - y / 3, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }); } break;
        case 'fade': cap(4.4); break;
        case 'afro': cap(6.4); break;
        case 'puff': cap(5.8); circ(cx, -0.5 + 2, 4.6, hair); break;
        case 'buns': cap(5.8); circ(cx - 6.5, 2.5, 3.3, hair); circ(cx + 6.5, 2.5, 3.3, hair); break;
        case 'cornrows': cap(6.2); g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 0.5; [-3, 0, 3].forEach((dx) => { g.beginPath(); g.moveTo(cx + dx, 1.4); g.lineTo(cx + dx, 6); g.stroke(); }); break;
        case 'braids': cap(6.2); break;
        default:
      }
    }
    if (front) {
      // face
      circ(cx - 2.8, 10, 1.25, '#fff'); circ(cx + 2.8, 10, 1.25, '#fff');
      circ(cx - 2.6, 10.2, 0.8, '#1a1a1a'); circ(cx + 2.6, 10.2, 0.8, '#1a1a1a');
      g.strokeStyle = '#3b1f12'; g.lineWidth = 0.7; g.beginPath(); g.arc(cx, 12.3, 2, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      if (av.glasses) { g.strokeStyle = '#111'; g.lineWidth = 0.6; [-2.8, 2.8].forEach((dx) => { g.beginPath(); g.arc(cx + dx, 10, 1.9, 0, Math.PI * 2); g.stroke(); }); g.beginPath(); g.moveTo(cx - 0.9, 10); g.lineTo(cx + 0.9, 10); g.stroke(); }
    }
  }

  function canvas(av, o, facing, scale = 2) {
    const c = document.createElement('canvas');
    c.width = 32 * scale; c.height = 46 * scale;
    const g = c.getContext('2d');
    g.scale(scale, scale);
    g.translate(0, 1);
    draw(g, av, o, facing);
    return c;
  }

  const Sprites = {
    draw, canvas,
    outfitFor(s) { return { school: s.player.school, level: s.time.year, gender: s.player.gender, house: s.player.house.color, kind: 'student' }; },
    playerLook(s) { return { av: s.player.avatar || D.defaultAvatar(s.player.gender, s.player.religion), outfit: Sprites.outfitFor(s) }; },
    npcLook(s, n) {
      const h = BH.U.hash(n.id + (n.first || n.last));
      if (n.type === 'teacher' || n.type === 'staff') {
        return { av: D.npcAvatar({ id: n.id, first: n.last, gender: n.gender, tribe: n.tribe }), outfit: { kind: 'teacher', gender: n.gender, top: TEACHER_TOPS[h % TEACHER_TOPS.length], bottom: '#263238' } };
      }
      const level = n.type === 'senior' ? Number(String(n.level).replace('SS', '')) + 3 : n.type === 'junior' ? n.level : s.time.year;
      return { av: D.npcAvatar(n), outfit: { kind: 'student', school: s.player.school, level, gender: n.gender, house: D.HOUSES[h % D.HOUSES.length].color } };
    },
    /* Create Phaser textures `${key}_f` and `${key}_b` */
    texture(scene, key, look) {
      ['f', 'b'].forEach((v) => {
        const k = `${key}_${v}`;
        if (scene.textures.exists(k)) scene.textures.remove(k);
        scene.textures.addCanvas(k, canvas(look.av, look.outfit, v === 'f' ? 'front' : 'back', 2));
      });
    },
    /* Round RPG portrait as a data URL */
    portrait(look, cacheKey) {
      if (cacheKey && portraits[cacheKey]) return portraits[cacheKey];
      const c = document.createElement('canvas');
      c.width = 120; c.height = 120;
      const g = c.getContext('2d');
      g.save(); g.translate(60 - 16 * 5, 62 - 9 * 5); g.scale(5, 5); draw(g, look.av, look.outfit, 'front'); g.restore();
      const url = c.toDataURL();
      if (cacheKey) portraits[cacheKey] = url;
      return url;
    },
    clearPortraits() { Object.keys(portraits).forEach((k) => delete portraits[k]); },
  };

  BH.Sprites = Sprites;
})(window.BH);
