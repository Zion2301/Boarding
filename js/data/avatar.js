/* Avatar options + school uniforms (used by the 3D avatar and the campus map) */
(function (BH) {
  const D = BH.data;

  D.AVATAR = {
    skins: [
      { id: 's1', hex: '#f1c9a5', label: 'Fair' },
      { id: 's2', hex: '#d9a066', label: 'Light brown' },
      { id: 's3', hex: '#b5774a', label: 'Caramel' },
      { id: 's4', hex: '#8d5524', label: 'Brown' },
      { id: 's5', hex: '#6b3e1f', label: 'Dark brown' },
      { id: 's6', hex: '#4a2a14', label: 'Deep' },
    ],
    hair: {
      m: [
        { id: 'lowcut', label: 'Low cut' },
        { id: 'waves', label: '360 waves' },
        { id: 'afro', label: 'Small afro' },
        { id: 'fade', label: 'Fade' },
        { id: 'bald', label: 'Clean shave' },
      ],
      f: [
        { id: 'braids', label: 'Braids' },
        { id: 'cornrows', label: 'Shuku' },
        { id: 'puff', label: 'Puff' },
        { id: 'buns', label: 'Two buns' },
        { id: 'ghana', label: 'Ghana weaving' },
        { id: 'threaded', label: 'Threading (isi owu)' },
        { id: 'ponytail', label: 'Ponytail' },
        { id: 'lowcut', label: 'Low cut (school rule!)' },
        { id: 'hijab', label: 'Hijab' },
      ],
    },
    hairColors: [
      { id: 'black', hex: '#141414', label: 'Black' },
      { id: 'brown', hex: '#3b2414', label: 'Dark brown' },
      { id: 'burgundy', hex: '#5a1424', label: 'Burgundy' },
      { id: 'blonde', hex: '#c9a14a', label: 'Blonde (illegal)' },
    ],
    builds: [
      { id: 'slim', w: 0.86, label: 'Slim' },
      { id: 'average', w: 1, label: 'Average' },
      { id: 'chubby', w: 1.2, label: 'Chubby' },
    ],
    heights: [
      { id: 'short', h: 0.9, label: 'Short' },
      { id: 'average', h: 1, label: 'Average' },
      { id: 'tall', h: 1.1, label: 'Tall' },
    ],
  };

  /* School uniforms: top = shirt, bottom = shorts/trousers/skirt, plus shoe & sock colours */
  D.UNIFORMS = {
    fgc:     { top: '#f4f2ea', bottom: '#1f5c3a', socks: '#f4f2ea', shoes: '#151515' },
    private: { top: '#dce7f7', bottom: '#1b2a4a', socks: '#1b2a4a', shoes: '#2b1a10' },
    mission: { top: '#f7f7f7', bottom: '#7a1f2b', socks: '#f7f7f7', shoes: '#151515' },
    state:   { top: '#efe3c4', bottom: '#7b5e34', socks: '#efe3c4', shoes: '#151515' },
  };

  D.defaultAvatar = (gender, religion) => ({
    skin: 's4',
    hair: gender === 'f' ? (religion === 'muslim' ? 'hijab' : 'braids') : 'lowcut',
    hairColor: 'black',
    build: 'average',
    height: 'average',
    glasses: false,
  });

  /* Deterministic look for NPCs (so a coursemate always looks the same) */
  D.npcAvatar = (npc) => {
    const h = BH.U.hash(npc.id + npc.first);
    const A = D.AVATAR;
    const hairs = A.hair[npc.gender === 'f' ? 'f' : 'm'].filter((x) => x.id !== 'hijab' || npc.tribe === 'Hausa');
    return {
      skin: A.skins[1 + (h % 5)].id,
      hair: hairs[(h >> 3) % hairs.length].id,
      hairColor: (h >> 6) % 7 === 0 ? 'brown' : 'black',
      build: A.builds[(h >> 9) % 3].id,
      height: A.heights[(h >> 11) % 3].id,
      glasses: (h >> 13) % 6 === 0,
    };
  };
})(window.BH);
