# BOARDING HOUSE: Game Design (the north star)

> **One line:** a single-player life sim where you live *your own* Nigerian boarding-school story, from JSS1 resumption day to SS3 graduation, surrounded by classmates who feel like real people.

This document is the reference for every future decision. If a feature doesn't serve the pillars below, it waits.
Status: **approved and implemented** (populated school, key cast, time control & pacing, story arcs, milestones, chapters, ending).

---

## 1. Direction

| Before | Now |
|---|---|
| Multiplayer-first: students are real players, NPC students off by default | **Story mode first.** Single-player. Every class is full of NPC students; about 15 of them are deep characters. |
| One shared school clock owned by the server | **The player owns time:** pause, normal speed, fast-forward, skip to the next bell or event. |
| Random events plus a few arcs | **Your story:** optional arcs triggered by your choices, relationships and stats. The game remembers what you did and brings it up years later. |
| Accounts required online | Local save slots by default. Accounts and cloud save remain optional, mainly for the future **Private School with friends** mode. |

**Multiplayer is not deleted.** Colyseus rooms, the shared calendar and accounts stay in the code as the base for a later optional mode, "**Private School**": invite your friends, and each friend *takes the place* of one of your NPC classmates (see §11).

---

## 2. Pillars

1. **People first.** Your classmates are the heart of the game. You should miss them when they leave and remember the bully's name ten years later.
2. **Your story, your pace.** No fixed path, no forced menus. Arcs grow from what you do, and time moves when you want it to.
3. **Fun from minute one.** Resumption day is loud, funny and full of characters. There's always something to do: Last Card under the bunk, football at 4 PM, gist under the mango tree.
4. **Every choice echoes.** Snitch in JSS2 and someone brings it up in SS3. Help a struggling friend pay fees and they're at your graduation.
5. **Real Nigerian boarding school.** Garri, cutlasses at labour, the Maths teacher's cane, Visiting Day jollof, NEPA, Sunday white, the send-forth party. Warm, specific, funny and honest.

---

## 3. The player's journey (6 years, 18 terms)

```
JSS1 ── JSS2 ── JSS3 (BECE) ── SS1 (department) ── SS2 ── SS3 (prefects, WAEC, send-forth, graduation)
```

**Each term follows a rhythm:**
- **Weeks 1–2:** resumption and settling in.
- **Weeks 3–4:** first tests.
- **Weeks 5–6:** mid-term and Visiting Day.
- **Week 8:** inter-house sports (term 2) or the cultural day / Social Night special.
- **Week 10:** exams, report card and vacation.

**What changes as you grow:**

| Year | You are… | New things that open up |
|---|---|---|
| JSS1 | the smallest | Survive seniors, find your people, first punishment, first Visiting Day |
| JSS2 | settled | Clubs, hustles, your first crush drama, juniors below you |
| JSS3 | top of junior school | BECE, junior-school prefects, "who's leaving?" |
| SS1 | a senior at last | Long sleeves or long skirt, **choose a department**, a school child to look after |
| SS2 | powerful | Can punish juniors (or refuse to), house captain race, scholarship and sports offers |
| SS3 | the oldest | **Prefect selection**, WAEC, send-forth party, sign-out day, graduation |

### 3.1 Pacing (6 years without boredom)

Each term can be lived in one of three **pacing modes**. You can change it at the start of any week:

| Mode | How it plays | Default for |
|---|---|---|
| **Live** | Every day is played: the clock, bells, lessons, free time | **JSS1 Term 1** (the most memorable term) |
| **Highlights** | Key days are played live: resumption, test days, Visiting Day, sports, exams, story moments. Ordinary days pass as a **day card**, simulated from your **week plan** (study / sport / hustle / social / rest), with gist, small choices and results. | Every term after the first |
| **Montage** | Skips to the next milestone with a short "what happened" reel. Your week plan decides how you grew. | Fast replays and catch-up |

**Key moments in every term, always played live:** resumption, first test day, Visiting Day (weeks 3/6/9), inter-house practice or sports day, Social Night specials, exams, end of term. Story beats always interrupt fast-forward.

