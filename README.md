# Boarding House 🏫

A mobile-first Nigerian boarding-school life sim. You start as a JSS1 student on resumption day and try to make it to SS3 graduation. It's a **story-mode-first, free-roam life sim**: the school runs on a clock, your classmates are characters with their own stories, and the choices you make (or ignore) are remembered all the way to graduation. Design: **[GAME_DESIGN.md](GAME_DESIGN.md)** · cast: **[CHARACTERS.md](CHARACTERS.md)**.

## Run it

- **Computer:** double-click `index.html`. It works offline from `file://` using the bundled content.
- **With live content editing:** `cd ~/Desktop/game_shi && python3 -m http.server 8000`, then open `http://localhost:8000`. Over http the game reads `content/*.json` directly, so edits show up on reload.
- **Phone (same Wi-Fi):** run the server above, then open `http://<your-computer-ip>:8000` (find the IP with `ipconfig getifaddr en0`) and use **Add to Home Screen**.
- **After editing anything in `content/`:** run `node tools/build-content.js` so the offline/`file://` bundle (`js/content/bundle.js`) matches.

## How it plays

- **Walk anywhere:** joystick, WASD/arrows, or tap to walk. Walk into a door to load that building's interior. Walk onto the exit mat to come back out at the same door.
- **Interact:** when you're next to something, a prompt floats above it with 1–2 actions: **E** (or tap) for the first, **F** for the second. **⋯**, holding E, a long-press or **Q/Tab** opens the **radial menu** with every action.
- **The clock never stops** (except in menus). By default 1 real second = 1 game minute; change it in ⚙️. Bells ring and NPCs move to class, dining, prep and bed. The clock card shows what's happening, where you're expected, and whether you're ✅ here, ⏰ late or ❗ absent.
- **⏳ Wait** fast-forwards time (15 min to 2 h, or until the next bell). Sleeping in your bed at night fast-forwards to the rising bell. Moving or tapping stops any wait.
- **Missions** appear in the right-hand tracker with ⏱ deadlines. Tap one for a 📍 waypoint and hints.
- **Calls** appear at the top when someone wants you (e.g. "📢 Senior Kunle dey call you · 36m"). They walk over to find you. Talk to them, or ignore them and face the consequence when the timer runs out.
- **👁️ Suspicion meter:** when a prefect, teacher or the house master can see you breaking a rule, it fills. When it's full, you're caught. Hide in toilets, under bunks, in the bush or behind buildings.

## Story mode (the main game)

- **A full school:** about 500 students across JSS1–SS3 (three arms each). Your set of about 30 includes **20 key characters** (`content/cast.json`) who remember you, can be talked to freely (AI) and grow up: some leave, others arrive (Musa in JSS2, Yinka in SS1, your school child in SS1). Everyone else uses preset lines.
- **Your people:** 👥 opens your best friend, squad, closest friends and who to watch out for. You can call someone over, sit together, share food or play Last Card with them. Key characters bring up the past ("Remember when you snitched on me in JSS2?") from the **story ledger**.
- **Story arcs** (`content/arcs.json`, 81 beats): characters come and find you when something happens in their life (Uche sent home for fees, Dera's BECE expo, Halima's withdrawal letter…). What you choose, and what you ignore, changes bonds, arc states and their endings.
- **Time control:** ⏸ / 1× 2× 4× / ⏭ next bell / ⏭⏭ next event (top right; **P** pauses). JSS1 Term 1 plays **Live**; after that the game switches to **Highlights**: ordinary days are simulated using your week plan and shown as day cards, and it stops for key days. 🎬 changes the mode (Live / Highlights / Montage).
- **Milestones:** letterboxed cards for resumption, first punishment, first visiting day, first report card, BECE, becoming a senior, department, school child, prefect selection, WAEC, send-forth, sign-out day and graduation. Each one autosaves.
- **Chapters & saves:** each term becomes a named chapter (⚙️ → 📖 Chapters). There are 5 save slots showing each slot's chapter, with autosave every day.
- **Ending:** graduation shows your results, **where are they now** for every key character you met, a yearbook, and your chapters.

No login is needed for story mode. The online mode is the title screen's **🌐 Private school with friends (beta)**.

## Private school with friends (beta)

