/* Game state shape. Systems fill in their own slices in onNewGame(s).
   Keep everything JSON-serialisable — it goes straight into localStorage. */
(function (BH) {
  const D = BH.data;

  BH.State = {
    create(opts) {
      const school = D.SCHOOLS[opts.school];
      const s = {
        version: D.CONFIG.SAVE_VERSION,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        slot: opts.slot || 1,
        player: {
          name: opts.name.trim(),
          gender: opts.gender,              // 'm' | 'f'
          origin: opts.origin,
          religion: opts.religion,          // 'christian' | 'muslim'
          background: opts.background,      // 'struggling' | 'middle' | 'bigman'
          school: opts.school,              // key of SCHOOLS
          schoolName: BH.U.pick(school.names),
          traits: opts.traits.slice(0, 2),
          scholarship: !!opts.scholarship,
          avatar: opts.avatar || D.defaultAvatar(opts.gender, opts.religion),
          lang: opts.lang || 'yoruba',
          house: BH.U.pick(D.HOUSES),
        },
        stats: { hunger: 80, thirst: 80, rest: 85, hygiene: 85, health: 95, morale: 70 },
        money: D.BACKGROUNDS[opts.background].money,
        reputation: 10,     // clout among students, 0-100
        seniorFavour: 40,   // general standing with seniors, 0-100
        time: { year: 1, term: 1, week: 1, dow: 6, dayCount: 0, block: 0, dayType: 'resumption' },
        today: null,        // filled by Time.newDay
        log: [],
        flags: {},
        queue: [],          // pending events: [{id, ctx}]
        stats_history: { daysPlayed: 0, meals: 0, quizzes: 0, correct: 0, punished: 0, missionsDone: 0 },
        gameOver: null,
      };
      return s;
    },

    freshToday(s) {
      return {
        log: [],
        done: {},          // blockId -> true once you've done that block's activity
        ctx: {},           // per-block scene context (menus, rolls) so re-render is stable
        meals: {},         // breakfast/lunch/dinner: true when eaten
        flags: {},         // misc per-day flags (skipDuty, drankAt…)
        talked: {},        // npcId -> true (one interaction per day)
        earnings: 0,       // hustle earnings today
        studies: 0,
        offences: 0,
      };
    },
  };

  /* Roll the circumstances you're born into — pure luck */
  BH.rollLife = () => {
    const U = BH.U;
    const pickOdds = (odds) => U.weighted(Object.keys(odds), (k) => odds[k]);
    const background = pickOdds(D.FAMILY_ODDS);
    const school = pickOdds(D.SCHOOL_ODDS[background]);
    const origin = U.pick(D.STATES);
    const region = D.STATE_REGION[origin] || { chr: 0.5, lang: 'yoruba' };
    const religion = Math.random() < region.chr ? 'christian' : 'muslim';
    return { background, school, origin, religion, lang: region.lang, scholarship: background === 'struggling' && school === 'private' };
  };

  /* Short helpers used everywhere */
  BH.log = (s, text, type = 'info') => {
    const entry = { t: BH.Time ? BH.Time.clock(s) : '', text, type, d: s.time.dayCount };
    s.today && s.today.log.unshift(entry);
    s.log.unshift(entry);
    if (s.log.length > BH.data.CONFIG.MAX_LOG) s.log.length = BH.data.CONFIG.MAX_LOG;
  };
  BH.gendered = (s, m, f) => (s.player.gender === 'f' ? f : m);
})(window.BH);
