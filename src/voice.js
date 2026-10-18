/* 语音朗读：用浏览器自带的中文语音，两位搭档用不同音调区分。没有中文语音时只显示字幕。 */
(function (root, factory) {
  root.GomokuVoice = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  let voices = [];

  // 憨：偏高、偏快；稳：偏低、偏慢
  const PROFILE = { 憨: { pitch: 1.3, rate: 1.12 }, 稳: { pitch: 0.62, rate: 0.92 } };
  const MALE_HINT = /yunxi|yunyang|yunjian|kangkang|male|男|xiaoyou|danny|sin-ji/i;

  function load() {
    if (!synth) return;
    voices = synth.getVoices().filter(v => /^(zh|cmn)/i.test(v.lang) || /chinese|中文|普通话|国语/i.test(v.name));
  }
  if (synth) {
    load();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', load);
  }

  /* 尽量给两人挑不同的声音：老稳优先男声，阿憨优先其它声音 */
  function pickVoice(who) {
    if (!voices.length) return null;
    const males = voices.filter(v => MALE_HINT.test(v.name));
    const others = voices.filter(v => !MALE_HINT.test(v.name));
    if (who === '稳') return males[0] || voices[voices.length > 1 ? 1 : 0];
    return others[0] || voices[0];
  }

  function speak(text, who) {
    return new Promise(resolve => {
      if (!synth || !voices.length) return resolve(false);
      let done = false;
      const finish = ok => { if (!done) { done = true; clearTimeout(guard); resolve(ok); } };
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(who), p = PROFILE[who] || PROFILE['憨'];
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'zh-CN';
      u.pitch = p.pitch; u.rate = p.rate; u.volume = 1;
      u.onend = () => finish(true);
      u.onerror = () => finish(false);
      // 个别浏览器偶尔不触发 onend，设个保险超时
      const guard = setTimeout(() => finish(false), 2500 + text.length * 380);
      try { synth.speak(u); } catch (e) { finish(false); }
    });
  }

  return {
    available() { return !!synth && voices.length > 0; },
    speak,
    cancel() { if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } } },
    /* 在用户手势里调用一次，解除 iOS 等平台的朗读限制 */
    unlock() {
      if (!synth) return;
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) { /* ignore */ }
    },
  };
});
