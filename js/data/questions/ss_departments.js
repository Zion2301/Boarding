/* Senior secondary department subjects — question banks (SS1 level, used for SS1–SS3).
   Same format as english.js. Add lvl: 5 / 6 entries for SS2 / SS3 specific questions. */

/* ================= SCIENCE ================= */
BH.Q.PHY = [
  { lvl: 4, q: 'The S.I. unit of power is the ___.', o: ['joule', 'watt', 'newton', 'ampere'], a: 1, e: 'Power is the rate of doing work, measured in watts (J/s).' },
  { lvl: 4, q: 'Which of these is a vector quantity?', o: ['Mass', 'Speed', 'Velocity', 'Temperature'], a: 2, e: 'Velocity has both magnitude and direction.' },
  { lvl: 4, q: 'A car travels 100 m in 20 s. Its average speed is ___.', o: ['2 m/s', '5 m/s', '20 m/s', '2000 m/s'], a: 1, e: 'Speed = 100 ÷ 20 = 5 m/s.' },
  { lvl: 4, q: 'Acceleration is the rate of change of ___.', o: ['distance', 'velocity', 'mass', 'force'], a: 1, e: 'a = change in velocity ÷ time.' },
  { lvl: 4, q: "Newton's first law of motion is also called the law of ___.", o: ['inertia', 'gravity', 'energy', 'momentum'], a: 0, e: 'A body stays at rest or in uniform motion unless acted on by a force — inertia.' },
  { lvl: 4, q: 'What is the weight of a 5 kg mass? (g = 10 m/s²)', o: ['0.5 N', '5 N', '50 N', '500 N'], a: 2, e: 'W = mg = 5 × 10 = 50 N.' },
  { lvl: 4, q: 'The energy a body has because of its motion is ___ energy.', o: ['potential', 'kinetic', 'chemical', 'nuclear'], a: 1, e: 'Kinetic energy = ½mv².' },
  { lvl: 4, q: 'Heat travels through a vacuum by ___.', o: ['conduction', 'convection', 'radiation', 'evaporation'], a: 2, e: 'Radiation needs no medium — that is how the sun\'s heat reaches us.' },
  { lvl: 4, q: 'The S.I. unit of electric current is the ___.', o: ['volt', 'ohm', 'ampere', 'coulomb'], a: 2, e: 'Current is measured in amperes (A).' },
  { lvl: 4, q: "According to Ohm's law, V = ___.", o: ['I/R', 'IR', 'R/I', 'I + R'], a: 1, e: 'Voltage = current × resistance.' },
  { lvl: 4, q: 'Density = mass ÷ ___', o: ['weight', 'volume', 'area', 'length'], a: 1, e: 'Density is mass per unit volume (kg/m³).' },
  { lvl: 4, q: 'Which instrument measures the diameter of a thin wire most accurately?', o: ['Metre rule', 'Micrometer screw gauge', 'Tape rule', 'Measuring cylinder'], a: 1, e: 'The micrometer screw gauge reads to 0.01 mm.' },
  { lvl: 4, q: 'Momentum = mass × ___', o: ['acceleration', 'velocity', 'time', 'distance'], a: 1, e: 'p = mv.' },
  { lvl: 4, q: 'The bending of light as it passes from one medium to another is ___.', o: ['reflection', 'refraction', 'diffraction', 'dispersion'], a: 1, e: 'Refraction is why a stick looks bent in water.' },
  { lvl: 4, q: 'A 20 N force moves a box 5 m in its direction. The work done is ___.', o: ['4 J', '25 J', '100 J', '15 J'], a: 2, e: 'W = F × d = 20 × 5 = 100 J.' },
];

