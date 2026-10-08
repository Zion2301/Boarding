/* Nigerian names by tribe + NPC archetype/persona flavour */
(function (BH) {
  BH.data.TRIBES = {
    Yoruba: {
      m: ['Tunde', 'Ayomide', 'Femi', 'Seun', 'Kunle', 'Tobi', 'Damilare', 'Bolaji', 'Segun', 'Toheeb', 'Kayode', 'Wale'],
      f: ['Funmi', 'Bisola', 'Temitope', 'Yetunde', 'Kemi', 'Morenike', 'Titilayo', 'Bukola', 'Simi', 'Tolani', 'Omowunmi', 'Ronke'],
      last: ['Adeyemi', 'Ogunleye', 'Balogun', 'Adebayo', 'Ojo', 'Akinola', 'Oladipo', 'Fashola', 'Olaniyan', 'Adewale', 'Oyelaran'],
    },
    Igbo: {
      m: ['Chidi', 'Emeka', 'Obinna', 'Ikenna', 'Kelechi', 'Nnamdi', 'Tochukwu', 'Uche', 'Somto', 'Ebuka', 'Chinedu', 'Kamsi'],
      f: ['Chioma', 'Adaeze', 'Ngozi', 'Amaka', 'Ifeoma', 'Chiamaka', 'Nneka', 'Uju', 'Ogechi', 'Kosi', 'Ebele', 'Oluchi'],
      last: ['Okafor', 'Eze', 'Nwosu', 'Okeke', 'Obi', 'Nwachukwu', 'Okonkwo', 'Anyanwu', 'Udeh', 'Ibe', 'Chukwuma'],
    },
    Hausa: {
      m: ['Abdullahi', 'Musa', 'Sani', 'Aminu', 'Usman', 'Ibrahim', 'Bashir', 'Yusuf', 'Kabiru', 'Nasiru', 'Umar', 'Haruna'],
      f: ['Aisha', 'Fatima', 'Zainab', 'Hauwa', 'Halima', 'Maryam', 'Amina', 'Hadiza', 'Khadija', 'Rukayya', 'Safiya', 'Bilkisu'],
      last: ['Bello', 'Abubakar', 'Danjuma', 'Lawal', 'Shehu', 'Garba', 'Yakubu', 'Mohammed', 'Sule', 'Aliyu', 'Dantata'],
    },
    Edo: {
      m: ['Osaze', 'Efosa', 'Osas', 'Eghosa', 'Ehis', 'Osamudiamen'],
      f: ['Osarugue', 'Itohan', 'Ivie', 'Eki', 'Isoken', 'Omosede'],
      last: ['Osagie', 'Igbinedion', 'Omoregie', 'Ehigiator', 'Osayande', 'Iyamu'],
    },
    'Efik/Ibibio': {
      m: ['Ekpo', 'Effiong', 'Edet', 'Okon', 'Ubong', 'Itoro'],
      f: ['Eno', 'Arit', 'Ekaette', 'Imaobong', 'Nse', 'Mfon'],
      last: ['Bassey', 'Etim', 'Ekanem', 'Udoh', 'Inyang', 'Essien'],
    },
    Ijaw: {
      m: ['Ebi', 'Tari', 'Preye', 'Timi', 'Douye', 'Tonye'],
      f: ['Ebiere', 'Ere', 'Pere', 'Boma', 'Ebiye', 'Tarila'],
      last: ['Amakiri', 'Dikibo', 'Benebo', 'Ebiowei', 'Owei', 'Tamuno'],
    },
    Tiv: {
      m: ['Terver', 'Aondona', 'Msughter', 'Iorwuese', 'Tersoo'],
      f: ['Doosuur', 'Mwuese', 'Nguveren', 'Seember', 'Mngohol'],
      last: ['Iorliam', 'Agber', 'Akaa', 'Tyokase', 'Orshi'],
    },
    Urhobo: {
      m: ['Oghenero', 'Ejiro', 'Efe', 'Ovie', 'Tega'],
      f: ['Oghenekaro', 'Rukevwe', 'Mamuyovwi', 'Ejiroghene', 'Onome'],
      last: ['Odjegba', 'Akpovi', 'Ejovi', 'Igho', 'Okpako'],
    },
    Idoma: {
      m: ['Ochai', 'Oche', 'Agbo', 'Ogbu', 'Ojonugwa'],
      f: ['Ene', 'Ojoma', 'Agbenu', 'Ehi', 'Onyeche'],
      last: ['Adah', 'Ochigbo', 'Oklobia', 'Agbo', 'Ogbole'],
    },
  };

  /* Classmate archetypes. count = how many in the class. */
  BH.data.ARCHETYPES = {
    captain:   { label: 'Class Captain', emoji: '📋', count: 1, desc: 'Writes "Noisemakers" list with the seriousness of INEC.' },
    hustler:   { label: 'Tuck-shop Hustler', emoji: '💸', count: 1, desc: 'Sells everything: biro, Milo, exam "expo", your own slippers back to you.' },
    thief:     { label: 'Sneaky One', emoji: '🐀', count: 1, desc: 'Always near your locker. Always "just passing".' },
    fine:      { label: 'Fine Girl/Boy', emoji: '✨', count: 2, desc: 'Everybody dey form when this one waka pass.' },
    brilliant: { label: 'Brilliant Quiet One', emoji: '🧠', count: 1, desc: 'Never talks. Always first in class. Possibly a robot.' },
    comedian:  { label: 'Comedian', emoji: '😂', count: 1, desc: 'Fit mimic every teacher. Fit also get the whole class punished.' },
    bully:     { label: 'Coursemate Bully', emoji: '😤', count: 1, desc: 'Repeated JSS1 once. Thinks he/she is a senior.' },
    gossip:    { label: 'Gossip', emoji: '🗞️', count: 1, desc: 'Knows who wrote love letter to who before the letter reach.' },
    churchy:   { label: 'Fellowship Leader', emoji: '📿', count: 1, desc: 'Will pray for you whether you ask or not.' },
    sporty:    { label: 'Sports Star', emoji: '🏅', count: 1, desc: 'Runs 100m like the senior wey dey pursue am.' },
    snitch:    { label: 'Snitch', emoji: '🐍', count: 1, desc: 'House master’s unofficial CCTV.' },
    regular:   { label: 'Coursemate', emoji: '🙂', count: 18, desc: 'Just trying to survive like you.' },
  };

  BH.data.PERSONAS = [
    { key: 'quiet', label: 'Quiet', gist: ['{n} just nod and smile. Small small, una go dey talk.', '{n} talk say e miss home. You both sit in silence. E sweet somehow.'] },
    { key: 'loud', label: 'Loud', gist: ['{n} dey shout gist about Senior {s} wey fall for dining hall. Everybody hear.', '{n}: "OMO! You hear wetin happen for SS2 class?!"'] },
    { key: 'funny', label: 'Funny', gist: ['{n} imitate the Maths teacher waka. You laugh tire.', '{n}: "If garri finish for this school, I go transfer to heaven."'] },
    { key: 'proud', label: 'Proud', gist: ['{n} talk about their papa jeep for 10 minutes straight.', '{n}: "For my house we get generator wey dey on by itself."'] },
    { key: 'kind', label: 'Kind', gist: ['{n} give you one cube of sugar. Pure love.', '{n} ask if you don chop. You feel seen.'] },
    { key: 'moody', label: 'Moody', gist: ['{n} dey vex today. You no know why. You no ask.', '{n} warm up after a while and tell you their secret fear of the house master.'] },
    { key: 'dramatic', label: 'Dramatic', gist: ['{n}: "I am suffering in this school! Mummy, come and carry me!"', '{n} dey act Nollywood scene about the dining hall beans.'] },
    { key: 'streetwise', label: 'Street-smart', gist: ['{n} show you the corner wey prefect no dey check.', '{n}: "Rule number one: never show senior your full chop box."'] },
    { key: 'bookish', label: 'Bookish', gist: ['{n} explain fractions to you with chin-chin. Now you understand.', '{n} recommend one Pacesetters novel. "Mark of the Cobra". E sweet.'] },
    { key: 'churchy', label: 'Prayerful', gist: ['{n} say make you no worry, God go provide Milo.', '{n} share one testimony about how dem escape cane last term.'] },
  ];

  /* Senior roles */
  BH.data.SENIOR_ROLES = {
    bully:         { label: 'Wicked Senior', emoji: '😈' },
    schoolParent:  { label: 'School Parent', emoji: '🤝' },
    labourPrefect: { label: 'Labour Prefect', emoji: '🧹' },
    diningPrefect: { label: 'Dining Hall Prefect', emoji: '🍽️' },
    headPrefect:   { label: 'Head Prefect', emoji: '🎖️' },
    houseCaptain:  { label: 'House Captain', emoji: '🏠' },
    chill:         { label: 'Chill Senior', emoji: '😎' },
    regular:       { label: 'Senior', emoji: '🧑🏾‍🎓' },
    greedy:        { label: 'Provision Collector', emoji: '🫗' },
  };

  /* Teacher personalities per subject. Unlisted subjects get a random generic style. */
  BH.data.TEACHERS = {
    PHY: { title: 'Mr.', last: 'Olumide', nick: '"Formula"', strict: 0.5, style: 'confusing',
      enter: ['Mr. Olumide enter, write 3 formulas for board, and start explaining in a language that no be English, no be Yoruba. Nobody understand. Everybody nod.', 'Mr. Olumide: "This one is very simple." He fills the whole board. It is not simple.', 'Mr. Olumide draw one diagram, rub am, draw another one, then say "So you see?" Nobody see.'],
      right: ['"Correct! At least ONE person understand Physics for this class."', '"Exactly. You see? Very simple."', '"Ah! You go read Engineering."'],
      wrong: ['"No no no. You no dey listen. As I was saying… (writes 4 more formulas)"', '"Wrong. Go and read Newton. Not Newton your classmate."', '"Hmm. Physics no be by force."'],
      punish: 'Mr. Olumide make you solve 20 questions on the board while the whole class watch. You no solve any.' },
    LIT: { title: 'Mrs.', last: 'Ekwueme', nick: '"Shakespeare"', strict: 0.2, style: 'gentle',
      enter: ['Mrs. Ekwueme read poem with so much feeling that one boy for back start to cry. Today: {topic}.', 'Mrs. Ekwueme enter holding "Things Fall Apart" like Bible: "Children, literature is LIFE."', '"Good morning my dear poets," Mrs. Ekwueme say softly. Even the bully sit up.'],
      right: ['"Beautiful! You have the soul of a poet."', '"Wonderful, my dear."', '"Yes! Achebe would be proud."'],
      wrong: ['"Not quite, my dear. Read the text again."', '"Hmm, no. But I like your imagination."'],
      punish: 'Mrs. Ekwueme look you with disappointment and ask you to recite a poem in front of the class. The shame no small.' },
    MTH: { title: 'Mr.', last: 'Bassey', nick: '"Koboko"', strict: 0.75, style: 'strict',
      enter: ['Mr. Bassey enter class with cane under armpit. The whole class quiet like graveyard.', '"Stand up! Sit down! Stand up!" — Mr. Bassey warm-up exercise before Maths.', 'Mr. Bassey drop cane for table: "Who no do assignment, come out before I find you."'],
      right: ['"Correct. Sit down before I change my mind."', '"Hmm. You fit try."', '"Good. At least one person dey reason for this class."'],
      wrong: ['"Ehn? Na so your papa pay school fees for you to talk nonsense?"', '"Kneel down there and think about your life."', '"Wrong! Even my goat sabi this one."'],
      punish: 'Mr. Bassey give you three strokes of koboko. Your palm don swell like puff-puff.' },
    ENG: { title: 'Mrs.', last: 'Oyelaran', nick: '"Grammar Police"', strict: 0.5, style: 'grammar',
      enter: ['Mrs. Oyelaran enter: "Good morning class. And if anybody tells me \'I am coming\' when going out, you will kneel."', 'Mrs. Oyelaran adjust her glasses: "Today we shall be doing CONCORD. Not Concorde the plane."', '"Who wrote \'furnitures\' in last week composition? Stand up."'],
      right: ['"Beautiful! You speak like the Queen\'s English."', '"Very good. Clap for him/her!"', '"Excellent. That is the correct usage."'],
      wrong: ['"Haba! Your English is fractured like a broken plate."', '"No, my dear. Go and read your Intensive English."', '"Who taught you that? Was it Nollywood?"'],
      punish: 'Mrs. Oyelaran make you write "I will not talk in class" 100 times. Your hand don cramp.' },
    BSC: { title: 'Mr.', last: 'Chukwuma', nick: '"Practical Never Happen"', strict: 0.35, style: 'distracted',
      enter: ['Mr. Chukwuma enter 15 minutes late: "Sorry class, my generator no gree start." Lesson begins.', 'Mr. Chukwuma: "Today we go do practical." (There is no laboratory equipment.) He draws beaker on board.', 'Mr. Chukwuma start lesson on Photosynthesis, end am with story about his village farm.'],
      right: ['"Correct! You be future scientist."', '"Good! Like my uncle wey be doctor for Abroad."', '"Yes! See am — brain dey work."'],
      wrong: ['"No. But nice try, nice try."', '"Hmm, no. Read your Basic Science textbook, page... any page."', '"Wrong. But the confidence dey."'],
      punish: 'Mr. Chukwuma send you to go stand outside the class. You hear the whole lesson through window anyway.' },
  };

  BH.data.GENERIC_TEACHER_STYLES = [
    { style: 'gentle', strict: 0.2, enter: ['{t} greet the class softly and begin the lesson on {topic}.', '{t}: "Good morning my lovely children. Today we look at {topic}."'],
      punish: '{t} sigh: "I\'m disappointed in you." You feel worse than if dem flog you.' },
    { style: 'boring', strict: 0.3, enter: ['{t} start reading note on {topic} from a book older than the school.', '{t} dictate notes on {topic}: "Full stop. New paragraph." for 80 minutes.'],
      punish: '{t} send you out of class. You no even mind.' },
    { style: 'storyteller', strict: 0.25, enter: ['{t} said "Before we start {topic}, let me tell you about 1987..."', '{t} teach {topic} through a story about a tortoise. Somehow e make sense.'],
      punish: '{t} make you stand on one leg until the story finish.' },
    { style: 'strict', strict: 0.65, enter: ['{t} enter, look the class up and down. Nobody breathe. Topic: {topic}.', '{t}: "Hands on your desk. Today: {topic}. Any noise, you go see me."'],
      punish: '{t} give you two strokes of cane plus "go and cut grass after school".' },
  ];
})(window.BH);
