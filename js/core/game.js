/* Game controller: new game, load, save, game over */
(function (BH) {
  const Game = {
    s: null,

    newGame(opts) {
      const acc = BH.Account && BH.Account.user;
      if (acc) opts = Object.assign({}, opts, { slot: 0 }); // logged in: the student is saved to your account
      const s = BH.State.create(opts);
      if (acc) { s.account = acc.id; s.player.playerId = acc.id; }
      Game.s = s;
      BH.hook('onNewGame', s);
      BH.Time.newDay(s);
      BH.log(s, `🚌 Resumption day at ${s.player.schoolName}`, 'day');
      BH.Time.startBlock(s);
      // the parent's goodbye now plays at the end of the resumption cutscene (BH.Onboarding)
      if (!BH.Onboarding) BH.Events.optional(s, 'arrivalParent');
      BH.Save.save(s);
      BH.UI.go('game');
    },

    /* start playing a save that's already in memory (cloud save) */
    start(s) {
      Game.s = s;
      BH.hook('onLoad', s);
      BH.UI.go(s.gameOver ? 'gameover' : 'game');
    },

    load(slot) {
      const s = BH.Save.load(slot);
      if (!s) return false;
      Game.s = s;
      BH.hook('onLoad', s);
      BH.UI.go(s.gameOver ? 'gameover' : 'game');
      return true;
    },

    save() {
      if (!Game.s) return false;
      return BH.Save.save(Game.s);
    },

    gameOver(s, kind, text) {
      s.gameOver = { kind, text, when: BH.Time.dateLabel(s) };
      BH.Save.save(s);
    },
  };

  BH.Game = Game;
})(window.BH);
