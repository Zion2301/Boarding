/* Sound hooks. BH.Sound.play('click' | 'coin' | 'success' | 'bad' | 'door' | 'notify' | 'open' | 'step')
   Uses tiny synthesised blips (no files needed). To use real audio, set paths in BH.data.SOUNDS. */
(function (BH) {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('bh_muted') === '1'; } catch (e) { /* ignore */ }
  const files = {};

  const SYNTH = {
    click:   [[660, 0.04, 'square', 0.05]],
    open:    [[520, 0.05, 'triangle', 0.08], [780, 0.06, 'triangle', 0.08]],
    notify:  [[880, 0.06, 'sine', 0.1], [1175, 0.08, 'sine', 0.1]],
    door:    [[220, 0.08, 'triangle', 0.12], [330, 0.08, 'triangle', 0.1]],
    coin:    [[988, 0.05, 'square', 0.06], [1319, 0.12, 'square', 0.06]],
    success: [[523, 0.08, 'triangle', 0.1], [659, 0.08, 'triangle', 0.1], [784, 0.08, 'triangle', 0.1], [1047, 0.16, 'triangle', 0.12]],
    bad:     [[196, 0.12, 'sawtooth', 0.08], [147, 0.18, 'sawtooth', 0.08]],
    step:    [[120, 0.02, 'square', 0.02]],
  };

  const Sound = {
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem('bh_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ } return muted; },
    unlock() {
      if (ctx) return;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    },
    play(name) {
      if (muted) return;
      const url = BH.data.SOUNDS && BH.data.SOUNDS[name];
      if (url) {
        try { const a = files[name] || (files[name] = new Audio(url)); a.currentTime = 0; a.play().catch(() => {}); } catch (e) { /* ignore */ }
        return;
      }
      if (!ctx) return;
      let t = ctx.currentTime;
      (SYNTH[name] || SYNTH.click).forEach(([freq, dur, type, vol]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + dur + 0.02);
        t += dur * 0.85;
      });
    },
  };

  // browsers only allow audio after the first touch/click
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => Sound.unlock(), { once: true, capture: true }));

  BH.Sound = Sound;
})(window.BH);
