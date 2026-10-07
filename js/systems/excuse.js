/* Excuses: getting caught or arriving late no longer means an instant punishment. The person who caught you
   asks for an explanation and you type it (or tap a quick option). The AI (or the offline matcher) decides:
   accepted → no punishment · warned → a warning · rejected/punish → the rule's punishment (never harsher than the
   rule allows; "report to the principal" can add one level) · walk away → the punishment.
   First case: the Vice Principal catching latecomers at assembly. Also teachers (late to class, missing assignments),
   prefects and house masters (out of bounds, after lights out). */
(function (BH) {
  const U = BH.U;
  const N = () => BH.NPC;
  const Dsc = () => BH.Discipline;

  const OPENERS = {
    late: ['"You! Come here. Why are you only coming now?"', '"Look at the time. Explain yourself, young one."', '"Late again? Talk. I am listening."'],
    caught: ['"Ehen! What are you doing here?"', '"Stop there! Explain yourself."', '"You think I didn\'t see you? Talk."'],
    assignment: ['"Where is your assignment? Everybody submitted except you."', '"No assignment? Give me one good reason."'],
  };

  const Excuse = {
    /* Can we hold a conversation right now? (needs the UI; headless tests punish immediately) */
    canTalk() { return !!(BH.Chat && BH.Panels && BH.UI && BH.UI.screen === 'game' && !BH.Panels.isOpenKind('chat')); },

    /* start({ npc, kind: 'late'|'caught'|'assignment', offence, sev, minor, apply(sevOrNull, how), done }) */
    start(s, o) {
      const npc = o.npc;
      const punish = (sev, how) => { o.apply(sev, how); };
      if (!npc || !Excuse.canTalk()) { punish(o.sev, 'auto'); o.done && o.done('auto'); return; }
      const name = N().name(npc);
      let decided = false;
      const decide = (how, sev) => {
        if (decided) return;
        decided = true;
        BH.fx.begin();
        if (how === 'accepted') { BH.log(s, `Excuse accepted: ${o.offence}`, 'good'); BH.bus.emit('excuse', { result: 'accepted', npc: npc.id, offence: o.offence }); }
        else if (how === 'warned') { BH.log(s, `Warned: ${o.offence}`, 'info'); BH.bus.emit('excuse', { result: 'warned', npc: npc.id, offence: o.offence }); }
        else { punish(sev, how); BH.bus.emit('excuse', { result: how, npc: npc.id, offence: o.offence }); }
        const fx = BH.fx.end();
        return fx;
      };
      const quick = {
        late: [{ label: '🙏 "Sorry, I overslept"', text: 'I am sorry, I overslept. It won\'t happen again.' }, { label: '🤒 "I was at the sick bay"', text: 'I was at the sick bay, I was not feeling well.' }, { label: '📚 "A teacher sent me"', text: 'A teacher sent me on an errand.' }],
        caught: [{ label: '🙏 "Sorry, I won\'t do it again"', text: 'I am very sorry. I won\'t do it again.' }, { label: '🤥 "I was just passing"', text: 'I was just passing, I didn\'t know it was out of bounds.' }, { label: '🤒 "I was looking for the nurse"', text: 'I was looking for the nurse, I was not feeling well.' }],
        assignment: [{ label: '🙏 "Sorry, I forgot"', text: 'I am sorry, I forgot to do it. I will submit it tomorrow.' }, { label: '🤒 "I was sick"', text: 'I was sick and went to the sick bay.' }, { label: '📓 "My book got lost"', text: 'Somebody took my exercise book.' }],
      }[o.kind] || [];
      quick.push({ label: '🤐 (Say nothing)', text: '...' });
      BH.Chat.open({
        npc, name: N().fullName(npc), sub: `${N().label(npc)} · ${o.offence}`,
        portrait: npc.type === 'staff' ? { emoji: npc.emoji } : { img: BH.Sprites.portrait(BH.Sprites.npcLook(s, npc), npc.id) },
        situation: 'excuse', intro: `${name}: ${U.pick(OPENERS[o.kind] || OPENERS.caught)}`,
        vars: { offence: o.offence, maxSeverity: o.sev, facts: o.facts || 'nothing else' },
        ctx: { maxSeverity: o.sev }, factsExtra: `They were caught for: ${o.offence}.`,
        quick, maxTurns: 4, placeholder: 'Explain yourself…',
        walkLabel: '🚶 Walk away', walkSub: 'They will punish you anyway',
        onResult(res) {
          const fx = res.effects || {};
          if (fx.excuse === 'accepted') { decide('accepted'); return 'end'; }
          if (fx.excuse === 'warned') { decide('warned'); return 'end'; }
          if (fx.excuse === 'rejected' || fx.punish) { decide(fx.punish && fx.punish.principal ? 'principal' : 'rejected', fx.punish ? fx.punish.severity : o.sev); return 'end'; }
          if (fx.end) { decide('rejected', o.sev); return 'end'; }
          return null;
        },
        onTimeout() { decide('rejected', o.sev); return `${name}: "Enough talk! I have heard enough."`; },
        onWalkAway() {
          N().rel(s, npc, -3);
          decide('walked', o.sev);
          BH.UI.toast(`🚶 You walked away from ${name}. That na extra wahala.`, 'bad');
          o.done && o.done('walked');
        },
        onDone() { if (!decided) decide('rejected', o.sev); o.done && o.done('talked'); },
      });
    },

    /* Teachers/prefects who will want an explanation later (missing assignment…) come and find you */
    later(s, { npc, offence, sev, kind = 'assignment' }) {
      if (!npc) return;
      BH.WorldSim.call(s, { kind: 'excuse', npc: npc.id, excuse: { offence, sev, kind }, text: `${N().name(npc)} wants to see you`, minutes: 240 });
    },
    /* answering such a call */
    fromCall(s, call) {
      const npc = N().get(s, call.npc);
      BH.WorldSim.dropCall(s, call.uid);
      Excuse.start(s, { npc, kind: call.excuse.kind, offence: call.excuse.offence, sev: call.excuse.sev, apply: (sev) => Excuse.punishFor(s, call.excuse.offence, sev, npc) });
    },
    /* the punishment itself (shared helper) */
    punishFor(s, reason, sev, npc) {
      const text = sev ? Dsc().offence(s, reason, sev) : Dsc().minor(s, reason);
      if (npc) N().rel(s, npc, -2);
      BH.UI && BH.UI.toast(`🚨 ${npc ? N().name(npc) + ': ' : ''}${reason}! ${text}`, 'bad');
    },
  };

  BH.Excuse = Excuse;
})(window.BH);