### 3.2 Time control

- **Pause** (also automatic in menus, conversations and choice cards).
- **Speeds:** 1× (1 real second = 1 game minute), 2×, 4×.
- **⏭ Skip to next bell** (the next block) and **⏭ Skip to next event** (the next story beat or key moment).
- **Sleep** skips to the morning.
- Time **never** moves while a menu, dialogue or choice is open.

---

## 4. The school is full of people

| Tier | Who | How many | Simulation |
|---|---|---|---|
| **A: Key characters** | Your set's 15 deep characters, plus 3 key seniors and 2 key juniors | ~20 | Full: schedule, memory, relationship, arc state, AI conversations |
| **B: Your set** | Everyone else in your level (3 arms × ~30) | ~75 | Named, a personality, a relationship score, preset gist and barks, light schedule |
| **C: The rest of the school** | JSS1–SS3 minus your set | ~450 | Generated from a seed on demand (name, look, arm, house). No stored daily state. They fill rooms, corridors and the field as crowds, with barks. |

- **Every class arm is full:** 25–35 students per arm, generated deterministically from the save's seed. They take the seats, the register and the bunks.
- **Characters grow up:** height and build change each year, and the uniform changes from short to long sleeves and from knee to long skirts. Attitudes shift with their arc state. Seniors graduate and juniors arrive every year.
- **People come and go:** transfers, expulsions, a late admission mid-term, the London returnee in SS1.

---

## 5. Key characters and conversations

See **CHARACTERS.md** for the cast. The rules:

- **Talk freely.** Key characters use the AI conversation system (server-side; the API key never reaches the client). Their personality, voice, goals, secrets *they choose to reveal*, current arc beat and memories go into the prompt. Background students use preset lines.
- **Memory has two layers:**
  1. **The story ledger:** structured facts the game records, e.g. `snitched_on:jide@JSS2T1`, `shared_food_with:dami ×14`, `defended:uche_fees`. These drive arcs and callbacks, so they work offline too.
  2. **Conversation memory:** short notes per character from AI chats ("You promised to teach me fractions"). These are sent with each chat.
- **Relationships have more than one dimension:** `friendship` (−100…100), `trust`, `rivalry`, `respect` and `romance` (PG crush meter, never sexual), plus flags like `bestFriend` and `squad`. They change through actions, choices, gifts, time spent together and neglect (friendships slowly cool if ignored).
- **Doing things with NPCs:** call a classmate over, pin a best friend (their location shows on the map), form a squad (a name and tag), sit together, walk together, share food, play Last Card, Ludo, Ayo or football with them, invite them to the gist circle.
- **Offline fallback:** with AI off, every key character still has rich preset dialogue for each arc beat.

---

## 6. Story arcs and events

**An arc** is a set of optional **beats**. Each beat has:
- `when`: conditions on year, term, week, stats, relationships, ledger facts, other arcs' states and randomness;
- `where`: a place and time window, or "they come and find you";
- `scene`: a dialogue or cutscene with choices, or an open AI conversation with a goal;
- `outcomes`: relationship changes, ledger facts, next beats, arc end states.

Arcs never block you. Ignore a beat and it resolves on its own, and that is remembered too. Arcs live in `content/arcs/*.json` (data-driven, editable without code).

**Arc families:**
1. **Character arcs:** about 15, one or two per key character, spanning six years (CHARACTERS.md).
2. **Life arcs:** academics (rival for 1st, the BECE, choosing a department, WAEC), discipline (from first punishment to suspension or prefect), money and hustle, sports, faith, leadership, crushes and slam books (PG).
3. **School events:**
   - **Weekly calendar:** Jumat, inter-house practice, Social Night, Visiting Day, elections, sports day.
   - **Random events:** fights, thefts, NEPA, a snake in the hostel, surprise inspections, a teacher absent.
   - **Player-driven:** elections, clubs, hustles, pranks.

