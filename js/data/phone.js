/* Phone: contacts & message templates.
   Template: { id, from, weight, when?(s), text, replies: [...], ignore: {...} }
   Reply:    { label, reply (their answer), fam (family/relationship change), fx (stats), money (sent via bursar),
               parcel ({item: qty} arrives at the weekend), rel (npc relationship), effect (special key) }
   Placeholders: {name} {sib} {friend} {crush} {bunk} {gb} (guy/babe) {pikin} (son/daughter) */
(function (BH) {
  BH.data.CONTACTS = {
    mummy:    { name: 'Mummy ❤️', emoji: '👩🏾' },
    daddy:    { name: 'Daddy', emoji: '👨🏾‍💼' },
    sibling:  { name: '{sib} (sibling)', emoji: '🧒🏾' },
    friend:   { name: '{friend} (home padi)', emoji: '😎' },
    crush:    { name: '{crush} 👀', emoji: '✨', npc: 'crush' },
    bunkmate: { name: '{bunk}', emoji: '🛏️', npc: 'bunkmate' },
    gc:       { name: 'Class Gist Squad 🔥', emoji: '👥' },
  };

  BH.data.MESSAGES = [
    /* ---------- Mummy ---------- */
    { id: 'mumMilo', from: 'mummy', weight: 3, text: 'Are you eating well? Did you finish the Milo already?? 🥺',
      replies: [
        { label: 'Yes ma, I dey chop well 🙏', reply: 'Good. God bless you my child. Read your books!', fam: 4, fx: { morale: 3 } },
        { label: 'Mummy the Milo don finish 😭 abeg send more', reply: 'Ehn?! Already?! Okay o, I will send through your uncle this weekend.', fam: 1, parcel: { milo: 3, milk: 2 } },
        { label: 'Senior collect am 😤', reply: 'WHAT?! Which senior?! I am calling your house master RIGHT NOW!', fam: 2, effect: 'mumComplain' },
      ],
      ignore: { fam: -6, fx: { morale: -2 }, effect: 'mumCalls' } },
    { id: 'mumPray', from: 'mummy', weight: 2, text: (s) => s.player.religion === 'muslim' ? 'Have you prayed today? Don\'t miss your salat o. Allah is watching. 🤲' : 'Have you prayed today? Cover yourself with the blood of Jesus before you sleep. 🙏',
      replies: [
        { label: 'Yes ma, I don pray 🙏', reply: 'That is my {pikin}! 🥰', fam: 4, fx: { morale: 4 } },
        { label: 'Mummy I dey busy with assignment', reply: 'Busy? Too busy for God? Hmm. Pray before you sleep.', fam: -1 },
      ],
      ignore: { fam: -4 } },
    { id: 'mumMoney', from: 'mummy', weight: 1.5, text: 'I sent ₦2,000 to the Bursar for you. Have you collected it?',
      replies: [
        { label: 'Yes ma! Thank you Mummy ❤️', reply: 'Spend it wisely. No buy rubbish.', fam: 4, money: 2000 },
        { label: 'No ma, I never see am 😐 (lie)', reply: 'Hmm. Let me call the Bursar...', fam: 0, effect: 'mumLie' },
      ],
      ignore: { fam: -3, money: 2000 } },
    { id: 'mumFood', from: 'mummy', weight: 1.5, text: 'I cooked jollof rice and fried chicken today. I remembered you 🥲',
      replies: [
        { label: 'Mummy you wan kill me?! 😭', reply: '😂😂 Sorry my dear. I will cook for you at vacation.', fam: 3, fx: { morale: 2 } },
        { label: 'Abeg keep my own for freezer 🙏', reply: 'Your brother don chop am finish. 😂', fam: 2, fx: { morale: -1 } },
      ],
      ignore: { fam: -2 } },

    /* ---------- Daddy ---------- */
    { id: 'dadResult', from: 'daddy', weight: 2, text: 'How are your studies? I hope you are not playing. I did not pay that school fees for fun.',
      replies: [
        { label: 'I dey read well sir 📚', reply: 'Good. I want to see As. Not Bs. As.', fam: 3 },
        { label: 'Daddy, Maths dey hard o 😩', reply: 'Then read it twice. When I was your age I walked 10km to school and still came first.', fam: 2, effect: 'dadTutor' },
        { label: 'Daddy abeg send more pocket money 🙏', reply: 'Money? Is money falling from trees? ...Okay. Check the Bursar on Friday.', fam: -1, effect: 'dadMoney' },
      ],
      ignore: { fam: -5, fx: { morale: -1 } } },
    { id: 'dadGreet', from: 'daddy', weight: 1, text: 'Your mother said you did not greet her properly on the phone. Is that how I trained you?',
      replies: [
        { label: 'Sorry sir, I go call am back 🙇', reply: 'Good. Respect is everything.', fam: 4 },
        { label: 'Daddy na network o 📶', reply: 'Network? Hmm. Okay.', fam: 0 },
      ],
      ignore: { fam: -6 } },

    /* ---------- Sibling ---------- */
    { id: 'sibTease', from: 'sibling', weight: 2, text: 'Mummy made fried rice and chicken today 😋😋 how is your beans with weevils? 😂',
      replies: [
        { label: 'Enjoy am. I go deal with you for holiday 😤', reply: '😂😂😂 I no fear you', fam: 2, fx: { morale: 2 } },
        { label: 'Abeg save me one chicken 😭', reply: 'Too late 🍗😋', fam: 3 },
      ],
      ignore: { fam: -2 } },
    { id: 'sibBlackmail', from: 'sibling', weight: 1, text: 'Send me ₦500 airtime or I go tell Mummy say you get phone for school 😈',
      replies: [
        { label: 'Okay okay 😩 (₦500)', reply: 'Pleasure doing business 😎', fam: 1, money: -500 },
        { label: 'Go and tell am. I no care 😤', reply: 'Okay o 😈', fam: -2, effect: 'sibSnitch' },
      ],
      ignore: { fam: -2, effect: 'sibSnitch' } },

    /* ---------- Home friend ---------- */
    { id: 'friendGist', from: 'friend', weight: 2, text: '{gb}!! How boarding house dey? Una dey see fine people? 👀',
      replies: [
        { label: 'Omo e get one like that 😏', reply: 'Ahhhh! Gist me everything when you come back 😂', fam: 3, fx: { morale: 4 } },
        { label: 'Na only garri and suffer dey here 😭', reply: 'Lmaooo sorry o. Hold body.', fam: 2, fx: { morale: 2 } },
      ],
      ignore: { fam: -3 } },
    { id: 'friendParty', from: 'friend', weight: 1.5, text: 'We dey do birthday party this weekend 🎉 everybody dey come except you 😂',
      replies: [
        { label: 'Wicked person 😭', reply: '😂 I go keep small cake for you', fam: 2, fx: { morale: -2 } },
        { label: 'Una enjoy. I dey reach university before una 😎', reply: 'Ehen, big grammar 😂', fam: 1, fx: { morale: 1 } },
      ],
      ignore: { fam: -2 } },

    /* ---------- Crush (classmate) ---------- */
    { id: 'crushHi', from: 'crush', weight: 1.5, text: 'hi 👀 you dey awake?',
      replies: [
        { label: 'Yes o, I no fit sleep 😊', reply: 'Me too 🙈 make we gist small', rel: 7, fx: { morale: 6, rest: -3 } },
        { label: 'Go and sleep jare 😂', reply: 'Hmm okay o 😒', rel: 1 },
        { label: 'Who be this?', reply: 'WOW. Okay. 🙄', rel: -6 },
      ],
      ignore: { rel: -4 } },
    { id: 'crushHelp', from: 'crush', weight: 1, text: 'Abeg you understand today\'s Maths? I no understand anything 😩',
      replies: [
        { label: 'Yes! Make I explain for you 📚', reply: 'You too sabi 🥰 thank you!', rel: 8, fx: { morale: 4 }, effect: 'tutorCrush' },
        { label: 'Me sef no understand 😂', reply: '😂😂 we go fail together', rel: 3 },
      ],
      ignore: { rel: -3 } },

    /* ---------- Bunkmate ---------- */
    { id: 'bunkWarn', from: 'bunkmate', weight: 1.2, text: '{gb} House master dey plan phone raid this week o!! Hide am well 🚨',
      replies: [
        { label: 'Thanks padi! I go hide am inside pillow 🫡', reply: 'Correct. No let dem catch you.', rel: 4, effect: 'hideWell' },
        { label: 'Na lie. Nobody dey raid', reply: 'Okay o, I don talk my own 🤷', rel: -1 },
      ],
      ignore: { rel: -2 } },

    /* ---------- Group chat ---------- */
    { id: 'gcRumor', from: 'gc', weight: 1.5, text: (s) => `${(BH.NPC.randomClassmate(s) || { first: 'Chidi' }).first}: Dem say ${(BH.NPC.randomClassmate(s) || { first: 'Amaka' }).first} write love letter to Senior ${BH.U.pick(['Tunde', 'Amaka', 'Musa', 'Chioma'])} 😱😱`,
      replies: [
        { label: '😂😂😂 Na wa', reply: '(12 people reacted 😂)', fx: { morale: 4 } },
        { label: 'Una leave person matter jare', reply: '(Somebody replied: "Holy Mary/Saint Abdul 😒")', fx: { morale: 1 } },
      ],
      ignore: {} },
    { id: 'gcPastQ', from: 'gc', weight: 1, when: (s) => s.time.week >= BH.data.CONFIG.TERM_WEEKS - 2, text: 'Who get past questions for exam?? 🙏🙏 I go pay',
      replies: [
        { label: 'Me! ₦200 per copy 😏', reply: '(3 people sent money!)', money: 600, fx: { morale: 3 } },
        { label: 'I go share am free 🫶', reply: '(Everybody: "God bless you!!" ❤️)', effect: 'shareFree', fx: { morale: 4 } },
      ],
      ignore: {} },
  ];
})(window.BH);
