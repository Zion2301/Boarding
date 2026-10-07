# Boarding House — Architecture: free-text writing & AI NPCs

This document plans the **free-text + AI** layer on top of the free-roam sandbox described in the README.
Principle: **preset choices stay as quick options, but you can always type your own words**, and the game keeps
working (with preset/heuristic fallbacks) when the AI is off, rate-limited or unreachable.

## 0. What exists today and what changes

| Today | Change |
|---|---|
| Static site. Game state lives in the browser (`localStorage`, `BH.Game.s`). | Add a small **Node game server** (`server/`). It serves the static game and an `/api/*` JSON API. The game still runs from `file://` or a plain static server, with AI features falling back to presets. |
| No accounts. | Each save gets an anonymous `playerId` (UUID) and a `schoolId` (derived from the school name). The server uses these for rate limits, memory and shared boards. Real auth is a later step. |
| No text filter. | `shared/moderation.js` is one filter used by **both** client and server. The server adds an **AI moderation pass** for anything other players can see. |
| No database. | `server/store.js` storage adapter. **Supabase** (Postgres) when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set (`server/supabase.sql` creates the tables); otherwise a local JSON file (`server/data/db.json`) for development. |

```
browser (game)                                   game server (Node, server/)
──────────────                                   ─────────────────────────────────────────
BH.AI  (js/systems/ai.js) ── fetch /api/* ───▶   router (server/index.js)
  · conversation UI (typed + quick options)        ├─ guard: AI toggle · rate limit · daily budget · cache
  · applies VALIDATED effects only                 ├─ moderation (shared filter + Haiku check)
  · offline fallback (intent matcher/presets)      ├─ npc chat  → Claude Haiku 4.5 (structured JSON)
                                                   ├─ grading / debate → Claude Sonnet 5.5 (structured JSON)
                                                   ├─ effects validator (caps per action/day)
                                                   └─ store (Supabase | JSON file): memory, boards,
                                                       graffiti, shirts, slam books, reports, usage
```

**The API key is only ever on the server** (`ANTHROPIC_API_KEY` env var). The browser never sees it and never calls Anthropic.

## 1. AI NPC conversations

### 1.1 Character sheets (`content/characters.json`)
One sheet per **role** (VP, teachers by style, nurse, Mama Tuck-shop, house master, school parent, seniors by role, classmates by archetype, Mummy/Daddy/sibling). Fields:
`name`, `role`, `personality`, `speech` (`pidgin` | `nigerian_english` | `mix`), `knows` (what they know), `goals`,
`allowed_actions` (the only actions this NPC may take), `can_give` (item ids + max amounts), `money_cap`.
The client sends only *facts* (NPC id, name, relationship 0–100, player name/level, situation, recent stats). The **server** builds the system prompt from the sheet in content/, so a client can't rewrite who an NPC is.

### 1.2 Prompt
`system` = fixed safety rules + the character sheet + the situation brief (cache-friendly: stable text first).
`messages` = this conversation's turns (max ~8 turns sent). Memory is put in the brief: the **last 10 memory notes** for this NPC×player
(promises, lies, insults, favours), each ≤ 160 chars.

### 1.3 Structured output (validated with zod on the server)
```json
{ "reply": "string ≤ 450 chars",
  "emotion": "neutral|happy|amused|annoyed|angry|sad|suspicious|impressed|worried",
  "relationship_change": -10..10,
  "action": "none|accept_excuse|reject_excuse|punish|warn|give_item|start_mission|report_to_principal|discount|refuse|send_money|send_provisions|answer_question|end_conversation",
  "action_detail": { "item": "id?", "amount": 0, "severity": 0, "mission": "id?" },
  "memory_note": "≤160 chars: what to remember about this exchange (or empty)",
  "distress": false }
```
Uses `output_config.format` structured outputs on **`claude-haiku-4-5-20251001`** with `max_tokens` 400.