BH.Q.CHE = [
  { lvl: 4, q: 'The atomic number of an element is the number of ___ in its nucleus.', o: ['neutrons', 'protons', 'electrons', 'nucleons'], a: 1, e: 'Atomic number = number of protons.' },
  { lvl: 4, q: 'Which of these is a noble gas?', o: ['Oxygen', 'Argon', 'Chlorine', 'Nitrogen'], a: 1, e: 'Argon is in Group 0 (18) — the noble gases.' },
  { lvl: 4, q: 'The chemical formula of water is ___.', o: ['H₂O', 'HO₂', 'H₂O₂', 'OH'], a: 0, e: 'Two hydrogen atoms and one oxygen atom. (H₂O₂ is hydrogen peroxide.)' },
  { lvl: 4, q: 'Rusting of iron requires ___.', o: ['oxygen and water', 'nitrogen only', 'carbon dioxide only', 'heat only'], a: 0, e: 'Iron rusts in the presence of both air (oxygen) and water.' },
  { lvl: 4, q: 'A substance that speeds up a reaction without being used up is a ___.', o: ['reactant', 'catalyst', 'product', 'solvent'], a: 1, e: 'Catalysts lower the activation energy and are recovered unchanged.' },
  { lvl: 4, q: 'Pure water is obtained from salt water by ___.', o: ['filtration', 'distillation', 'decantation', 'sieving'], a: 1, e: 'Distillation boils the water off and condenses it, leaving the salt.' },
  { lvl: 4, q: 'An acid turns blue litmus paper ___.', o: ['red', 'green', 'yellow', 'colourless'], a: 0, e: 'Acids turn blue litmus red; alkalis turn red litmus blue.' },
  { lvl: 4, q: 'How many electrons are in the outermost shell of sodium (atomic number 11)?', o: ['1', '2', '8', '11'], a: 0, e: 'Electron configuration 2, 8, 1.' },
  { lvl: 4, q: 'A bond formed by sharing electrons is a/an ___ bond.', o: ['ionic', 'covalent', 'metallic', 'hydrogen'], a: 1, e: 'Covalent bonds involve shared electron pairs.' },
  { lvl: 4, q: 'Which of these is a physical change?', o: ['Burning of wood', 'Melting of ice', 'Rusting of iron', 'Souring of milk'], a: 1, e: 'Melting is reversible and forms no new substance.' },
  { lvl: 4, q: 'The gas that turns lime water milky is ___.', o: ['oxygen', 'hydrogen', 'carbon dioxide', 'nitrogen'], a: 2, e: 'CO₂ reacts with lime water to form insoluble calcium carbonate.' },
  { lvl: 4, q: 'What is the relative molecular mass of CO₂? (C = 12, O = 16)', o: ['28', '44', '32', '40'], a: 1, e: '12 + 2 × 16 = 44.' },
  { lvl: 4, q: 'Isotopes have the same number of protons but different numbers of ___.', o: ['electrons', 'neutrons', 'shells', 'protons'], a: 1, e: 'Isotopes differ in neutron number, hence mass number.' },
  { lvl: 4, q: 'Sodium chloride is commonly known as ___.', o: ['sugar', 'table salt', 'chalk', 'soap'], a: 1, e: 'NaCl is table salt.' },
  { lvl: 4, q: 'The pH of a strong alkali is likely to be ___.', o: ['1', '4', '7', '13'], a: 3, e: 'Strong alkalis have pH values close to 14.' },
];

