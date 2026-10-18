/* 对局状态：落子、悔棋、胜负判定。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.GomokuGame = factory(root.GomokuRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  class Game {
    constructor(size = R.SIZE) {
      this.size = size;
      this.reset();
    }

    reset() {
      this.board = R.createBoard(this.size);
      this.moves = [];            // [{x,y,player}]
      this.turn = R.BLACK;        // 黑先
      this.winner = null;         // BLACK | WHITE | 'draw' | null
      this.winLine = null;
    }

    get over() { return this.winner !== null; }

    canPlay(x, y) {
      return !this.over && R.inBoard(this.board, x, y) && this.board[y][x] === R.EMPTY;
    }

    play(x, y) {
      if (!this.canPlay(x, y)) return false;
      const player = this.turn;
      this.board[y][x] = player;
      this.moves.push({ x, y, player });
      const line = R.findWinLine(this.board, x, y);
      if (line) { this.winner = player; this.winLine = line; }
      else if (this.moves.length === this.size * this.size) this.winner = 'draw';
      else this.turn = R.opponent(player);
      return true;
    }

    /* 撤销最近一步，返回是否成功。 */
    undo() {
      const last = this.moves.pop();
      if (!last) return false;
      this.board[last.y][last.x] = R.EMPTY;
      this.turn = last.player;
      this.winner = null;
      this.winLine = null;
      return true;
    }

    get lastMove() { return this.moves[this.moves.length - 1] || null; }
  }

  return { Game };
});
