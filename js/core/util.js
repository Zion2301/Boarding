/* ============================================================
   BOARDING HOUSE — core utilities, event bus, system registry
   Everything hangs off the global `BH` namespace so the game
   runs from file:// with plain <script> tags (no build step).
   ============================================================ */
window.BH = window.BH || {};
BH.data = BH.data || {};
BH.Q = BH.Q || {};            // question banks: BH.Q[subjectCode] = [{lvl,q,o,a,e}]
BH.actions = BH.actions || {}; // UI click handlers: data-act="name"
BH.Screens = BH.Screens || {};

(function (BH) {
  const U = {};

  U.clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
  U.randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.uid = () => Math.random().toString(36).slice(2, 9);

  U.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  U.sample = (arr, n) => U.shuffle(arr).slice(0, n);

  // items: array, weightFn: item => number
  U.weighted = (items, weightFn) => {
    const ws = items.map(weightFn);
    const total = ws.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= ws[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };

  // Deterministic pick so re-renders show the same flavour line
  U.hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return Math.abs(h);
  };
  U.seedPick = (arr, seed) => arr[U.hash(String(seed)) % arr.length];

  U.money = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "{name} don come" + {name:'Tunde'} -> "Tunde don come"
  U.fill = (str, vars = {}) => String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  U.line = (arr, vars) => U.fill(U.pick(arr), vars);
  U.cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  BH.U = U;

  /* ---------- Event bus: systems talk to each other through this ---------- */
  /* The EventBus. Every system reports what happened here (caught, interact, give, attend, study…);
     the ConsequenceSystem, missions, gist and paths listen. '*' receives every event. */
  const listeners = {};
  BH.bus = {
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return fn; },
    off(evt, fn) { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); },
    once(evt, fn) { const w = (p, s) => { BH.bus.off(evt, w); fn(p, s); }; return BH.bus.on(evt, w); },
    emit(evt, payload = {}) {
      const s = BH.Game && BH.Game.s;
      (listeners[evt] || []).slice().forEach((fn) => fn(payload, s));
      (listeners['*'] || []).slice().forEach((fn) => fn(evt, payload, s));
    },
  };

  /* ---------- System registry ----------
     A system is an object with any of these optional hooks:
       onNewGame(s), onLoad(s), onNewDay(s), onBlockStart(s, blockId),
       onBlockEnd(s, blockId), onDayEnd(s), onTermEnd(s), onMinute(s) (every in-game minute),
       talkOptions(s, npc) and actionsFor(s, target) (gathered with BH.collect)
     Register new systems (phone, report cards, prefects...) with
     BH.registerSystem('phone', PhoneSystem) and they get called. */
  BH.systemOrder = [];
  BH.registerSystem = (name, sys) => {
    BH[name] = sys;
    if (!BH.systemOrder.includes(name)) BH.systemOrder.push(name);
    return sys;
  };
  BH.hook = (hookName, ...args) => {
    BH.systemOrder.forEach((n) => {
      const sys = BH[n];
      if (sys && typeof sys[hookName] === 'function') sys[hookName](...args);
    });
  };

  /* Gather arrays from every system that implements a hook, e.g.
     BH.collect('talkOptions', s, npc) → extra conversation options from missions, academics… */
  BH.collect = (hookName, ...args) => {
    const out = [];
    BH.systemOrder.forEach((n) => {
      const sys = BH[n];
      if (sys && typeof sys[hookName] === 'function') out.push(...(sys[hookName](...args) || []));
    });
    return out;
  };

  /* ---------- FX accumulator: collects stat deltas for the outcome card ---------- */
  BH.fx = {
    stack: null,
    begin() { this.stack = []; },
    push(icon, amount, label) {
      if (!this.stack || !amount) return;
      const ex = this.stack.find((x) => x.icon === icon && x.label === label);
      if (ex) ex.amount += amount; else this.stack.push({ icon, amount, label });
    },
    end() { const out = (this.stack || []).filter((x) => Math.round(x.amount) !== 0); this.stack = null; return out; },
  };
})(window.BH);
