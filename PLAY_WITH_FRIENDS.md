# 🏫 Play Boarding House with friends

There are three ways to play together. Pick one:

| | Best for | What you do |
|---|---|---|
| **A. Same Wi-Fi** ⭐ easiest | Friends in the same room or house, or on your phone's hotspot | Run **`npm run play`** and send the link it shows |
| **B. Different places** | A quick game with a friend somewhere else | Run **`npm run tunnel`** and send the 🌍 link |
| **C. Always online** | Anyone can play any time, even when your computer is off | Put the game on the internet once (about 20 minutes) |

---

## Before the first time (5 minutes, only once)

1. **Install Node.js**: go to **https://nodejs.org**, download the button that says **LTS**, and install it like any app.
2. **Open a terminal in the game folder:**
   - **Mac:** open the **Terminal** app, type `cd ` (with a space after it), drag the game folder into the window, and press **Enter**.
   - **Windows:** open the game folder, click the address bar at the top, type `cmd`, and press **Enter**.

That's it. The first time you run the game, it installs everything else by itself. It needs internet for that first run.

---

## Option A: Same Wi-Fi or hotspot (easiest)

1. In the terminal, type:
   ```
   npm run play
   ```
2. After a few seconds you'll see something like this:
   ```
   🖥️  You: open http://localhost:8787

   📱 Your friend (same Wi-Fi or your phone hotspot) opens:
      http://192.168.1.144:8787
      [QR code]
   ```
3. **You** open `http://localhost:8787` in your browser (Chrome works best).
4. **Your friend** scans the QR code with their phone camera, or types the `http://192.168…` link exactly as shown, including the `:8787`.
5. Each of you taps **✨ Create account** (first time) or **🔑 Log in**, then **✏️ Create your student**. If you both start within about 20 minutes, you're grouped together: same class arm, same house, bunkmates.

**Keep the terminal window open while you play.** To stop, click the window and press **Ctrl + C**.

### If your friend's page won't load

- **Mac:** a pop-up asked *"Do you want the application node to accept incoming network connections?"* Click **Allow**. If you clicked Deny, go to System Settings → Network → Firewall → Options and allow **node**.
- **Windows:** a "Windows Security" pop-up appears. Tick **Private networks** and click **Allow access**.
- **Check you're on the same Wi-Fi.** School, hotel and café Wi-Fi often block devices from seeing each other. If so, turn on your **phone hotspot**, connect both devices to it, and run `npm run play` again (the link changes).
- **Several links shown?** If the first one doesn't work, try the others listed under it.
- **Still stuck?** Use Option B. It works on any network.

---

## Option B: Friends in different places (one command)

1. In the terminal, type:
   ```
   npm run tunnel
   ```
2. Wait about 20 seconds. You'll get a public link like:
   ```
   🌍 Friends ANYWHERE open this link (send it on WhatsApp):
      https://happy-words-here.trycloudflare.com
   ```
3. Send that link to your friends and open it yourself too. It works on mobile data or any Wi-Fi.

Notes:
- The link is **free, needs no account, and changes every time** you run the command.
- It works only while your computer is on and the terminal window is open.
- The first time, it downloads a small free tool from Cloudflare automatically.

*Prefer ngrok?* Install ngrok from https://ngrok.com, run `npm run play` in one terminal, and run `ngrok http 8787` in a second one. Then send the `https://…ngrok…` link.

---

## Option C: Always online (deploy once)

The simplest setup is **one service** that runs the game server and also serves the game: **Fly.io** or **Railway**. Everyone opens your app's link. Your computer can be off.

### C1. Fly.io (recommended)

1. Create a free account at **https://fly.io** and install their tool:
   - **Mac:** `brew install flyctl`
   - **Windows:** see https://fly.io/docs/flyctl/install/
2. In the game folder, run:
   ```
   fly auth login
   fly launch --copy-config --no-deploy
   ```
   When it asks for an app name, pick something like `boarding-house-ada`. It updates `fly.toml` for you.
3. Make a small disk for saves (friends, gangs, notice boards), then deploy:
   ```
   fly volumes create data --size 1
   fly deploy
   ```
4. Open **https://boarding-house-ada.fly.dev** (your app name) and share that link.
5. *(Optional)* For real AI conversations instead of the free mock, delete the `AI_MOCK = "1"` line from `fly.toml`, then run:
   ```
   fly secrets set ANTHROPIC_API_KEY=sk-ant-…your key…
   fly deploy
   ```

### C2. Railway (no command line)

1. Put the game folder on **GitHub**. GitHub Desktop makes this easy.
2. On **https://railway.com**: New Project → **Deploy from GitHub repo** → pick it. Railway finds the `Dockerfile` by itself.
3. In the service's **Settings**:
   - **Networking → Generate Domain** gives you your link.
   - **Volumes → Add volume**, mount path `/data`.
