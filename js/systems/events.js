/* Events. Two kinds:
   - FORCED (forced: true): body/school consequences that interrupt you — collapsing, letters home, suspension,
     vacation & report card, department choice. These open straight away.
   - OPTIONAL (everything else): handed to the WorldSim as a *call* (an NPC comes to find you) or a *happening*
     (a notification). You can answer, or ignore it and get the `ignore` consequence when it expires.
   Event def: { weight, forced?, when(s, blockId), ctx(s) -> serialisable {}, emoji, title,
                text(s, c), choices(s, c) -> [{ label, sub, run(s, c) -> text }] } */
(function (BH) {
  const U = BH.U;
  const D = BH.data;
  const N = () => BH.NPC;
  const npc = (s, id) => BH.NPC.get(s, id);
  const nm = (s, id) => BH.NPC.name(npc(s, id));
  const isJunior = (s) => s.time.year <= 3;
  const kindOf = (blockId) => D.BLOCKS[blockId].kind;
  const harsh = (s) => BH.Stats.school(s).seniorHarsh;

  const EVENTS = {
    /* ===================== FORCED ===================== */
    sickbay: {
      forced: true, emoji: '🏥', title: 'Sick Bay',
      text: () => 'Your body don give up. Everything dey spin and you collapse for corridor. Dem carry you go sick bay. Matron look you over her glasses: "Na malaria. Or hunger. Or both. Take this Chloroquine and Panadol."',
      choices: () => [{
        label: '🛏️ Rest in sick bay', sub: 'You miss the next two blocks',
        run(s) {
          s.today.flags.sickbay = true;
          BH.Stats.change(s, { health: 30, rest: 25, hunger: 12, thirst: 15, morale: -4 });
          BH.Time.skipBlocks(s, 2);
          return 'You sleep for sick bay bed wey squeak anytime you turn. Matron give you bread and tea. You feel better small. 🩺';
        },
      }],
    },
    hospital: {
      forced: true, emoji: '🚑', title: 'Rushed to Hospital',
      text: () => 'You collapse for real this time. School driver rush you go General Hospital. Dem call your parents. Mummy arrive, crying and praying in tongues for the whole ward to hear.',
      choices: () => [{
        label: '🙏 Recover', sub: 'You lose the rest of today',
        run(s) {
          s.stats.health = 60; s.stats.hunger = 70; s.stats.thirst = 75; s.stats.rest = 70;
          BH.Stats.change(s, { morale: -10 });
          BH.Inv.add(s, 'garri', 3); BH.Inv.add(s, 'milo', 2);
          BH.Time.skipToEndOfDay(s);
          return 'Drip, injection, and one long lecture from Mummy: "Is it because you no dey chop your food?!" She refill your provisions small before she go.';
        },
      }],
    },
    rash: {
      forced: true, emoji: '🤧', title: 'Rashes!',
      text: () => 'Your skin start to scratch you everywhere. Small small bumps don appear. Somebody shout: "Eczema! Make una no sit near am o!"',
      choices: (s) => [
        { label: '🏥 Go collect calamine lotion from sick bay', sub: 'Stops the scratching',
          run(s) { s.today.flags.rash = true; BH.Stats.change(s, { hygiene: 12, health: 4, rest: -3 }); return 'Matron rub calamine for your body. You white like masquerade, but the scratching stop.'; } },
        { label: '😖 Scratch am and continue', sub: 'People go avoid you',
          run(s) { s.today.flags.rash = true; BH.Stats.change(s, { morale: -6 }); BH.Stats.rep(s, -3); return 'You dey scratch like monkey. Your seatmate shift go the edge of the bench.'; } },
      ],
    },
    dehydrated: {
      forced: true, emoji: '🥵', title: 'Dehydrated',
      text: () => 'Your lips crack, your head dey bang, your eyes dey see double. Your body dey beg for water.',
      choices: (s) => {
        const out = [{ label: '🚰 Run to the tap', sub: '+ Thirst', run(s) { s.today.flags.dehydrated = true; return BH.Inv.drinkTap(s); } }];
        if (BH.Inv.has(s, 'pureWater')) out.push({ label: '💧 Drink your pure water', sub: 'Uses 1 sachet', run(s) { s.today.flags.dehydrated = true; return BH.Inv.use(s, 'pureWater').text; } });
        return out;
      },
    },
    letterHome: {
      forced: true, emoji: '✉️', title: 'Letter to Your Parents',
      text: (s) => `The House Master call you to office. "${s.player.name}, your name don too dey my book. I don write to your parents." He seal the envelope with spit.`,
      choices: () => [{ label: '😰 "Sir, abeg..."', sub: 'Morale drop',
        run(s) {
          s.discipline.letters++;
          BH.Stats.change(s, { morale: -12 });
          return 'Two days later, the reply come by phone: Daddy say if he hear your name again, him go come school by himself with belt. Behave.';
        } }],
    },
    suspension: {
      forced: true, emoji: '🚫', title: 'Suspended!',
      text: () => 'The Principal don suspend you for three days. Dem pack your bag, and your parents come carry you. The drive home quiet like funeral.',
      choices: () => [{ label: '😔 Go home in shame', sub: 'Skip 3 days, morale crash',
        run(s) {
          s.discipline.suspensions++;
          BH.Time.skipDays(s, 3);
          s.stats.hunger = 85; s.stats.thirst = 85; s.stats.rest = 80; s.stats.hygiene = 85; s.stats.morale = 30;
          BH.Stats.rep(s, -6);
          return 'Three days of house chores, Mummy\'s cold shoulder, and Daddy\'s lectures. At least the food sweet. You return to school on probation.';
        } }],
    },

    /* ===================== RANDOM ===================== */
    seniorErrand: {
      weight: 3, emoji: '🫡', title: 'Senior Dey Call You',
      when: (s, b) => isJunior(s) && ['hostel', 'free'].includes(kindOf(b)) && !!N().errandSenior(s),
      ctx: (s) => ({ npc: N().errandSenior(s).id, task: U.pick(['fetch one bucket of water', 'wash my plates', 'iron my uniform', 'go buy me pure water with your own money', 'arrange my locker', 'help me spread my clothes']) }),
      text: (s, c) => `"JUNIOR! JUNIOR! Come here!" ${nm(s, c.npc)} dey call you. "Go and ${c.task}. Sharp sharp!"`,
      choices: (s, c) => [
        { label: '🏃 "Yes Senior!" — run the errand', sub: 'Costs energy, gains favour',
          run(s) { BH.Stats.change(s, { rest: -7 }); BH.Stats.favour(s, 4); N().rel(s, npc(s, c.npc), 5); return `You do am finish. ${nm(s, c.npc)}: "Good. You go survive this school."`; } },
        { label: '📚 "Senior, I dey go prep / class"', sub: 'Excuse — might work',
          run(s) {
            if (U.chance(0.45 + BH.Stats.mod(s, 'dodge'))) return `${nm(s, c.npc)} look you: "...Oya go. But I know your face."`;
            N().rel(s, npc(s, c.npc), -6);
            BH.Stats.change(s, { rest: -6 });
            return `"You dey lie for my face?!" ${nm(s, c.npc)} send you on the errand PLUS make you frog jump. Na double wahala.`;
          } },
        { label: '🙅 Refuse flat', sub: 'Brave or foolish?',
          run(s) {
            N().rel(s, npc(s, c.npc), -12); BH.Stats.favour(s, -8);
            if (BH.Stats.has(s, 'stubborn') || BH.Stats.has(s, 'agbero')) { BH.Stats.rep(s, 4); }
            if (U.chance(harsh(s) * 0.7)) { BH.Stats.change(s, { rest: -10, morale: -6, health: -3 }); return `${nm(s, c.npc)} no talk. Just one dirty slap. Then "Kneel down there till I come back." Juniors wey see am now respect you small.`; }
            return `${nm(s, c.npc)} shock. "You get mind!" But e no do anything... yet. Your coursemates hail you quietly.`;
          } },
      ],
    },
    seniorBorrow: {
      weight: 2.5, emoji: '🫗', title: '"Borrow" Wey No Go Return',
      when: (s, b) => isJunior(s) && ['hostel', 'free', 'sleep'].includes(kindOf(b)) && BH.Inv.valuables(s).length > 0 && !!N().senior(s, 'greedy') && !!N().senior(s, 'bully'),
      ctx: (s) => ({ npc: (U.chance(0.6) ? N().senior(s, 'greedy') : N().senior(s, 'bully')).id }),
      text: (s, c) => `${nm(s, c.npc)} lean on your locker: "Junior, I hear say your mummy pack plenty provisions for you. Make I borrow small. I go return am." (They will not return am.)`,
      choices: (s, c) => [
        { label: '🎁 Give am with smile', sub: 'Lose provisions, gain favour',
          run(s) {
            const lost = BH.Inv.loseRandom(s, 2);
            BH.bus.emit('provisions:lost', { items: lost });
            BH.Stats.favour(s, 5); N().rel(s, npc(s, c.npc), 8);
            return `They collect ${lost.join(' and ')}. "You be good junior." Your chop box don lighter.`;
          } },
        { label: '🤥 "Senior, e don finish o"', sub: 'Lie — risky',
          run(s) {
            if (U.chance(0.4 + BH.Stats.mod(s, 'dodge') + BH.Stats.mod(s, 'luck'))) return `${nm(s, c.npc)} hiss and waka comot. Your provisions safe. Oscar award for you. 🏆`;
            const lost = BH.Inv.loseRandom(s, 3);
            BH.bus.emit('provisions:lost', { items: lost });
            N().rel(s, npc(s, c.npc), -8); BH.Stats.change(s, { morale: -6 });
            return `They open your locker by force. "Finish? Wetin be this?!" They carry ${lost.join(', ')} AND give you knock for head.`;
          } },
        { label: '🏃 Run go call your school parent', sub: 'Depends on who your school parent be',
          run(s) {
            const sp = N().senior(s, 'schoolParent');
            if (!sp) { const lost = BH.Inv.loseRandom(s, 2); return `You no get school parent to run to. They collect ${lost.join(' and ')}.`; }
            if (sp.rel >= 55) { N().rel(s, npc(s, c.npc), -5); return `${N().name(sp)} come out: "Leave my child alone!" ${nm(s, c.npc)} grumble and comot. Protection na everything. 🛡️`; }
            const lost = BH.Inv.loseRandom(s, 2);
            BH.bus.emit('provisions:lost', { items: lost });
            return `${N().name(sp)} say "I no dey for this one." ${nm(s, c.npc)} collect ${lost.join(' and ')}. You need to build that relationship.`;
          } },
      ],
    },
    thiefStrikes: {
      weight: 2, emoji: '🐀', title: 'Somebody Don Touch Your Locker',
      when: (s, b) => ['hostel', 'meal', 'free'].includes(kindOf(b)) && BH.Inv.valuables(s).length > 0 && !BH.Inv.has(s, 'padlock'),
      ctx: (s) => ({ npc: N().byArch(s, 'thief').id, item: U.pick(BH.Inv.valuables(s).slice(0, 5)) }),
      text: (s, c) => {
        c.qty = BH.Inv.take(s, c.item, Math.min(2, BH.Inv.count(s, c.item)));
        BH.bus.emit('provisions:lost', { items: [D.ITEMS[c.item].name] });
        return `You open your locker... your ${D.ITEMS[c.item].name} don reduce! Your eye catch ${nm(s, c.npc)} wey dey smile anyhow for corner, mouth white like person wey just lick powdered milk.`;
      },
      choices: (s, c) => [
        { label: '😤 Confront am', sub: 'Might get it back',
          run(s) {
            if (U.chance(0.4 + BH.Stats.mod(s, 'fight'))) { BH.Inv.add(s, c.item, c.qty || 1); N().rel(s, npc(s, c.npc), -10); BH.Stats.rep(s, 3); return `"Open your locker!" Your ${D.ITEMS[c.item].name} dey there with your name still written on am. ${nm(s, c.npc)} beg and return am. Justice served. ⚖️`; }
            N().rel(s, npc(s, c.npc), -8);
            return `${nm(s, c.npc)}: "Me?! I swear to God!" No evidence. You go just hold your peace.`;
          } },
        { label: '🔒 Buy padlock (₦500)', sub: 'Stops future theft',
          run(s) { if (s.money < 500) return 'You no get ₦500. Your locker go remain open like government treasury.'; BH.Stats.money(s, -500); BH.Inv.add(s, 'padlock', 1); return 'You buy padlock from tuck shop. Your locker now get security. 🔒'; } },
        { label: '😮‍💨 Let am go', sub: 'Peace of mind',
          run(s) { BH.Stats.change(s, { morale: -4 }); return 'You let am go. "God dey see you," you mutter. Na Him go judge.'; } },
      ],
    },
    labourPatrol: {
      weight: 2, emoji: '🧹', title: 'Labour Prefect Dey Come!',
      when: (s, b) => ['hostel', 'free'].includes(kindOf(b)) && s.time.year <= 5 && !!N().senior(s, 'labourPrefect') && s.senior.prefect !== 'labour',
      ctx: (s) => ({ npc: N().senior(s, 'labourPrefect').id }),
      text: (s, c) => `Somebody shout "${nm(s, c.npc).toUpperCase()} DEY COME!" The Labour Prefect dey waka this direction with exercise book and pen, looking for free hands to cut grass.`,
      choices: (s, c) => [
        { label: '🫥 Hide inside the bathroom', sub: 'Dodge chance',
          run(s) {
            if (U.chance(0.55 + BH.Stats.mod(s, 'dodge') + BH.Stats.mod(s, 'luck'))) { BH.Stats.change(s, { hygiene: -3 }); return 'You hide for bathroom wey dey smell like broken promise. But e pass you. Freedom! 🙌'; }
            BH.bus.emit('npc:encounter', { role: 'labourPrefect' });
            BH.Stats.change(s, { rest: -12, hygiene: -8 });
            return `"I see your leg under the door." ${nm(s, c.npc)} give you one plot of grass to cut. 😩`;
          } },
        { label: '👋 "Good afternoon Senior!"', sub: 'Face am like a man/woman',
          run(s) {
            BH.bus.emit('npc:encounter', { role: 'labourPrefect' });
            if (U.chance(0.4)) { N().rel(s, npc(s, c.npc), 4); return `${nm(s, c.npc)}: "Good afternoon. You be good junior. Continue." Waka pass. Blessings!`; }
            BH.Stats.change(s, { rest: -8 });
            return `${nm(s, c.npc)}: "Ehen, good afternoon. Go and sweep that corridor." Greeting no save you.`;
          } },
      ],
    },
    rat: {
      weight: 1.2, emoji: '🐁', title: 'Rat Attack',
      when: (s, b) => ['sleep', 'hostel'].includes(kindOf(b)) && BH.Inv.has(s, 'garri', 2),
      text: () => 'You hear krrrkrrrkrrr inside your locker. You open am — one fat rat jump out, and your garri bag get hole wey reach your future.',
      choices: () => [
        { label: '🥿 Chase am with slippers', sub: 'Fun but tiring',
          run(s) { BH.Inv.take(s, 'garri', 2); BH.Stats.change(s, { rest: -4, morale: 3 }); return 'The whole hostel join you chase the rat. E escape through the window. Garri don lost but the gist sweet.'; } },
        { label: '😩 Pack the remaining garri', sub: 'Save what you can',
          run(s) { BH.Inv.take(s, 'garri', 1); return 'You tie the hole with rubber band. You go dey soak garri with fear from now.'; } },
      ],
    },
    crushHello: {
      weight: 1.5, emoji: '😳', title: 'Butterflies',
      when: (s, b) => ['free', 'meal', 'prep'].includes(kindOf(b)),
      ctx: (s) => ({ npc: N().crush(s).id }),
      text: (s, c) => `${nm(s, c.npc)} — the one wey everybody dey look — waka come your side: "Hi... you get extra biro? Mine don finish."`,
      choices: (s, c) => [
        { label: '🖊️ Give am your best biro', sub: 'Romance begins?',
          run(s) { N().rel(s, npc(s, c.npc), 8); BH.Stats.change(s, { morale: 8 }); return `${nm(s, c.npc)} smile: "Thank you. I go return am." You no fit sleep tonight. ✨`; } },
        { label: '😶 Freeze and say nothing', sub: 'Stage fright',
          run(s) { BH.Stats.change(s, { morale: -3 }); return `Your mouth refuse to open. ${nm(s, c.npc)} collect from another person. You go dey replay this moment for life.`; } },
        { label: '😎 "Only if you sit with me for prep"', sub: 'Bold move',
          run(s) {
            if (U.chance(0.4 + (s.reputation / 200) + (BH.Stats.has(s, 'clown') ? 0.15 : 0))) { N().rel(s, npc(s, c.npc), 12); BH.Stats.rep(s, 3); BH.Stats.change(s, { morale: 10 }); return `${nm(s, c.npc)} laugh: "You get mouth o. Okay." The whole class don dey whisper. 👀`; }
            N().rel(s, npc(s, c.npc), -3); BH.Stats.rep(s, -2);
            return `${nm(s, c.npc)} hiss and waka. Somebody behind you shout "Ehyaaa!" 😭`;
          } },
      ],
    },
    schoolParentGift: {
      weight: 1.2, emoji: '🤲', title: 'Your School Parent Dey Look Out For You',
      when: (s, b) => isJunior(s) && ['hostel', 'free', 'sleep'].includes(kindOf(b)) && !!N().senior(s, 'schoolParent') && N().senior(s, 'schoolParent').rel >= 55,
      ctx: (s) => ({ npc: N().senior(s, 'schoolParent').id }),
      text: (s, c) => `${nm(s, c.npc)}, your school ${BH.gendered(s, 'father', 'mother')}, call you to their corner: "Come, take this one. If anybody disturb you, tell me. You hear?"`,
      choices: (s, c) => [{ label: '🙏 "Thank you Senior!"', sub: 'Free provisions',
        run(s) { const it = U.pick(['indomie', 'gala', 'milo', 'biscuits']); BH.Inv.add(s, it, 2); BH.Stats.change(s, { morale: 8 }); N().rel(s, npc(s, c.npc), 4); return `You collect two ${D.ITEMS[it].name}. Small small, boarding house dey get sense.`; } }],
    },
    comedian: {
      weight: 1.5, emoji: '🤣', title: 'Class Comedian Dey Perform',
      when: (s, b) => ['free', 'prep', 'class'].includes(kindOf(b)),
      ctx: (s) => ({ npc: N().byArch(s, 'comedian').id }),
      text: (s, c) => `${nm(s, c.npc)} climb desk dey imitate Mr. Bassey: "Who no do assignment?! Kneel down! Your papa na goat!" The class don scatter with laughter.`,
      choices: (s, c) => [
        { label: '😂 Laugh tire', sub: 'Morale up — but teacher fit enter',
          run(s) {
            BH.Stats.change(s, { morale: 9 }); N().rel(s, npc(s, c.npc), 3);
            if (U.chance(0.2)) { BH.Stats.change(s, { rest: -8, morale: -5 }); return 'Mr. Bassey himself appear for door. Silence. "Everybody — outside — kneel down." Una kneel for 30 minutes but e still worth am.'; }
            return 'You laugh until stomach pain you. Best part of the day. 😂';
          } },
        { label: '🎭 Join the performance', sub: 'Clout — or wahala',
          run(s) {
            BH.Stats.change(s, { morale: 12 }); BH.Stats.rep(s, 4); N().rel(s, npc(s, c.npc), 6);
            if (BH.Discipline.caught(s, 0.25)) { const p = BH.Discipline.offence(s, 'Mocking a teacher', 2); return `The class captain report you two. ${p}`; }
            return 'You do the Mrs. Oyelaran "furnitures" voice. The class scatter! Legend status unlocked. 🌟';
          } },
      ],
    },
    bullyPush: {
      weight: 1.5, emoji: '😤', title: 'Coursemate Bully',
      when: (s, b) => ['meal', 'hostel', 'free'].includes(kindOf(b)),
      ctx: (s) => ({ npc: N().byArch(s, 'bully').id }),
      text: (s, c) => `${nm(s, c.npc)} push you comot from the line: "Comot for my front! You no know who I be?" Everybody dey look.`,
      choices: (s, c) => [
        { label: '👊 Push am back', sub: 'Fight!',
          run(s) {
            const win = U.chance(0.35 + BH.Stats.mod(s, 'fight'));
            const caught = BH.Discipline.caught(s, 0.35);
            let t = win ? `You push am back so hard e fall inside the drainage. The crowd shout "EHYAAA!" Respect earned. 💪` : `${nm(s, c.npc)} sabi fight pass you. You collect two knocks. Shame.`;
            if (win) { BH.Stats.rep(s, 7); N().rel(s, npc(s, c.npc), -8); } else { BH.Stats.change(s, { health: -6, morale: -6 }); BH.Stats.rep(s, -3); }
            if (caught) t += ' Then the House Captain catch both of una. ' + BH.Discipline.offence(s, 'Fighting', 2);
            return t;
          } },
        { label: '🗣️ Report to class captain', sub: 'Safe — but "snitch" label',
          run(s) { BH.Stats.rep(s, -2); N().rel(s, npc(s, c.npc), -5); N().rel(s, N().byArch(s, 'captain'), 4); return 'Class captain write the bully name. The bully go dey look you with eye like say you owe am money.'; } },
        { label: '😮‍💨 Let am be', sub: 'Choose peace',
          run(s) { BH.Stats.change(s, { morale: -5 }); return 'You step aside. Your pride dey pain you, but your face still dey intact.'; } },
      ],
    },
    jollofBackdoor: {
      weight: 1, emoji: '🍛', title: 'Back-door Jollof',
      when: (s, b) => ['free', 'prep', 'hostel'].includes(kindOf(b)) && s.money >= 300,
      text: () => 'Gist dey go round: one cook for kitchen dey sell party jollof for back door, ₦300 per wrap. The smell alone fit convert unbeliever.',
      choices: () => [
        { label: '🤑 Buy one wrap (₦300)', sub: 'Big hunger boost — if no wahala',
          run(s) {
            BH.Stats.money(s, -300);
            if (BH.Discipline.caught(s, 0.18)) { const p = BH.Discipline.offence(s, 'Buying food at kitchen back door', 1); return `The Dining Prefect dey wait for the corner. Jollof seized. Money gone. ${p}`; }
            BH.Stats.change(s, { hunger: 32, morale: 10 }); return 'Party jollof! With small fried plantain! You chop am for toilet like say na contraband. Na contraband. 🔥';
          } },
        { label: '🙅 Ignore', sub: 'Save money', run(s) { BH.Stats.change(s, { morale: -2 }); return 'You fight the smell with pure willpower. Your stomach no go forgive you.'; } },
      ],
    },
    waterScarcity: {
      weight: 1.2, emoji: '🚱', title: 'Water Don Finish!',
      when: (s, b) => ['hostel', 'free'].includes(kindOf(b)) && BH.Stats.school(s).water <= 3,
      text: () => 'NEPA take light since morning, so pumping machine no work. The overhead tank don dry. Na only the stream behind the school farm remain.',
      choices: () => [
        { label: '🪣 Go fetch from the stream', sub: 'Tiring but you go baff',
          run(s) { BH.Stats.change(s, { rest: -10, hygiene: 16, thirst: 10 }); return 'You trek go stream with bucket for head like Mama Ijebu. Na stress but you clean. 💦'; } },
        { label: '😬 Manage — no baff', sub: 'Hygiene go suffer',
          run(s) { BH.Stats.change(s, { hygiene: -8, morale: -3 }); return 'You use wet towel clean yourself. "Kampala baff". E no reach.'; } },
      ],
    },
    collectivePunish: {
      weight: 1, emoji: '📢', title: '"ALL JSS1, LINE UP!"',
      when: (s, b) => isJunior(s) && ['hostel', 'sleep', 'free'].includes(kindOf(b)) && !!N().senior(s, 'bully'),
      ctx: (s) => ({ npc: N().senior(s, 'bully').id }),
      text: (s, c) => `${nm(s, c.npc)} dey shout: "Somebody talk for night after lights out! Until una tell me who, everybody go frog jump!"`,
      choices: (s, c) => [
        { label: '🐸 Endure with your coursemates', sub: 'Solidarity',
          run(s) { BH.Stats.change(s, { rest: -9, morale: -4 }); s.npcs.classmates.forEach((x) => { x.rel = U.clamp(x.rel + 1); }); return 'Una frog jump together till your legs dey shake. But una no sell anybody. Coursemates respect you. 🤝'; } },
        { label: '🐍 Point at the noisemaker', sub: 'Senior happy, coursemates vex',
          run(s) {
            const victim = N().randomClassmate(s);
            N().rel(s, victim, -15); BH.Stats.favour(s, 5); BH.Stats.rep(s, -7);
            return `You point at ${victim.first}. ${nm(s, c.npc)} release everybody except ${victim.first}. From today, dem don tag you "Snitch". 🐍`;
          } },
      ],
    },
    brilliantHelp: {
      weight: 1, emoji: '🧠', title: 'Free Tutorial',
      when: (s, b) => ['prep', 'free'].includes(kindOf(b)),
      ctx: (s) => ({ npc: N().byArch(s, 'brilliant').id, code: U.pick(BH.Academics.quizzable(s)) }),
      text: (s, c) => `${nm(s, c.npc)}, the quiet one wey dey always take first, see you dey struggle with ${BH.Academics.name(s, c.code, true)}. "You want make I show you?"`,
      choices: (s, c) => [
        { label: '🙏 "Yes abeg!"', sub: 'Knowledge boost',
          run(s) { BH.Academics.study(s, c.code, 7, true); N().rel(s, npc(s, c.npc), 6); return `${nm(s, c.npc)} explain am so simple. How you no understand this thing before?! 💡`; } },
        { label: '😏 "I sabi am already"', sub: 'Pride',
          run(s) { N().rel(s, npc(s, c.npc), -3); return `${nm(s, c.npc)} shrug and go back to reading. You don\'t sabi am already.`; } },
      ],
    },
    foundMoney: {
      weight: 0.7, emoji: '💵', title: 'Money for Ground',
      when: (s, b) => ['meal', 'free'].includes(kindOf(b)),
      text: () => 'You see ₦500 note for ground near the dining hall, folded and lonely.',
      choices: () => [
        { label: '🤫 Pocket am', sub: '+₦500', run(s) { BH.Stats.money(s, 500); return 'You put am for pocket sharp sharp. God don answer prayer. (Whose prayer? Not your business.)'; } },
        { label: '😇 Submit am to the Head Prefect', sub: 'Integrity — Civic Education approves',
          run(s) {
            BH.Stats.rep(s, 3); BH.Stats.favour(s, 4); N().rel(s, N().senior(s, 'headPrefect'), 8);
            if (U.chance(0.3 + BH.Stats.mod(s, 'luck'))) { BH.Stats.money(s, 300); return 'Head Prefect announce your name for assembly as "honest student". The owner give you ₦300 thank-you. Good things dey happen to good people. ✨'; }
            return 'The Head Prefect nod: "Integrity. Rare thing for this school." Your name go enter good book.';
          } },
      ],
    },
    foodPoison: {
      weight: 0.8, emoji: '🤢', title: 'Beans Wahala',
      when: (s, b) => (s.today.meals.dinner && ['prep', 'sleep'].includes(kindOf(b))) || (s.today.meals.lunch && kindOf(b) === 'hostel'),
      text: () => 'The dining hall beans don start war for your stomach. Gbuuuuu... You need toilet NOW.',
      choices: () => [{ label: '🏃 Run to the toilet', sub: 'Pray say e get water',
        run(s) { BH.Stats.change(s, { health: -8, thirst: -10, rest: -6, morale: -4 }); return 'Toilet no get water. You don learn new level of suffering. Drink ORS from sick bay later. 🚽'; } }],
    },
    gossipNews: {
      weight: 1.2, emoji: '🗞️', title: 'Hot Gist!',
      when: (s, b) => ['free', 'meal', 'hostel'].includes(kindOf(b)),
      ctx: (s) => ({ npc: N().byArch(s, 'gossip').id }),
      text: (s, c) => `${nm(s, c.npc)} run come: "${BH.NPC.gossipLine(s)}"`,
      choices: (s, c) => [
        { label: '👂 "Talk am well! Wetin happen next?"', sub: 'Morale + friendship', run(s) { BH.Stats.change(s, { morale: 5 }); N().rel(s, npc(s, c.npc), 4); return 'Una gist reach 30 minutes. Best entertainment wey no need NEPA.'; } },
        { label: '🙉 "I no dey for gossip"', sub: 'Wise', run(s) { N().rel(s, npc(s, c.npc), -2); BH.Stats.favour(s, 1); return `${nm(s, c.npc)}: "Holy Mary/Saint Abdul! Okay o." They find another audience.`; } },
      ],
    },
    noisemakers: {
      weight: 1.2, emoji: '📋', title: 'Noisemakers List',
      when: (s, b) => ['class', 'prep'].includes(kindOf(b)),
      ctx: (s) => ({ npc: N().byArch(s, 'captain').id }),
      text: (s, c) => `Class captain ${nm(s, c.npc)} dey write "NOISEMAKERS" for board... and your name dey there, number 3!`,
      choices: (s, c) => [
        { label: '💸 "Abeg clean am" (₦100)', sub: 'Bribe — corruption starts young',
          run(s) {
            if (s.money < 100) return `You no even get ₦100. ${nm(s, c.npc)} underline your name twice.`;
            BH.Stats.money(s, -100); N().rel(s, npc(s, c.npc), 3);
            return `${nm(s, c.npc)} look left, look right, wipe your name. "I no see anything." Nigeria. 🇳🇬`;
          } },
        { label: '😤 "I no talk!" — argue', sub: 'Might work, might worsen',
          run(s) {
            if (U.chance(0.4)) { return `${nm(s, c.npc)} remove your name grudgingly. Victory!`; }
            const p = BH.Discipline.offence(s, 'Noisemaking (and arguing with captain)', 1);
            N().rel(s, npc(s, c.npc), -6);
            return `Argument make am add "talks too much" next to your name. Teacher see the list. ${p}`;
          } },
        { label: '🤷 Ignore am', sub: 'Maybe teacher no go check', run(s) { if (U.chance(0.5)) return 'Teacher never check the list. Saved by laziness.'; return BH.Discipline.minor(s, 'Name on noisemakers list'); } },
      ],
    },
    nightMosquito: {
      weight: 1.2, emoji: '🦟', title: 'Mosquito Concert',
      when: (s, b) => kindOf(b) === 'sleep',
      text: () => 'Mosquitoes dey sing for your ear like say na Afrobeats concert. Bzzzzzzz. Your net get hole wey fit pass goat.',
      choices: () => [
        { label: '🩴 Fight them with slippers', sub: 'Less sleep', run(s) { BH.Stats.change(s, { rest: -8, morale: -2 }); return 'You kill like 6. Your hand don red with your own blood. Victory?'; } },
        { label: '🛌 Cover yourself from head to toe', sub: 'Hot but safe', run(s) { BH.Stats.change(s, { rest: -3, hygiene: -3 }); return 'You wrap yourself like moi-moi inside leaf. Sweat everywhere, but mosquito no reach you.'; } },
      ],
    },
  };

  /* ===================== RESUMPTION DAY (answer or ignore) ===================== */
  EVENTS.arrivalParent = {
    weight: 0, emoji: '🚌', title: 'Resumption Day',
    text(s) {
      const bg = D.BACKGROUNDS[s.player.background];
      const sp = s.player;
      if (s.time.dayCount > 0) return `**${sp.schoolName}** — ${BH.Time.levelName(s)}, Term ${s.time.term}. Resumption day again! ${s.time.year >= 4 ? 'Juniors dey rush to carry YOUR box. 😎' : 'The new JSS1 students dey cry for gate. You smile — you don pass that level.'}`;
      return `**${sp.schoolName}**. Motto: _${BH.Stats.school(s).motto}_.\n\nCars, buses and okadas everywhere. You carry your chop box, bucket and mattress. You don dey posted to **${sp.house.name}**.${sp.scholarship ? '\n\n🎓 You dey here on **scholarship**. Show them.' : ''}\n\n${U.fill(bg.parentLine, { money: U.money(s.money) })}`;
    },
    choices: (s) => {
      const out = [
        { label: '🤗 Hug your parent tight', sub: 'Morale up', run(s) { BH.Stats.change(s, { morale: 8 }); return 'You hold am tight. "Behave yourself o! Read your book! No follow bad gang!" They drive off.'; } },
        { label: BH.gendered(s, '😎 "Bye bye" — act like big boy', '😎 "Bye bye" — act like big girl'), sub: '+ Clout', run(s) { BH.Stats.rep(s, 3); BH.Stats.change(s, { morale: -2 }); return 'You wave like person wey don dey boarding school since 1999. Inside, you dey cry small.'; } },
      ];
      if (!s.phone.has) out.push({ label: '📱 Hide a phone inside the garri bag', sub: 'Contraband — the gateman might search', run(s) {
        const model = { struggling: "your uncle's old Nokia", middle: 'a small Android', bigman: 'a brand-new iPhone' }[s.player.background];
        if (BH.Discipline.caught(s, BH.Discipline.strict(s) * 0.55)) return `Baba Musa search your box and bring out ${model}. "PHONE?! On resumption day?!" Seized. ` + BH.Discipline.minor(s, 'Phone found at the gate');
        BH.Phone.give(s, 90);
        return `You hide ${model} inside the garri. The gateman search everything… except the garri. 📱`;
      } });
      return out;
    },
  };
  EVENTS.settlingBully = {
    weight: 0, emoji: '📦', title: 'Chop Box Inspection',
    ctx: (s) => ({ npc: (N().senior(s, 'bully') || {}).id }),
    text: (s, c) => `${nm(s, c.npc)} block your way for the hostel corridor: "NEW STUDENT! Wetin you carry come? Open that chop box for inspection."`,
    choices: (s, c) => [
      { label: '📦 Open your chop box', sub: 'Lose some provisions, gain favour', run(s) { const lost = BH.Inv.loseRandom(s, 2); BH.bus.emit('provisions:lost', { items: lost }); BH.Stats.favour(s, 5); N().rel(s, npc(s, c.npc), 10); return `They "inspect" and confiscate ${lost.join(' and ') || 'nothing'}. "You go enjoy this school." 🙃`; } },
      { label: '🤥 "Senior, na only garri dey inside"', sub: 'Lie — 50/50', run(s) {
        if (U.chance(0.45 + BH.Stats.mod(s, 'dodge') + BH.Stats.mod(s, 'luck'))) return `${nm(s, c.npc)} look your face… "Garri pikin. Comot." Your Milo dey safe. 😮‍💨`;
        const lost = BH.Inv.loseRandom(s, 3); BH.bus.emit('provisions:lost', { items: lost }); N().rel(s, npc(s, c.npc), -8);
        return `They open am by force. "Garri abi?!" They carry ${lost.join(', ')}. You don enter their book. 📕`;
      } },
    ],
  };

  /* What happens if you ignore an optional event (default: the person feels ignored) */
  const IGNORE = {
    seniorBorrow: (s, c) => { N().rel(s, npc(s, c.npc), -6); BH.Stats.favour(s, -4); const lost = BH.Inv.loseRandom(s, 1); return `${nm(s, c.npc)} no see you, so they "borrow" ${lost[0] || 'nothing'} from your locker anyway. 😑`; },
    labourPatrol: (s, c) => { N().rel(s, npc(s, c.npc), -4); return `${nm(s, c.npc)} write your name for "work later" list. 📋`; },
    crushHello: (s, c) => { N().rel(s, npc(s, c.npc), -2); return `${nm(s, c.npc)} waited, then left. The moment don pass. 💔`; },
    bullyPush: (s, c) => { N().rel(s, npc(s, c.npc), -2); return `You dodge ${nm(s, c.npc)} today. E go still find you.`; },
    collectivePunish: (s, c) => { BH.Stats.favour(s, -6); return `You no show for the "ALL JSS1" line-up. ${nm(s, c.npc)} don mark your name in red. 😬`; },
    schoolParentGift: (s, c) => { N().rel(s, npc(s, c.npc), -3); return `${nm(s, c.npc)} come with gift, no see you. "This child no dey value me."`; },
    brilliantHelp: () => 'The free tutorial don finish. Maybe next time.',
    arrivalParent: (s) => { BH.Stats.change(s, { morale: -4 }); return 'Your parent waited, then drove off without a proper goodbye. 😢'; },
    settlingBully: (s, c) => { N().rel(s, npc(s, c.npc), -6); return `${nm(s, c.npc)}: "You dey run from me? I go see you." 😤`; },
    rash: (s) => { BH.Stats.change(s, { health: -4, morale: -3 }); BH.Stats.rep(s, -1); return 'The rash spread small because you no treat am. 🤧'; },
    dehydrated: (s) => { BH.Stats.change(s, { health: -6 }); return 'Your head dey bang — you still never drink water. 🥵'; },
    nightMosquito: (s) => { BH.Stats.change(s, { rest: -6 }); return 'The mosquitoes feast on you all night. 🦟'; },
    rat: (s) => { BH.Inv.take(s, 'garri', 1); return 'The rat chop your garri while you dey look. 🐀'; },
    foodPoison: (s) => { BH.Stats.change(s, { health: -8, rest: -5 }); return 'Your belle turn and turn. You no go sick bay. 🤢'; },
  };
  const NPC_EVENTS = ['seniorBorrow', 'labourPatrol', 'crushHello', 'schoolParentGift', 'bullyPush', 'collectivePunish', 'brilliantHelp', 'noisemakers', 'comedian', 'gossipNews'];

  const Events = {
    EVENTS,

    /* forced events go straight to the queue (the scene opens them) */
    queue(s, id, ctx) {
      if (s.queue.some((q) => q.id === id)) return;
      s.queue.push({ id, ctx: ctx || (EVENTS[id].ctx ? EVENTS[id].ctx(s) : {}) });
    },

    current(s) {
      while (s.queue.length && !EVENTS[s.queue[0].id]) s.queue.shift();
      return s.queue[0] || null;
    },

    /* Random events no longer interrupt at block start — the WorldSim rolls them during the day */
    maybeTrigger() {},

    eligible(s, id) {
      const e = EVENTS[id];
      if (!e || e.forced) return false;
      try { return e.when ? e.when(s, BH.Time.blockId(s)) : true; } catch (err) { return false; }
    },
    pickNpcEvent(s) {
      const ids = NPC_EVENTS.filter((id) => Events.eligible(s, id));
      const recent = s.flags.recentEvents || [];
      const id = U.weighted(ids, (k) => (recent.includes(k) ? 0.15 : 1) * (EVENTS[k].weight || 1));
      if (!id) return null;
      s.flags.recentEvents = [id, ...recent].slice(0, 5);
      let ctx = {};
      try { ctx = EVENTS[id].ctx ? EVENTS[id].ctx(s) : {}; } catch (err) { return null; }
      if (ctx && 'npc' in ctx && !ctx.npc) return null; // nobody to play the part (e.g. bot students are off)
      return { id, ctx };
    },

    /* An optional event becomes a call (NPC) or a happening (notification) */
    optional(s, id, ctx) {
      const e = EVENTS[id];
      if (!e) return null;
      if (!ctx) { try { ctx = e.ctx ? e.ctx(s) : {}; } catch (err) { return null; } }
      if (ctx && 'npc' in ctx && !ctx.npc) return null;
      const who = ctx.npc || ctx.j || null;
      return BH.WorldSim.call(s, { kind: 'event', id, ctx, npc: who, text: `${e.emoji} ${e.title}`, minutes: who ? 40 : 30 });
    },
    ignore(s, id, ctx) {
      if (EVENTS[id] && EVENTS[id].onIgnore) return EVENTS[id].onIgnore(s, ctx || {});
      const f = IGNORE[id];
      if (f) return f(s, ctx || {});
      const who = ctx && ctx.npc && npc(s, ctx.npc);
      if (who) { N().rel(s, who, -3); return `${nm(s, ctx.npc)} no see you. They go remember.`; }
      return null;
    },

    /* Render data for a queued (forced) event (text cached so random rolls happen once) */
    view(s) {
      const q = Events.current(s);
      if (!q) return null;
      const e = EVENTS[q.id];
      if (q.text === undefined) q.text = e.text(s, q.ctx);
      return { q, e, text: q.text, choices: e.choices(s, q.ctx) };
    },
    /* Same for an optional event you chose to answer */
    viewCall(s, call) {
      const e = EVENTS[call.id];
      if (!e) return null;
      if (call.text2 === undefined) call.text2 = e.text(s, call.ctx);
      return { q: call, e, text: call.text2, choices: e.choices(s, call.ctx) };
    },

    resolve(s, i) {
      const v = Events.view(s);
      if (!v) return null;
      const ch = v.choices[i];
      if (!ch) return null;
      s.queue.shift();
      const text = ch.run(s, v.q.ctx);
      BH.bus.emit('event:done', { id: v.q.id, choice: i });
      BH.log(s, `${v.e.emoji} ${v.e.title}: ${ch.label.replace(/^\S+\s/, '')}`, 'event');
      return text;
    },
    resolveCall(s, call, i) {
      const v = Events.viewCall(s, call);
      if (!v) return null;
      const ch = v.choices[i];
      if (!ch) return null;
      BH.WorldSim.dropCall(s, call.uid);
      const text = ch.run(s, call.ctx);
      BH.bus.emit('event:done', { id: call.id, choice: i });
      BH.log(s, `${v.e.emoji} ${v.e.title}: ${ch.label.replace(/^\S+\s/, '')}`, 'event');
      return text;
    },
  };

  BH.registerSystem('Events', Events);
})(window.BH);
