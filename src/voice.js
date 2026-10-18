/* 语音朗读：用浏览器自带的中文语音，两位搭档用不同音调区分。没有中文语音时只显示字幕。 */
(function (root, factory) {
  root.GomokuVoice = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  let voices = [];

  // 自然：接近正常说话，几乎不变调；夸张：拉开两人音调，更好区分但更有机器味
  const PROFILES = {
    natural: { 憨: { pitch: 1.08, rate: 1.05 }, 稳: { pitch: 0.92, rate: 0.96 } },
    fun:     { 憨: { pitch: 1.3, rate: 1.12 },  稳: { pitch: 0.62, rate: 0.92 } },
  };
  const MALE_HINT = /yunxi|yunyang|yunjian|kangkang|male|男|xiaoyou|danny|sin-ji/i;

  function load() {
    if (!synth) return;
    voices = synth.getVoices().filter(v => /^(zh|cmn)/i.test(v.lang) || /chinese|中文|普通话|国语/i.test(v.name));
  }
  if (synth) {
    load();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', load);
  }

  /* 用户指定了声音就用指定的；否则自动：老稳优先男声，阿憨优先其它声音 */
  function pickVoice(who, uri) {
    if (!voices.length) return null;
    const chosen = uri && voices.find(v => v.voiceURI === uri || v.name === uri);
    if (chosen) return chosen;
    const males = voices.filter(v => MALE_HINT.test(v.name));
    const others = voices.filter(v => !MALE_HINT.test(v.name));
    if (who === '稳') return males[0] || voices[voices.length > 1 ? 1 : 0];
    return others[0] || voices[0];
  }

  /* prefs：{uri: 指定声音, style: 'natural' | 'fun'} */
  function speak(text, who, prefs = {}) {
    return new Promise(resolve => {
      if (!synth || !voices.length) return resolve(false);
      let done = false;
      const finish = ok => { if (!done) { done = true; clearTimeout(guard); resolve(ok); } };
      const u = new SpeechSynthesisUtterance(text);
      const profile = PROFILES[prefs.style] || PROFILES.natural;
      const v = pickVoice(who, prefs.uri), p = profile[who] || profile['憨'];
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
    list() { return voices.map(v => ({ uri: v.voiceURI || v.name, name: v.name, lang: v.lang })); },
    speak,
    cancel() { if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } } },
    /* 在用户手势里调用一次，解除 iOS 等平台的朗读限制 */
    unlock() {
      if (!synth) return;
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) { /* ignore */ }
    },
  };
});
