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


/* ---------- 禁手 ---------- */
const put = (b, color, pts) => pts.forEach(([x, y]) => { b[y][x] = color; });

t('禁手：长连(六连)', () => {
  const b = R.createBoard();
  put(b, R.BLACK, [[3, 7], [4, 7], [5, 7], [7, 7], [8, 7]]);
  assert.strictEqual(R.forbiddenReason(b, 6, 7), '长连');
});

t('禁手：恰好五连永远不是禁手', () => {
  const b = R.createBoard();
  put(b, R.BLACK, [[3, 7], [4, 7], [5, 7], [6, 7]]);
  assert.strictEqual(R.forbiddenReason(b, 7, 7), null);
});

t('禁手：三三', () => {
  const b = R.createBoard();
  put(b, R.BLACK, [[5, 7], [6, 7], [7, 5], [7, 6]]);
  assert.strictEqual(R.forbiddenReason(b, 7, 7), '三三');
});

t('禁手：其中一个三被堵死则不算三三', () => {
  const b = R.createBoard();
  put(b, R.BLACK, [[5, 7], [6, 7], [7, 5], [7, 6]]);
  put(b, R.WHITE, [[4, 7]]);
  assert.strictEqual(R.forbiddenReason(b, 7, 7), null);
});

t('禁手：跳三(X_XX)同样算活三', () => {
  const b = R.createBoard();
  put(b, R.BLACK, [[5, 7], [6, 7], [7, 4], [7, 6]]);   // 横：5,6,(7)  竖：4,_,6,(7) 跳三
  assert.strictEqual(R.forbiddenReason(b, 7, 7), '三三');
});

