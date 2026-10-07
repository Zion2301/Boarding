/* Rules & detection (headless part).
   content/rules.json says who cares about each rule and how bad it is; this file says WHEN you're breaking it.
   The scene does the seeing (vision cones + line of sight) and calls Rules.watch() each frame;
   suspicion builds while a watcher can see you breaking a rule, and when it fills you're caught.
   Hiding (toilet, under a bunk, in the bush) makes you invisible. */
(function (BH) {
  const D = BH.data;
  const C = () => BH.Content;
  const R = () => C().get('rules');

  const where = (s) => s.world.map || 'campus';
  const myHostel = (s) => (s.player.gender === 'f' ? 'girlsHostel' : 'boysHostel');
  const otherHostel = (s) => (s.player.gender === 'f' ? 'boysHostel' : 'girlsHostel');
  const kind = (s) => BH.Time.block(s).kind;
  const isPrefect = (s, ...posts) => !!s.senior && posts.includes(s.senior.prefect);
  const excused = (s) => !!(s.today.flags.excused && s.today.flags.excused >= BH.Clock.abs(s));

  /* One predicate per rule id: true while you're breaking it */
  const PRED = {
    afterLightsOut(s) {
      const m = BH.Clock.mod(s);
      const late = m >= BH.Clock.LIGHTS_OUT || m < 4 * 60 + 45;
      if (!late || kind(s) !== 'sleep' || isPrefect(s, 'head', 'labour')) return false;
      return where(s) !== myHostel(s) && !(where(s) === 'sickbay' && excused(s));
    },
    outOfBounds(s) {
      if (where(s) === 'staff') return true;
      if (where(s) === 'campus' && s.world.area === 'backFence') return true;
      return !!(s.world.room && s.world.room.forbidden);
    },
    oppositeHostel(s) { return where(s) === otherHostel(s); },
    truancy(s) {
      const k = kind(s);
      if (!['class', 'prep'].includes(k) || excused(s) || s.flags.suspended) return false;
      if (k === 'class' && BH.Activities.freePeriod(s)) return false;
      return !BH.Activities.present(s);
    },
    siestaWander(s) {
      if (BH.Time.blockId(s) !== 'siesta' || excused(s) || isPrefect(s, 'head', 'labour')) return false;
      return where(s) !== myHostel(s) && where(s) !== 'sickbay';
    },
    phone(s) { return !!(s.world.phoneOut && s.world.phoneOut > BH.Clock.abs(s)); },
    cooking(s) { return !!(s.world.smell && s.world.smell.until > BH.Clock.abs(s) && s.world.smell.map === where(s)); },
    crime(s) { const c = s.world.crime; return c && c.until > BH.Clock.abs(s) ? c.rule : null; },
    sleepingInClass(s) {
      const a = s.act;
      if (!a) return false;
      if (a.type === 'lesson' && a.mode === 'doze') return true;
      return a.type === 'sleep' && ['desk', 'pew'].includes(a.where) && ['class', 'prep', 'worship'].includes(kind(s));
    },
    afterHours(s) {
      const L = D.CAMPUS.LOCATIONS[where(s)];
      if (!L || !L.hours || where(s) === 'staff') return false;
      const [a, b] = L.hours.split('-').map(BH.Clock.toMin);
      const m = BH.Clock.mod(s);
      return m < a || m > b;
    },
  };

  const Rules = {
    PRED,
    def(id) { return R().rules[id]; },
    vision() { return R().vision; },

    /* All rules you're breaking right now, worst first */
    active(s) {
      const out = [];
      const c = PRED.crime(s);
      if (c) out.push(c);
      ['oppositeHostel', 'outOfBounds', 'afterLightsOut', 'afterHours', 'cooking', 'phone', 'truancy', 'sleepingInClass', 'siestaWander'].forEach((id) => {
        try { if (PRED[id](s)) out.push(id); } catch (e) { /* rule needs state that isn't ready */ }
      });
      return out.sort((a, b) => (Rules.def(b).sev - Rules.def(a).sev) || (Rules.def(b).suspicion - Rules.def(a).suspicion));
    },
    /* The worst rule this kind of watcher reacts to */
    caresAbout(s, watcherKind, list = Rules.active(s)) {
      return list.find((id) => (Rules.def(id).seenBy || []).includes(watcherKind)) || null;
    },
    hidden(s) { return !!(s.act && s.act.type === 'hide'); },

    /* Suspicion meter. Called by the scene each frame with whoever can see you (or null). */
    watch(s, dtSec, seer) {
      const v = Rules.vision();
      const sus = s.world.sus || (s.world.sus = { level: 0, by: null, rule: null });
      const grace = s.world.grace && s.world.grace > BH.Clock.abs(s);
      if (seer && seer.rule && !Rules.hidden(s) && !grace) {
        const r = Rules.def(seer.rule);
        const close = Math.max(0.35, 1 - seer.dist / (v.range * 1.15));
        const asleep = s.act && s.act.type === 'sleep' ? 3 : 1;
        sus.level = Math.min(1, sus.level + dtSec * v.fillPerSec * r.suspicion * close * asleep * (0.6 + seer.strict * 0.6));
        sus.by = seer.id; sus.rule = seer.rule;
        if (sus.level >= 1) {
          sus.level = 0;
          BH.Consequences.caught(s, seer.rule, seer.id);
          return 'caught';
        }
      } else {
        sus.level = Math.max(0, sus.level - dtSec * v.drainPerSec);
        if (!sus.level) { sus.by = null; sus.rule = null; }
      }
      return null;
    },

    /* Flag a crime as "live" for a few minutes (stealing, snooping…) — anyone who sees you now catches you */
    commit(s, rule, minutes = 3, extra = {}) {
      s.world.crime = Object.assign({ rule, until: BH.Clock.abs(s) + minutes }, extra);
    },
  };

  BH.registerSystem('Rules', Rules);
})(window.BH);