BH.Q.BIO = [
  { lvl: 4, q: 'The "powerhouse" of the cell is the ___.', o: ['nucleus', 'mitochondrion', 'ribosome', 'vacuole'], a: 1, e: 'Mitochondria release energy through respiration.' },
  { lvl: 4, q: 'Which organelle is found in plant cells but not animal cells?', o: ['Nucleus', 'Cell membrane', 'Chloroplast', 'Mitochondrion'], a: 2, e: 'Chloroplasts carry out photosynthesis.' },
  { lvl: 4, q: 'The basic unit of classification is the ___.', o: ['kingdom', 'genus', 'species', 'family'], a: 2, e: 'Species is the smallest and most basic unit.' },
  { lvl: 4, q: 'Movement of water from a dilute to a concentrated solution across a semi-permeable membrane is ___.', o: ['diffusion', 'osmosis', 'transpiration', 'active transport'], a: 1, e: 'That is the definition of osmosis.' },
  { lvl: 4, q: 'Which blood cells fight infection?', o: ['Red blood cells', 'White blood cells', 'Platelets', 'Plasma'], a: 1, e: 'White blood cells (leucocytes) defend the body.' },
  { lvl: 4, q: 'The enzyme in saliva that digests starch is ___.', o: ['pepsin', 'ptyalin (salivary amylase)', 'lipase', 'trypsin'], a: 1, e: 'Ptyalin breaks starch into maltose.' },
  { lvl: 4, q: 'Which of these is a producer in a food chain?', o: ['Grasshopper', 'Grass', 'Hawk', 'Lizard'], a: 1, e: 'Green plants make their own food — they are producers.' },
  { lvl: 4, q: 'The female reproductive part of a flower is the ___.', o: ['stamen', 'pistil (carpel)', 'sepal', 'petal'], a: 1, e: 'The pistil has the stigma, style and ovary.' },
  { lvl: 4, q: 'Organisms that cause disease are called ___.', o: ['hosts', 'pathogens', 'vectors', 'producers'], a: 1, e: 'Pathogens include bacteria, viruses, fungi and protozoa.' },
  { lvl: 4, q: 'The vector of malaria is the ___.', o: ['housefly', 'female Anopheles mosquito', 'tsetse fly', 'Aedes mosquito'], a: 1, e: 'Only the female Anopheles transmits the Plasmodium parasite.' },
  { lvl: 4, q: 'The study of organisms and their environment is ___.', o: ['ecology', 'anatomy', 'genetics', 'taxonomy'], a: 0, e: 'Ecology studies relationships between organisms and their surroundings.' },
  { lvl: 4, q: 'Which part of the brain controls balance?', o: ['Cerebrum', 'Cerebellum', 'Medulla oblongata', 'Hypothalamus'], a: 1, e: 'The cerebellum coordinates balance and posture.' },
  { lvl: 4, q: 'Gaseous exchange in fish takes place in the ___.', o: ['lungs', 'gills', 'skin only', 'trachea'], a: 1, e: 'Gills absorb dissolved oxygen from water.' },
  { lvl: 4, q: 'The hormone that lowers blood sugar is ___.', o: ['adrenaline', 'insulin', 'thyroxine', 'oestrogen'], a: 1, e: 'Insulin is produced by the pancreas.' },
  { lvl: 4, q: 'Mushrooms belong to the kingdom ___.', o: ['Plantae', 'Animalia', 'Fungi', 'Monera'], a: 2, e: 'Mushrooms are fungi — they have no chlorophyll.' },
];

