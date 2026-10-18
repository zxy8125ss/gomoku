/*
 * 语音朗读，两种引擎：
 *  - 设备语音：浏览器自带的 Web Speech，免费、离线，但音质取决于设备。
 *  - 在线语音：微软 Azure 语音服务（需要用户自备密钥）。每句话合成一次后缓存在本机，之后离线也能播。
 * 在线语音任何环节失败都会自动退回设备语音，不影响解说。
 */
(function (root, factory) {
  root.GomokuVoice = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  let voices = [];

  /* ---------------- 设备语音 ---------------- */

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

  /* iOS 上中文声音列表常常要过一会儿才出来，且不一定触发 voiceschanged：每次朗读前再取一次 */
  function ensureVoices() { if (synth && !voices.length) load(); }

  /* iOS 17+：声明为“环境音”，跟随静音键——静音时所有声音（包括在线语音）都不出声 */
  function respectSilentSwitch() {
    try { if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { /* ignore */ }
  }
  respectSilentSwitch();

  function speakDevice(text, who, prefs) {
    return new Promise(resolve => {
      ensureVoices();
      // 拿不到声音列表也照样朗读：系统会按 zh-CN 用默认中文声音
      if (!synth) return resolve(false);
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
      try { if (synth.paused) synth.resume(); synth.speak(u); } catch (e) { finish(false); }
    });
  }

  /* ---------------- 在线语音（微软 Azure 语音服务） ---------------- */

  const ONLINE_VOICES = [
    { id: 'zh-CN-YunxiNeural', name: '云希 · 年轻男声' },
    { id: 'zh-CN-YunyangNeural', name: '云扬 · 沉稳男声' },
    { id: 'zh-CN-YunjianNeural', name: '云健 · 浑厚男声' },
    { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 · 温暖女声' },
    { id: 'zh-CN-XiaoyiNeural', name: '晓伊 · 活泼女声' },
  ];
  const online = {
    on: false, key: '', region: 'eastasia',
    voices: { 憨: 'zh-CN-YunxiNeural', 稳: 'zh-CN-YunyangNeural' },
    broken: false, error: '', onError: null,
  };
  const RATE = { 憨: '+8%', 稳: '-4%' };
  const CACHE_NAME = 'gomoku-tts-v1';
  const mem = new Map();
  let audioEl = null, audioUrl = '', playToken = 0, pendingStop = null;

  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const onlineReady = () => online.on && !!online.key && !!online.region;

  function buildSSML(text, voice, who) {
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">` +
      `<voice name="${voice}"><prosody rate="${RATE[who] || '+0%'}">${esc(text)}</prosody></voice></speak>`;
  }

  /* 取一句话的音频：先查内存，再查本地缓存，最后才请求服务 */
  async function fetchAudio(text, who) {
    const voice = online.voices[who] || online.voices['憨'];
    const cacheKey = `https://tts.cache.local/${voice}/${encodeURIComponent(text)}`;
    if (mem.has(cacheKey)) return mem.get(cacheKey);

    let cache = null;
    try {
      if (typeof caches !== 'undefined') {
        cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(cacheKey);
        if (hit) { const blob = await hit.blob(); mem.set(cacheKey, blob); return blob; }
      }
    } catch (e) { cache = null; }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    let res;
    try {
      res = await fetch(`https://${online.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST', signal: ctl.signal,
        headers: {
          'Ocp-Apim-Subscription-Key': online.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        },
        body: buildSSML(text, voice, who),
      });
    } finally { clearTimeout(timer); }
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? '密钥无效或无权限' : `服务返回 ${res.status}`);
    const blob = await res.blob();
    if (!blob.size) throw new Error('服务返回了空音频');
    mem.set(cacheKey, blob);
    if (cache) { try { await cache.put(cacheKey, new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } })); } catch (e) { /* 缓存失败不影响播放 */ } }
    return blob;
  }

  function getAudio() { if (!audioEl) audioEl = new Audio(); return audioEl; }

  function playBlob(blob) {
    return new Promise(resolve => {
      const a = getAudio();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(blob);
      let done = false;
      const finish = ok => { if (!done) { done = true; clearTimeout(guard); pendingStop = null; resolve(ok); } };
      const guard = setTimeout(() => finish(false), 20000);
      pendingStop = () => finish(true);        // 被取消时视为“已处理”，不触发退回
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      a.src = audioUrl;
      const p = a.play();
      if (p && p.catch) p.catch(() => finish(false));
    });
  }

  async function speakOnline(text, who) {
    const mine = ++playToken;
    const blob = await fetchAudio(text, who);
    if (mine !== playToken) return true;           // 期间被取消或被新的一句顶替
    const ok = await playBlob(blob);
    if (!ok && mine === playToken) throw new Error('音频播放失败');
    return true;
  }

  /* ---------------- 对外接口 ---------------- */

  /* prefs：{uri: 设备语音, style: 'natural' | 'fun'} */
  async function speak(text, who, prefs = {}) {
    if (onlineReady() && !online.broken) {
      try { return await speakOnline(text, who); } catch (e) {
        online.broken = true;
        online.error = e && e.name === 'AbortError' ? '请求超时' : (e && e.message === 'Failed to fetch' ? '网络不通或被浏览器拦截' : (e && e.message) || '未知错误');
        if (online.onError) { try { online.onError(online.error); } catch (_) { /* ignore */ } }
      }
    }
    return speakDevice(text, who, prefs);
  }

  return {
    ONLINE_VOICES,
    deviceAvailable() { ensureVoices(); return !!synth && voices.length > 0; },
    available() { return !!synth || onlineReady(); },
    list() { return voices.map(v => ({ uri: v.voiceURI || v.name, name: v.name, lang: v.lang })); },
    /* cfg：{on, key, region, voices:{憨,稳}, onError}；每次改动都会重置“失败”状态 */
    configureOnline(cfg) {
      online.on = !!cfg.on; online.key = (cfg.key || '').trim(); online.region = (cfg.region || 'eastasia').trim().toLowerCase();
      if (cfg.voices) online.voices = Object.assign({}, online.voices, cfg.voices);
      if (cfg.onError !== undefined) online.onError = cfg.onError;
      online.broken = false; online.error = '';
    },
    status() { return { online: onlineReady(), broken: online.broken, error: online.error }; },
    speak,
    cancel() {
      playToken++;
      if (pendingStop) pendingStop();
      if (audioEl) { try { audioEl.pause(); } catch (e) { /* ignore */ } }
      if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } }
    },
    /* 在用户手势里调用一次，解除 iOS 等平台的朗读/播放限制 */
    unlock() {
      ensureVoices();
      if (synth) { try { const u = new SpeechSynthesisUtterance('。'); u.lang = 'zh-CN'; u.volume = 0; synth.speak(u); } catch (e) { /* ignore */ } }
      if (online.on && typeof Audio !== 'undefined') {
        try {
          const a = getAudio();
          a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
          const p = a.play(); if (p && p.catch) p.catch(() => {});
        } catch (e) { /* ignore */ }
      }
    },
  };
});
