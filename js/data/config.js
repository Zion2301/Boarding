/* Game-wide configuration & character-creation data */
(function (BH) {
  const D = BH.data;

  D.CONFIG = {
    SAVE_VERSION: 5,
    SLOTS: 3,
    TERM_WEEKS: 10,
    TERMS_PER_YEAR: 3,
    MAX_LOG: 60,
    QUIZ_QUESTIONS: 3,
    QUIZ_SECONDS: 20,
    EXAM_QUESTIONS: 5,
    EXAM_SECONDS: 25,
    EVENT_CHANCE: 0.3,       // chance of a random event at the start of a block
    MISSIONS_PER_DAY: 3,
  };

  D.LEVELS = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'];
  D.DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  D.STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
    'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi',
    'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
    'Taraba', 'Yobe', 'Zamfara'];

  D.RELIGIONS = {
    christian: { label: 'Christian', emoji: '✝️', rs: 'CRS', rsName: 'Christian Religious Studies', fellowship: 'Fellowship' },
    muslim: { label: 'Muslim', emoji: '☪️', rs: 'IRS', rsName: 'Islamic Religious Studies', fellowship: 'MSSN / Jumat' },
  };

  D.LANGUAGES = { yoruba: 'Yoruba', igbo: 'Igbo', hausa: 'Hausa' };

  D.BACKGROUNDS = {
    struggling: {
      label: 'Struggling', emoji: '🪙', money: 1500,
      desc: 'Mummy sell her wrapper to pay your fees. Your chop box light, but your spirit strong.',
      provisions: { garri: 12, sugar: 6, groundnut: 6, milk: 3, soap: 10, detergent: 5, biscuits: 2, kuli: 4 },
      parentLine: 'Mummy squeeze {money} for your palm: "Na all I get be this o. Use am well. Remember the son/daughter of whom you are."',
    },
    middle: {
      label: 'Middle class', emoji: '🏠', money: 5000,
      desc: 'Daddy na civil servant, Mummy get shop. Your chop box decent — Milo dey, Cornflakes dey.',
      provisions: { garri: 10, sugar: 8, milk: 8, milo: 6, cornflakes: 5, indomie: 6, biscuits: 6, sardine: 2, groundnut: 5, soap: 15, detergent: 8, cream: 1, torch: 1, pureWater: 6 },
      parentLine: 'Daddy hand you {money}: "This na your pocket money for the term. If I hear say you waste am ehn..."',
    },
    bigman: {
      label: 'Big Man pikin', emoji: '💎', money: 20000,
      desc: 'Daddy na Honourable. Your chop box need two people to carry. Seniors don already smell your Milo from gate.',
      provisions: { garri: 6, sugar: 10, milk: 12, milo: 12, cornflakes: 8, indomie: 12, biscuits: 10, sardine: 6, cornedBeef: 4, gala: 6, chinchin: 6, plantainChips: 6, groundnut: 4, soap: 20, detergent: 10, cream: 2, torch: 1, flask: 1, pureWater: 10, bottledWater: 6, pringles: 2 },
      parentLine: 'The driver bring out envelope: {money}. "Oga say make you call am if anybody disturb you."',
    },
  };

  /* food/water: 1 (terrible) - 5 (excellent). strict/seniorHarsh: 0-1 probabilities modifiers */
  D.SCHOOLS = {
    fgc: {
      label: 'Federal Government College', short: 'FGC', emoji: '🇳🇬',
      desc: 'Unity School. Students from every state. Food “manageable”, seniors no dey play.',
      names: ['Federal Government College, Odogbolu', 'Federal Government College, Kano', 'Federal Government College, Enugu', 'Federal Government College, Warri'],
      food: 2, water: 2, strict: 0.55, seniorHarsh: 0.7, motto: 'Pro Unitate',
    },
    private: {
      label: 'Private elite school', short: 'Private', emoji: '🏰',
      desc: 'Air-condition hostel, chef dey cook. But dem go call your papa for every small thing.',
      names: ['Greenfield International College', 'Royal Crest Academy', 'Corona Heights College', 'Lekki Lighthouse Academy'],
      food: 5, water: 5, strict: 0.5, seniorHarsh: 0.25, motto: 'Excellence in All Things',
    },
    mission: {
      label: 'Missionary school', short: 'Mission', emoji: '⛪',
      desc: 'Rev. Father/Sister dey run am. Discipline na 100%. Morning devotion compulsory, even for your enemy.',
      names: ["St. Gregory's College", "Queen of Apostles College", "St. Finbarr's College", "Holy Child College"],
      food: 3, water: 3, strict: 0.8, seniorHarsh: 0.5, motto: 'Lux et Veritas',
    },
    state: {
      label: 'State boarding school', short: 'State', emoji: '🏫',
      desc: 'Fees cheap, water scarce, beans get “protein”. Seniors here na real government.',
      names: ['Government Secondary School, Ikot Ekpene', 'Community Grammar School, Ilesa', 'Government College, Umuahia', 'Government Girls/Boys Secondary School, Zaria'],
      food: 1, water: 1, strict: 0.4, seniorHarsh: 0.9, motto: 'Knowledge is Power',
    },
  };

  /* Trait modifiers (all additive/multiplicative tweaks read through BH.Stats.mod):
     study: knowledge gain mult, dodge: +escape chance, hustle: sale price mult,
     catch: +chance of being caught, morale: morale gain mult, favour: senior favour mult,
     energy: rest drain mult, luck: +chance of lucky breaks, rel: relationship gain mult, fight: +win chance */
  D.TRAITS = {
    stubborn: { label: 'Stubborn', emoji: '🐐', desc: 'Nobody fit force you. Seniors vex, but you no dey bend.', mods: { favour: 0.8, morale: 1.1, fight: 0.15, catch: 0.05 } },
    bookworm: { label: 'Book worm', emoji: '🤓', desc: 'You fit read textbook for fun. Knowledge enter you sharp sharp.', mods: { study: 1.4, rel: 0.9 } },
    sharp: { label: 'Sharp guy/babe', emoji: '🦊', desc: 'Street-smart. You sabi escape, sabi negotiate, sabi lie small.', mods: { dodge: 0.2, hustle: 1.15, luck: 0.05 } },
    gentle: { label: 'Gentle', emoji: '🕊️', desc: 'Everybody like you. Teachers trust you, seniors no too dey punish you.', mods: { favour: 1.2, catch: -0.1, rel: 1.1 } },
    agbero: { label: 'Agbero spirit', emoji: '💪', desc: 'You fit fight, you fit shout. Juniors fear you, teachers dey watch you.', mods: { fight: 0.3, dodge: 0.05, catch: 0.08, rep: 1.2 } },
    clown: { label: 'Class clown', emoji: '🤡', desc: 'Your mouth na your weapon. Morale high, but teacher dey always see you.', mods: { morale: 1.3, rel: 1.2, catch: 0.1 } },
    prayer: { label: 'Prayer warrior', emoji: '🙏', desc: 'You dey bind and cast every morning. Luck dey your side, morale no dey fall easily.', mods: { luck: 0.12, morale: 1.15 } },
    sporty: { label: 'Sporty', emoji: '⚽', desc: 'Stamina of a horse. You no dey tire easily and sports na your thing.', mods: { energy: 0.8, rep: 1.1 } },
    hustler: { label: 'Hustler', emoji: '💰', desc: 'You fit sell sand for Sahara. Provisions na business to you.', mods: { hustle: 1.4, luck: 0.03 } },
  };

  /* ---------- The dice of life ----------
     You don't choose your family. Odds roughly follow Nigerian reality. */
  D.FAMILY_ODDS = { struggling: 45, middle: 40, bigman: 15 };
  // Which school your family can afford / chooses for you
  D.SCHOOL_ODDS = {
    struggling: { state: 55, fgc: 33, mission: 10, private: 2 },   // private = scholarship!
    middle:     { fgc: 40, mission: 30, state: 15, private: 15 },
    bigman:     { private: 60, mission: 25, fgc: 15 },
  };
  // Region of each state: chance of being Christian, and the Nigerian language you'd likely take
  const R = (chr, lang) => ({ chr, lang });
  D.STATE_REGION = {
    Lagos: R(0.6, 'yoruba'), Ogun: R(0.55, 'yoruba'), Oyo: R(0.5, 'yoruba'), Osun: R(0.5, 'yoruba'), Ondo: R(0.75, 'yoruba'), Ekiti: R(0.85, 'yoruba'),
    Kwara: R(0.35, 'yoruba'), Kogi: R(0.55, 'yoruba'),
    Abia: R(0.98, 'igbo'), Anambra: R(0.98, 'igbo'), Ebonyi: R(0.98, 'igbo'), Enugu: R(0.98, 'igbo'), Imo: R(0.98, 'igbo'),
    'Akwa Ibom': R(0.95, 'igbo'), Bayelsa: R(0.95, 'igbo'), 'Cross River': R(0.95, 'igbo'), Delta: R(0.92, 'igbo'), Edo: R(0.85, 'yoruba'), Rivers: R(0.95, 'igbo'),
    Benue: R(0.9, 'hausa'), Plateau: R(0.75, 'hausa'), Nasarawa: R(0.5, 'hausa'), Niger: R(0.3, 'hausa'), 'FCT (Abuja)': R(0.55, 'hausa'),
    Taraba: R(0.5, 'hausa'), Adamawa: R(0.45, 'hausa'), Kaduna: R(0.45, 'hausa'), Gombe: R(0.25, 'hausa'), Bauchi: R(0.15, 'hausa'),
    Borno: R(0.1, 'hausa'), Yobe: R(0.05, 'hausa'), Kano: R(0.05, 'hausa'), Jigawa: R(0.03, 'hausa'), Katsina: R(0.03, 'hausa'),
    Kebbi: R(0.05, 'hausa'), Sokoto: R(0.03, 'hausa'), Zamfara: R(0.03, 'hausa'),
  };

  D.HOUSES = [
    { name: 'Awolowo House', color: '#2563eb', tag: 'Blue' },
    { name: 'Azikiwe House', color: '#16a34a', tag: 'Green' },
    { name: 'Tafawa Balewa House', color: '#dc2626', tag: 'Red' },
    { name: 'Funmilayo House', color: '#ca8a04', tag: 'Yellow' },
    { name: 'Mary Slessor House', color: '#9333ea', tag: 'Purple' },
    { name: 'Sardauna House', color: '#ea580c', tag: 'Orange' },
  ];
})(window.BH);
