/*
 * 五子棋 AI。
 *  - 入门：单步启发式评分（五格窗口），偶尔“手滑”。
 *  - 普通 / 困难 / 大师：带迭代加深的 alpha-beta（negamax）搜索，
 *    候选点按启发式评分排序并裁剪，必胜 / 必堵直接处理，到时限即返回上一层的最优解。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.GomokuAI = factory(root.GomokuRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  const { EMPTY, BLACK, WHITE, DIRS, inBoard, opponent } = R;

  const FIVE = 1e6;
  const MATE = 1e7;

  /* ---------------- 启发式：单点评分 ---------------- */

  // 五格窗口内己方棋子数 → 分值（窗口内没有对方棋子才计分）
  const WINDOW_SCORE = [0, 1, 12, 150, 3000, FIVE];

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

  /* ---------------- 静态局面评估 ---------------- */

  const EVAL = [0, 1, 9, 90, 1000, 1e5];
  let fourBlack = false, fourWhite = false;   // evaluate 的副产物：谁有“再下一子就五连”

  /* 全盘五格窗口扫描，返回 黑 - 白 的分值。 */
  function evaluate(board) {
    const n = board.length;
    let s = 0;
    fourBlack = fourWhite = false;
    for (const [dx, dy] of DIRS) {
      for (let y = 0; y < n; y++) {
        const ey = y + dy * 4;
        if (ey < 0 || ey >= n) continue;
        for (let x = 0; x < n; x++) {
          const ex = x + dx * 4;
          if (ex < 0 || ex >= n) continue;
          let b = 0, w = 0;
          for (let i = 0; i < 5; i++) {
            const c = board[y + dy * i][x + dx * i];
            if (c === BLACK) b++; else if (c === WHITE) w++;
          }
          if (b && !w) { s += EVAL[b]; if (b === 4) fourBlack = true; }
          else if (w && !b) { s -= EVAL[w]; if (w === 4) fourWhite = true; }
        }
      }
    }
    return s;
  }

  /* ---------------- 搜索 ---------------- */

  const LEVELS = {
    easy:   { kind: 'heuristic', defense: 0.6, pick: 5, mistake: 0.25 },
    normal: { kind: 'search', maxDepth: 2, timeMs: 500,  breadth: [10, 8] },
    hard:   { kind: 'search', maxDepth: 6, timeMs: 1200, breadth: [12, 8, 6, 6, 5, 5] },
    master: { kind: 'search', maxDepth: 12, timeMs: 3000, breadth: [14, 10, 8, 7, 6, 6, 5, 5, 4, 4, 4, 4] },
  };

  function createContext(board, opts, cfg) {
    const n = board.length;
    const stones = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (board[y][x] !== EMPTY) stones.push([x, y]);
    return {
      board, n, stones,
      mark: new Int32Array(n * n), stamp: 0,
      forbidden: !!opts.forbidden,
      breadth: opts.breadth || cfg.breadth,
      deadline: Date.now() + (opts.timeMs != null ? opts.timeMs : cfg.timeMs),
      nodes: 0, aborted: false,
    };
  }

  /*
   * 生成并排序 player 的候选着法。
   * 返回已按“必胜 > 必堵 > 启发式分”处理好的列表（最多 limit 个）。
   */
  function genMoves(ctx, player, limit) {
    const { board, n } = ctx;
    const foes = opponent(player);
    ctx.stamp++;
    const out = [];
    for (const [sx, sy] of ctx.stones) {
      for (let dy = -2; dy <= 2; dy++) {
        const cy = sy + dy;
        if (cy < 0 || cy >= n) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const cx = sx + dx;
          if (cx < 0 || cx >= n || board[cy][cx] !== EMPTY) continue;
          const idx = cy * n + cx;
          if (ctx.mark[idx] === ctx.stamp) continue;
          ctx.mark[idx] = ctx.stamp;
          const atk = scoreAt(board, cx, cy, player);
          const def = scoreAt(board, cx, cy, foes);
          const center = 1 - (Math.abs(cx - 7) + Math.abs(cy - 7)) / n;
          out.push({ x: cx, y: cy, atk, def, s: atk + def * 1.05 + center });
        }
      }
    }
    if (!out.length) {
      if (!ctx.stones.length) out.push({ x: n >> 1, y: n >> 1, atk: 0, def: 0, s: 0 });
      return out;
    }

    // 黑棋禁手：只对“有可能形成多重威胁”的点做昂贵的判定
    let list = out;
    if (ctx.forbidden && player === BLACK) {
      list = out.filter(m => m.atk < 150 || !R.forbiddenReason(board, m.x, m.y));
      if (!list.length) list = out;
    }

    const win = list.find(m => m.atk >= FIVE);
    if (win) return [win];
    const blocks = list.filter(m => m.def >= FIVE);
    const pool = blocks.length ? blocks : list;
    pool.sort((a, b) => b.s - a.s);
    return pool.length > limit ? pool.slice(0, limit) : pool;
  }

  function negamax(ctx, player, depth, alpha, beta, ply) {
    if (ctx.aborted) return 0;
    if ((++ctx.nodes & 127) === 0 && Date.now() > ctx.deadline) { ctx.aborted = true; return 0; }
    const { board } = ctx;

    if (depth === 0) {
      const sc = evaluate(board);
      // 轮到我且我已有“四”，下一手必成五
      if (player === BLACK ? fourBlack : fourWhite) return MATE - ply - 1;
      return player === BLACK ? sc : -sc;
    }

    const limit = ctx.breadth[Math.min(ply, ctx.breadth.length - 1)] || 5;
    const moves = genMoves(ctx, player, limit);
    if (!moves.length) return 0;
    if (moves[0].atk >= FIVE) return MATE - ply;

    const foes = opponent(player);
    let best = -Infinity;
    for (const m of moves) {
      board[m.y][m.x] = player;
      ctx.stones.push([m.x, m.y]);
      const sc = -negamax(ctx, foes, depth - 1, -beta, -alpha, ply + 1);
      ctx.stones.pop();
      board[m.y][m.x] = EMPTY;
      if (ctx.aborted) return 0;
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }

  function searchMove(board, player, cfg, opts, rng) {
    const ctx = createContext(board, opts, cfg);
    const maxDepth = opts.maxDepth != null ? opts.maxDepth : cfg.maxDepth;
    const rootLimit = ctx.breadth[0] || 10;

    // 开局：随机落在天元附近，避免每盘一模一样
    if (ctx.stones.length <= 1) {
      const c = ctx.n >> 1;
      if (!ctx.stones.length) return { x: c, y: c, depth: 0 };
      const [sx, sy] = ctx.stones[0];
      const opts9 = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = sx + dx, y = sy + dy;
        if ((dx || dy) && inBoard(board, x, y) && board[y][x] === EMPTY) opts9.push({ x, y, depth: 0 });
      }
      if (opts9.length) return opts9[Math.floor(rng() * opts9.length)];
    }

    let roots = genMoves(ctx, player, rootLimit);
    if (!roots.length) return null;
    if (roots.length === 1) return { x: roots[0].x, y: roots[0].y, depth: 0 };

    const foes = opponent(player);
    let best = roots[0];
    let reached = 0, bestScore = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -Infinity, bestThis = null, completed = true;
      for (const m of roots) {
        board[m.y][m.x] = player;
        ctx.stones.push([m.x, m.y]);
        const sc = -negamax(ctx, foes, depth - 1, -Infinity, -alpha, 1);
        ctx.stones.pop();
        board[m.y][m.x] = EMPTY;
        if (ctx.aborted) { completed = false; break; }
        m.score = sc;
        if (sc > alpha) { alpha = sc; bestThis = m; }
      }
      if (!completed) break;
      best = bestThis; reached = depth; bestScore = alpha;
      roots = roots.slice().sort((a, b) => b.score - a.score);   // 下一层先搜上一层最好的
      if (Math.abs(alpha) > MATE - 200) break;                   // 已经看到必胜或必败
      if (Date.now() > ctx.deadline) break;
    }
    return { x: best.x, y: best.y, depth: reached, score: bestScore, nodes: ctx.nodes };
  }

  /* ---------------- 入门级启发式 ---------------- */

  function heuristicMove(board, player, cfg, rng) {
    const foes = opponent(player);
    const n = board.length, mid = (n - 1) / 2;
    const scored = candidates(board).map(([x, y]) => {
      const atk = scoreAt(board, x, y, player);
      const def = scoreAt(board, x, y, foes);
      const center = 1 - (Math.abs(x - mid) + Math.abs(y - mid)) / n;
      let s = atk + def * cfg.defense + center;
      if (atk >= FIVE) s += 1e9;      // 我能直接成五
      else if (def >= FIVE) s += 1e8; // 必须堵对方的五
      return { x, y, s };
    });
    scored.sort((a, b) => b.s - a.s);
    const forced = scored[0].s >= 1e8;
    if (!forced && cfg.mistake && rng() < cfg.mistake) {
      const pool = scored.slice(0, Math.min(cfg.pick + 3, scored.length));
      const m = pool[Math.floor(rng() * pool.length)];
      return { x: m.x, y: m.y, depth: 0 };
    }
    const pool = scored.slice(0, forced ? 1 : Math.min(cfg.pick, scored.length));
    const m = pool[Math.floor(rng() * pool.length)];
    return { x: m.x, y: m.y, depth: 0 };
  }

  /*
   * 选一步。返回 {x, y, depth, ...}。
   * opts：forbidden（黑棋禁手）、timeMs / maxDepth（覆盖难度默认值）、rng（可注入，便于测试）。
   */
  function chooseMoveDetailed(board, player, level = 'normal', opts = {}) {
    const cfg = LEVELS[level] || LEVELS.normal;
    const rng = opts.rng || Math.random;
    // 搜索会临时落子，所以在副本上进行，调用方的棋盘不受影响
    const work = board.map(row => row.slice());
    if (cfg.kind === 'heuristic') return heuristicMove(work, player, cfg, rng);
    return searchMove(work, player, cfg, opts, rng);
  }

  /* 兼容旧接口：返回 [x, y]。 */
  function chooseMove(board, player, level = 'normal', rng = Math.random, opts = {}) {
    const m = chooseMoveDetailed(board, player, level, Object.assign({ rng }, opts));
    return [m.x, m.y];
  }

  return { chooseMove, chooseMoveDetailed, scoreAt, candidates, evaluate, LEVELS };
});
