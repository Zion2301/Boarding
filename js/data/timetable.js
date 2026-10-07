/* Time blocks, day schedules, class timetable, subjects, dining menus */
(function (BH) {
  const D = BH.data;

  /* dur = hours the block lasts (drives stat decay).
     kind: used by systems to know what kind of block it is.
     shop: tuck shop accessible. noEat: eating here is risky. */
  D.BLOCKS = {
    arrival:   { time: '14:00', dur: 2,    title: 'Resumption Day',          loc: 'School Gate',        emoji: '🚌', kind: 'story' },
    settling:  { time: '16:30', dur: 2,    title: 'Settling In',             loc: 'Hostel',             emoji: '🛏️', kind: 'story' },
    rising:    { time: '05:00', dur: 0.5,  title: 'Rising Bell',             loc: 'Dormitory',          emoji: '🔔', kind: 'hostel' },
    duty:      { time: '05:30', dur: 0.75, title: 'Morning Duty',            loc: 'Hostel Compound',    emoji: '🧹', kind: 'labour' },
    bath:      { time: '06:15', dur: 0.75, title: 'Bath Time',               loc: 'Bathroom & Tap',     emoji: '🚿', kind: 'hostel' },
    breakfast: { time: '07:00', dur: 0.75, title: 'Breakfast',               loc: 'Dining Hall',        emoji: '🍞', kind: 'meal', meal: 'breakfast' },
    assembly:  { time: '07:45', dur: 0.25, title: 'Assembly & Inspection',   loc: 'Assembly Ground',    emoji: '📢', kind: 'assembly', noEat: true },
    p1:        { time: '08:00', dur: 1.33, title: 'Period 1',                loc: 'Classroom',          emoji: '📚', kind: 'class', period: 0, noEat: true },
    p2:        { time: '09:20', dur: 1.33, title: 'Period 2',                loc: 'Classroom',          emoji: '📚', kind: 'class', period: 1, noEat: true },
    break:     { time: '10:40', dur: 0.33, title: 'Short Break',             loc: 'Tuck Shop & Field',  emoji: '🥤', kind: 'free', shop: true },
    p3:        { time: '11:00', dur: 1.33, title: 'Period 3',                loc: 'Classroom',          emoji: '📚', kind: 'class', period: 2, noEat: true },
    p4:        { time: '12:20', dur: 1.66, title: 'Period 4',                loc: 'Classroom',          emoji: '📚', kind: 'class', period: 3, noEat: true },
    lunch:     { time: '14:00', dur: 0.75, title: 'Lunch',                   loc: 'Dining Hall',        emoji: '🍛', kind: 'meal', meal: 'lunch' },
    siesta:    { time: '14:45', dur: 1.25, title: 'Siesta',                  loc: 'Dormitory',          emoji: '💤', kind: 'hostel' },
    afternoon: { time: '16:00', dur: 2.5,  title: 'Afternoon Activities',    loc: 'Field / Clubs',      emoji: '⚽', kind: 'free', shop: true },
    dinner:    { time: '18:30', dur: 1,    title: 'Dinner',                  loc: 'Dining Hall',        emoji: '🍲', kind: 'meal', meal: 'dinner' },
    prep:      { time: '19:30', dur: 2.5,  title: 'Night Prep',              loc: 'Classroom',          emoji: '🕯️', kind: 'prep' },
    lightsout: { time: '22:00', dur: 7,    title: 'Lights Out',              loc: 'Dormitory',          emoji: '🌙', kind: 'sleep',
                 decay: { hunger: 12, thirst: 14, rest: 0, hygiene: 4, morale: 0 } },
    // weekend
    labour:    { time: '06:00', dur: 3,    title: 'Saturday General Labour', loc: 'School Compound',    emoji: '🪓', kind: 'labour' },
    freetime:  { time: '10:00', dur: 3,    title: 'Saturday Free Time',      loc: 'Anywhere',           emoji: '🎈', kind: 'free', shop: true },
    social:    { time: '19:00', dur: 2.5,  title: 'Saturday Night Social',   loc: 'Assembly Hall',      emoji: '🪩', kind: 'free' },
    service:   { time: '08:00', dur: 2.5,  title: 'Sunday Worship',          loc: 'Chapel / Mosque',    emoji: '🛐', kind: 'worship', noEat: true },
    sundayPm:  { time: '15:00', dur: 3,    title: 'Sunday Afternoon',        loc: 'Hostel / Phone Booth', emoji: '✉️', kind: 'free', shop: true },
  };

  D.SCHEDULES = {
    resumption: ['arrival', 'settling', 'dinner', 'lightsout'],
    weekday: ['rising', 'duty', 'bath', 'breakfast', 'assembly', 'p1', 'p2', 'break', 'p3', 'p4', 'lunch', 'siesta', 'afternoon', 'dinner', 'prep', 'lightsout'],
    saturday: ['rising', 'labour', 'bath', 'breakfast', 'freetime', 'lunch', 'siesta', 'afternoon', 'dinner', 'social', 'lightsout'],
    sunday: ['rising', 'bath', 'breakfast', 'service', 'lunch', 'siesta', 'sundayPm', 'dinner', 'prep', 'lightsout'],
  };

  /* Subjects. 'RS' resolves to CRS or IRS from religion; 'NLG' to the chosen Nigerian language. */
  D.SUBJECTS = {
    ENG: { name: 'English Language', short: 'English', emoji: '📖' },
    MTH: { name: 'Mathematics', short: 'Maths', emoji: '➗' },
    BSC: { name: 'Basic Science', short: 'B. Science', emoji: '🔬' },
    BTE: { name: 'Basic Technology', short: 'B. Tech', emoji: '🔧' },
    SOS: { name: 'Social Studies', short: 'Social St.', emoji: '🌍' },
    CIV: { name: 'Civic Education', short: 'Civic', emoji: '⚖️' },
    RS:  { name: 'Religious Studies', short: 'CRS/IRS', emoji: '🛐' },
    AGR: { name: 'Agricultural Science', short: 'Agric', emoji: '🌽' },
    HEC: { name: 'Home Economics', short: 'Home Econs', emoji: '🍳' },
    BUS: { name: 'Business Studies', short: 'Business', emoji: '💼' },
    CCA: { name: 'Cultural & Creative Arts', short: 'CCA', emoji: '🎨' },
    PHE: { name: 'Physical & Health Education', short: 'PHE', emoji: '🏃' },
    ICT: { name: 'Computer Studies', short: 'Computer', emoji: '💻' },
    FRE: { name: 'French', short: 'French', emoji: '🇫🇷' },
    NLG: { name: 'Nigerian Language', short: 'Language', emoji: '🗣️' },
    // senior secondary
    DPR: { name: 'Data Processing', short: 'Data Proc.', emoji: '🖥️' },
    PHY: { name: 'Physics', short: 'Physics', emoji: '⚛️' },
    CHE: { name: 'Chemistry', short: 'Chemistry', emoji: '🧪' },
    BIO: { name: 'Biology', short: 'Biology', emoji: '🧬' },
    FMA: { name: 'Further Mathematics', short: 'F. Maths', emoji: '📐' },
    GEO: { name: 'Geography', short: 'Geography', emoji: '🗺️' },
    LIT: { name: 'Literature-in-English', short: 'Literature', emoji: '📜' },
    GOV: { name: 'Government', short: 'Government', emoji: '🏛️' },
    HIS: { name: 'History', short: 'History', emoji: '🏺' },
    FA:  { name: 'Fine Arts', short: 'Fine Arts', emoji: '🖌️' },
    ACC: { name: 'Financial Accounting', short: 'Accounting', emoji: '📒' },
    COM: { name: 'Commerce', short: 'Commerce', emoji: '🏪' },
    ECO: { name: 'Economics', short: 'Economics', emoji: '📈' },
    OFP: { name: 'Office Practice', short: 'Office Prac.', emoji: '🗂️' },
    MKT: { name: 'Marketing', short: 'Marketing', emoji: '📣' },
  };

  /* SS1 departments. Core subjects are taken by everybody. */
  D.SS_CORE = ['ENG', 'MTH', 'CIV', 'DPR'];
  D.DEPARTMENTS = {
    science:    { label: 'Science', emoji: '🔬', subjects: ['PHY', 'CHE', 'BIO', 'FMA', 'AGR', 'GEO'], jamb: ['PHY', 'CHE', 'BIO'],
                  desc: 'Doctor, engineer, pharmacist. Your parents go happy, your brain go suffer.', from: ['MTH', 'BSC', 'BTE'] },
    arts:       { label: 'Arts', emoji: '🎭', subjects: ['LIT', 'GOV', 'HIS', 'RS', 'NLG', 'FA'], jamb: ['LIT', 'GOV', 'HIS'],
                  desc: 'Lawyer, journalist, diplomat. Plenty reading, plenty grammar, plenty argument.', from: ['ENG', 'SOS', 'CIV', 'RS'] },
    commercial: { label: 'Commercial', emoji: '💼', subjects: ['ACC', 'COM', 'ECO', 'OFP', 'MKT'], jamb: ['ECO', 'ACC', 'COM'],
                  desc: 'Banker, accountant, CEO. You go dey count money for exam before you count am for real life.', from: ['BUS', 'MTH', 'SOS'] },
  };
  // where SS subject knowledge starts from (JSS subject that feeds it)
  D.SS_FEEDS = { PHY: 'BSC', CHE: 'BSC', BIO: 'BSC', FMA: 'MTH', GEO: 'SOS', LIT: 'ENG', GOV: 'CIV', HIS: 'SOS', FA: 'CCA',
    ACC: 'BUS', COM: 'BUS', ECO: 'SOS', OFP: 'BUS', MKT: 'BUS', DPR: 'ICT' };

  /* Which subjects each level offers (SS departments come in a later update) */
  D.CURRICULUM = {
    JSS: ['ENG', 'MTH', 'BSC', 'BTE', 'SOS', 'CIV', 'RS', 'AGR', 'HEC', 'BUS', 'CCA', 'PHE', 'ICT', 'FRE', 'NLG'],
  };

  /* JSS weekly class timetable — 4 periods/day Mon–Fri.
     An array in a slot alternates by week number. */
  D.TIMETABLE = {
    JSS: [
      ['MTH', 'BTE', 'ENG', 'SOS'],
      ['BSC', 'CIV', 'MTH', 'AGR'],
      ['ENG', 'RS', 'BSC', 'NLG'],
      ['MTH', 'FRE', 'ENG', ['CCA', 'ICT']],
      ['BSC', 'BUS', 'HEC', 'PHE'],
    ],
  };

  /* What teachers "teach" in a lesson — flavour for the class scene */
  D.TOPICS = {
    ENG: ['Parts of Speech', 'Concord (Subject-Verb Agreement)', 'Vowel Sounds', 'Letter Writing (Informal)', 'Comprehension: "The Lazy Farmer"', 'Synonyms & Antonyms'],
    MTH: ['Fractions', 'LCM and HCF', 'Number Bases', 'Simple Equations', 'Perimeter and Area', 'Percentages', 'Approximation'],
    BSC: ['Living and Non-living Things', 'The Cell', 'States of Matter', 'Photosynthesis', 'Measurement', 'Energy', 'Human Body Systems'],
    BTE: ['Safety in the Workshop', 'Technical Drawing Instruments', 'Wood Materials', 'Simple Machines'],
    SOS: ['The Family', 'Culture and Social Values', 'Marriage Types in Nigeria', 'Our Physical Environment'],
    CIV: ['National Values', 'Honesty', 'Citizenship', 'The National Anthem and Pledge'],
    RS:  ['Creation', 'Moral Lessons', 'The Life of the Prophets', 'Obedience'],
    AGR: ['Meaning of Agriculture', 'Farm Tools', 'Crop Classification', 'Soil Types'],
    HEC: ['Personal Hygiene', 'Kitchen Equipment', 'Food Nutrients', 'Sewing Tools'],
    BUS: ['Office Equipment', 'Bookkeeping Basics', 'Honesty in Business', 'Consumer Rights'],
    CCA: ['Colour Wheel', 'Nigerian Traditional Dances', 'Drawing a Still Life', 'Drama: Stage Directions'],
    PHE: ['Athletics: Track Events', 'Personal Health', 'Football Rules', 'First Aid'],
    ICT: ['Parts of a Computer', 'Input and Output Devices', 'History of Computers', 'Using the Mouse (no mouse available)'],
    FRE: ['Les Salutations', 'Les Nombres 1–20', 'La Famille', 'Les Jours de la Semaine'],
    NLG: ['Greetings', 'Alphabet and Tones', 'Proverbs', 'Folktales'],
    DPR: ['Data and Information', 'Spreadsheets', 'Computer Files', 'Database Basics'],
    PHY: ['Motion', 'Newton\'s Laws', 'Work, Energy and Power', 'Heat Transfer', 'Current Electricity', 'Refraction of Light'],
    CHE: ['Atomic Structure', 'Chemical Bonding', 'Separation Techniques', 'Acids, Bases and Salts', 'The Mole Concept'],
    BIO: ['The Cell', 'Classification of Living Things', 'Nutrition in Animals', 'Ecology', 'Transport in Plants'],
    FMA: ['Sets and Logic', 'Binary Operations', 'Indices and Surds', 'Matrices'],
    GEO: ['The Solar System', 'Rocks', 'Weather and Climate', 'Map Reading'],
    LIT: ['Introduction to Poetry', 'Drama: Tragedy and Comedy', 'Things Fall Apart', 'Figures of Speech', 'African Prose'],
    GOV: ['Arms of Government', 'Democracy', 'Separation of Powers', 'Nigerian Constitutions', 'Pre-colonial Administration'],
    HIS: ['The Nok Culture', 'The Sokoto Caliphate', 'Benin Kingdom', 'Amalgamation of 1914'],
    FA:  ['Colour Theory', 'Pencil Shading', 'Nigerian Art Traditions', 'Sculpture'],
    ACC: ['The Accounting Equation', 'Double Entry', 'The Trial Balance', 'Books of Original Entry'],
    COM: ['Introduction to Commerce', 'Retail Trade', 'Aids to Trade', 'Insurance'],
    ECO: ['Scarcity and Choice', 'Demand and Supply', 'Factors of Production', 'Market Structures'],
    OFP: ['The Office', 'Filing Systems', 'Mail Handling', 'Office Machines'],
    MKT: ['Meaning of Marketing', 'The Marketing Mix', 'Consumer Behaviour', 'Advertising'],
  };

  /* Dining menus. q = quality tier (1 terrible – 5 posh). protein: has meat/egg/fish a senior might "collect". */
  D.MENUS = {
    breakfast: [
      { name: 'Bread and tea (the tea na coloured water)', q: 1, hunger: 16, thirst: 12, protein: false },
      { name: 'Pap and akara', q: 2, hunger: 22, thirst: 10, protein: false },
      { name: 'Beans and pap', q: 2, hunger: 26, thirst: 8, protein: false },
      { name: 'Bread and beans (ewa agoyin style)', q: 2, hunger: 26, thirst: 4, protein: false },
      { name: 'Yam and egg sauce', q: 3, hunger: 28, thirst: 4, protein: true },
      { name: 'Custard and moi-moi', q: 3, hunger: 26, thirst: 8, protein: true },
      { name: 'Jollof spaghetti with fish', q: 4, hunger: 30, thirst: 4, protein: true },
      { name: 'Pancakes, sausage and tea', q: 5, hunger: 30, thirst: 10, protein: true },
    ],
    lunch: [
      { name: 'Eba and egusi (soup wey fish only pass by)', q: 1, hunger: 30, thirst: 2, protein: false },
      { name: 'Rice and stew — the famous "carrot rice"', q: 2, hunger: 30, thirst: 4, protein: true },
      { name: 'Beans and dodo', q: 2, hunger: 32, thirst: 2, protein: false },
      { name: 'Amala and ewedu', q: 2, hunger: 30, thirst: 4, protein: false },
      { name: 'Yam porridge (asaro)', q: 3, hunger: 34, thirst: 2, protein: false },
      { name: 'Semo and okra with fish', q: 3, hunger: 32, thirst: 4, protein: true },
      { name: 'Fried rice and chicken', q: 5, hunger: 38, thirst: 2, protein: true },
    ],
    dinner: [
      { name: 'Garri and beans (beans get "protein" — weevils)', q: 1, hunger: 30, thirst: 0, protein: false },
      { name: 'Rice and beans with palm oil stew', q: 2, hunger: 30, thirst: 2, protein: false },
      { name: 'Eba and okra', q: 2, hunger: 28, thirst: 4, protein: false },
      { name: 'Moi-moi and pap', q: 3, hunger: 26, thirst: 10, protein: true },
      { name: 'Spaghetti and stew with meat', q: 3, hunger: 30, thirst: 2, protein: true },
      { name: 'Pounded yam and egusi with goat meat', q: 5, hunger: 38, thirst: 2, protein: true },
    ],
    fridayLunch: { name: 'FRIDAY JOLLOF RICE 🔥 (with one small meat)', q: 4, hunger: 38, thirst: 2, protein: true, special: true },
  };
})(window.BH);
