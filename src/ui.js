/* 界面：Canvas 绘制棋盘、处理点击、驱动 AI。 */
(function () {
  const { BLACK, WHITE } = GomokuRules;
  const game = new GomokuGame.Game();

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');
  const modeEl = document.getElementById('mode');
  const levelEl = document.getElementById('level');
  const levelWrap = document.getElementById('levelWrap');
  const undoBtn = document.getElementById('undo');
  const restartBtn = document.getElementById('restart');

  let hover = null;
  let aiTimer = null;
  let geo = { size: 0, margin: 0, cell: 0 };

  const NAME = { [BLACK]: '黑', [WHITE]: '白' };
  const STAR_POINTS = [3, 7, 11];

  function humanColor() {
    if (modeEl.value === 'ai-black') return BLACK;
    if (modeEl.value === 'ai-white') return WHITE;
    return null; // 双人
  }
  const vsAI = () => modeEl.value !== 'pvp';
  const aiTurn = () => vsAI() && !game.over && game.turn !== humanColor();

  /* ---------- 绘制 ---------- */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const css = canvas.getBoundingClientRect().width;
    canvas.width = canvas.height = Math.round(css * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = game.size;
    geo.size = css;
    geo.margin = css / (n + 1);
    geo.cell = (css - geo.margin * 2) / (n - 1);
    draw();
  }

  const px = i => geo.margin + i * geo.cell;

  function stone(x, y, color, alpha = 1) {
    const r = geo.cell * 0.44;
    const cx = px(x), cy = px(y);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = alpha === 1 ? r * 0.35 : 0;
    ctx.shadowOffsetY = r * 0.12;
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    if (color === BLACK) { g.addColorStop(0, '#666'); g.addColorStop(1, '#0a0a0a'); }
    else { g.addColorStop(0, '#fff'); g.addColorStop(1, '#cfcfcf'); }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function draw() {
    const n = game.size, s = geo.size;
    ctx.clearRect(0, 0, s, s);

    // 木纹底色
    const bg = ctx.createLinearGradient(0, 0, s, s);
    bg.addColorStop(0, '#e8c27a'); bg.addColorStop(1, '#d6a85a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s);

    // 网格
    ctx.strokeStyle = '#5a3d1a'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      ctx.moveTo(px(0), px(i) + .5); ctx.lineTo(px(n - 1), px(i) + .5);
      ctx.moveTo(px(i) + .5, px(0)); ctx.lineTo(px(i) + .5, px(n - 1));
    }
    ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeRect(px(0), px(0), px(n - 1) - px(0), px(n - 1) - px(0));

    // 星位
    ctx.fillStyle = '#5a3d1a';
    for (const a of STAR_POINTS) for (const b of STAR_POINTS) {
      ctx.beginPath(); ctx.arc(px(a), px(b), geo.cell * 0.09, 0, Math.PI * 2); ctx.fill();
    }

    // 棋子
    for (const m of game.moves) stone(m.x, m.y, m.player);

    // 悬停预览（仅轮到玩家时）
    if (hover && game.canPlay(hover.x, hover.y) && !aiTurn()) stone(hover.x, hover.y, game.turn, 0.45);

    // 最后一步标记
    const last = game.lastMove;
    if (last) {
      ctx.strokeStyle = last.player === BLACK ? '#ff6b4a' : '#d63a1a';
      ctx.lineWidth = 2;
      const r = geo.cell * 0.14;
      ctx.beginPath(); ctx.arc(px(last.x), px(last.y), r, 0, Math.PI * 2); ctx.stroke();
    }

    // 获胜连线
    if (game.winLine) {
      ctx.strokeStyle = '#e0302a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      const pts = game.winLine.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const [a, b] = [pts[0], pts[pts.length - 1]];
      ctx.beginPath(); ctx.moveTo(px(a[0]), px(a[1])); ctx.lineTo(px(b[0]), px(b[1])); ctx.stroke();
    }
  }

  /* ---------- 状态 ---------- */
  function updateStatus() {
    statusEl.classList.toggle('win', game.over);
    if (game.winner === 'draw') statusEl.textContent = '平局：棋盘已满';
    else if (game.over) {
      const h = humanColor();
      const who = h === null ? `${NAME[game.winner]}方获胜！` : (game.winner === h ? '你赢了！🎉' : '电脑获胜，再接再厉');
      statusEl.textContent = who;
    } else if (aiTurn()) statusEl.textContent = '电脑思考中…';
    else statusEl.textContent = `轮到${NAME[game.turn]}方落子`;
    undoBtn.disabled = game.moves.length === 0;
    levelWrap.style.display = vsAI() ? '' : 'none';
  }

  function refresh() { updateStatus(); draw(); }

  /* ---------- AI ---------- */
  function scheduleAI() {
    clearTimeout(aiTimer);
    if (!aiTurn()) return;
    aiTimer = setTimeout(() => {
      if (!aiTurn()) return;
      const [x, y] = GomokuAI.chooseMove(game.board, game.turn, levelEl.value);
      game.play(x, y);
      refresh();
    }, 350);
  }

  /* ---------- 交互 ---------- */
  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scale = geo.size / rect.width;
    const fx = ((e.clientX - rect.left) * scale - geo.margin) / geo.cell;
    const fy = ((e.clientY - rect.top) * scale - geo.margin) / geo.cell;
    const x = Math.round(fx), y = Math.round(fy);
    if (x < 0 || y < 0 || x >= game.size || y >= game.size) return null;
    return { x, y };
  }

  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    hover = cellFromEvent(e); draw();
  });
  canvas.addEventListener('pointerleave', () => { hover = null; draw(); });
  canvas.addEventListener('click', e => {
    if (aiTurn()) return;
    const c = cellFromEvent(e);
    if (!c || !game.play(c.x, c.y)) return;
    hover = null;
    refresh();
    scheduleAI();
  });

  function restart() {
    clearTimeout(aiTimer);
    game.reset(); hover = null;
    refresh(); scheduleAI();
  }

  function undo() {
    clearTimeout(aiTimer);
    if (!vsAI()) game.undo();
    else do { game.undo(); } while (game.moves.length && game.turn !== humanColor());
    refresh(); scheduleAI();
  }

  undoBtn.addEventListener('click', undo);
  restartBtn.addEventListener('click', restart);
  modeEl.addEventListener('change', restart);
  window.addEventListener('resize', resize);

  resize(); refresh(); scheduleAI();

  // 供测试使用
  window.__gomoku = { game };
})();
