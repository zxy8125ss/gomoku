/* 五子棋规则：纯函数，无 DOM 依赖，浏览器、Worker 与 Node 通用。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GomokuRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SIZE = 15;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function createBoard(size = SIZE) {
    return Array.from({ length: size }, () => new Array(size).fill(EMPTY));
  }

  function inBoard(board, x, y) {
    return y >= 0 && y < board.length && x >= 0 && x < board.length;
  }

  function opponent(p) {
    return p === BLACK ? WHITE : BLACK;
  }

  /* 经过 (x,y)、沿 (dx,dy) 方向的连续同色棋子数。 */
  function runLength(board, x, y, dx, dy) {
    const p = board[y][x];
    let n = 1;
    for (const s of [1, -1]) {
      let cx = x + dx * s, cy = y + dy * s;
      while (inBoard(board, cx, cy) && board[cy][cx] === p) {
        n++; cx += dx * s; cy += dy * s;
      }
    }
    return n;
  }

  /*
   * 以 (x,y) 为中心检查是否连成五子，返回连线上的所有格子，否则 null。
   * exact=true 时只承认恰好五连（职业规则下黑棋长连不算赢）。
   */
  function findWinLine(board, x, y, exact = false) {
    const p = board[y][x];
    if (p === EMPTY) return null;
    for (const [dx, dy] of DIRS) {
      const line = [[x, y]];
      for (const s of [1, -1]) {
        let cx = x + dx * s, cy = y + dy * s;
        while (inBoard(board, cx, cy) && board[cy][cx] === p) {
          line.push([cx, cy]);
          cx += dx * s; cy += dy * s;
        }
      }
      if (exact ? line.length === 5 : line.length >= 5) return line;
    }
    return null;
  }

  function isFull(board) {
    return board.every(row => row.every(c => c !== EMPTY));
  }

  /* (x,y) 处已有的棋子在 (dx,dy) 方向是否构成“活四”：恰好四连，两端为空，且任一端补上都是恰好五连。 */
  function isOpenFour(board, x, y, dx, dy) {
    const p = board[y][x];
    let ax = x, ay = y, n = 1;
    while (inBoard(board, ax + dx, ay + dy) && board[ay + dy][ax + dx] === p) { ax += dx; ay += dy; n++; }
    let bx = x, by = y;
    while (inBoard(board, bx - dx, by - dy) && board[by - dy][bx - dx] === p) { bx -= dx; by -= dy; n++; }
    if (n !== 4) return false;
    const free = (cx, cy) => inBoard(board, cx, cy) && board[cy][cx] === EMPTY;
    const notP = (cx, cy) => !inBoard(board, cx, cy) || board[cy][cx] !== p;
    return free(ax + dx, ay + dy) && free(bx - dx, by - dy)
      && notP(ax + 2 * dx, ay + 2 * dy) && notP(bx - 2 * dx, by - 2 * dy);
  }

  /*
   * 黑棋禁手判定（连珠规则）。(x,y) 必须是空点，按黑棋落子假设判断。
   * 返回 null（不是禁手）或 '长连' / '四四' / '三三'。
   * 恰好五连的落子永远不是禁手。
   * 简化说明：同一条线上的“双四”（如 X_XXX_X）按一个四计，属极罕见形状。
   */
  function forbiddenReason(board, x, y, depth = 0) {
    if (board[y][x] !== EMPTY) return null;
    board[y][x] = BLACK;
    try {
      let overline = false;
      for (const [dx, dy] of DIRS) {
        const n = runLength(board, x, y, dx, dy);
        if (n === 5) return null;
        if (n >= 6) overline = true;
      }
      if (overline) return '长连';

      let fours = 0, threes = 0;
      for (const [dx, dy] of DIRS) {
        const n0 = runLength(board, x, y, dx, dy);
        let hasFour = false, hasThree = false;
        for (let k = -4; k <= 4; k++) {
          if (k === 0) continue;
          const cx = x + dx * k, cy = y + dy * k;
          if (!inBoard(board, cx, cy) || board[cy][cx] !== EMPTY) continue;
          board[cy][cx] = BLACK;
          const n = runLength(board, x, y, dx, dy);
          let openFour = false;
          if (n > n0 && n === 4) openFour = isOpenFour(board, x, y, dx, dy);
          board[cy][cx] = EMPTY;
          if (n > n0 && n === 5) hasFour = true;
          // 只有当补的那一子本身不是禁手时，才算真正的活三
          else if (openFour && (depth >= 2 || !forbiddenReason(board, cx, cy, depth + 1))) hasThree = true;
        }
        if (hasFour) fours++;
        else if (hasThree) threes++;
      }
      if (fours >= 2) return '四四';
      if (threes >= 2) return '三三';
      return null;
    } finally {
      board[y][x] = EMPTY;
    }
  }

  return {
    SIZE, EMPTY, BLACK, WHITE, DIRS,
    createBoard, inBoard, opponent, runLength, findWinLine, isFull, isOpenFour, forbiddenReason,
  };
});
