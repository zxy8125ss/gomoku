/*
 * 相声式解说：根据棋形挑台词。纯逻辑，无 DOM，浏览器与 Node 通用。
 * 两位虚构搭档：阿憨（逗哏，憨厚爱吃）和老稳（捧哏，冷静吐槽）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.GomokuCommentary = factory(root.GomokuRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  const { EMPTY, DIRS, inBoard, runLength, isOpenFour, opponent } = R;

  const WHO = { 憨: '阿憨', 稳: '老稳' };

  /* ---------------- 棋形识别 ---------------- */

  /* 假设 p 的棋子已在 (x,y)：统计该子形成的五连、活四、冲四数、活三数。 */
  function threatsAt(board, x, y, p) {
    const res = { five: false, openFour: false, fours: 0, threes: 0 };
    for (const [dx, dy] of DIRS) {
      const n0 = runLength(board, x, y, dx, dy);
      if (n0 >= 5) { res.five = true; continue; }
      const open4 = n0 === 4 && isOpenFour(board, x, y, dx, dy);
      let four = false, three = false;
      for (let k = -4; k <= 4; k++) {
        if (k === 0) continue;
        const cx = x + dx * k, cy = y + dy * k;
        if (!inBoard(board, cx, cy) || board[cy][cx] !== EMPTY) continue;
        board[cy][cx] = p;
        const m = runLength(board, x, y, dx, dy);
        if (m > n0) {
          if (m >= 5) four = true;
          else if (m === 4 && isOpenFour(board, x, y, dx, dy)) three = true;
        }
        board[cy][cx] = EMPTY;
      }
      if (open4) res.openFour = true;
      else if (four) res.fours++;
      else if (three) res.threes++;
    }
    return res;
  }

  /* 在空点 (x,y) 临时放 p，取威胁后还原。 */
  function threatsIfPlaced(board, x, y, p) {
    board[y][x] = p;
    try { return threatsAt(board, x, y, p); } finally { board[y][x] = EMPTY; }
  }

  const isDouble = t => t.fours >= 2 || t.threes >= 2 || (t.fours >= 1 && t.threes >= 1);

  /*
   * 分析一手棋。boardBefore 是落子前的棋盘（函数内会临时改动并还原）。
   * 返回 {event, keys}：event 是最重要的一个事件名。
   */
  function analyzeMove(boardBefore, move, moveCount = 0) {
    const { x, y, player } = move;
    const keys = [];

    const mine = threatsIfPlaced(boardBefore, x, y, player);
    const theirs = threatsIfPlaced(boardBefore, x, y, opponent(player));

    if (mine.five) keys.push('five');
    else if (mine.openFour) keys.push('openFour');
    else if (isDouble(mine)) keys.push('doubleThreat');
    else if (mine.fours) keys.push('four');
    else if (mine.threes) keys.push('openThree');

    if (theirs.five) keys.push('blockFour');                       // 对方有四，这里是它的成五点
    else if (isDouble(theirs)) keys.push('blockDouble');           // 对方的双杀点
    else if (theirs.openFour || theirs.fours) keys.push('blockThree');   // 对方有三，这里能让它成四

    const n = boardBefore.length, c = n >> 1;
    if (moveCount === 0 && x === c && y === c) keys.push('center');
    if (x === 0 || y === 0 || x === n - 1 || y === n - 1) keys.push('edge');
    keys.push('plain');

    const ORDER = ['five', 'openFour', 'doubleThreat', 'blockFour', 'four', 'blockDouble', 'openThree', 'blockThree', 'center', 'edge', 'plain'];
    const event = ORDER.find(k => keys.includes(k));
    return { event, keys };
  }

  /* ---------------- 台词 ---------------- */
  // 每条台词是一段对话：[['憨','…'], ['稳','…']]。每句尽量短，方便语音朗读。

  const LINES = {
    'start.ai': [
      [['憨', '各位好，我是阿憨，今天负责热场。'], ['稳', '我是老稳，负责不让他乱说。'], ['憨', '那我先说，我饿了。'], ['稳', '开局就说这个？']],
      [['憨', '老稳，这棋盘像不像一块大饼？'], ['稳', '像棋盘的就是棋盘。'], ['憨', '那五个子连一块，是不是五香？'], ['稳', '那叫五连。']],
      [['憨', '来了来了，人机大战！'], ['稳', '你紧张什么？'], ['憨', '我怕电脑算得比我炒菜还快。'], ['稳', '你炒菜也没人跟你比。']],
    ],
    'start.pvp': [
      [['憨', '两位高手面对面，空气都凝固了！'], ['稳', '空调没开而已。']],
      [['憨', '今天不分人脑电脑，只分输赢！'], ['稳', '这话终于像人话了。']],
    ],
    'start.forbidden': [
      [['憨', '这局有禁手，黑棋不能乱来。'], ['稳', '对，三三、四四、长连都不行。'], ['憨', '那我吃两碗面行吗？'], ['稳', '你先把规则看明白。']],
      [['憨', '禁手规则，黑棋要守规矩。'], ['稳', '先手占便宜，所以得限制一下。'], ['憨', '这叫劫富济贫。'], ['稳', '这叫公平。']],
    ],

    center: [
      [['憨', '天元开局，稳！'], ['稳', '这回你说对了。']],
      [['憨', '落在正中间，像包子的褶。'], ['稳', '那叫中心，不叫褶。']],
    ],
    edge: [
      [['憨', '这子下到边上了，是去看风景吗？'], ['稳', '边上的子，作用不大。']],
      [['憨', '这子是不是离家出走了？'], ['稳', '离中心太远，不是好兆头。']],
    ],
    plain: [
      [['憨', '嗯，这手很有想法。'], ['稳', '你看懂了吗？'], ['憨', '没看懂，但我先夸。']],
      [['稳', '这一手中规中矩。'], ['憨', '中规中矩，就是不出彩呗。']],
      [['憨', '慢慢来，不着急，棋如人生。'], ['稳', '人生可没有悔棋键。']],
      [['憨', '棋盘上的子越来越多了。'], ['稳', '废话，下了好几手了。']],
      [['稳', '攻守兼备，看看对方怎么应。'], ['憨', '我赌他应一手！'], ['稳', '不应才怪。']],
      [['憨', '这手我吃不准。'], ['稳', '你吃什么都吃不准。']],
    ],

    'openThree.me': [
      [['憨', '活三！你这是要连成串啊！'], ['稳', '两头都空着，对手得马上处理。']],
      [['憨', '三个子站一排，像糖葫芦！'], ['稳', '再来一个就是活四了。']],
    ],
    'openThree.ai': [
      [['憨', '电脑摆出活三了，你可得留神！'], ['稳', '不堵的话，下一手就是活四。']],
      [['憨', '哎哟，它三个连上了！'], ['稳', '别慌，先看两头怎么堵。']],
    ],
    'openThree.pvp': [
      [['憨', '活三出现！'], ['稳', '对面得赶紧拦。']],
      [['憨', '三子成线，气势不小。'], ['稳', '但两头还开着，能堵。']],
    ],

    'four.me': [
      [['憨', '四个了！再一个就五连！'], ['稳', '对手只能堵，没得选。']],
      [['憨', '冲四！逼得对方不能不应。'], ['稳', '这叫抢先手。']],
    ],
    'four.ai': [
      [['憨', '电脑冲四了！快堵快堵！'], ['稳', '只有一个点能堵，别犹豫。']],
      [['憨', '它又四个了！'], ['稳', '堵住它，不然就输了。']],
    ],
    'four.pvp': [
      [['憨', '冲四！'], ['稳', '只能堵一头，对面看着办。']],
      [['憨', '四连了，场面紧张！'], ['稳', '紧张的是对面。']],
    ],

    'openFour.me': [
      [['憨', '活四！两头都能成五！'], ['稳', '这局基本定了。']],
      [['憨', '这手漂亮！'], ['稳', '活四，对手拦不住。']],
    ],
    'openFour.ai': [
      [['憨', '坏了，电脑活四……'], ['稳', '两头都空，大势已去。']],
      [['憨', '老稳，咱还有救吗？'], ['稳', '没了，这个堵不过来。']],
    ],
    'openFour.pvp': [
      [['憨', '活四！'], ['稳', '两头同时要成五，神仙也难救。']],
    ],

    'doubleThreat.me': [
      [['憨', '一手两个威胁，你这是要两头吃！'], ['稳', '这叫双杀，对手顾得了这头顾不了那头。']],
      [['憨', '一子两用，会过日子！'], ['稳', '四三、三三，哪个都够对方喝一壶。']],
    ],
    'doubleThreat.ai': [
      [['憨', '不好，电脑一手两用，这是双杀啊！'], ['稳', '除非有反手，否则难办了。']],
      [['憨', '这手又攻又守？'], ['稳', '不，是一手造了两个威胁。']],
    ],
    'doubleThreat.pvp': [
      [['憨', '一手双威胁！'], ['稳', '这一手，对手不好接。']],
    ],

    'blockFour.me': [
      [['憨', '救场如救火，你这手堵得及时！'], ['稳', '再晚一步，对方就五连了。']],
      [['憨', '好险！差点就输了。'], ['稳', '堵得对，下一手得想着进攻了。']],
    ],
    'blockFour.ai': [
      [['憨', '电脑把你的四堵住了。'], ['稳', '没办法，只能换思路。']],
      [['憨', '被堵了，老稳！'], ['稳', '正常，换个方向再来。']],
    ],
    'blockFour.pvp': [
      [['憨', '这一手堵得好！'], ['稳', '要不然对方就五连了。']],
    ],

    'blockThree.me': [
      [['憨', '你把对手的三给堵了，稳。'], ['稳', '该防的时候就得防。']],
      [['憨', '堵得好，不给对方活四的机会。'], ['稳', '防患于未然。']],
    ],
    'blockThree.ai': [
      [['憨', '电脑把你的三堵了。'], ['稳', '被盯上了，换个方向发展。']],
      [['憨', '这手卡得准！'], ['稳', '它看出你的意图了。']],
    ],
    'blockThree.pvp': [
      [['憨', '这手卡位不错。'], ['稳', '把对方的三拦住了。']],
    ],

    'blockDouble.me': [
      [['憨', '你把对手的双杀点占了，高！'], ['稳', '一手化解两路威胁，漂亮。']],
    ],
    'blockDouble.ai': [
      [['憨', '电脑占了你的关键点。'], ['稳', '那里本来是你的双杀点。']],
    ],
    'blockDouble.pvp': [
      [['憨', '关键点被占了！'], ['稳', '这一手，挡住了对方的杀招。']],
    ],

    hint: [
      [['憨', '老稳，他在偷看答案！'], ['稳', '提示是参考，别全信。']],
      [['憨', '提示出来了，听不听？'], ['稳', '听，但要懂为什么。']],
      [['憨', '我也想要提示。'], ['稳', '你下棋根本不动脑子。']],
    ],
    undo: [
      [['憨', '悔棋？落子无悔啊！'], ['稳', '人机局，别太较真。']],
      [['憨', '撤了撤了，重新来。'], ['稳', '这回想明白了再下。']],
      [['憨', '悔棋好啊，我悔了好多年了。'], ['稳', '你悔的是吃多了。']],
    ],
    forbiddenTry: [
      [['憨', '哎，这个点黑棋不能下！'], ['稳', '禁手，三三、四四或者长连。']],
      [['憨', '违规啦违规啦！'], ['稳', '裁判没吹哨，规则替你吹了。']],
    ],
    'resign.me': [
      [['憨', '认输了？别灰心！'], ['稳', '输了就复盘，进步靠这个。']],
      [['憨', '这么快就投子了？'], ['稳', '知道什么时候收手，也是本事。']],
    ],
    'resign.pvp': [
      [['憨', '一方认输！'], ['稳', '体面认输，也是高手风度。']],
    ],

    'win.me': [
      [['憨', '你赢啦！恭喜恭喜！'], ['稳', '这手五连，干净利落。'], ['憨', '今晚请客吧！'], ['稳', '你就想着吃。']],
      [['憨', '太厉害了！'], ['稳', '一共 {n} 手，赢得漂亮。'], ['憨', '我给你鼓掌！'], ['稳', '你鼓掌也没人听见。']],
    ],
    'lose.me': [
      [['憨', '输给电脑了，不丢人！'], ['稳', '电脑只会算，你会想。'], ['憨', '对对对，下次赢它！'], ['稳', '先复盘，再战。']],
      [['憨', '唉，差一点。'], ['稳', '差的不是一点，是那个活三没看住。'], ['憨', '老稳你这话有点伤人。'], ['稳', '实话。']],
    ],
    'win.pvp': [
      [['憨', '胜负已分！'], ['稳', '恭喜赢家，输的也别灰心。'], ['憨', '来，握个手。'], ['稳', '是抱拳。']],
      [['憨', '精彩，真精彩！'], ['稳', '共 {n} 手，一气呵成。']],
    ],
    draw: [
      [['憨', '平局！棋盘满了！'], ['稳', '难得，双方都没留破绽。'], ['憨', '那今晚吃啥？'], ['稳', '我跟你说棋呢。']],
    ],

    thinking: [
      [['憨', '电脑在想，咱也不能干等。'], ['稳', '想得越久，说明这步越不简单。']],
      [['憨', '老稳，这电脑是不是卡了？'], ['稳', '没卡，它在往后算好几步。']],
    ],
    longgame: [
      [['憨', '这局下得真长，我都饿了。'], ['稳', '四十多手了，双方都很谨慎。']],
      [['憨', '棋盘是不是快满了？'], ['稳', '离满还远着呢。']],
    ],
    replay: [
      [['憨', '来，咱们回头看看。'], ['稳', '复盘最见功夫。']],
    ],
  };

  // 这些事件会打断正在进行的解说
  const HIGH = new Set(['five', 'openFour', 'doubleThreat', 'blockFour', 'four', 'forbiddenTry']);

  // 各频率下，事件被解说的概率
  const CHANCE = {
    high: { default: 1 },
    mid: { plain: 0.28, edge: 0.6, center: 1, default: 1 },
    low: { plain: 0, edge: 0, center: 0.5, blockThree: 0.5, blockDouble: 0.7, openThree: 0.6, default: 1 },
  };

  function createCommentator(opts = {}) {
    const rng = opts.rng || Math.random;
    const recent = [];

    function pick(key, side) {
      const list = (side && LINES[`${key}.${side}`]) || LINES[key];
      if (!list) return null;
      const fresh = list.filter(d => !recent.includes(d));
      const pool = fresh.length ? fresh : list;
      const d = pool[Math.floor(rng() * pool.length)];
      recent.push(d); if (recent.length > 8) recent.shift();
      return d;
    }

    const fill = (d, vars) => d.map(([who, text]) => ({
      who, name: WHO[who],
      text: text.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : '')),
    }));

    return {
      /* 固定事件（开局、悔棋、输赢……）。返回 {lines, high} 或 null。 */
      event(key, side, vars) {
        const d = pick(key, side);
        return d ? { key, lines: fill(d, vars), high: true } : null;
      },
      /*
       * 一手棋的解说。boardBefore：落子前棋盘；move：{x,y,player}；ctx：{side, level, moveCount}。
       * 返回 {key, lines, high} 或 null（这一手不吭声）。
       */
      move(boardBefore, move, ctx = {}) {
        const { event } = analyzeMove(boardBefore, move, ctx.moveCount || 0);
        if (event === 'five') return null;     // 结局由输赢台词负责
        let key = event;
        if (ctx.moveCount && ctx.moveCount + 1 === 40) key = event === 'plain' ? 'longgame' : key;
        const table = CHANCE[ctx.level] || CHANCE.mid;
        const p = table[key] != null ? table[key] : table.default;
        if (rng() >= p) return null;
        const d = pick(key, ctx.side);
        return d ? { key, lines: fill(d, ctx.vars), high: HIGH.has(key) } : null;
      },
    };
  }

  return { createCommentator, analyzeMove, threatsAt, LINES, WHO, HIGH };
});