Everyone logs in with their own account (saved on the server). The whole school shares one calendar, and each player is in their own year: newcomers arrive as late admissions, returning players are welcomed back and promoted. Background music is generated live.

Play with friends from the first minute: run **`npm run play`** (same Wi-Fi) or **`npm run tunnel`** (anywhere) and send the link it prints:
- **Resumption day:** a cutscene, then the story-tutorial; players who arrive together share a class arm, house and bunks.
- **Games:** Last Card, football on the field, Ayo, Draughts, Ludo, races, dance battles, ten-ten, suwe, table tennis and volleyball.
- **Social:** friends, best friend, calls, chat bubbles, gangs.
- **Events:** a living calendar plus random events.

See **[PLAY_WITH_FRIENDS.md](PLAY_WITH_FRIENDS.md)**.

## School structure

Six levels (JSS1–SS3), each with arms A/B/C. Every class arm has its own form teacher, captain, timetable, register, seating and noticeboard. Staff (53 named adults with personalities) are the main NPCs. Students are real players, and bot students are off by default (⚙️ Menu → 🧪 Bot students, or `?bots=1`). See **[SCHOOL.md](SCHOOL.md)**.

## Architecture

Plain HTML/JS with no build step, all on the global `BH` namespace. One store: `BH.Game.s`.

```
content/                 ← all game content as JSON (source of truth)
  manifest.json          list of content files and maps
  maps/campus.json       outdoor campus: locations, doors→interiors, outdoor objects, patrol routes, walking graph
  maps/<building>.json   one file per interior (tile-grid layout + spots, rooms, secrets)
  tiles.json             tile legend (char → furniture/wall type, solid, seat, interactable kind)
  interactables.json     every interactable kind and its actions
  routines.json          NPC daily routines + staff NPCs
  missions.json          mission templates: offers, deadlines, steps, consequences, story arcs
  items.json             items, recipes, tuck-shop stock
  dialogue.json          staff conversation trees + greetings
  rules.json             school rules: who catches you, how bad, what happens
  world.json             secrets, weather, world events, success paths
tools/build-content.js   bundles content/ → js/content/bundle.js (for file:// + offline)

js/core/content.js       loader (live JSON over http, bundle otherwise) + map compiler + grid pathfinding
js/systems/              headless game rules (no Phaser):
  clock.js        TimeSystem: continuous clock, speed setting, wait/fast-forward, bells
  time.js         days, blocks, weeks, terms
  schedule.js     NPC ScheduleSystem: where every NPC is now (routines, overrides, seats, owners)
  activities.js   attendance, lessons, prep, meals, inspection, sleep/nap/hide (replaces the old 4-choice scenes)
  missions.js     MissionSystem: offered → active → completed/failed/expired (or refused/ignored)
  interaction.js  InteractionSystem: actions for a target + the condition language
  actions.js      the verbs: every handler named by interactables, NPC prompts and dialogue
  rules.js        rule predicates + suspicion meter (detection's headless half)
  consequences.js ConsequenceSystem: data-driven consequence blocks, getting caught, reputation groups, snitching
  gist.js         rumours: spread, NPC gist, overhearing, reputation effects
  world.js        WorldSim: weather, NEPA, world events, calls & happenings
  paths.js        success paths & titles
  events.js       forced life events + optional events (answer or ignore)
  …stats, discipline, inventory, npcs, academics, seniority, phone, reports (existing systems)
js/game/
  scenemanager.js SceneManager: one WorldScene restarted per map, fades, door enter/exit, escorts, autosave
  scene.js        WorldScene: player, NPCs from the schedule, vision cones, interaction target, markers, weather, night
  maprender.js    placeholder art: campus drawing + tile-grid interiors in 3/4 view
js/ui/
  hud.js          HUD, floating E-prompt, tracker, calls, suspicion meter, wait, settings
  radial.js       radial action menu
  dialogue.js     conversations (NPCs, staff trees, mission offers, calls, snitching, subject picker)
```

**EventBus.** Systems report to `BH.bus` (`on`/`off`/`once`/`emit`, plus `'*'`). The ConsequenceSystem, missions, gist and paths all listen. Main events: `interact`, `npc:talk`, `npc:give`, `spotted`, `caught`, `arrive`, `attend`, `study`, `meal`, `inspection`, `sleep`, `found`, `secret`, `bell`, `enter`, `map:changed`, `mission:<status>`, `test:start`, `hustle:sale`, `snitch`.

