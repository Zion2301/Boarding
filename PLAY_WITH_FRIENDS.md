# Playing (and testing) with friends

Multiplayer runs on the same server as the game: Colyseus rooms in `server/mp/`, with the browser client in `js/net/`.

## Start a session

1. On your computer, run `cd server && npm run dev`.
   The terminal prints `Multiplayer ready · friends on the same Wi-Fi can open http://192.168.x.x:8787`.
2. You open http://localhost:8787. Your friend opens the `http://192.168.x.x:8787` link on their phone or laptop (same Wi-Fi).
   - **Testing alone:** use a normal window plus a private/incognito window. They must be separate browsers or profiles, so each has its own save and player id.
   - **Friend not on your Wi-Fi:** expose the port with a tunnel such as `cloudflared tunnel --url http://localhost:8787` and send them the https link.
3. When you're connected, the game shows a "🌐 Online" toast. Other players have **yellow name tags**.

Online, everybody shares one school (name, uniform, timetables) and one clock (time of day and weekday). Sleeping or waiting only fast-forwards when **everyone** in the room is sleeping or waiting.

## 1. Resumption day

- Both of you start a **new game** within about 20 minutes of each other. You become one arrival group: same class arm, same house, and same-gender players become **bunkmates**.
- Watch the gate cutscene (or press Skip), then follow the gold arrow:
  1. register at the Admin Block;
  2. carry your box to the hostel;
  3. choose a bunk;
  4. meet your bunkmate: walk up to them and say something (press **C**) or wave;
  5. the senior's provision "inspection";
  6. free time until dinner;
  7. dinner in the dining hall;
  8. lights out and the ghost story.

## 2. Games (🎲 button)

| Game | How to play it with a friend |
|---|---|
| 🃏 **Whot!** | One of you opens a table (🎲 → Open a table, or tap your friend → 🃏 Play Whot!). The other taps the invite chip. Then **Deal cards**. Bots fill empty seats. |
| ⚽ **Football** | Both of you tap 🎲 → Join the match (or use the field's ⚽ action). Teams balance automatically and bots fill the gaps. Run into the ball to dribble; **Space** passes and **F** shoots. |
| 🌰 Ayo · ⚫ Draughts · 🎲 Ludo | Tap your friend → 🌰 / ⚫, or 🎲 → open a table and they join from the list. Ludo seats up to 4. |
| 🏃🏾 Race · 🪩 Dance battle | Best at **inter-house practice** (Wednesday 4 PM, on the field) and **Social Night** (Saturday 7 PM, assembly). They're also in 🎲 any time. Results are shouted to everyone online. |
| 👏🏾 Ten-ten · 🪨 Suwe · 🏓 Table tennis · 🏐 Volleyball | Quick 2–3 minute games from 🎲 → Playground & sports (against a bot opponent). |
| 🌳 Gist circle · 📻 Radio · 🕯️ Storytime | 🎲 → Hang out. Your friends see your speech bubble or dance. |

## 3. Social

- **Tap a yellow name tag** (or walk up to a player and press Space) to:
  - add them as a friend;
  - 💛 pin them as **best friend**, so they can see where you are (👥 → Friends → 📍 Show me);
  - 📣 call them (they get a chip and a blue waypoint to you) or 🗣️ shout their name;
  - wave or beckon;
  - 👣 walk together or 🪑 sit together;
  - 🎁 share food;
  - invite them to a game or to your gang.
- **👥 button:** friends (online and where they are), requests, everyone on campus, and **gangs** (create one with a name and tag, then invite people).
- **C or 💬:** chat. People near you see a bubble; **📢** shouts to the whole map; there are emotes too. Talking in class can get you caught by the teacher.
- If your best friend is standing next to you when you get caught, they might cover for you.

## 4. Events (no fixed storyline)

| Kind | What happens |
|---|---|
| Weekly calendar (`content/calendar.json`) | Jumat (Friday, Muslim students), inter-house practice (Wednesday), Social Night (Saturday), visiting day (Saturdays of weeks 3/6/9), class captain nominations and election (week 1 Friday, week 2 Monday), inter-house sports day (week 8). A 📢 chip appears with a "go there" button. |
| Random events (`content/world.json`) | Fights, thefts, NEPA (power cut), rain, raids, teacher absent (free period), 🐍 **snake in the hostel**, 🧐 **surprise inspection**. |
| Player-driven | Run for class captain at your class noticeboard; your friends in the class count toward the vote. |
| Story arcs | Arcs start from what you do (`did:` conditions), for example being robbed or playing sport, not from the date. |

To test quickly, set the game speed to 4× (⚙️ menu) or use ⏳ Wait. Note that waiting only fast-forwards online when everyone is waiting.