/* ================= ARTS ================= */
BH.Q.LIT = [
  { lvl: 4, q: 'A poem of fourteen lines is a ___.', o: ['sonnet', 'ode', 'elegy', 'ballad'], a: 0, e: 'Sonnets have 14 lines (Shakespearean or Petrarchan).' },
  { lvl: 4, q: 'A poem that mourns the dead is a/an ___.', o: ['ode', 'elegy', 'epic', 'lyric'], a: 1, e: 'An elegy is a lament for the dead.' },
  { lvl: 4, q: 'The main character in a story is the ___.', o: ['antagonist', 'protagonist', 'narrator', 'foil'], a: 1, e: 'The protagonist is the central character; the antagonist opposes them.' },
  { lvl: 4, q: 'A play that ends with the downfall of the hero is a ___.', o: ['comedy', 'tragedy', 'farce', 'melodrama'], a: 1, e: 'Tragedy ends in suffering or death for the hero.' },
  { lvl: 4, q: '"Things Fall Apart" was written by ___.', o: ['Wole Soyinka', 'Chinua Achebe', 'Chimamanda Adichie', 'Cyprian Ekwensi'], a: 1, e: 'Chinua Achebe published it in 1958.' },
  { lvl: 4, q: 'Okonkwo is the main character of ___.', o: ['Arrow of God', 'Things Fall Apart', 'The Lion and the Jewel', 'Purple Hibiscus'], a: 1, e: 'Okonkwo of Umuofia is the tragic hero of Things Fall Apart.' },
  { lvl: 4, q: '"The Lion and the Jewel" was written by ___.', o: ['Chinua Achebe', 'Wole Soyinka', 'Ola Rotimi', 'J.P. Clark'], a: 1, e: 'Wole Soyinka, Nobel laureate (1986).' },
  { lvl: 4, q: 'The repetition of initial consonant sounds, as in "Peter Piper picked", is ___.', o: ['assonance', 'alliteration', 'rhyme', 'onomatopoeia'], a: 1, e: 'Alliteration repeats initial consonant sounds.' },
  { lvl: 4, q: 'A story narrated by a character using "I" is told from the ___ point of view.', o: ['first-person', 'second-person', 'third-person', 'omniscient'], a: 0, e: 'First-person narrators use "I".' },
  { lvl: 4, q: 'The time and place in which a story happens is its ___.', o: ['plot', 'setting', 'theme', 'tone'], a: 1, e: 'Setting = where and when.' },
  { lvl: 4, q: 'A speech in which a character alone on stage reveals their thoughts is a ___.', o: ['dialogue', 'soliloquy', 'aside', 'prologue'], a: 1, e: 'Hamlet\'s "To be or not to be" is a famous soliloquy.' },
  { lvl: 4, q: '"The Gods Are Not to Blame" was written by ___.', o: ['Ola Rotimi', 'Wole Soyinka', 'Femi Osofisan', 'Ahmed Yerima'], a: 0, e: 'Ola Rotimi adapted Oedipus Rex into a Yoruba setting.' },
  { lvl: 4, q: 'A comparison using "like" or "as" is a ___.', o: ['metaphor', 'simile', 'personification', 'irony'], a: 1, e: 'Simile: "as cold as ice".' },
  { lvl: 4, q: 'The central idea of a literary work is its ___.', o: ['plot', 'theme', 'setting', 'diction'], a: 1, e: 'Theme is the underlying message.' },
  { lvl: 4, q: 'A long narrative poem about heroic deeds is a/an ___.', o: ['epic', 'sonnet', 'limerick', 'haiku'], a: 0, e: 'Epics like the Iliad celebrate heroes.' },
];

