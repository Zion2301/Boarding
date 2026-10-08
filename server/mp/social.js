// Social graph that outlives a session: friends, pending requests, best friend, gangs (squads).
// Stored in server/data/social.json (swap for Supabase tables later — same shape).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.SOCIAL_FILE || path.join(here, '..', 'data', 'social.json');

let db = { profiles: {}, gangs: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { /* fresh */ }
let timer = null;
const save = () => { clearTimeout(timer); timer = setTimeout(() => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); }, 300); };

export const Social = {
  profile(pid, name) {
    const p = db.profiles[pid] = db.profiles[pid] || { pid, name: name || pid, friends: [], requests: [], bestie: null, gang: null };
    if (name) p.name = name;
    return p;
  },
  /* last known class/house so invite links work while you're offline */
  remember(pid, info) { const p = Social.profile(pid); Object.entries(info).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p[k] = v; }); save(); },
  publicProfile(pid) { const p = db.profiles[pid]; return p ? { pid, name: p.name, level: p.level, arm: p.arm, house: p.house, gender: p.gender, school: p.school } : null; },
  view(pid) {
    const p = Social.profile(pid);
    const g = p.gang && db.gangs[p.gang];
    return {
      friends: p.friends.map((f) => ({ pid: f, name: Social.profile(f).name, bestie: db.profiles[f] && db.profiles[f].bestie === pid })),
      requests: p.requests.map((f) => ({ pid: f, name: Social.profile(f).name })),
      bestie: p.bestie,
      gang: g ? { id: g.id, name: g.name, tag: g.tag, members: g.members.map((m) => ({ pid: m, name: Social.profile(m).name })) } : null,
      gangInvites: (p.gangInvites || []).map((gid) => db.gangs[gid]).filter(Boolean).map((x) => ({ id: x.id, name: x.name, tag: x.tag })),
    };
  },
  /* A asks B. If B already asked A, they become friends. Returns 'friends' | 'requested' | 'already' */
  request(a, b) {
    if (a === b) return 'self';
    const A = Social.profile(a), B = Social.profile(b);
    if (A.friends.includes(b)) return 'already';
    if (A.requests.includes(b)) { // B asked first
      A.requests = A.requests.filter((x) => x !== b);
      A.friends.push(b); B.friends.push(a);
      save(); return 'friends';
    }
    if (!B.requests.includes(a)) B.requests.push(a);
    save(); return 'requested';
  },
  unfriend(a, b) {
    const A = Social.profile(a), B = Social.profile(b);
    A.friends = A.friends.filter((x) => x !== b); B.friends = B.friends.filter((x) => x !== a);
    if (A.bestie === b) A.bestie = null; if (B.bestie === a) B.bestie = null;
    save();
  },
  setBestie(a, b) {
    const A = Social.profile(a);
    if (b && !A.friends.includes(b)) return false;
    A.bestie = b || null; save(); return true;
  },
  areFriends(a, b) { return Social.profile(a).friends.includes(b); },
  /* everyone who pinned this player as their best friend may see where they are? No — the other way round:
     your best friend can see where YOU are. So: who may see A = A's bestie. */
  bestieOf(pid) { return Social.profile(pid).bestie; },

  createGang(pid, name, tag) {
    const P = Social.profile(pid);
    if (P.gang) Social.leaveGang(pid);
    const id = crypto.randomUUID().slice(0, 8);
    db.gangs[id] = { id, name, tag, members: [pid], owner: pid };
    P.gang = id; save();
    return db.gangs[id];
  },
  inviteGang(pid, to) {
    const P = Social.profile(pid);
    if (!P.gang) return null;
    const T = Social.profile(to);
    T.gangInvites = [...new Set([...(T.gangInvites || []), P.gang])];
    save(); return db.gangs[P.gang];
  },
  joinGang(pid, gid) {
    const P = Social.profile(pid), g = db.gangs[gid];
    if (!g || !(P.gangInvites || []).includes(gid)) return null;
    if (P.gang) Social.leaveGang(pid);
    g.members.push(pid); P.gang = gid; P.gangInvites = (P.gangInvites || []).filter((x) => x !== gid);
    save(); return g;
  },
  leaveGang(pid) {
    const P = Social.profile(pid), g = P.gang && db.gangs[P.gang];
    if (g) { g.members = g.members.filter((m) => m !== pid); if (!g.members.length) delete db.gangs[g.id]; }
    P.gang = null; save();
  },
  gangOf(pid) { const P = Social.profile(pid); return P.gang ? db.gangs[P.gang] || null : null; },
};
