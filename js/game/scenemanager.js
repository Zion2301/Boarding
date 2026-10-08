/* SceneManager — one Phaser game, one WorldScene that is restarted with a different map.
   - enter(buildingKey): walking into a door fades to black and loads that building's interior map.
   - exit(): the interior's exit tiles put you back outside at the same door.
   - load(mapId, spawn): any map, any point (escorts, new term, getting marched to the house master…).
   - Autosaves on every enter/exit.
   Adding a building = a content/maps/<id>.json file + 'interior' on its campus location (see README). */
(function (BH) {
  const D = BH.data;
  let game = null;

  const SM = {
    busy: false,

    start(parent) {
      SM.stop();
      const s = BH.Game.s;
      const mapId = (s.world && s.world.map && BH.Content.map(s.world.map)) ? s.world.map : 'campus';
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        backgroundColor: '#1b1410',
        scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
        physics: { default: 'arcade', arcade: { debug: false } },
        input: { activePointers: 3 },
        audio: { noAudio: true },
        scene: [],
      });
      game.scene.add('World', BH.WorldScene, true, { mapId, spawn: s.pos });
    },
    stop() { if (game) { game.destroy(true); game = null; BH.World.scene = null; } SM.busy = false; },
    running() { return !!game; },
    current() { return BH.World.scene ? BH.World.scene.mapId : null; },

    load(mapId, spawn) {
      const sc = BH.World.scene;
      const s = BH.Game.s;
      if (!sc || SM.busy) return;
      if (!BH.Content.map(mapId)) { console.warn('No map', mapId); s.world.map = sc.mapId; s.world.moved = false; return; }
      SM.busy = true;
      const from = sc.mapId;
      s.world.map = mapId;
      s.world.moved = false;
      s.pos = spawn || null;
      if (s.act && ['lesson', 'prep', 'seat', 'hide'].includes(s.act.type)) s.act = null;
      sc.player.setVelocity(0);
      BH.Sound && BH.Sound.play('door');
      sc.cameras.main.fadeOut(200, 0, 0, 0);
      sc.cameras.main.once('camerafadeoutcomplete', () => {
        BH.Save.save(s); // autosave on every map change
        BH.bus.emit('map:changed', { from, to: mapId });
        sc.scene.restart({ mapId, spawn }); // busy is cleared by the new scene's create()
      });
    },

    /* walk through a building door */
    enter(key) {
      const L = D.CAMPUS.LOCATIONS[key];
      if (!L || L.kind !== 'b') return;
      const id = L.interior || key;
      const cm = BH.Content.compile(id);
      if (!cm) { BH.UI.toast(`${L.emoji} ${L.name} is locked for now.`, 'info'); return; }
      BH.bus.emit('enter', { map: id, key });
      SM.load(id, { x: cm.entry.x, y: cm.entry.y });
    },
    /* hallway → classroom (the old 2D renderer has no hallway doors drawn; kept for parity) */
    enterRoom(id) { const cm = BH.Content.compile(id); if (cm) SM.load(id, { x: cm.entry.x, y: cm.entry.y }); },
    /* leave an interior through its exit */
    exit() {
      const sc = BH.World.scene;
      if (!sc || sc.outdoor) return;
      if (sc.cm.src.parent) { const pm = BH.Content.compile(sc.cm.src.parent); const d = (pm.doors || []).find((x) => x.to === sc.mapId); return SM.load(sc.cm.src.parent, d ? { x: d.x, y: d.y + pm.T * 1.1 } : pm.entry); }
      const key = sc.cm.src.exit || sc.mapId;
      SM.load('campus', SM.doorSpawn(key));
    },
    doorSpawn(key) {
      const L = D.CAMPUS.LOCATIONS[key];
      if (!L) return null;
      const out = L.door.y < L.y ? -46 : 46;
      return { x: L.door.x, y: L.door.y + out };
    },

    /* get marched somewhere (caught, fainted…) */
    escort(where) {
      const s = BH.Game.s;
      const sc = BH.World.scene;
      if (!sc) { s.world.moved = true; return; }
      const myHostel = BH.Schedule.myHostel(s);
      const go = (map, spawn) => setTimeout(() => SM.load(map, spawn), 600);
      if (where === 'hostel') {
        const cm = BH.Content.compile(myHostel);
        const bed = cm.objects.find((o) => o.kind === 'myBed');
        return go(myHostel, bed ? { x: bed.x, y: bed.y + cm.T } : cm.entry);
      }
      if (where === 'class') { const e = BH.Activities.expected(s); if (e && e.map !== 'campus') { const cm = BH.Content.compile(e.map); return go(e.map, cm.entry); } return null; }
      if (where === 'sickbay') { const cm = BH.Content.compile('sickbay'); const bed = cm.objects.find((o) => o.kind === 'sickBed'); return go('sickbay', bed ? { x: bed.x, y: bed.y + cm.T } : cm.entry); }
      if (where === 'out') {
        if (!sc.outdoor) return go('campus', SM.doorSpawn(sc.cm.src.exit || sc.mapId));
        const a = D.CAMPUS.LOCATIONS.assembly.door;
        return go('campus', { x: a.x, y: a.y });
      }
      return null;
    },
  };

  BH.SceneManager = SM;
})(window.BH);