### 1.4 Effects: the server decides what actually happens
`server/effects.js` turns the model's suggestion into **validated effects**:
- `action` must be in the sheet's `allowed_actions` and valid for the situation (e.g. `accept_excuse` only in an excuse situation). Otherwise it becomes `none`.
- `relationship_change` is clamped to ±8 per message and ±15 per NPC per in-game day.
- `give_item`/`send_provisions`: only items in `can_give`, at most 3 units, and at most 5 items per player per day.
- `send_money`/`discount`: capped by the sheet's `money_cap` (Mummy ₦2,000, discount ≤ 30%) and a per-player daily total.
- `punish`: severity is never above the rule's own severity. `report_to_principal` can add at most +1 severity, up to 3.
- `start_mission`: only missions listed in the sheet.
The server records granted money/items per player per day (the "ledger"). The client applies **only** the returned `effects` through the existing ConsequenceSystem.
Because saves are still client-side, a determined player could edit their own save. The server guarantees the AI can never hand out more than the caps.

### 1.5 Safety (part of every system prompt)
- Players are teenagers (11–18). Keep everything age-appropriate, in character, with no profanity beyond mild school slang.
- Never romantic, flirtatious or sexual with the player, even if asked. Deflect in character.
- Never give harmful real-world advice (weapons, drugs, self-harm methods, dangerous "pranks", medical dosing). Stay inside the game world.
- If the player is clearly in **real distress** (self-harm, suicide, abuse, being hurt at home or school, feeling unsafe), the NPC **steps out of role**, sets `"distress": true` and replies gently: they matter, and they should talk to a trusted adult (parent, teacher, school counsellor) or call emergency services if in danger.
- Belt and braces: `shared/moderation.js` also has a **distress detector** that runs in the browser *before* sending. If it matches, the help panel opens even when the AI is off.
- The **help resources panel** comes from `content/help.json` so locally verified helplines can be added without code.

### 1.6 Cost & safety controls (`server/guard.js`)
| Control | Default (env) |
|---|---|
| Global AI switch | `AI_ENABLED=1`, plus a runtime toggle in the admin page (`/admin.html`, `ADMIN_TOKEN`) |
| Per-player rate limit | 8 requests / minute (`AI_RATE_PER_MIN`) |
| Per-player daily budget | 120 AI messages / day (`AI_DAILY_BUDGET`); grading counts 2 |
| Global daily budget | 20,000 calls (`AI_GLOBAL_DAILY`) |
| Response cache | LRU (1,000 entries, 6 h) keyed on role + situation + normalised player text + relationship band, only for turns with no memory/history (common openers, "sorry I'm late") |
| Output length | `max_tokens` 400 (chat), 700 (grading) |
| Fallback | Any failure, refusal, budget hit or AI-off makes the server reply `{ fallback: true }`. The client uses the offline **intent matcher** (keyword → preset outcome) or preset dialogue |
| Player-side switch | Settings → "AI conversations" on/off |
| Mock mode | `AI_MOCK=1`: deterministic fake model for development and tests, no key needed |

### 1.7 Use-cases wired up
1. **Excuses** (first test case: being late, handled by the **Vice Principal** at assembly or the teacher at the classroom door): late arrival or getting caught opens an *excuse conversation* instead of an instant punishment. Accept → warning only; reject/punish → the rule's punishment; walk away → punishment.
   Also: missing assignments (teacher) and out of bounds (prefect/house master).
2. **Haggling at the tuck shop**: `discount` (≤ 30%) or `refuse`.
3. **School father/mother**: advice, protection, small gifts (`give_item`).
4. **Texts to/from family**: free-text replies on the phone; the reply can include `send_money`.
5. **Letters home**: written letter → AI reply from Mummy/Daddy 2–4 in-game days later, sometimes with money or provisions (capped).
6. **Asking teachers about the subject**: `answer_question` (short, school-level explanation) plus a small knowledge bump.