**System hooks.** `onNewGame`, `onLoad`, `onNewDay`, `onBlockStart`, `onBlockEnd`, `onDayEnd`, `onTermEnd`, `onMinute`. Systems can also supply conversation options through `talkOptions(s, npc)` and extra actions through `actionsFor(s, target)`; these are collected with `BH.collect`.

**Saves.** The save version is now 5. Older saves migrate automatically: missions and position reset, and everything else is kept.

## Adding content

- **A new interior:**
  1. Create `content/maps/<id>.json` with a `layout` (rows of tile characters from `tiles.json`, with `E` tiles as the exit), plus optional `spots`, `npcSeats`, `rooms`, `secrets`, `patrol` and `quiet`/`studyBoost`/`forbidden`.
  2. Add the id to `manifest.json`.
  3. Set `"interior": "<id>"` on a building in `maps/campus.json` (or add a new building there).
  4. Run `node tools/build-content.js`.
- **A new interactable or action:** add a kind to `interactables.json` and give it a tile character in `tiles.json` or an `objects` entry in `campus.json`. Actions call a handler (`do`) in `js/systems/actions.js`; add a handler there if none of the existing ones fit.
- **A new mission:** add a template to `missions.json`. Pick the offer type, deadline, steps and consequence blocks; no code is needed for the existing step types.
- **A new NPC routine or staff member:** use `routines.json`.
- **A new rule:** add an entry to `rules.json` plus a predicate in `js/systems/rules.js`.
- **A new secret:** add an entry under `secrets` in `world.json` and reference it from a map's `secrets`.
- **Art:** set `BH.data.SPRITES.buildings` and `BH.data.SPRITES.tiles` in `js/data/campus.js` to image paths, and they replace the placeholder shapes.

## How to test each system

The quickest method is the browser console (`F12`) while a game is running. Run `s = BH.Game.s` first; the commands below use it.

