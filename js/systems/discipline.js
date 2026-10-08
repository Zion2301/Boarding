/* Discipline record: offences → punishments → letter home → suspension → expulsion */
(function (BH) {
  const U = BH.U;

  const PUNISHMENTS = {
    1: [
      'Kneel down for 30 minutes with your two hands up. Your knees don learn the floor pattern.',
      'Frog jump round the hostel. Your thighs dey call you bad names.',
      '"Pick pin" — hold your ears, squat, and stay there till the prefect remember you.',
      'Stand on one leg facing the wall. Everybody wey pass dey laugh.',
    ],
    2: [
      'Cut one full plot of grass with blunt cutlass. Na sweat you baff today.',
      'Fetch 10 buckets of water for the senior hostel. Your arm don become rope.',
      'Wash the house toilets. The one wey nobody dey flush. You go remember this one for life.',
      'Uproot one stubborn tree stump. "Make e comot before evening!"',
    ],
    3: [
      'Six strokes of cane in front of the whole assembly. The shame pain pass the cane.',
      'Dig a pit: "One metre by one metre. I go measure am." Then cover am back.',
      'Detention every afternoon for a week, plus you write "I will be of good behaviour" 500 times.',
    ],
  };
  const PUNISH_FX = {
    1: { rest: -6, morale: -5 },
    2: { rest: -14, morale: -8, hygiene: -10, thirst: -6 },
    3: { rest: -10, morale: -14, health: -6 },
  };

  const Discipline = {
    onNewGame(s) {
      s.discipline = { points: 0, record: [], letters: 0, suspensions: 0, weekOffences: 0 };
    },

    /* Probability of being caught. base already includes situation (teacher strictness etc.) */
    caught(s, base) {
      const p = U.clamp(base + BH.Stats.mod(s, 'catch') - BH.Stats.mod(s, 'dodge') - BH.Stats.mod(s, 'luck') / 2, 0.05, 0.95);
      const hit = Math.random() < p;
      // your best friend standing next to you might cover for you ("Ma, she was with me!")
      const bf = hit && BH.Social && BH.Social.coverChance(s);
      if (bf && Math.random() < 0.4) {
        BH.UI && BH.UI.toast(`💛 ${bf.name.split(' ')[0]} covers for you: "${BH.U.pick(['Sir, na me send am!', 'Ma, she was with me the whole time!', 'E no do anything, I swear!'])}" You're off the hook.`, 'good');
        BH.Net.send('cover', { to: bf.pid });
        return false;
      }
      return hit;
    },
    strict(s) { return BH.Stats.school(s).strict; },

    status(s) {
      const p = s.discipline.points;
      if (p >= 25) return { label: 'Final warning', cls: 'crit' };
      if (p >= 15) return { label: 'On probation', cls: 'low' };
      if (p >= 6) return { label: 'Warned', cls: 'mid' };
      return { label: 'Clean-ish', cls: 'good' };
    },

    /* Record an offence and apply a punishment. Returns punishment text. */
    offence(s, reason, severity = 1, customPunish) {
      severity = U.clamp(severity, 1, 3);
      const d = s.discipline;
      d.points += severity;
      d.weekOffences++;
      s.today.offences++;
      s.stats_history.punished++;
      d.record.unshift({ day: s.time.dayCount, label: reason, sev: severity, when: BH.Time.dateLabel(s) });
      if (d.record.length > 40) d.record.length = 40;

      BH.Stats.change(s, PUNISH_FX[severity]);
      const text = customPunish || U.pick(PUNISHMENTS[severity]);
      BH.log(s, `Punished: ${reason}`, 'bad');
      BH.bus.emit('discipline', { reason, severity });
      BH.UI && BH.UI.shake();

      if (d.points >= 30) {
        BH.Game.gameOver(s, 'expelled', 'Your discipline file don thick pass Bible. The Principal sign your expulsion letter. Mummy come carry you with tears and koboko.');
      } else if (d.points >= 20 && d.suspensions === 0) {
        BH.Events.queue(s, 'suspension');
      } else if (d.points >= 10 && d.letters === 0) {
        BH.Events.queue(s, 'letterHome');
      }
      return text;
    },

    /* On-the-spot punishment with no points on your file (failed inspection, talking…) */
    minor(s, reason, customPunish) {
      s.today.offences++;
      s.stats_history.punished++;
      BH.Stats.change(s, PUNISH_FX[1]);
      BH.log(s, `Punished: ${reason}`, 'bad');
      BH.bus.emit('discipline', { reason, severity: 0 });
      BH.UI && BH.UI.shake();
      return customPunish || U.pick(PUNISHMENTS[1]);
    },

    /* A clean week earns back a little goodwill */
    onDayEnd(s) {
      if (s.today.offences === 0 && s.discipline.points > 0) s.discipline.points--;
      if (s.time.dow === 6) {
        if (s.discipline.weekOffences === 0 && s.discipline.points > 0) {
          s.discipline.points = Math.max(0, s.discipline.points - 2);
          BH.log(s, 'Clean week! House master don soften small on your matter.', 'good');
        }
        s.discipline.weekOffences = 0;
      }
    },
  };

  BH.registerSystem('Discipline', Discipline);
})(window.BH);