**Callbacks:** any line can reference the ledger, e.g. `{if snitched_on:jide} "You remember JSS2? You sold me out."`.
**The director** spaces things out: at most one big beat per day, priority to beats about people you're close to, and a quiet day is allowed sometimes.

---

## 7. Milestones (cutscenes, always played live, autosaved)

| # | Milestone |
|---|---|
| 1 | **Resumption day:** the gate, the crowd, your parents' goodbye |
| 2 | **First punishment** |
| 3 | **First Visiting Day:** who comes (or doesn't) |
| 4 | **First report card:** Daddy's reaction |
| 5 | **BECE** (end of JSS3) |
| 6 | **Becoming a senior:** the long sleeves or long skirt, and your first junior saying "Good morning Senior" |
| 7 | **Choosing a department** (SS1) |
| 8 | **Your school child arrives** (SS1) |
| 9 | **Prefect selection** (SS3, term 1) |
| 10 | **WAEC** |
| 11 | **Send-forth party** |
| 12 | **Sign-out day:** shirts covered in signatures |
| 13 | **Graduation** |

## 8. The ending

Your ending comes from everything you did:
- results (BECE, WAEC);
- friendships and enemies;
- reputation with each group;
- punishments, suspensions and expulsion;
- positions held (captain, prefect, house captain);
- the paths you followed (scholar, sports, leader, hustler, popular, troublemaker).

**The finale:**
1. **Graduation speech** (yours, or watching someone else give it).
2. **"Where are they now"**, one card per key character, determined by their arc ending and your relationship ("Uche: Chemical Engineer in Port Harcourt. Still calls you on your birthday.").
3. **The Yearbook:** your journey term by term: photos (in-game snapshots), signatures from friends, quotes, records ("Most punished: you, 41 times"), your slam books and shirt signatures.

Expulsion or dropping out are real, early endings, each with its own epilogue.

---

## 9. Fun from minute one (the first 10 minutes)

1. A **cutscene**: Dad's car in a crowded gate, hawkers, Mallam Musa checking names, a crying mum.
2. **Dami** (your bunkmate-to-be) is in the car in front of yours, already crying. They grab your hand.
3. **Register** at Admin: your house and class. **Emeka** gets the VP to laugh and gets sent out.
4. **Carry your chop box to the hostel:** **Jide** "accidentally" bumps you; **Zara**'s driver carries her three boxes.
5. **Choose a bunk.** Dami is on the top bunk. **Senior Commander** does a "provision inspection" (comedy).
6. **Free time:** **Osas** tries to sell you your own bucket. A Last Card game starts under the bunk. You can join.
7. **First dinner:** the beans have weevils, and Emeka does a stand-up show about it.
8. **Lights out:** the ghost story. Esther starts praying loudly. Somebody screams.

---

## 10. Saves

- **Multiple slots** (5), plus an optional cloud save when logged in.
- **Autosave** at every day's end and at every milestone.
- **The Chapter screen** shows your journey: JSS1 Term 1, JSS1 Term 2… Each chapter shows highlights, your report card, best friend at the time, the biggest moment, and a mood colour. You can view past chapters (read-only).

---

## 11. Future: "Private School" (multiplayer, later)

- An optional mode: one player hosts a private school (Colyseus room) and invites friends.
- **A friend takes the place of an NPC classmate.** Key characters have a `slot` id, and a friend can occupy the slot of a *background* classmate (never a key character mid-arc), or a new student slot ("late admission").
- Story state stays per player; the school (calendar, class lists) is shared by the room.

**What must stay true now (architecture rules):**
- **State lives apart from rendering:** game state is plain JSON (`BH.Game.s`, `s.school`, `BH.Actors`), and the renderer only reads it.
- **All player input goes through intents/actions** (`BH.Intents`, `BH.Actions`), so it can later be sent to a server unchanged.
- **Characters are data:** characters (NPC or player) have the same student record shape (`s.school.students` and NPC records), so a slot can switch between "npc" and "remote player".
- **Rules engines are shared:** Last Card (the Whot-style card game), football and board games use one engine (`shared/*`) for both the local bots and the server rooms.
- **Time has one interface:** the clock goes through `BH.Clock` with a local driver (story mode) and a network driver (private school).

## 12. What's kept from the current build

The 3D campus and interiors, Sims-style camera, schedules, class arms, timetables, lessons (typed answers), registers, staff NPCs, resumption-day onboarding, Last Card, football, Ayo, Draughts, Ludo, race, dance, ten-ten, suwe, table tennis, volleyball, the social layer (rebuilt around NPCs), the event director and calendar, procedural music, the AI server with moderation and safety, writing (notes, letters, slam books, graffiti, shirts).

## 13. Build order (after approval)

1. **Populate the school:** a full roster for every arm (tiers B/C), bots on by default, crowds in rooms and on the field, seniors and juniors per year, and graduation turnover.
2. **Key characters:** content/characters data, arc-aware AI prompts, the story ledger and conversation memory, relationship dimensions, and NPC versions of the social actions (call over, best friend, squad, share food, play games).
3. **Time control and pacing:** pause, speeds, skip to bell or event, Live/Highlights/Montage modes, the week planner and day cards.
4. **Arc and event system:** arc data format, the director, callbacks, and the first arcs for every key character's JSS1–JSS2 beats.
5. **Milestones and ending:** milestone cutscenes, Chapter screen, autosaves, "where are they now", the yearbook.

## 14. Non-goals (for now)

- Romance beyond PG crushes and love letters.
- Grind-heavy economies.
- Competitive multiplayer.
- Any real-world harmful advice through the AI (the safety rules in `server/prompts.js` always apply).

## 15. Player feedback, round 1 (2026-10-12)

What testers asked for, and where each item stands. The team rule from this round: **no competing with other games. Build our own, 1–2 hours a day.**

| # | Feedback | Status |
|---|---|---|
| 1 | **Girl designs need work** | ✅ Done (2026-10-13), in `js/render3d/characters.js`. Girls now have a tapered torso (narrower shoulders and waist) and slimmer arms. Skirts and gowns are flared and pleated with a waistband. The junior pinafore has a bib, straps and buttons. Faces for everyone now show eye whites, pupils and brows; girls also get lashes, lips and gold studs. Hair sits back from the face (it used to cover the eyes), and the hijab leaves the face open. New styles: Ghana weaving, threading (isi owu) and ponytail, and braids now have beads. The creator preview uses the same builder, so what you pick is what you get. |
| 2 | **State the mission at the start** | ✅ Done. The "🎯 Your Mission" card (`EVENTS.missionBrief`) plays once after the parent's goodbye: graduate with a name nobody forgets (pass, find your people, build your rep, don't get expelled). |
| 3 | **Gossipers, bullies, night security with a big torch, troublemakers, noisy boys** | Partly done. Bullies (chop-box inspection, bully arcs), gossip (`gist.js`), the night watchman Baba Sunday and patrolling prefects already existed. ✅ New: a real **day/night cycle** in 3D (`js/render3d/sky3d.js`) and **visible torch beams** on the watchman, patrolling prefects/house masters and you (if you own a torch). Guards sweep their beam. Next: NPC troublemakers who act *in the world* (noisy dorm after lights out → collective punishment, boys sneaking out, fights you can stop or watch, gossips who spread what they saw). |
| 4 | **Online with real players + NPCs; 15% of real players slotted into senior secondary** | Proposal (it changes §1 and §11). Most real players start in JSS1. About 15% of joiners are placed in SS1–SS3 (rounded: 50 players → 8 seniors), so juniors face some *real* seniors. Seniors gain rep by "bullying" NPC juniors and real juniors **inside the teachers' rules** (punishments come from the same rules engine: catch-and-report, the VP's office). Real juniors get a live response choice (obey / argue / report / run). The story mode stays: players create their own storyline. |
| 5 | **Talk bar = live chat with real people; how long it stays depends on where you are** | To do (with #4). In class a chat lasts **2.5 minutes** before the teacher gets angry (warning → punishment). Outside or in the dorm there's no limit. |
