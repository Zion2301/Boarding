// The school's clock — one for everybody, kept on the server and saved to disk.
// It only runs while somebody is online (the school "pauses" when it's empty and carries on from the same moment).
// Fast-forward (sleep / wait) needs every online player to agree; see CampusRoom.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Cal = require('../../shared/calendar.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DATA_DIR || (process.env.DATA_FILE ? path.dirname(process.env.DATA_FILE) : path.join(here, '..', 'data'));
const FILE = path.join(DIR, 'calendar.json');

let state = { abs: Cal.abs(0, Cal.ARRIVAL) }; // a brand-new school opens on Resumption Sunday, 2 PM
try { state = Object.assign(state, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { /* new school */ }
let lastWrite = 0;

export const SchoolClock = {
  Cal,
  get abs() { return state.abs; },
  advance(minutes) {
    state.abs += minutes;
    if (Date.now() - lastWrite > 10000) SchoolClock.persist();
  },
  persist() { lastWrite = Date.now(); try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state)); } catch { /* read-only disk */ } },
  now() { const { day, min } = Cal.split(state.abs); return Object.assign({ abs: state.abs, min }, Cal.info(day)); },
  /* admin/testing: jump the whole school to a day + minute */
  set(day, min) { state.abs = Cal.abs(day, min); SchoolClock.persist(); },
};
