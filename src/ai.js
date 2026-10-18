/*
 * 五子棋 AI：基于“五格窗口”的启发式评分。
 * 对每个候选空位，分别评估“我下这里能形成什么”（进攻）和
 * “对手下这里能形成什么”（防守），两者相加取最高分。
 * 窗口法天然覆盖活三、冲四、跳三（X_XX）等形状。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.GomokuAI = factory(root.GomokuRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  const { EMPTY, DIRS, inBoard, opponent } = R;

  // 五格窗口内己方棋子数 → 分值（窗口内没有对方棋子才计分）
  const WINDOW_SCORE = [0, 1, 12, 150, 3000, 1e6];

  /* 假设 player 落在 (x,y)，计算该点沿四个方向的形状得分。 */
  function scoreAt(board, x, y, player) {
    let total = 0;
    const foes = opponent(player);
    for (const [dx, dy] of DIRS) {
      // 取该方向 -4..+4 共 9 格；越界视为对方棋子（挡住）
      const cells = [];
      for (let k = -4; k <= 4; k++) {
        const cx = x + dx * k, cy = y + dy * k;
        if (!inBoard(board, cx, cy)) cells.push(foes);
        else cells.push(k === 0 ? player : board[cy][cx]);
      }
      for (let start = 0; start <= 4; start++) {
        let mine = 0, blocked = false;
        for (let i = start; i < start + 5; i++) {
          if (cells[i] === foes) { blocked = true; break; }
          if (cells[i] === player) mine++;
        }
        if (!blocked) total += WINDOW_SCORE[mine];
      }
    }
    return total;
  }

  /* 只考虑已有棋子周围 2 格内的空位，开局时返回天元。 */
  function candidates(board) {
    const n = board.length;
    const seen = new Set();
    const out = [];
    let any = false;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (board[y][x] === EMPTY) continue;
        any = true;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const cx = x + dx, cy = y + dy;
            if (!inBoard(board, cx, cy) || board[cy][cx] !== EMPTY) continue;
            const key = cy * n + cx;
            if (!seen.has(key)) { seen.add(key); out.push([cx, cy]); }
          }
        }
      }
    }
    if (!any) out.push([n >> 1, n >> 1]);
    return out;
  }

  const LEVELS = {
    easy:   { defense: 0.6, pick: 5, mistake: 0.25 },
    normal: { defense: 1.0, pick: 1, mistake: 0 },
    hard:   { defense: 1.15, pick: 1, mistake: 0 },
  };

  /* 返回 [x, y]；rng 可注入以便测试。 */
  function chooseMove(board, player, level = 'normal', rng = Math.random) {
    const cfg = LEVELS[level] || LEVELS.normal;
    const foes = opponent(player);
    const n = board.length, mid = (n - 1) / 2;
    const scored = candidates(board).map(([x, y]) => {
      const atk = scoreAt(board, x, y, player);
      const def = scoreAt(board, x, y, foes);
      // 轻微偏向棋盘中央，打破同分
      const center = 1 - (Math.abs(x - mid) + Math.abs(y - mid)) / n;
      let s = atk + def * cfg.defense + center;
      if (atk >= WINDOW_SCORE[5]) s += 1e9;      // 我能直接成五
      else if (def >= WINDOW_SCORE[5]) s += 1e8; // 必须堵对方的五
      return { x, y, s };
    });
    scored.sort((a, b) => b.s - a.s);

    // 必胜 / 必堵永远不犯错，简单难度只在其他情况下偶尔“手滑”
    const forced = scored[0].s >= 1e8;
    if (!forced && cfg.mistake && rng() < cfg.mistake) {
      const pool = scored.slice(0, Math.min(cfg.pick + 3, scored.length));
      const m = pool[Math.floor(rng() * pool.length)];
      return [m.x, m.y];
    }
    const pool = scored.slice(0, forced ? 1 : Math.min(cfg.pick, scored.length));
    const m = pool[Math.floor(rng() * pool.length)];
    return [m.x, m.y];
  }

  return { chooseMove, scoreAt, candidates, LEVELS };
});
