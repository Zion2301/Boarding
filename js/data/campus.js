/* Campus glue. The map itself lives in content/maps/campus.json (loaded into D.CAMPUS by js/core/content.js);
   interiors are content/maps/<building>.json. This file maps timetable blocks to places and holds art/sound hooks. */
(function (BH) {
  const D = BH.data;

  /* Where each timetable block happens (a campus LOCATIONS key) */
  D.BLOCK_LOCATION = (s, blockId, code) => {
    const hostel = s.player.gender === 'f' ? 'girlsHostel' : 'boysHostel';
    switch (blockId) {
      case 'arrival': return 'gate';
      case 'settling': case 'rising': case 'duty': case 'bath': case 'siesta': case 'lightsout': return hostel;
      case 'breakfast': case 'lunch': case 'dinner': return 'dining';
      case 'assembly': case 'social': return 'assembly';
      case 'register': case 'p1': case 'p2': case 'p3': case 'p4': case 'p5': case 'p6': case 'p7': case 'p8': case 'prep':
        return BH.School ? BH.School.placeFor(s, 'player', blockId).key : (s.time.year <= 3 ? 'jss' : 'ss');
      case 'break': return 'tuckshop';
      case 'afternoon': case 'freetime': case 'labour': return 'field';
      case 'service': return s.player.religion === 'muslim' ? 'mosque' : 'chapel';
      case 'sundayPm': return 'admin';
      default: return 'assembly';
    }
  };

  /* Drop-in art: fill these with image paths and the scene will use them instead of shapes.
     buildings: campus building images by LOCATIONS key. tiles: interior tile images by tile type (content/tiles.json "t"). */
  D.SPRITES = {
    buildings: {},        // e.g. { dining: 'assets/dining.png' }
    tiles: {},            // e.g. { bunk: 'assets/bunk.png', desk: 'assets/desk.png' }
    player: null,
    npc: null,
  };

  /* Sound hooks: put file paths here to replace the built-in synth blips */
  D.SOUNDS = { click: null, coin: null, success: null, bad: null, door: null, notify: null, step: null, bell: null };
})(window.BH);