| System | Try this |
|---|---|
| **Free roam / no forced menus** | Start a new game. Only the resumption-day call appears at the top, and you can ignore it. Walk anywhere. |
| **InteractionSystem** | Walk up to the tap, your bed (⭐ in your hostel), a desk or a locker. The prompt shows E/F actions; press **Q** or hold **E** for the radial. Risky actions (👀) have red buttons. |
| **SceneManager / interiors** | Walk into any door: it fades and loads that interior. Leave through the exit mat. There are 14 maps (hostels, JSS/SS classrooms, lab, dining, tuck shop, library, sick bay, admin, chapel, mosque, staff room). In the console: `BH.SceneManager.enter('library')`. Entering or leaving autosaves. |
| **TimeSystem** | Watch the clock. Change speed in ⚙️ (0.5×–4×). Use ⏳ to wait 1 h and see NPCs move. `BH.Clock.wait(s, 120)` does the same from the console. |
| **NPC ScheduleSystem** | Stand at the field during afternoon activities, then wait until dinner: students walk to the dining hall. Go into the JSS classroom during a period and your coursemates are at their desks. `BH.Schedule.where(s, s.npcs.classmates[0])` shows where someone is. A profile (👤 → People) shows "Right now: …". |
| **Attendance & lessons** | During a weekday period, go to your classroom and sit at your ⭐ desk. The lesson runs; switch to Doze, Whisper or Novel from the prompt. Skip a class to see "❗ Absent" and possibly a roll-call punishment at the end of the period. 👤 → Academics shows attendance. |
| **Tests & hints** | In weeks 4 and 8 (tests) and week 10 (exams), sitting in class opens the quiz. Knowledge, past questions (library secret), a peek at the mark book or leaked papers each strike out wrong options. |
| **MissionSystem** | `BH.Missions.offerCall(s, 'breadForSenior')`: the senior walks to you. Talk to them and Accept, Refuse or walk away. Get bread any way (tuck shop, beg the cook, steal from the serving counter, pay a hustler) and use "Give Bread". Let one run out to see ⌛ expired, or ignore a call to see "ignored". Arcs: `BH.Missions.assign(s, 'thiefArc1')`. Secret missions unlock from the staff-room notice, the SS desk graffiti, the bush near the library and behind the dining hall. |
| **Detection & hiding** | Stay outside after 10:15 PM. Prefects patrol with yellow cones that turn red when they see you breaking a rule. The 👁️ meter fills and you're caught and escorted to your hostel. Hide in a bush (radial → Hide) and the meter drains. Also try the staff room, the opposite hostel, or "Steal bread 👀" in front of the dining prefect. |
| **ConsequenceSystem & reputation** | 👤 → Reputation shows Teachers, Seniors, Juniors, Coursemates and your House. Snitch through a teacher or house master ("Report something"): Teachers go up, Coursemates go down, and a 🐀 rumour starts. |
| **Gist / rumours** | Talk to classmates and pick "Any gist?". Stand close to two idle students to overhear (speech bubble). `s.rumours` holds the list; 👤 shows what people say about you. |
| **WorldSim** | Weather is rolled per day by term (🌧️ rain makes the field muddy and labour harder, 🌫️ harmattan dries your skin, 🔥 heat makes you thirstier). NEPA cuts power in the evenings. Fights, thefts, absent teachers and raids happen on their own. Force one with `BH.WorldSim.H.fight(s, {text:'{a} vs {b} at {place}'})` or `BH.WorldSim.H.raid(s, {text:'Raid!'})`. |
| **Crafting & items** | 🎒 → Cook/combine: soaked garri needs garri + water (fetch water at the tap with your starter bucket). Buy a heater from Mama Tuck-shop's whisper option to make cooked Kwik Noodles, which is illegal: the smell lingers and prefects catch it. Hide your phone in your mattress against raids. |
| **Sleep anywhere** | Sleep in your bed at night for full rest; a mosquito net helps. Nap on a desk, pew or sick-bay bed. Push rest to 0 and you pass out where you stand. ⏳ at night → "Sleep right here". |
| **Paths** | 👤 → Your paths. Study, train on the field, hustle, dance, lead or cause trouble to earn titles. Your top path becomes your graduation legacy. |
| **Story arcs** | `BH.Arcs.start(s, BH.Content.get('arcs').beats.find(b => b.id === 'emeka_board')); BH.Dialogue.event()` plays a beat right away. `s.story.ledger` holds the memories, `s.story.arcs` the arc states and endings. |
| **Milestones & ending** | `BH.Milestones.trigger(s, 'sendForth'); BH.Dialogue.event()` plays a milestone. ⚙️ → 📖 Chapters lists the chapters. `BH.Game.gameOver(s, 'graduated', 'Done!'); BH.UI.go('gameover')` previews the ending. |
| **Pacing** | Finish JSS1 Term 1 (or run `s.pacing.mode = 'highlights'`), then sleep. Ordinary days are simulated as day cards and key days play live. |
| **Headless check** | `node tools/build-content.js` validates every JSON file. The game systems run without Phaser, so you can load the `js/` scripts (in `index.html` order, up to `js/core/game.js`) in a Node `vm` and tick `BH.Clock.tick(s, minutes)` to simulate days. |

## AI conversations & writing (game server)

Typing your own words works everywhere: in conversations (✍️ *Say something…*), excuses, phone texts, letters, notes, essays, debates, slam books, the noticeboard, graffiti, the diary and sign-out shirts. Preset options stay as one-tap shortcuts. See **ARCHITECTURE.md** for the design.

The AI runs on the **game server** in `server/`. The browser never sees the API key.

```bash
cd server && npm install
npm test          # 22 automated checks with a fake AI (no key needed)
npm run dev       # play with the fake AI:  http://localhost:8787
cp .env.example .env   # add ANTHROPIC_API_KEY and ADMIN_TOKEN, then:
npm start         # real AI (Claude Haiku 4.5 for NPCs, Sonnet 5.5 for grading)
```

- Without the server (opened from `file://`, or AI switched off), everything still works using preset replies and an offline grader. The chat header shows **✨ AI** or **📜 preset**.
- Admin dashboard: `http://localhost:8787/admin.html` (enter your `ADMIN_TOKEN`). It lists reports with the original text, lets you hide/restore items, shows AI usage, and has the global AI on/off switch.
- Storage: a local file (`server/data/db.json`) by default. To use Supabase, run `server/supabase.sql` in your project and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Players can turn AI conversations off in ⚙️. ⚙️ → 💛 *Help & support* opens the help panel at any time. Edit its resources in `content/help.json`.

