# School structure

This file describes how classes, staff, timetables, lessons and students work, and how they map onto multiplayer.

## Data (all in `content/`, JSON)

| File | What it holds |
|---|---|
| `school.json` | Levels JSS1–SS3, with arms A/B/C each. Periods per subject per week (JSS, and SS core). The SS department lines. The split subjects: RS by religion (CRS/IRS), NLG by language (Yoruba/Igbo/Hausa). Department rooms, lab subjects, register length, class notices, bot settings. |
| `staff.json` | Every adult. 33 teachers, each with `teaches: { subject: [levels] }`, a personality, `speech`, `voice`, `quirks`, lesson `flags` (cane, fast, farm, late, kind) and their own class `lines` (enter, right, wrong, sleep, talk, noAnswer, punish). 20 other staff: principal, two VPs, house master and mistress, matron, nurse, bursar, three cooks, librarian, gateman, night guard, tuck-shop aunty, farm manager, two cleaners, chaplain, imam. |
| `lessons.json` | Board notes and multiple-choice questions for subjects that have no question bank. Subjects with a bank use the bank's questions, and its explanations become the board notes. |
| `routines.json` | Daily routines per role. Teachers use `$teaching` (the room their timetable gives them) and `$form` (their form class at register). The games master and the Agric teacher have their own routines. |
| `maps/classroom.json`, `maps/classroomSS.json` | Classroom templates. |

These maps are generated when content loads (`js/core/content.js`):
- 18 classrooms (`JSS1A`…`SS3C`), each with `parent`, `exit` and `classId`.
- The `juniorBlock` and `seniorBlock` hallways, with one labelled door per arm.

On campus, the "Junior Block" and "Senior Block" buildings lead into the hallways.

## Shared state: `s.school` (server-owned in multiplayer)

`js/systems/school.js` builds it deterministically from `s.school.seed`, so every client in a room builds the same school.

| Key | |
|---|---|
| `classes[JSS1A]` | `level`, `arm`, `map`, `form` (form teacher id), `captain`, `assistant`, `seating {studentId: deskIndex}`, `register {day: {studentId: 'P'/'L'/'A'}}`, `notices` |
| `students[id]` | **Real players**: `name`, `gender`, `level`, `arm`, `dept`, `religion`, `lang`, `house`. `School.enrol(s, id, info)` puts a joining player in the arm with the fewest players. |
| `tt[classId][day][period]` | The timetable entry: `{code, t: teacherId, room}`, or `{line, parts:[…]}` for SS department lines and RS/NLG splits. |
| `houseMasters` | House → teacher. |
| `settings.fill_with_bot_students` | Dev/test setting, **off by default**. |
| `lessons[room]` | The live lesson in each room (transient). |

### Timetables

Each class arm gets its own week: 5 days × 8 periods of 40 minutes, plus a 10-minute form-class register after assembly.

Generation:
- Each class/subject gets one teacher from the teachers who teach it at that level, balancing load.
- Units are booked hardest first: SS department lines, which book all three arms of a level together, then split subjects, then the busiest teachers.
- No class, teacher or shared room (lab, mosque, library, dining hall) is ever booked twice. Science groups use the lab when it's free.
- A swap-repair pass fixes most periods that couldn't get a teacher. The rest (about 1%) become free periods ("teacher no come").

Example: JSS1 can have Basic Science while SS2 has Chemistry at the same time, in different rooms with different teachers. Each student goes to their own room: `School.placeFor(s, studentId)` resolves department, religion and language.

## Lessons (`js/systems/lessons.js`)

A lesson runs in a room from the clock:
1. The teacher enters in their own voice.
2. They write notes on the board. Mr. Olumide writes too fast and rubs the board out.
3. They ask three questions. Half are put to a named student. **Anyone present can answer by typing** a letter or the answer itself.
4. Every few minutes the teacher looks up and catches sleepers and talkers, using their own lines.
5. They wrap up with notes, homework or test news, then dismiss the class.

At register time the form teacher calls the roll, and you answer "Present".

Player input is an **intent**, `{type: 'lesson:answer', actor, room, text}`, sent with `BH.Intents.send`. In single-player it applies immediately. The multiplayer layer will send it to the server unchanged.

UI: `js/ui/lesson.js` (chalkboard, question with A–D buttons, class feed, text box; **T** focuses it). The 3D blackboard shows the same notes (`js/render3d/interior3d.js`).

## Students = real players

Bot students (coursemates, seniors, juniors) are created only when **⚙️ Menu → 🧪 Bot students** is on, or with `?bots=1` in the URL. Switching them off stashes them (`s.npcs._bots`), so nothing is lost.

With bots off, the staff are the NPCs. Events and missions that need a student skip themselves.

## Multiplayer mapping (next phase: Colyseus)

- **Room state** = `s.school` + clock + `BH.Actors` snapshot.
- **Join**: `School.enrol(s, uid, profile)`, then `ensureSeating` and `ensureLeaders`.
- **Inputs**: movement intents (already) + `lesson:answer`. The server runs `Lessons.answer` and broadcasts `lessons[room]`.
- **Lessons**: the server ticks every room that has at least one player in it.
- Per-player state (stats, inventory, missions, academics) stays per player.
