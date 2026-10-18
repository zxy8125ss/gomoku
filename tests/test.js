const assert = require('assert');
const R = require('../src/rules.js');
const { Game } = require('../src/game.js');
const AI = require('../src/ai.js');

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok -', name); };

t('横竖斜五连均判胜', () => {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const b = R.createBoard();
    const sx = dy === -1 ? 3 : 3, sy = dy === -1 ? 9 : 3;
    for (let i = 0; i < 5; i++) b[sy + dy * i][sx + dx * i] = R.BLACK;
    assert(R.findWinLine(b, sx + dx * 2, sy + dy * 2), `dir ${dx},${dy}`);
  }
});

t('四连不算胜，长连(六连)算胜', () => {
  const b = R.createBoard();
  for (let i = 0; i < 4; i++) b[7][i] = R.WHITE;
  assert.strictEqual(R.findWinLine(b, 2, 7), null);
  for (let i = 4; i < 6; i++) b[7][i] = R.WHITE;
  assert.strictEqual(R.findWinLine(b, 2, 7).length, 6);
});

t('Game：黑先、交替落子、不可重复落子', () => {
  const g = new Game();
  assert(g.play(7, 7)); assert.strictEqual(g.turn, R.WHITE);
  assert(!g.play(7, 7));
  assert(g.play(8, 7)); assert.strictEqual(g.turn, R.BLACK);
});

t('Game：黑方五连获胜后禁止继续落子，悔棋可恢复', () => {
  const g = new Game();
  for (let i = 0; i < 4; i++) { g.play(i, 0); g.play(i, 1); }
  g.play(4, 0);
  assert.strictEqual(g.winner, R.BLACK);
  assert(!g.play(10, 10));
  assert(g.undo());
  assert.strictEqual(g.winner, null);
  assert.strictEqual(g.turn, R.BLACK);
  assert(g.play(4, 0));
});

t('AI：开局落天元', () => {
  const [x, y] = AI.chooseMove(R.createBoard(), R.BLACK, 'hard');
  assert.deepStrictEqual([x, y], [7, 7]);
});

t('AI：能一步成五就直接赢', () => {
  const b = R.createBoard();
  for (let i = 0; i < 4; i++) b[5][3 + i] = R.WHITE;   // 白四连 (3..6, 5)
  for (let i = 0; i < 3; i++) b[9][i] = R.BLACK;
  const [x, y] = AI.chooseMove(b, R.WHITE, 'hard');
  assert.strictEqual(y, 5); assert([2, 7].includes(x));
});

t('AI：对手四连时必须堵', () => {
  const b = R.createBoard();
  for (let i = 0; i < 4; i++) b[5][3 + i] = R.BLACK;   // 黑四连，两端 2 与 7
  b[2][2] = R.WHITE;
  for (const level of ['easy', 'normal', 'hard']) {
    for (let k = 0; k < 50; k++) {
      const [x, y] = AI.chooseMove(b, R.WHITE, level);
      assert(y === 5 && (x === 2 || x === 7), `${level} 没堵: ${x},${y}`);
    }
  }
});

t('AI：优先堵活三(开放三)而不是乱下', () => {
  const b = R.createBoard();
  b[7][6] = b[7][7] = b[7][8] = R.BLACK; // 活三
  b[3][3] = R.WHITE;
  const [x, y] = AI.chooseMove(b, R.WHITE, 'normal');
  assert(y === 7 && (x === 5 || x === 9), `没堵活三: ${x},${y}`);
});

t('AI 自对弈：能正常下完且不越界/不重复', () => {
  const g = new Game();
  let guard = 0;
  while (!g.over && guard++ < 300) {
    const [x, y] = AI.chooseMove(g.board, g.turn, 'normal');
    assert(g.play(x, y), `非法落子 ${x},${y}`);
  }
  assert(g.over, '300 步内应分出结果');
});

t('强 AI 对 弱 AI：困难应不输简单', () => {
  let hardWins = 0, easyWins = 0;
  for (let i = 0; i < 6; i++) {
    const g = new Game();
    const hardIsBlack = i % 2 === 0;
    while (!g.over) {
      const hardTurn = (g.turn === R.BLACK) === hardIsBlack;
      const [x, y] = AI.chooseMove(g.board, g.turn, hardTurn ? 'hard' : 'easy');
      g.play(x, y);
    }
    if (g.winner === 'draw') continue;
    ((g.winner === R.BLACK) === hardIsBlack ? hardWins++ : easyWins++);
  }
  console.log(`   困难胜 ${hardWins} / 简单胜 ${easyWins}`);
  assert(hardWins >= easyWins);
});

console.log(`\n${passed} 项测试通过`);