### How to test each one (in the game, with `npm run dev` or `npm start`)
| # | Feature | Try this |
|---|---|---|
| 1 | **AI excuses (the VP)** | Arrive 15+ minutes late to class or assembly (or get caught out of bounds). Type an excuse. A sick-bay story → accepted; honesty → warning; rudeness → punishment. Walking away → punishment. Shortcut in the browser console: `s = BH.Game.s; BH.Excuse.start(s, { npc: BH.Schedule.staff(s,'vp'), kind:'late', offence:'Late to assembly', sev:0, apply:(sev)=>BH.Excuse.punishFor(s,'Late to assembly',sev,BH.Schedule.staff(s,'vp')) })` |
| 1 | Free chat, subject questions, haggling | Talk to anyone → ✍️ *Say something…*. Teachers → ❓ *Ask about…*. Mama Tuck-shop → 🏷️ *Price talk* (a discount applies to your next 3 buys). |
| 2 | **Essay grading** | Tests in weeks 4 and 8, exams in week 10, in English, Literature, Government, Civic, Social Studies, Religious Studies or Economics: after the multiple-choice questions comes a typed question, marked against a rubric. Shortcut: `BH.Quiz.open(BH.Game.s, {code:'CIV', mode:'test'}, '', [], o => console.log(o.text))` |
| 2 | **Debates** | Library → librarian's desk → 🎤 *Debate Society*. Pick a side and argue. AI judges score both sides out of 30. |
| 3 | **Notes in class** | During a period, sit at your desk → radial (Q / ⋯) → ✉️ *Pass a note*. The further the desk and the stricter the teacher, the riskier it is. A caught note is confiscated, and the teacher makes a joke without reading it out. |
| 4 | **Letters home** | Your bed → *Write letter home*. A reply arrives 2–4 game days later (🎒 → ✍️ Writing → ✉️ Letters), sometimes with money. |
| 4 | **Texts** | Get a phone (resumption-day smuggling or `BH.Phone.give(BH.Game.s)`) → 📱 → Mummy → type at the bottom. |
| 5 | **Slam book** | Buy one at the tuck shop → 🎒 → ✍️ → 📒. Pass it to friends (relationship 40+). Real players sign with the share code (*Sign a friend's slam book*). |
| 5 | **Noticeboard** | Any notice board → 📌 *School noticeboard (players)*. Posts are moderated and reportable (🚩). |
| 5 | **Graffiti** | Any desk, bunk or *behind the building* spot → radial → ✏️ *Write on it* (counts as vandalism if seen). Anyone at your school sees it later via 👀 *Read the writing*. |
| 5 | **Diary** | 🎒 → ✍️ → 📔. Private: it never leaves your device. |
| 6 | **Sign-out shirt** | Comes on Friday of the last week of SS3 (a 👕 call appears). Shortcut: `BH.Screens.writing.shirt()` → *Ask classmates to sign* → *Save to trophy room* (title screen → 🏆). Real players sign with the shirt code. |
| — | **Safety** | Type something like "I want to hurt myself" in any text box: the NPC steps out of the game and the help panel opens, even with AI off. Phone numbers, @handles, links, slurs and sexual content are blocked before anything is sent. |
| — | **Limits** | 8 AI messages a minute and 120 a day per player (`AI_RATE_PER_MIN`, `AI_DAILY_BUDGET`). Money from parents is capped at ₦3,000 a day. NPCs can only take the actions in their character sheet (`content/characters.json`). |

## Existing features (still here)

These all work as before, now reached through the world instead of menus: character creation and the dice of life, the six stat bars, report cards (CA now comes from tests and assignments and is adjusted for attendance), BECE/WAEC/NECO/JAMB, SS1 departments, the phone, the junior-to-senior flip, prefect posts (duties are now world actions: the assembly podium, field, altar, speaker and prefects' table), the 3D avatar, the discipline ladder, and 3 save slots.
# Boarding
