/* Background music — made live with Web Audio (no files, no licences), so it never repeats exactly.
   Moods follow where you are and the time:
     menu    — highlife guitar tune (title screen, arrival cutscene)
     campus  — afrobeat groove: kick, clap, shaker, bass, highlife guitar, talking-drum fills
     night   — calm pads, soft marimba, crickets
     social  — Social Night party: amapiano-style log-drum bass, four-on-the-floor
     quiet   — classrooms during lessons / prep: (almost) silence so you can read
   Volume: ⚙️ menu (saved per device). Starts after your first tap/click (browser rule). */
(function (BH) {
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // C major pentatonic-ish palette, chords as MIDI roots
  const SONGS = {
    menu: { bpm: 96, prog: [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]], kick: [0, 8, 10], clap: [4, 12], shake: 0.5, bass: [0, 3, 6, 10, 12], guitar: true, melody: 0.8, drum: 0.2 },
    campus: { bpm: 104, prog: [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]], kick: [0, 3, 8, 11], clap: [4, 12], shake: 0.9, bass: [0, 3, 6, 8, 11, 14], guitar: true, melody: 0.45, drum: 0.5 },
    night: { bpm: 72, prog: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], kick: [], clap: [], shake: 0.15, bass: [0, 8], guitar: false, melody: 0.35, pad: true, crickets: true },
    social: { bpm: 114, prog: [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]], kick: [0, 4, 8, 12], clap: [4, 12], shake: 1, bass: [0, 3, 7, 10, 14], guitar: true, melody: 0.5, logdrum: true, drum: 0.3 },
    quiet: { bpm: 60, prog: [[60, 64, 67], [57, 60, 64]], kick: [], clap: [], shake: 0, bass: [], guitar: false, melody: 0, pad: true, padVol: 0.25 },
  };
  const SCALE = [0, 2, 4, 7, 9]; // pentatonic

  let ctx = null, out = null, busGain = null, noise = null, timer = null;
  const st = { song: null, want: 'menu', step: 0, bar: 0, next: 0, motif: [], fade: null };

  const Music = {
    get ctx() { return ctx; },
    get mood() { return st.want; },
    get volume() { const v = BH.Prefs && BH.Prefs.v.music; return v === undefined ? 0.5 : v; },
    setVolume(v) { BH.Prefs.set('music', v); if (out) out.gain.setTargetAtTime(Music.level(), ctx.currentTime, 0.2); },
    level() { return (BH.Sound && BH.Sound.muted ? 0 : 1) * Music.volume * 0.35; },

    start() {
      if (ctx) return;
      try { ctx = (BH.Sound && BH.Sound.ctx) || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      out = ctx.createGain(); out.gain.value = Music.level(); out.connect(ctx.destination);
      busGain = ctx.createGain(); busGain.gain.value = 1; busGain.connect(out);
      // a second of white noise, reused for drums / shaker / crickets
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      st.next = ctx.currentTime + 0.1;
      timer = setInterval(Music.tick, 40);
      Music.pick();
      setInterval(Music.pick, 1500);
    },

    /* which mood fits right now */
    pick() {
      const ui = BH.UI && BH.UI.screen;
      let want = 'menu';
      const s = BH.Game && BH.Game.s;
      if (ui === 'game' && s) {
        const map = s.world && s.world.map;
        const b = BH.Time.block(s);
        if (BH.Cutscene && BH.Cutscene.active) want = 'menu';
        else if ((b && ['class', 'prep', 'register'].includes(b.kind) && map && map !== 'campus') || (BH.Lessons && BH.Lessons.here(s))) want = 'quiet';
        else if ((BH.Director && BH.Director.isOn(s, 'socialNight')) || BH.Time.blockId(s) === 'social' || (BH.Games && BH.Games.dance && BH.Games.dance.st)) want = 'social';
        else if (BH.Clock.isNight(s) || BH.Clock.mod(s) >= 20 * 60) want = 'night';
        else want = 'campus';
      }
      if (want !== st.want) { st.want = want; Music.crossfade(); }
      if (out) out.gain.setTargetAtTime(Music.level(), ctx.currentTime, 0.3);
    },
    crossfade() {
      if (!ctx) return;
      const t = ctx.currentTime;
      busGain.gain.cancelScheduledValues(t);
      busGain.gain.setValueAtTime(busGain.gain.value, t);
      busGain.gain.linearRampToValueAtTime(0, t + 1.2);
      st.fade = t + 1.2;
    },

    /* the sequencer: schedule 16th notes a little ahead of time */
    tick() {
      if (!ctx || ctx.state === 'suspended') return;
      if (st.fade && ctx.currentTime >= st.fade) { st.fade = null; st.song = null; busGain.gain.setValueAtTime(0, ctx.currentTime); busGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5); }
      if (!st.song && !st.fade) { st.song = SONGS[st.want]; st.step = 0; st.bar = 0; st.motif = Music.motif(); st.next = Math.max(st.next, ctx.currentTime + 0.05); }
      const S = st.song;
      if (!S) return;
      const sixteenth = 60 / S.bpm / 4;
      while (st.next < ctx.currentTime + 0.15) {
        Music.play(S, st.step, st.bar, st.next, sixteenth);
        st.step++;
        if (st.step >= 16) { st.step = 0; st.bar++; if (st.bar % 8 === 0) st.motif = Music.motif(); }
        st.next += sixteenth * (st.step % 2 ? 0.94 : 1.06); // a little swing
      }
    },
    motif() { return Array.from({ length: 8 }, () => (Math.random() < 0.25 ? null : SCALE[Math.floor(Math.random() * SCALE.length)] + (Math.random() < 0.3 ? 12 : 0))); },

    play(S, step, bar, t, len) {
      const chord = S.prog[Math.floor(bar / 1) % S.prog.length];
      const root = chord[0] - 24;
      if (S.kick.includes(step)) Music.kick(t);
      if (S.clap.includes(step)) Music.clap(t);
      if (S.shake && (step % 2 === 0 || Math.random() < S.shake * 0.6)) Music.shaker(t, step % 4 === 2 ? 0.05 : 0.025 * S.shake);
      if (S.bass.includes(step)) S.logdrum ? Music.logdrum(t, NOTE(root + (step === 7 ? 7 : 0)), len * 3) : Music.bass(t, NOTE(root + ([6, 14].includes(step) ? 7 : 0)), len * 2);
      if (S.guitar && step % 2 === 1) { const n = chord[(step >> 1) % 3] + 12; Music.pluck(t, NOTE(n), 0.05); }
      if (S.melody && step % 2 === 0 && Math.random() < S.melody) { const m = st.motif[(step >> 1) % 8]; if (m !== null) Music.marimba(t, NOTE(chord[0] + 12 + m), S === SONGS.night ? 0.05 : 0.06); }
      if (S.drum && step === 14 && bar % 2 === 1 && Math.random() < S.drum) Music.talkingDrum(t, len);
      if (S.pad && step === 0) chord.forEach((n) => Music.pad(t, NOTE(n), len * 16, (S.padVol || 0.5) * 0.04));
      if (S.crickets && Math.random() < 0.08) Music.cricket(t);
    },

    /* ---------- instruments ---------- */
    env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); },
    osc(type, f, t, dur, peak, a = 0.005) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); Music.env(g, t, a, peak, dur); o.connect(g).connect(busGain); o.start(t); o.stop(t + a + dur + 0.05); return o; },
    noiseHit(t, dur, peak, type, freq, q = 1) { const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noise; f.type = type; f.frequency.value = freq; f.Q.value = q; Music.env(g, t, 0.002, peak, dur); src.connect(f).connect(g).connect(busGain); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05); },
    kick(t) { const o = Music.osc('sine', 140, t, 0.28, 0.9); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); },
    clap(t) { Music.noiseHit(t, 0.12, 0.35, 'bandpass', 1400, 0.8); Music.noiseHit(t + 0.012, 0.1, 0.25, 'bandpass', 1100, 0.8); },
    shaker(t, v) { Music.noiseHit(t, 0.04, v, 'highpass', 7000); },
    bass(t, f, dur) { Music.osc('triangle', f, t, dur, 0.35, 0.01); Music.osc('sine', f / 2, t, dur, 0.25, 0.01); },
    logdrum(t, f, dur) { const o = Music.osc('sine', f * 1.6, t, dur, 0.45, 0.01); o.frequency.exponentialRampToValueAtTime(f, t + 0.12); },
    pluck(t, f, v) { Music.osc('square', f, t, 0.12, v * 0.5); Music.osc('triangle', f * 2, t, 0.09, v * 0.6); },
    marimba(t, f, v) { Music.osc('sine', f, t, 0.35, v); Music.osc('sine', f * 4, t, 0.06, v * 0.3); },
    pad(t, f, dur, v) { [0.997, 1.003].forEach((d) => { const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f * d; fl.type = 'lowpass'; fl.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur); o.connect(fl).connect(g).connect(busGain); o.start(t); o.stop(t + dur + 0.1); }); },
    talkingDrum(t, len) { [0, 1, 2].forEach((i) => { const o = Music.osc('sine', 220, t + i * len, len * 1.4, 0.3); o.frequency.exponentialRampToValueAtTime(i === 1 ? 330 : 150, t + i * len + len); }); },
    cricket(t) { for (let i = 0; i < 3; i++) Music.osc('sine', 4200 + Math.random() * 300, t + i * 0.05, 0.03, 0.015); },
  };

  // browsers only allow sound after the first touch/click
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { Music.start(); if (ctx && ctx.state === 'suspended') ctx.resume(); }, { capture: true }));
  BH.Music = Music;
})(window.BH);
