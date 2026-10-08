# MIGRATION: 2D Phaser client → 3D Three.js client (Sims-style)

Status is tracked in the **Progress** section at the bottom.

## Context
The 2D Phaser map feels flat and lifeless. Rebuild the **game client** in 3D (Three.js, runs in the browser/phones) with a Sims-like orbit camera, natural animated characters, and a warm, living Nigerian campus — while keeping the existing game systems (`js/systems/*`), content JSON (`content/*`), the DOM HUD/dialogue/panels, the Node AI server and its Supabase-ready store.

Audit findings that shape the plan:
- **No Colyseus server or Supabase data exist**; the game is single-player and the only server is `server/` (AI/moderation). User decision: stay single-player now but **design for multiplayer** — serializable state store separate from rendering, all player input as **intents**, other characters treated as **remote actors** driven locally. Colyseus is the next phase.
- Systems only touch the renderer through `BH.World` (`snap, escort, follow, target, toScreen, nearbyNpcs, watcherNear, npcPos, refreshPlayer, start/stop`) plus a few reads of `BH.World.scene.{npcs, player, cm, mapId}` (`js/systems/writing.js:55-73`, `js/ui/hud.js:242`). Keeping that API means systems stay untouched.
- Movement/NPC/detection/door/target logic currently lives inside `js/game/scene.js` (Phaser). It gets **extracted into a headless sim layer** (reused as-is in spirit: `syncNpcs/goalPoint/arrivalPoint/exitPoint/updateNpcs/detect/overhear/findTarget/updateArea`), then rendered by Three.
- Three.js is r128 (`vendor/three.min.js`, used only by `js/ui/three/avatar3d.js`). Current three is r186 (ESM-only) + `three-pathfinding` (MIT) — both reachable on npm.
- User decision: **characters built in code from parts** (rigid parts on a bone hierarchy, our own AnimationClips, AnimationMixer blending) → full control of uniforms (shorts/trousers, pinafore, hijab) and animations (sit, sleep, kneel, carry…), tiny downloads, offline.

## Architecture
```
input (tap / joystick / keys)          NPC controller (local AI, "remote players")
        │ intents {type, …}                     │ intents
        ▼                                       ▼
 js/sim/intents.js ──► js/sim/sim.js (fixed 30 Hz tick, headless)
                         ├─ actors.js    ActorStore: {id, kind: player|npc|remote, map, x, y, heading, vel, anim, outfit, carry, seat}  → snapshot()/apply()
                         ├─ navmesh.js   per-map navmesh (three-pathfinding) built from content maps
                         ├─ movement.js  accel/turn-rate/path-follow + separation steering (no sliding)
                         ├─ npcs.js      ported schedule-driven NPC logic (seats, patrols, callers, fights)
                         ├─ detect.js    vision cones + LOS (ported from scene.detect / MapRender.blocked)
                         └─ world-api.js BH.World facade (same API as today + compat `scene` object)
        ▼ reads state only
 js/render3d/ (Three r186): engine.js · camera.js · campus3d.js · interior3d.js · characters.js · outfits.js · anims.js · sky.js · ambient.js · cutaway.js
 DOM HUD/panels/dialogue (unchanged), game systems (unchanged)
```
- Logic stays in **map pixel space** (existing content coordinates); render space: 1 m = 40 px, `x = px/40, z = py/40`, y up.
- Game state stays in `BH.Game.s` (JSON); actor state lives in `BH.Actors` (serializable; player position persisted via existing `s.pos`/`s.world.map`). Intents are plain JSON → later sent to Colyseus unchanged.
- **No build step for game code.** One-time vendor build: `tools/build-vendor.mjs` (esbuild) bundles three r186 + `BufferGeometryUtils` + `three-pathfinding` into `vendor/three-bundle.js` exposing `window.THREE`/`window.Pathfinding` — keeps `file://` and offline working. `avatar3d.js` gets small r186 API fixes.
- Migration switch: `?engine=2d` keeps the Phaser renderer until the 3D client reaches parity; removed in the last step.

## Steps (each ends with "how to run")
Run for every step: `cd server && npm run dev` → http://localhost:8787 (3D) · `?engine=2d` old renderer · `?debug=1` FPS/draw-call overlay.