BH.Q.GOV = [
  { lvl: 4, q: '"Government of the people, by the people, for the people" describes ___.', o: ['monarchy', 'democracy', 'oligarchy', 'dictatorship'], a: 1, e: 'Abraham Lincoln\'s definition of democracy.' },
  { lvl: 4, q: 'The arm of government that makes laws is the ___.', o: ['executive', 'legislature', 'judiciary', 'civil service'], a: 1, e: 'The legislature (National Assembly) makes laws.' },
  { lvl: 4, q: 'The arm of government that interprets laws is the ___.', o: ['legislature', 'executive', 'judiciary', 'police'], a: 2, e: 'The courts (judiciary) interpret laws.' },
  { lvl: 4, q: 'Dividing power among the arms of government is called ___.', o: ['rule of law', 'separation of powers', 'federalism', 'sovereignty'], a: 1, e: 'Separation of powers prevents concentration of power.' },
  { lvl: 4, q: 'Nigeria became independent on ___.', o: ['1st October 1960', '1st October 1963', '12th June 1993', '29th May 1999'], a: 0, e: 'Independence from Britain: 1 October 1960.' },
  { lvl: 4, q: 'Nigeria became a republic in ___.', o: ['1960', '1963', '1966', '1979'], a: 1, e: 'Nigeria became a republic on 1 October 1963.' },
  { lvl: 4, q: "Nigeria's federal legislature is called the ___.", o: ['House of Lords', 'National Assembly', 'Congress', 'Council of Chiefs'], a: 1, e: 'The National Assembly = Senate + House of Representatives.' },
  { lvl: 4, q: 'A system where power is shared between central and state governments is ___.', o: ['unitary', 'federal', 'confederal', 'monarchical'], a: 1, e: 'Nigeria practises federalism.' },
  { lvl: 4, q: 'The supreme power of a state to make and enforce laws within its territory is ___.', o: ['legitimacy', 'sovereignty', 'authority', 'franchise'], a: 1, e: 'Sovereignty is supreme, independent power.' },
  { lvl: 4, q: 'The right to vote is called ___.', o: ['franchise', 'referendum', 'recall', 'petition'], a: 0, e: 'Franchise (suffrage) is the right to vote.' },
  { lvl: 4, q: 'The first Executive President of Nigeria was ___.', o: ['Nnamdi Azikiwe', 'Shehu Shagari', 'Tafawa Balewa', 'Olusegun Obasanjo'], a: 1, e: 'Shagari (1979). Azikiwe was a ceremonial president.' },
  { lvl: 4, q: 'The body that conducts elections in Nigeria is ___.', o: ['NDLEA', 'INEC', 'EFCC', 'NYSC'], a: 1, e: 'The Independent National Electoral Commission.' },
  { lvl: 4, q: 'The concept of "rule of law" was popularised by ___.', o: ['A.V. Dicey', 'Montesquieu', 'Karl Marx', 'John Locke'], a: 0, e: 'A.V. Dicey, British jurist.' },
  { lvl: 4, q: 'Montesquieu is associated with the theory of ___.', o: ['rule of law', 'separation of powers', 'social contract', 'communism'], a: 1, e: 'From "The Spirit of the Laws" (1748).' },
  { lvl: 4, q: 'How many states are there in Nigeria?', o: ['30', '36', '37', '19'], a: 1, e: '36 states plus the FCT, Abuja.' },
];

/* ================= COMMERCIAL ================= */
BH.Q.ECO = [
  { lvl: 4, q: 'Economics studies how man allocates ___ resources.', o: ['unlimited', 'scarce', 'free', 'natural only'], a: 1, e: 'Scarcity is the central problem of economics.' },
  { lvl: 4, q: 'Opportunity cost is the ___.', o: ['money cost', 'alternative forgone', 'total cost', 'price of goods'], a: 1, e: 'It is the next best alternative given up.' },
  { lvl: 4, q: 'Law of demand: other things equal, as price rises, quantity demanded ___.', o: ['rises', 'falls', 'stays constant', 'doubles'], a: 1, e: 'Price and quantity demanded move in opposite directions.' },
  { lvl: 4, q: 'Which of these is a factor of production?', o: ['Money', 'Land', 'Profit', 'Price'], a: 1, e: 'Land, labour, capital and entrepreneur.' },
  { lvl: 4, q: 'The reward for labour is ___.', o: ['rent', 'wages', 'interest', 'profit'], a: 1, e: 'Labour earns wages/salaries.' },
  { lvl: 4, q: 'The reward for capital is ___.', o: ['rent', 'wages', 'interest', 'profit'], a: 2, e: 'Capital earns interest.' },
  { lvl: 4, q: 'The reward for the entrepreneur is ___.', o: ['rent', 'wages', 'interest', 'profit'], a: 3, e: 'The entrepreneur bears risk and earns profit.' },
  { lvl: 4, q: 'A market with only one seller is a ___.', o: ['monopoly', 'oligopoly', 'perfect competition', 'duopoly'], a: 0, e: 'Mono = one.' },
  { lvl: 4, q: 'A persistent rise in the general price level is ___.', o: ['deflation', 'inflation', 'recession', 'depreciation'], a: 1, e: 'Inflation reduces the purchasing power of money.' },
  { lvl: 4, q: 'Goods used together, like a car and fuel, are ___ goods.', o: ['substitute', 'complementary', 'inferior', 'Giffen'], a: 1, e: 'Complements are jointly demanded.' },
  { lvl: 4, q: 'Division of labour leads to ___.', o: ['less output', 'specialisation and increased output', 'higher costs always', 'unemployment always'], a: 1, e: 'Workers specialise and become more efficient.' },
  { lvl: 4, q: 'GDP stands for ___.', o: ['Gross Domestic Product', 'General Domestic Price', 'Gross Demand Product', 'Government Debt Payment'], a: 0, e: 'Total value of goods and services produced in a country.' },
  { lvl: 4, q: 'The Central Bank of Nigeria acts as ___.', o: ['a commercial bank', 'banker to the government', 'an insurance company', 'the stock exchange'], a: 1, e: 'The CBN is the government\'s banker and regulates other banks.' },
  { lvl: 4, q: 'If supply increases while demand stays the same, price tends to ___.', o: ['rise', 'fall', 'stay the same', 'double'], a: 1, e: 'More supply at the same demand pushes the price down.' },
  { lvl: 4, q: 'Which of these is a direct tax?', o: ['VAT', 'Import duty', 'Personal income tax', 'Excise duty'], a: 2, e: 'Direct taxes are paid straight to government by the person taxed.' },
];

