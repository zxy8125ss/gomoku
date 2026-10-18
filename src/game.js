/* 对局状态：落子、悔棋、认输、胜负判定、禁手。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.GomokuGame = factory(root.GomokuRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  class Game {
    /* opts.forbidden：开启黑棋禁手（三三、四四、长连），黑棋须恰好五连才算赢。 */
    constructor(size = R.SIZE, opts = {}) {
      this.size = size;
      this.forbidden = !!opts.forbidden;
      this.reset();
    }

    reset() {
      this.board = R.createBoard(this.size);
      this.moves = [];            // [{x,y,player}]
      this.turn = R.BLACK;        // 黑先
      this.winner = null;         // BLACK | WHITE | 'draw' | null
      this.winLine = null;
      this.resigned = false;
      this.error = null;          // 最近一次非法落子的原因
    }

    get over() { return this.winner !== null; }

    canPlay(x, y) {
      return !this.over && R.inBoard(this.board, x, y) && this.board[y][x] === R.EMPTY;
    }

    /* 该点对当前行棋方是否为禁手；返回原因文字或 null。 */
    forbiddenAt(x, y) {
      if (!this.forbidden || this.turn !== R.BLACK || !this.canPlay(x, y)) return null;
      return R.forbiddenReason(this.board, x, y);
    }

    play(x, y) {
      this.error = null;
      if (!this.canPlay(x, y)) return false;
      const reason = this.forbiddenAt(x, y);
      if (reason) { this.error = `${reason}禁手`; return false; }
      const player = this.turn;
      this.board[y][x] = player;
      this.moves.push({ x, y, player });
      const exact = this.forbidden && player === R.BLACK;
      const line = R.findWinLine(this.board, x, y, exact);
      if (line) { this.winner = player; this.winLine = line; }
      else if (this.moves.length === this.size * this.size) this.winner = 'draw';
      else this.turn = R.opponent(player);
      return true;
    }

    resign(player = this.turn) {
      if (this.over) return false;
      this.winner = R.opponent(player);
      this.resigned = true;
      return true;
    }

    /* 撤销最近一步，返回是否成功。 */
    undo() {
      if (this.resigned) { this.winner = null; this.resigned = false; return true; }
      const last = this.moves.pop();
      if (!last) return false;
      this.board[last.y][last.x] = R.EMPTY;
      this.turn = last.player;
      this.winner = null;
      this.winLine = null;
      return true;
    }

    get lastMove() { return this.moves[this.moves.length - 1] || null; }

    /* 取前 k 步的局面（用于复盘），返回新的 Game。 */
    snapshot(k) {
      const g = new Game(this.size, { forbidden: this.forbidden });
      for (const m of this.moves.slice(0, k)) g.play(m.x, m.y);
      return g;
    }
  }

  return { Game };
});