## 2. AI grading & debates
- `content/open_questions.json`: open-ended questions per subject (English, Literature, Government, Civic, CRS/IRS, Social Studies, Economics) with `marks` and a rubric (criteria + key points).
- Tests and exams in those subjects end with **one open question**. The player types an answer (max 800 chars) and the server grades it with **`claude-sonnet-5-5`** → `{ score, out_of, comment (teacher voice, ≤ 200 chars), strengths[], improvements[] }`. The score is clamped to `0..out_of`.
  Requests use `output_config.format` + `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
- Fallback grader: keyword/key-point coverage + length heuristic, labelled "(marked by hand)".
- **Debate competitions** (Debate Society on Saturday afternoons in the library, and the inter-house debate): motion, the NPC opponent's argument, the player's typed argument (max 1,000 chars). Sonnet judges `{ player_score, opponent_score (0–30), winner, comment }` with clamped scores. The fallback judge uses a heuristic.

## 3. Writing as game objects
| Object | Where it lives | Visibility | Moderation |
|---|---|---|---|
| **Class notes** (≤ 200 chars) to a classmate via desk seats | client save (+ the NPC answers via AI or presets) | private between sender and target | filter only (private) |
| **Slam book** (item; question list in `content/slambook.json`) | server (`slambooks`), id stored in the save | owner + signers (NPC classmates answer via AI/presets; real players can sign via share code) | filter + AI check |
| **Sign-out shirt** (SS3 graduation) | server (`shirts`), rendered with canvas, saved to the profile **trophy room** | public to anyone with the code | filter + AI check |
| **Noticeboard** posts per school | server (`board_posts`) | everyone at that school | filter + AI check, reportable |
| **Graffiti** on desks and walls (persists across terms) | server (`graffiti`, keyed by school + map + spot) | everyone at that school | filter + AI check, reportable |
| **Diary** | client save only | private, never sent anywhere | none needed (never shown to others) |
| **Letters home** | client save; AI reply via server | private | filter (personal info) |

Notes in class: passing goes seat to seat (1 hop per neighbouring desk). Each hop risks the teacher noticing:
`p = alertness × facing × distance`, where alertness comes from the teacher's strictness and facing is higher for rows near the front.
If caught, the note is confiscated, the sender gets a minor punishment, and the teacher reads out a **funny generic line**. The real text is never shown or sent anywhere.

## 4. Moderation for all text
- `shared/moderation.js` (one UMD file, loaded by the browser and `require`d by the server):
  - profanity/slur list (English + common Nigerian insults), sexual terms, harassment patterns ("kill yourself", …);
  - personal info: phone numbers (incl. +234 / 080…), emails, URLs, social handles (@…), street addresses;
  - verdicts: `ok` | `masked` (mild profanity is masked) | `blocked` (with reasons). It also returns `distress` matches.
- Server **AI moderation** (`claude-haiku-4-5-20251001`, structured `{ allowed, categories[], reason }`) for anything other players can see: slam books, shirts, noticeboard, graffiti. AI off or failure means **local filter only**: posts become `pending` (hidden from others) unless the local filter is confident they are `ok`.
- **Reports**: every public item has a 🚩 Report button. `reports` stores `{ item_type, item_id, original_text, reporter, reason, created_at }`. Items with ≥ 3 reports are auto-hidden. The **admin dashboard** (`/admin.html`) lists reports, lets you hide or restore items, shows AI usage, and has the global AI toggle.
- The diary is never transmitted. Private notes only go through the local filter.

## 5. File map (new)
```
ARCHITECTURE.md
server/package.json          deps: @anthropic-ai/sdk, zod, (@supabase/supabase-js optional)
server/index.js              static files + /api router
server/ai.js                 Claude calls (chat, grade, debate, moderate) + mock mode
server/prompts.js            system prompts (safety block, character sheet, situations)
server/effects.js            action → validated effects (caps, ledger)
server/guard.js              AI toggle, rate limits, budgets, cache
server/store.js              storage adapter: Supabase | JSON file
server/supabase.sql          table definitions
server/admin.html            reports, usage, AI toggle
shared/moderation.js         text filter + distress detector (browser + server)
content/characters.json      NPC character sheets
content/open_questions.json  open-ended questions + rubrics
content/debates.json         motions + opponent arguments
content/slambook.json        slam book questions
content/help.json            help resources panel
js/systems/ai.js             client API wrapper, offline fallback, effect application
js/systems/writing.js        notes, slam books, letters, diary, graffiti, noticeboard, shirts (game logic)
js/ui/chat.js                typed conversation UI (quick options + text box), help panel
js/ui/screens/writing.js     panels: diary, letters, slam book, noticeboard, shirt/trophy room
```

## 6. Build order (as requested)
1. AI conversation system + structured actions. First case: **the VP and lateness excuses**.
2. AI essay grading (open questions in tests/exams) + debates.
3. Notes in class.
4. Letters home + typed text replies.
5. Slam books, noticeboard, graffiti, diary.
6. Sign-out day shirts + trophy room.
