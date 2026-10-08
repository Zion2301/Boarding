/* InteractionSystem — decides what you can DO with whatever you're next to.
   Targets (found by the scene): { type: 'object', obj } (an interactable from a map) · { type: 'npc', npc }
   · { type: 'door', key } · { type: 'self' } (you're seated / hiding / asleep / busy).
   Actions come from content/interactables.json (+ systems' actionsFor hooks) and run handlers in actions.js.
   The HUD shows the first two on the E-prompt and the rest in the radial menu.
   Also home of the tiny condition language used by interactables, missions and dialogue. */
(function (BH) {
  const D = BH.data;
  const C = () => BH.Content;

  /* ---------- conditions ---------- */
  function test1(s, cond, ctx = {}) {
    if (!cond) return true;
    if (cond[0] === '!') return !test1(s, cond.slice(1), ctx);
    const [k, ...rest] = cond.split(':');
    const v = rest.join(':');
    const b = BH.Time.block(s);
    const m = BH.Clock.mod(s);
    switch (k) {
      case 'block': return b.kind === v || (v === 'free' && ['free', 'hostel'].includes(b.kind));
      case 'blockId': return BH.Time.blockId(s) === v;
      case 'has': return BH.Inv.has(s, v);
      case 'money': return s.money >= Number(v);
      case 'junior': return s.time.year <= 3;
      case 'senior': return s.time.year >= 4;
      case 'prefect': return s.senior && s.senior.prefect === v;
      case 'night': return BH.Clock.isNight(s);
      case 'day': return !BH.Clock.isNight(s);
      case 'evening': return m >= 18 * 60 && m < 23 * 60;
      case 'dow': return s.time.dow === Number(v);
      case 'daytype': return s.time.dayType === v;
      case 'dayCount': return s.time.dayCount >= Number(v);
      case 'week': return s.time.week >= Number(v) || s.time.term > 1 || s.time.year > 1;
      case 'examSoon': return s.time.week >= D.CONFIG.TERM_WEEKS - 1;
      case 'arcDone': return !!(s.arcs && s.arcs[v] === 'done');
      case 'mission': return BH.Missions.hasTag(s, v);
      case 'once': return !s.today.flags['once_' + v];
      case 'flag': return !!s.today.flags[v];
      case 'did': return !!(s.flags && s.flags['did_' + v]); // things you've done (arcs start from behaviour, not dates)
      case 'map': return (s.world.map || 'campus') === v;
      case 'owner': return !!ctx.mine;
      case 'notOwner': return !ctx.mine;
      case 'staff': return Interaction.staffHere(s, v);
      case 'nostaff': return !Interaction.staffHere(s, v);
      case 'myClass': return BH.Activities.inMyClass(s);
      case 'seated': return !!(s.act && ['lesson', 'prep', 'seat'].includes(s.act.type));
      case 'mode': return !!(s.act && s.act.mode === v);
      case 'sleeping': return !!(s.act && s.act.type === 'sleep');
      case 'hiding': return !!(s.act && s.act.type === 'hide');
      case 'phone': return !!(s.phone && s.phone.has && !s.phone.confiscated);
      case 'phoneHidden': return !!(s.phone && s.phone.has && s.phone.hidden);
      case 'phoneSeized': return !!(s.phone && s.phone.confiscated);
      case 'friend': return true;
      default: return true;
    }
  }

  const Interaction = {
    test(s, cond, ctx) {
      if (!cond) return true;
      return (Array.isArray(cond) ? cond : [cond]).every((c) => test1(s, c, ctx));
    },
    staffHere(s, role) {
      return (s.npcs.staff || []).some((n) => n.role === role && BH.Schedule.where(s, n).map === (s.world.map || 'campus'));
    },

    /* Is this object yours? (your bed/chop box/locker, your desk in your class) */
    mine(s, obj) {
      if (!obj) return false;
      // the bunk you chose on resumption day (else the ⭐ bed)
      const mb = s.world && s.world.myBunk;
      if (mb && ['bunk', 'myBed'].includes(obj.kind)) return obj.map === mb.map && obj.id === mb.id;
      if (obj.kind === 'myBed') return obj.map === BH.Schedule.myHostel(s);
      if (obj.kind === 'chopBox') return obj.map === BH.Schedule.myHostel(s);
      if (obj.kind === 'locker') {
        if (obj.map !== BH.Schedule.myHostel(s)) return false;
        const cm = C().compile(obj.map);
        const bed = cm.objects.find((o) => o.kind === 'myBed');
        return bed && Math.hypot(bed.x - obj.x, bed.y - obj.y) < 100;
      }
      if (obj.kind === 'myDesk') return BH.Activities.myClassroom(s) === obj.map;
      if (obj.kind === 'desk') return BH.School.isMyDesk(s, obj); // your seat in your class arm
      return false;
    },
    defFor(s, obj) {
      let kind = obj.kind;
      if (kind === 'desk' && Interaction.mine(s, obj)) kind = 'myDesk';
      if (kind === 'myDesk' && !Interaction.mine(s, obj)) kind = 'desk';
      if (kind === 'myBed' && !Interaction.mine(s, obj)) kind = 'bunk';
      if (kind === 'bunk' && Interaction.mine(s, obj)) kind = 'myBed';
      return C().interactable(kind);
    },
    title(s, target) {
      if (target.type === 'npc') return `${BH.NPC.emoji(target.npc)} ${BH.NPC.name(target.npc)}`;
      if (target.type === 'ball') return '⚽ The ball';
      if (target.type === 'remote') { const p = BH.Net && BH.Net.byPid(target.pid); return `${BH.Social.isBestie(target.pid) ? '💛' : BH.Social.isFriend(target.pid) ? '🤝' : '🧑🏾‍🎓'} ${p ? p.name : 'Player'}`; }
      if (target.type === 'door' && target.room) { const m = C().map(target.room); return `🚪 ${m ? m.name : target.room}${target.room === BH.Activities.myClassroom(s) ? ' (your class)' : ''}`; }
      if (target.type === 'door') { const L = D.CAMPUS.LOCATIONS[target.key]; return `${L.emoji} ${L.name}`; }
      if (target.type === 'self') return Interaction.selfTitle(s);
      const def = Interaction.defFor(s, target.obj);
      const owner = !Interaction.mine(s, target.obj) && ['bunk', 'locker', 'chopBox', 'desk'].includes(target.obj.kind) ? BH.Schedule.owner(s, target.obj.map, target.obj.id) : null;
      const mine = Interaction.mine(s, target.obj);
      return `${def ? def.emoji : '✨'} ${mine ? 'Your ' + (def.name || '').replace(/^Your /, '').toLowerCase() : def ? def.name : 'Something'}${owner ? ` (${owner.first}'s)` : ''}`;
    },

    /* ---------- the list of actions for a target ---------- */
    actions(s, target) {
      if (!target) return [];
      let list = [];
      if (target.type === 'object') {
        const obj = target.obj;
        const def = Interaction.defFor(s, obj);
        const ctx = { obj, mine: Interaction.mine(s, obj) };
        (def ? def.actions : []).forEach((a) => {
          if (!Interaction.test(s, a.when, ctx)) return;
          list.push(Object.assign({ prio: 5 }, a));
        });
        if (obj.secret && !Interaction.found(s, obj) && !list.some((a) => a.do === 'search')) {
          list.push({ id: 'search', label: 'Search', emoji: '🔍', do: 'search', prio: 4 });
        }
      } else if (target.type === 'npc') list = Interaction.npcActions(s, target.npc);
      else if (target.type === 'ball') list = [{ id: 'pass', label: 'Pass', emoji: '⚽', do: 'fbKick', args: { power: 0.55 }, prio: 0 }, { id: 'shoot', label: 'Shoot!', emoji: '🥅', do: 'fbKick', args: { power: 1 }, prio: 1 }];
      else if (target.type === 'remote') {
        const fr = BH.Social.isFriend(target.pid);
        list = [
          { id: 'menu', label: 'Hang out', emoji: '🧑🏾‍🤝‍🧑🏾', do: 'socialMenu', prio: 0 },
          fr ? { id: 'follow', label: 'Walk together', emoji: '👣', do: 'socialDo', args: { op: 'follow' }, prio: 1 } : { id: 'friend', label: 'Add friend', emoji: '🤝', do: 'socialDo', args: { op: 'friend' }, prio: 1 },
          { id: 'wave', label: 'Wave', emoji: '👋🏾', do: 'socialDo', args: { op: 'wave' }, prio: 2 },
          { id: 'share', label: 'Share food', emoji: '🎁', do: 'socialDo', args: { op: 'share' }, prio: 3 },
          { id: 'whot', label: 'Play Last Card', emoji: '🃏', do: 'socialDo', args: { op: 'whot' }, prio: 4 },
          { id: 'sit', label: 'Sit together', emoji: '🪑', do: 'socialDo', args: { op: 'sit' }, prio: 5 },
        ];
      }
      else if (target.type === 'door') list = [{ id: 'enter', label: 'Enter', emoji: '🚪', do: 'enter', prio: 0 }];
      else if (target.type === 'self') list = Interaction.selfActions(s);
      list.push(...BH.collect('actionsFor', s, target));
      return list.sort((a, b) => (a.prio ?? 5) - (b.prio ?? 5));
    },
    found(s, obj) { return !!(s.found && s.found[obj.map + '|' + obj.id]); },

    npcActions(s, n) {
      const out = [{ id: 'talk', label: 'Talk', emoji: '💬', do: 'talk', prio: 0 }];
      const junior = s.time.year <= 3;
      if (n.type === 'classmate') out.push({ id: 'gist', label: 'Any gist?', emoji: '🗣️', do: 'quickGist', prio: 1 });
      if (n.type === 'senior' && junior) out.push({ id: 'greet', label: 'Greet', emoji: '🙇', do: 'quickGreet', prio: 1 });
      if (n.type === 'teacher' || n.type === 'staff') out.push({ id: 'greet', label: 'Greet', emoji: '👋', do: 'quickGreet', prio: 1 });
      if (n.type === 'junior') out.push({ id: 'errand', label: 'Send on errand', emoji: '🫵', do: 'sendJunior', prio: 1 });
      out.push({ id: 'give', label: 'Give something', emoji: '🎁', do: 'giveMenu', prio: 3 });
      out.push({ id: 'follow', label: 'Follow', emoji: '👣', do: 'follow', prio: 4 });
      if (n.type !== 'teacher' && n.type !== 'staff') out.push({ id: 'pickpocket', label: 'Pickpocket 👀', emoji: '🫳', do: 'pickpocket', crime: 'stealing', prio: 6 });
      return out;
    },

    selfTitle(s) {
      const a = s.act;
      if (!a) return '🧍 You';
      if (a.type === 'lesson') return `🪑 In class · ${BH.Academics.name(s, a.code, true)}`;
      if (a.type === 'prep') return `📖 Studying ${a.code ? BH.Academics.name(s, a.code, true) : ''}`;
      if (a.type === 'seat') return '🪑 Sitting';
      if (a.type === 'hide') return '🫥 Hiding';
      if (a.type === 'sleep') return '😴 Asleep';
      return '⏳ Busy';
    },
    selfActions(s) {
      const a = s.act;
      if (!a) return [];
      const out = [];
      if (a.type === 'lesson') {
        const modes = [
          ['focus', 'Pay attention', '📖'], ['doze', 'Doze off', '😴'], ['gist', 'Whisper to seatmate', '💬'],
        ];
        if (BH.Inv.has(s, 'novel')) modes.push(['novel', 'Read novel under desk', '📗']);
        modes.forEach(([m, label, emoji], i) => { if (a.mode !== m) out.push({ id: 'mode_' + m, label, emoji, do: 'lessonMode', args: { mode: m }, prio: 1 + i }); });
        out.push({ id: 'note', label: 'Pass a note', emoji: '✉️', do: 'notePanel', prio: 4 });
      }
      if (a.type === 'prep' || a.type === 'seat') out.push({ id: 'subject', label: 'Change subject', emoji: '📚', do: 'pickStudy', prio: 2 });
      if (['lesson', 'prep', 'seat'].includes(a.type)) out.push({ id: 'stand', label: 'Stand up', emoji: '🧍', do: 'standUp', prio: 0 });
      if (a.type === 'hide') out.push({ id: 'unhide', label: 'Come out', emoji: '🧍', do: 'standUp', prio: 0 });
      if (a.type === 'sleep') out.push({ id: 'wake', label: 'Wake up', emoji: '⏰', do: 'standUp', prio: 0 });
      return out;
    },

    /* ---------- running an action ---------- */
    run(s, target, a) {
      const handler = BH.Actions.get(a.do);
      if (!handler) return { text: `(${a.do} not implemented)` };
      const map = s.world.map || 'campus';
      const ctx = { target, obj: target.obj, npc: target.npc, map, args: a.args || {}, action: a, mine: target.obj && Interaction.mine(s, target.obj) };
      BH.fx.begin();
      if (a.crime) BH.Rules.commit(s, a.crime, (a.mins || 0) + 3);
      let res = handler(s, ctx) || null;
      if (typeof res === 'string') res = { text: res };
      if (res && res.cancel) { BH.fx.end(); if (a.crime) s.world.crime = null; return res.text ? res : null; }
      if (res && res.crimeItem && s.world.crime) Object.assign(s.world.crime, { item: res.crimeItem, n: res.crimeN || 1 });
      BH.bus.emit('interact', { action: a.id, kind: target.obj ? target.obj.kind : target.type, map, obj: target.obj ? target.obj.id : null, npc: target.npc ? target.npc.id : null });
      if (a.args && a.args.once) s.today.flags['once_' + a.args.once] = true;
      const fx = BH.fx.end();
      const mins = (res && res.mins !== undefined) ? res.mins : a.mins;
      if (mins && !(res && res.noTime)) BH.Activities.busy(s, mins, `${a.emoji || '⏳'} ${a.label}…`);
      BH.Store && BH.Store.changed();
      return res ? Object.assign({ fx }, res) : (fx.length ? { fx } : null);
    },
  };

  BH.Interaction = Interaction;
  BH.Cond = { test: Interaction.test };
})(window.BH);
