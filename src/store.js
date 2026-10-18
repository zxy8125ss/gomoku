/* 本地存储：设置、战绩、进行中的对局。storage 可注入，便于在 Node 里测试。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GomokuStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KEYS = { settings: 'gomoku:settings', stats: 'gomoku:stats', game: 'gomoku:game', last: 'gomoku:last' };
  const LEVELS = ['easy', 'normal', 'hard', 'master'];

  const DEFAULT_SETTINGS = {
    theme: 'wood',        // wood | ink | jade
    sound: true,
    haptics: true,
    numbers: false,       // 棋子上显示步数
    coords: true,         // 棋盘边缘显示坐标
    setup: { level: 'normal', side: 'black', forbidden: false },   // 上次的开局选择
  };

  function emptyStats() {
    const s = { streak: 0, best: 0, pvp: { black: 0, white: 0, draw: 0 } };
    for (const l of LEVELS) s[l] = { w: 0, l: 0, d: 0 };
    return s;
  }

  function memoryStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  }

  function create(storage) {
    let st = storage;
    if (!st) { try { st = window.localStorage; st.getItem('x'); } catch (e) { st = memoryStorage(); } }

    const read = (key, fallback) => {
      try {
        const v = st.getItem(key);
        const parsed = v ? JSON.parse(v) : null;
        return parsed !== null && typeof parsed === 'object' ? parsed : fallback;
      } catch (e) { return fallback; }
    };
    const write = (key, val) => { try { st.setItem(key, JSON.stringify(val)); } catch (e) { /* 空间不足或被禁用 */ } };

    return {
      getSettings() {
        const s = read(KEYS.settings, {});
        return Object.assign({}, DEFAULT_SETTINGS, s, { setup: Object.assign({}, DEFAULT_SETTINGS.setup, s.setup) });
      },
      saveSettings(s) { write(KEYS.settings, s); },

      getStats() {
        const base = emptyStats(), s = read(KEYS.stats, {});
        for (const l of LEVELS) base[l] = Object.assign(base[l], s[l]);
        base.pvp = Object.assign(base.pvp, s.pvp);
        base.streak = s.streak || 0; base.best = s.best || 0;
        return base;
      },

      /* 人机对局结果：outcome 为 'win' | 'loss' | 'draw'（相对玩家）。 */
      recordAI(level, outcome) {
        const s = this.getStats();
        if (!s[level]) return s;
        if (outcome === 'win') { s[level].w++; s.streak++; s.best = Math.max(s.best, s.streak); }
        else if (outcome === 'loss') { s[level].l++; s.streak = 0; }
        else s[level].d++;
        write(KEYS.stats, s);
        return s;
      },

      recordPvp(winner) {   // 'black' | 'white' | 'draw'
        const s = this.getStats();
        s.pvp[winner]++;
        write(KEYS.stats, s);
        return s;
      },

      resetStats() { write(KEYS.stats, emptyStats()); },

      /* 进行中（或刚结束）的对局：{mode, level, human, forbidden, moves:[[x,y]], counted, resigned} */
      getGame() { return read(KEYS.game, null); },
      saveGame(g) { write(KEYS.game, g); },
      clearGame() { try { st.removeItem(KEYS.game); } catch (e) { /* ignore */ } },
    };
  }

  return { create, memoryStorage, DEFAULT_SETTINGS, LEVELS };
});