1. **Foundation** — MIGRATION.md (audit + this plan), vendor bundle, engine loop (sim fixed-step + render interpolation, pause when panels open), Sims camera (`camera.js`: orbit 360° drag/right-drag/Q·E/two-finger twist, zoom scroll/pinch from close-up to bird's-eye, tilt low→top-down, free pan + "snap to player" HUD button, damped spring on all axes, collision pull-in via raycast vs building boxes), campus ground + red-earth paths from `content/maps/campus.json`.
2. **Sim layer + player** — `js/sim/*` (actors, intents, navmesh from campus walkable area minus building footprints/trees, movement with acceleration/turning/separation), port player & door/zone/target/detection logic out of `scene.js`, `BH.World` facade (`toScreen` via `camera.project`), tap-to-walk (raycast → navmesh path), joystick (existing `HUD.joy`), WASD camera-relative. Character rig v1 + idle/walk/run with speed-matched blending (timeScale = speed/stride → no foot sliding). HUD/prompt/radial work unchanged.
3. **Living campus (outdoor art)** — `content/maps/campus3d.json` (decor placements, data-driven): painted buildings with signs (canvas-texture atlas), zinc/tile roofs, gate with school name + motto, overhead water tank, borehole, flag (cloth shader) at assembly, football field + goalposts, basketball/volleyball court, table tennis, benches under trees, fence with bush; instanced mango/dogonyaro/palm trees with wind-sway vertex shader, flowers.
4. **NPCs as remote actors** — port schedule sync/paths/patrols/seek/fights into `js/sim/npcs.js` driving actors via intents; 3D vision cones; overhear bubbles (DOM, positioned via `toScreen`); NPC LOD (mixer update rate by distance, frustum cull).
5. **Characters, outfits, animations** — `characters.js` (parts: body/head/skin/hair incl. hijab/glasses, built from existing `js/data/avatar.js` data), `content/outfits.json` (per school: junior/senior × boy/girl uniforms, house wear in house colours, Sunday white, night wear, casual/visiting day, prefect badge, teacher suits/kaftans/ankara/gowns) chosen automatically by block/location; `anims.js` clips: idle, walk, run, sit, sleep, eat, talk gestures, carry bucket, kneel, wave, dance, cheer — wired to activities (sit at desk/pew, sleep in bed, eat at table, kneel on punishment, carry with `water` item, dance at social, cheer at sports, talk in conversations).
6. **Sky, weather, ambient life** — `sky.js` (sun colour/angle by clock: sunrise, harsh noon, sunset glow, night with security lights + mosquito swarms; NEPA = lights off; rain particles + wet tint; harmattan haze fog), `ambient.js` (instanced birds, lizards doing push-ups on walls, dog at the gate, laundry cloth flapping, generator smoke, dust puffs, swaying leaves).
7. **Interiors** — `interior3d.js` builds rooms from the existing tile-grid JSON (walls, furniture blocks, seats, doors), same `SceneManager` fade transitions/autosave; `cutaway.js` Sims wall cutaway (walls between camera and player drop to stubs/fade, roofs hidden indoors; outdoors roofs fade when the camera dives close).
8. **Performance + cleanup** — InstancedMesh everywhere repeated, merged static geometry per building, vertex colours + single atlas, shadow only near player, pixel-ratio cap + auto quality tiers by FPS, LOD; test mid-range Android profile; remove Phaser + `js/game/*` 2D renderer and `?engine=2d`; update README/MIGRATION.md.

## Critical files
- New: `MIGRATION.md`, `tools/build-vendor.mjs`, `vendor/three-bundle.js`, `js/sim/*.js`, `js/render3d/*.js`, `content/maps/campus3d.json`, `content/outfits.json`
- Modified: `index.html` (scripts, engine switch), `js/game/scenemanager.js` (drive 3D scene), `js/ui/hud.js` (snap-to-player button, camera hints), `js/ui/three/avatar3d.js` (r186 + reuse new character builder), `sw.js`
- Reused unchanged: `js/systems/*` (Schedule, Rules, Activities, Interaction, Missions…), `content/*`, `js/ui/{dialogue,chat,panels,radial}.js`, `server/*`
- Retired at step 8: `js/game/scene.js`, `js/game/maprender.js`, `js/game/sprites.js`, `vendor/phaser.min.js`

## Verification (each step)
- `node <scratchpad>/sim.js 6` headless day simulation still 0 errors (systems untouched); `cd server && npm test` 22/22.
- Headless Chrome (CDP, swiftshader, manual `renderer` stepping): screenshots desktop 900×640 + phone 390×844, camera orbit/zoom/tilt/pan, tap-to-walk path, enter/exit buildings, prompt/radial/dialogue still positioned correctly, NPC schedules visible.
- `?debug=1` overlay: FPS, draw calls, triangles — targets for mid-range Android: < 120 draw calls, < 150k tris, 30+ FPS.
- After each step I report the run command and what to look at.

## Progress
| Step | Status | How to run / what to look at |
|---|---|---|
| 1 Foundation | ✅ done | `cd server && npm run dev` → http://localhost:8787/?engine=3d&debug=1 — orbit (right-drag / one finger), pan (left-drag / two fingers), zoom (wheel/pinch), tilt (R/V, PgUp/PgDn or vertical drag), rotate Q/E, 🎯 snaps back. Keys in 3D: Space/Enter = action, F = 2nd action, Tab = radial. |
| 2 Sim layer + player | ✅ done | http://localhost:8787/?debug=1 (3D is now the default; `?engine=2d` = old Phaser map). Tap/click the ground to walk there (navmesh path), tap a person to walk up and talk, tap a building to go to its door. WASD/arrows or the joystick walk camera-relative; hold Shift (or push the stick fully) to run. Walk into a door to enter; NPCs follow the schedule, sit, sleep, patrol, spot you (cones). Headless: `js/sim/*` runs without the renderer. |
| 2b School structure | ✅ done | Real class arms (JSS1A…SS3C) in Junior/Senior Block hallways, 53 staff NPCs, clash-free per-arm timetables, live lessons you answer by typing, register, seating, captains. Students = players; bots off by default. See [SCHOOL.md](SCHOOL.md). Try `?bots=1` to fill the class. |
| 3 Living campus | — | |
| 4 NPCs | — | |
| 5 Characters/outfits/anims | — | |
| 6 Sky/weather/ambient | — | |
| 7 Interiors + cutaway | — | |
| 8 Performance + cleanup | — | |