4. In **Variables**, add `AI_MOCK = 1` (or `ANTHROPIC_API_KEY = sk-ant-…` for real AI).
5. Share your `https://….up.railway.app` link.

### C3. Optional: game on Netlify or Vercel, server on Fly or Railway

You only need this if you want the game pages on a separate website host:
1. Deploy the server first (C1 or C2) and copy its link, for example `https://boarding-house-ada.fly.dev`.
2. On **Netlify** or **Vercel**, import the same GitHub repo. The settings are already in `netlify.toml` and `vercel.json`.
3. Add an environment variable `GAME_SERVER_URL` set to your server link, then deploy.
4. Share the Netlify or Vercel link. The game talks to your server for multiplayer and AI.

> Tip: you can also point any copy of the game at a server by adding `?server=https://your-server` to the link once. It's remembered on that device.

**Keep your AI key secret.** Only put it in Fly or Railway secrets/variables, never in the game files or on Netlify/Vercel.

---

## Accounts: everybody logs in

The game is online-first: each player has their own **account** (a username and password, no email needed).
- On the title screen tap **✨ Create account** the first time, then **🔑 Log in** from any phone or laptop.
- Your student is **saved on the server**, so you carry on from wherever you left off, on any device.
- Accounts and saves live on whichever computer or server runs the game. With Option A or B that's your computer, so keep the game folder safe. With Option C it's the hosting service.
- No server (opening the game file directly)? You can still play alone with **offline saves**.

## One school, one calendar

Everyone is in the **same school at the same time**: the same day, week and term. Each player is in their **own year**, so you can be in SS3 while your friend has just started JSS1.

| Who | What happens when they log in |
|---|---|
| **A brand-new student** | Arrives *today*, whatever day it is. On a Sunday it's resumption day; otherwise it's a **late admission**, e.g. Week 5, Tuesday at 10 AM. They register, get a house and class, and find a bunk. Nobody marks them absent while they settle in. From then on they follow the normal timetable. |
| **Someone coming back** | Skips straight to "now". A **welcome back** note says how many school days passed. They come back rested and fed, and are never punished for days they were away. |
| **Someone away for a whole school year (or more)** | Promoted automatically (JSS1 → JSS2…), and graduates after SS3. |

- School time only moves while someone is online. When everyone logs off, the school "pauses" and carries on from the same moment.
- **Sleep and Wait only fast-forward when everybody online is sleeping or waiting.**
- **Testing tip (host only):** to jump the whole school to a date, run this on the computer running the game. The example is Term 2, Week 5, Tuesday at 10 AM:
  ```
  curl -X POST localhost:8787/api/admin/time -H "content-type: application/json" -d "{\"year\":1,\"term\":2,\"week\":5,\"dow\":1,\"min\":600}"
  ```
  `dow`: 0 = Monday … 6 = Sunday; `min` = minutes after midnight (600 = 10:00 AM).

## Music 🎵

Background music plays automatically after your first tap: afrobeat by day, calm at night, a party at Social Night, and quiet in class. Change it in **⚙️ Menu → 🎵 Music** (Off / Low / Mid / Loud).

## The lobby, invite links and "join my class"

- **🌐 Play with friends** (on the title screen, and in the ⚙️ menu in game) shows:
  - whether the server is online;
  - **who's online right now**, with their class and where they are on campus;
  - the link to send your friends, with **📋 Copy** or **📤 Share** buttons.
- **🔗 Your invite link** opens the game and puts your friend in **your school**. When they create their new student, they join **your class arm and house**, and become your **bunkmate** if you're both boys or both girls.
  - It works even if you're offline when they open it.
  - From your own computer, the invite automatically uses the Wi-Fi or public address, never "localhost".
- **🏫 Join their class:** already have a student? In game, tap your friend's yellow name tag → **🏫 Join their class**. You move to their class arm and house. This only works if you're both in the same year, e.g. both JSS1.
- **Starting together:** if you both create new students within about 20 minutes of each other, you're grouped automatically: same class arm, same house, bunkmates.

---

## What to try together

1. **Resumption day:** watch the gate scene, register at Admin, carry your box to the hostel, choose bunks, and meet your bunkmate (say hi with **C**).
2. **🎲 Games:** Whot! (open a table or tap your friend → 🃏), football on the field (Space = pass, F = shoot), Ayo, Draughts, Ludo, races, dance battles, ten-ten, suwe, table tennis, volleyball.
3. **👥 Social:**
   - Tap a yellow name tag to add a friend, pin a 💛 best friend, 📣 call them (they get an arrow to you), walk or sit together, share food, or invite them to your gang.
   - Press **C** to chat; people near you see a bubble, and 📢 shouts to the whole map.
4. **Events:** inter-house practice on Wednesdays at 4 PM (races), Social Night on Saturdays at 7 PM (dance battles), visiting day, elections, and surprise events like a 🐍 snake in the hostel.