t('禁手：四四', () => {
  const b = R.createBoard();
  put(b, R.BLACK, [[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]);
  assert.strictEqual(R.forbiddenReason(b, 7, 7), '四四');
});

t('禁手：四三是允许的', () => {
  const b = R.createBoard();
  put(b, R.BLACK, [[4, 7], [5, 7], [6, 7], [7, 5], [7, 6]]);
  assert.strictEqual(R.forbiddenReason(b, 7, 7), null);
});

t('禁手：只对黑棋生效，白棋可以三三', () => {
  const g = new Game(15, { forbidden: true });
  g.board[7][5] = g.board[7][6] = R.WHITE; g.board[5][7] = g.board[6][7] = R.WHITE;
  g.turn = R.WHITE;
  assert(g.play(7, 7));
});

t('Game：开启禁手后黑棋禁手点被拒绝并给出原因', () => {
  const g = new Game(15, { forbidden: true });
  put(g.board, R.BLACK, [[5, 7], [6, 7], [7, 5], [7, 6]]);
  assert(!g.play(7, 7));
  assert.strictEqual(g.error, '三三禁手');
  assert.strictEqual(g.moves.length, 0);
});

t('Game：禁手模式下黑棋须恰好五连才赢，白棋长连也算赢', () => {
  const g = new Game(15, { forbidden: true });
  for (let i = 0; i < 4; i++) { g.play(i, 0); g.play(i, 2); }
  g.play(4, 0);
  assert.strictEqual(g.winner, R.BLACK);
  const h = new Game();           // 普通规则：长连算赢
  put(h.board, R.BLACK, [[3, 7], [4, 7], [5, 7], [7, 7], [8, 7]]);
  assert(h.play(6, 7)); assert.strictEqual(h.winner, R.BLACK);
});

t('Game：认输与撤销认输', () => {
  const g = new Game();
  g.play(7, 7);
  assert(g.resign(R.WHITE));
  assert.strictEqual(g.winner, R.BLACK);
  assert(g.undo());
  assert.strictEqual(g.winner, null);
  assert.strictEqual(g.moves.length, 1);
});

t('Game：snapshot 复盘到第 k 步', () => {
  const g = new Game();
  g.play(7, 7); g.play(8, 8); g.play(7, 8);
  const s = g.snapshot(2);
  assert.strictEqual(s.moves.length, 2);
  assert.strictEqual(s.board[8][7], R.EMPTY);
});

/* ---------- 搜索 AI ---------- */
t('搜索 AI：有活三时走出活四(必胜)', () => {
  const b = R.createBoard();
  put(b, R.BLACK, [[6, 7], [7, 7], [8, 7]]);
  put(b, R.WHITE, [[6, 5], [8, 9], [3, 3]]);
  for (const level of ['normal', 'hard', 'master']) {
    const [x, y] = AI.chooseMove(b, R.BLACK, level, Math.random, { timeMs: 300 });
    b[y][x] = R.BLACK;
    assert(R.isOpenFour(b, x, y, 1, 0) || R.isOpenFour(b, x, y, 0, 1) || R.isOpenFour(b, x, y, 1, 1) || R.isOpenFour(b, x, y, 1, -1), `${level} 没走活四: ${x},${y}`);
    b[y][x] = R.EMPTY;
  }
});

t('搜索 AI：对手有活三时必须处理(堵或反击)，不能放任变活四', () => {
  const b = R.createBoard();
  put(b, R.BLACK, [[6, 7], [7, 7], [8, 7]]);
  put(b, R.WHITE, [[7, 6], [3, 3]]);
  for (const level of ['normal', 'hard', 'master']) {
    const [x, y] = AI.chooseMove(b, R.WHITE, level, Math.random, { timeMs: 300 });
    assert(y === 7 && [5, 9, 4, 10].includes(x), `${level} 没处理活三: ${x},${y}`);
  }
});

t('搜索 AI：不修改传入的棋盘', () => {
  const g = new Game();
  put(g.board, R.BLACK, [[7, 7], [8, 8]]); put(g.board, R.WHITE, [[7, 8]]);
  const before = JSON.stringify(g.board);
  AI.chooseMove(g.board, R.WHITE, 'hard', Math.random, { timeMs: 200 });
  assert.strictEqual(JSON.stringify(g.board), before);
});

t('搜索 AI：时限内返回(master 限时 300ms)', () => {
  const g = new Game();
  put(g.board, R.BLACK, [[7, 7], [8, 8], [6, 8], [9, 7]]); put(g.board, R.WHITE, [[7, 8], [8, 7], [7, 6], [6, 7]]);
  const t0 = Date.now();
  AI.chooseMove(g.board, R.BLACK, 'master', Math.random, { timeMs: 300 });
  assert(Date.now() - t0 < 900, `耗时 ${Date.now() - t0}ms`);
});

t('禁手模式下 AI 自对弈：每一手都合法，黑棋从不犯禁', () => {
  for (let i = 0; i < 4; i++) {
    const g = new Game(15, { forbidden: true });
    let guard = 0;
    while (!g.over && guard++ < 250) {
      const lvl = i % 2 ? 'hard' : 'normal';
      const m = AI.chooseMoveDetailed(g.board, g.turn, lvl, { forbidden: true, timeMs: 150 });
      assert(g.play(m.x, m.y), `第${g.moves.length + 1}手非法 ${m.x},${m.y}: ${g.error}`);
    }
    assert(g.over, '应分出胜负');
  }
});


/* ---------- 存储 ---------- */
const Store = require('../src/store.js');

t('Store：默认设置、保存与合并', () => {
  const st = Store.create(Store.memoryStorage());
  assert.strictEqual(st.getSettings().theme, 'wood');
  st.saveSettings({ theme: 'ink', setup: { level: 'hard' } });
  const s = st.getSettings();
  assert.strictEqual(s.theme, 'ink');
  assert.strictEqual(s.sound, true);              // 未保存的字段取默认值
  assert.strictEqual(s.setup.level, 'hard');
  assert.strictEqual(s.setup.side, 'black');      // 嵌套字段同样合并
});

t('Store：战绩与连胜', () => {
  const st = Store.create(Store.memoryStorage());
  st.recordAI('hard', 'win'); st.recordAI('hard', 'win'); st.recordAI('hard', 'win');
  let s = st.recordAI('hard', 'loss');
  assert.deepStrictEqual(s.hard, { w: 3, l: 1, d: 0 });
  assert.strictEqual(s.streak, 0); assert.strictEqual(s.best, 3);
  st.recordAI('easy', 'draw'); st.recordPvp('black');
  s = st.getStats();
  assert.strictEqual(s.easy.d, 1); assert.strictEqual(s.pvp.black, 1);
  st.resetStats();
  assert.strictEqual(st.getStats().hard.w, 0);
});

t('Store：存档读写、损坏数据不崩溃', () => {
  const mem = Store.memoryStorage();
  const st = Store.create(mem);
  assert.strictEqual(st.getGame(), null);
  st.saveGame({ mode: 'ai', moves: [[7, 7]] });
  assert.deepStrictEqual(st.getGame().moves, [[7, 7]]);
  st.clearGame(); assert.strictEqual(st.getGame(), null);
  mem.setItem('gomoku:stats', '{坏的json'); mem.setItem('gomoku:settings', 'null');
  assert.strictEqual(st.getStats().streak, 0);
  assert.strictEqual(st.getSettings().theme, 'wood');
});

console.log(`\n${passed} 项测试通过`);