BH.Q.ACC = [
  { lvl: 4, q: 'The accounting equation is ___.', o: ['Assets = Capital + Liabilities', 'Assets = Capital − Liabilities', 'Capital = Assets + Liabilities', 'Liabilities = Assets + Capital'], a: 0, e: 'Everything a business owns is financed by the owner or by creditors.' },
  { lvl: 4, q: 'Every debit entry must have a corresponding ___ entry.', o: ['debit', 'credit', 'cash', 'journal'], a: 1, e: 'The double-entry principle.' },
  { lvl: 4, q: 'Which of these is a current asset?', o: ['Land', 'Buildings', 'Inventory (stock)', 'Motor van'], a: 2, e: 'Current assets are expected to turn into cash within a year.' },
  { lvl: 4, q: 'Money owed TO a business by customers is called ___.', o: ['creditors', 'debtors (receivables)', 'capital', 'drawings'], a: 1, e: 'Debtors owe the business money.' },
  { lvl: 4, q: 'Goods or money taken by the owner for personal use are ___.', o: ['sales', 'drawings', 'purchases', 'returns'], a: 1, e: 'Drawings reduce capital.' },
  { lvl: 4, q: 'The book of original entry for credit purchases is the ___.', o: ['sales day book', 'purchases day book', 'cash book', 'ledger'], a: 1, e: 'Credit purchases go into the purchases day book (journal).' },
  { lvl: 4, q: 'A trial balance checks the ___.', o: ['profit', 'arithmetical accuracy of the ledger', 'cash at bank', 'assets only'], a: 1, e: 'Total debits should equal total credits.' },
  { lvl: 4, q: 'Gross profit = Sales − ___', o: ['expenses', 'cost of sales', 'drawings', 'capital'], a: 1, e: 'Gross profit is sales minus the cost of goods sold.' },
  { lvl: 4, q: 'Which of these is a liability?', o: ['Bank overdraft', 'Cash in hand', 'Debtors', 'Equipment'], a: 0, e: 'An overdraft is money the business owes the bank.' },
  { lvl: 4, q: 'The fall in value of a fixed asset over time is ___.', o: ['appreciation', 'depreciation', 'inflation', 'discount'], a: 1, e: 'Depreciation spreads an asset\'s cost over its useful life.' },
  { lvl: 4, q: 'The cash book records ___.', o: ['only credit sales', 'cash and bank transactions', 'only assets', 'only expenses'], a: 1, e: 'It has cash and bank columns.' },
  { lvl: 4, q: 'Capital introduced by the owner is credited to the ___ account.', o: ['cash', 'capital', 'drawings', 'sales'], a: 1, e: 'Debit cash/bank, credit capital.' },
  { lvl: 4, q: 'The document a seller sends a buyer for goods sold on credit is a/an ___.', o: ['receipt', 'invoice', 'cheque', 'credit note'], a: 1, e: 'The invoice states what is owed.' },
  { lvl: 4, q: 'A credit note is issued when ___.', o: ['goods are returned', 'goods are sold for cash', 'money is borrowed', 'salaries are paid'], a: 0, e: 'It reduces the amount the buyer owes.' },
  { lvl: 4, q: 'Net profit = Gross profit − ___', o: ['sales', 'expenses', 'capital', 'purchases'], a: 1, e: 'Subtract operating expenses from gross profit.' },
];

