/* 五子棋规则：纯函数，无 DOM 依赖，浏览器与 Node 通用。 */
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

  /* 以 (x,y) 为中心检查是否连成五子（含长连），返回连线上的所有格子，否则 null。 */
  function findWinLine(board, x, y) {
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
      if (line.length >= 5) return line;
    }
    return null;
  }

  function isFull(board) {
    return board.every(row => row.every(c => c !== EMPTY));
  }

  return { SIZE, EMPTY, BLACK, WHITE, DIRS, createBoard, inBoard, opponent, findWinLine, isFull };
});
