/* 音效与震动：全部用 Web Audio 现场合成，不需要音频文件。 */
(function (root, factory) {
  root.GomokuAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  let ctx = null;
  const state = { sound: true, haptics: true };

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, start, dur, type = 'sine', gain = 0.2, endFreq = null) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + start;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(start, dur, gain, cutoff) {
    const a = ac(); if (!a) return;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = cutoff; f.Q.value = 1.2;
    const g = a.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(a.destination);
    src.start(a.currentTime + start);
  }

  function vibrate(ms) {
    if (state.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
  }

  return {
    configure(s) { state.sound = !!s.sound; state.haptics = !!s.haptics; },
    /* 首次用户操作时调用，解除浏览器的自动播放限制 */
    unlock() { if (state.sound) ac(); },

    place(color) {
      vibrate(8);
      if (!state.sound) return;
      noise(0, 0.05, 0.5, color === 1 ? 1800 : 2600);               // 棋子触盘的“嗒”
      tone(color === 1 ? 190 : 240, 0, 0.09, 'sine', 0.22, 90);     // 木盘的闷响
    },
    click() { vibrate(5); if (state.sound) tone(660, 0, 0.04, 'triangle', 0.08); },
    error() {
      vibrate([20, 40, 20]);
      if (state.sound) { tone(180, 0, 0.12, 'square', 0.07); tone(150, 0.1, 0.16, 'square', 0.07); }
    },
    win() {
      vibrate([30, 40, 30, 40, 80]);
      if (!state.sound) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle', 0.18));
    },
    lose() {
      vibrate(120);
      if (!state.sound) return;
      [392, 349.23, 311.13, 261.63].forEach((f, i) => tone(f, i * 0.16, 0.3, 'sine', 0.16));
    },
    draw() { if (state.sound) { tone(440, 0, 0.2, 'sine', 0.14); tone(440, 0.24, 0.3, 'sine', 0.14); } },
  };
});