BH.Q.COM = [
  { lvl: 4, q: 'Commerce is mainly concerned with ___.', o: ['production only', 'the distribution of goods and services', 'farming only', 'mining'], a: 1, e: 'Commerce = trade + aids to trade.' },
  { lvl: 4, q: 'Which of these is an aid to trade?', o: ['Farming', 'Banking', 'Mining', 'Fishing'], a: 1, e: 'Banking, insurance, transport, warehousing and advertising aid trade.' },
  { lvl: 4, q: 'A retailer sells goods to ___.', o: ['manufacturers', 'wholesalers', 'final consumers', 'importers'], a: 2, e: 'Retailers are the last link to the consumer.' },
  { lvl: 4, q: 'Trade between two countries is ___ trade.', o: ['home', 'foreign (international)', 'retail', 'wholesale'], a: 1, e: 'Foreign trade = imports and exports.' },
  { lvl: 4, q: 'Insurance is based on the principle of ___.', o: ['profit', 'utmost good faith', 'monopoly', 'inflation'], a: 1, e: 'Uberrimae fidei — both parties must disclose all facts.' },
  { lvl: 4, q: 'A business owned and run by one person is a ___.', o: ['partnership', 'sole proprietorship', 'public company', 'cooperative'], a: 1, e: 'Like Mama Tuck-shop.' },
  { lvl: 4, q: 'Which of these is a means of payment?', o: ['Invoice', 'Cheque', 'Quotation', 'Catalogue'], a: 1, e: 'A cheque instructs a bank to pay money.' },
  { lvl: 4, q: 'The middleman between the manufacturer and the retailer is the ___.', o: ['consumer', 'wholesaler', 'banker', 'transporter'], a: 1, e: 'Wholesalers buy in bulk and sell in smaller quantities.' },
  { lvl: 4, q: 'Advertising is mainly used to ___.', o: ['produce goods', 'inform and persuade consumers', 'store goods', 'insure goods'], a: 1, e: 'It creates awareness and demand.' },
  { lvl: 4, q: 'A warehouse is used for ___.', o: ['banking', 'storing goods', 'advertising', 'transport'], a: 1, e: 'Warehousing creates time utility.' },
  { lvl: 4, q: 'Selling goods to another country is ___.', o: ['importing', 'exporting', 're-exporting', 'smuggling'], a: 1, e: 'Exports earn foreign exchange.' },
  { lvl: 4, q: 'Which document states the price and terms of goods a buyer asked about?', o: ['Quotation', 'Receipt', 'Cheque', 'Credit note'], a: 0, e: 'A quotation answers an enquiry.' },
  { lvl: 4, q: 'Sharing profit among members according to their purchases is a feature of a ___.', o: ['cooperative society', 'public company', 'sole trader', 'partnership'], a: 0, e: 'The "dividend on purchases" is unique to cooperatives.' },
  { lvl: 4, q: 'The stock exchange deals mainly in ___.', o: ['foodstuff', 'securities (shares and bonds)', 'cars', 'crude oil'], a: 1, e: 'It is a market for second-hand securities.' },
  { lvl: 4, q: 'Which Nigerian body protects consumers?', o: ['FCCPC (Consumer Protection)', 'NNPC', 'INEC', 'NECO'], a: 0, e: 'The Federal Competition and Consumer Protection Commission.' },
];
