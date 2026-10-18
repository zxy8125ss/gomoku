/* 界面控制器：首页、开局设置、对局、AI 线程、复盘、战绩、设置。 */
(function () {
  const { BLACK, WHITE } = GomokuRules;
  const { Game } = GomokuGame;
  const store = GomokuStore.create();
  const sfx = GomokuAudio;
  const $ = id => document.getElementById(id);

  const LEVELS = {
    easy:   { name: '入门', stars: 1, desc: '只看眼前一步，偶尔手滑，适合新手' },
    normal: { name: '普通', stars: 2, desc: '懂攻防，会预判对手下一手' },
    hard:   { name: '困难', stars: 3, desc: '向前推演多步，会布局会连攻' },
    master: { name: '大师', stars: 4, desc: '深度搜索，限时思考，非常难赢' },
  };
  const THEME_COLORS = { wood: '#d6a85a', ink: '#1b2027', jade: '#9ccdad' };
  const MIN_THINK_MS = 450;     // AI 落子前至少停顿一下，节奏更自然

  let settings = store.getSettings();
  let session = null;           // {mode:'ai'|'pvp', level, human, game, counted, forbidden, resignedBy}
  let replay = null;            // {step, timer}
  let thinking = false;
  let aiToken = 0, hintToken = 0, hintTimer = 0, toastTimer = 0;

  const view = new GomokuView.BoardView($('board'));

  /* ================= AI 客户端：优先用 Worker，失败则退回主线程 ================= */
  class AIClient {
    constructor() {
      this.seq = 0; this.pending = new Map(); this.worker = null;
      try {
        this.worker = new Worker('src/ai-worker.js');
        this.worker.onmessage = e => this.settle(e.data.id, e.data);
        this.worker.onerror = () => { this.worker = null; this.flush(); };   // 如 file:// 下不允许 Worker
      } catch (e) { this.worker = null; }
    }
    settle(id, data) {
      const p = this.pending.get(id);
      if (p) { this.pending.delete(id); p.resolve(data); }
    }
    runLocal(job) {
      return new Promise(resolve => setTimeout(() => {
        const t0 = Date.now();
        const move = GomokuAI.chooseMoveDetailed(job.board, job.player, job.level, job.opts);
        resolve({ id: job.id, move, ms: Date.now() - t0 });
      }, 30));
    }
    flush() {   // Worker 挂了：把没返回的任务改在主线程算
      for (const [id, p] of this.pending) { this.pending.delete(id); this.runLocal(p.job).then(p.resolve); }
    }
    think(board, player, level, opts) {
      const job = { id: ++this.seq, board, player, level, opts };
      if (!this.worker) return this.runLocal(job);
      return new Promise(resolve => {
        this.pending.set(job.id, { resolve, job });
        this.worker.postMessage(job);
      });
    }
  }
  const ai = new AIClient();

  /* ================= 通用：弹层、提示、屏幕 ================= */
  const modal = $('modal'), sheet = $('sheet');
  let dismissible = true;

  function openModal(html, { dismiss = true } = {}) {
    sheet.innerHTML = html; sheet.scrollTop = 0;
    sheet.onclick = null; sheet.onchange = null;      // 清掉上一个弹层留下的处理函数
    modal.hidden = false; dismissible = dismiss;
  }
  function closeModal() { modal.hidden = true; sheet.innerHTML = ''; }
  modal.addEventListener('click', e => { if (e.target === modal && dismissible) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden && dismissible) closeModal(); });

  function toast(msg, ms = 1900) {
    const el = $('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
    if (id === 'game') requestAnimationFrame(() => view.resize());
  }

  /* ================= 设置 ================= */
  function applySettings() {
    document.documentElement.dataset.theme = settings.theme;
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = THEME_COLORS[settings.theme] || THEME_COLORS.wood;
    view.theme = GomokuView.THEMES[settings.theme] || GomokuView.THEMES.wood;
    view.opts.numbers = settings.numbers; view.opts.coords = settings.coords;
    view.draw();
    sfx.configure(settings);
    store.saveSettings(settings);
  }

  /* ================= 对局存取 ================= */
  function persist() {
    if (!session) return;
    store.saveGame({
      mode: session.mode, level: session.level, human: session.human, forbidden: session.forbidden,
      moves: session.game.moves.map(m => [m.x, m.y]),
      counted: session.counted, resignedBy: session.resignedBy || null,
    });
  }

  function restore(saved) {
    if (!saved || !Array.isArray(saved.moves)) return null;
    const game = new Game(15, { forbidden: !!saved.forbidden });
    for (const [x, y] of saved.moves) if (!game.play(x, y)) return null;
    if (saved.resignedBy) game.resign(saved.resignedBy);
    return {
      mode: saved.mode === 'pvp' ? 'pvp' : 'ai', level: LEVELS[saved.level] ? saved.level : 'normal',
      human: saved.human || null, game, counted: !!saved.counted, forbidden: !!saved.forbidden,
      resignedBy: saved.resignedBy || null,
    };
  }

  /* ================= 首页 ================= */
  function refreshHome() {
    const saved = restore(store.getGame());
    const btn = $('btnResume');
    if (saved && !saved.game.over && saved.game.moves.length) {
      btn.hidden = false;
      $('resumeSub').textContent = `${saved.mode === 'ai' ? '人机 · ' + LEVELS[saved.level].name : '双人'} · 第 ${saved.game.moves.length + 1} 手`;
    } else btn.hidden = true;

    const st = store.getStats();
    const streak = $('homeStreak');
    streak.hidden = st.streak < 2;
    streak.textContent = `🔥 ${st.streak} 连胜`;
  }

  /* ================= 开始 / 继续对局 ================= */
  function startGame({ mode, level, side, forbidden }) {
    cancelAI(); clearHint(); exitReplayQuiet();
    let human = null;
    if (mode === 'ai') human = side === 'random' ? (Math.random() < 0.5 ? BLACK : WHITE) : (side === 'white' ? WHITE : BLACK);
    session = { mode, level, human, game: new Game(15, { forbidden }), counted: false, forbidden, resignedBy: null };
    persist();
    enterGame();
  }

  function enterGame() {
    view.setGame(session.game);
    view.hover = null;
    $('gameTitle').textContent = (session.mode === 'ai' ? `人机对战 · ${LEVELS[session.level].name}` : '双人对战') + (session.forbidden ? ' · 禁手' : '');
    showScreen('game');
    renderStatus();
    maybeAI();
  }

  /* ================= 状态栏 / 按钮 ================= */
  const aiTurn = () => !!session && session.mode === 'ai' && !session.game.over && session.game.turn !== session.human;
  const canHumanMove = () => !!session && !replay && !session.game.over && !thinking && !aiTurn();

  function renderStatus() {
    if (!session) return;
    const g = session.game;
    const ai_ = session.mode === 'ai';
    $('nameBlack').textContent = ai_ ? (session.human === BLACK ? '你' : `电脑·${LEVELS[session.level].name}`) : '黑方';
    $('nameWhite').textContent = ai_ ? (session.human === WHITE ? '你' : `电脑·${LEVELS[session.level].name}`) : '白方';

    const active = g.over ? (g.winner === 'draw' ? 0 : g.winner) : g.turn;
    $('pBlack').classList.toggle('active', active === BLACK);
    $('pWhite').classList.toggle('active', active === WHITE);
    $('pBlack').classList.toggle('thinking', thinking && g.turn === BLACK);
    $('pWhite').classList.toggle('thinking', thinking && g.turn === WHITE);

    $('moveNo').textContent = g.over ? `共 ${g.moves.length} 手` : `第 ${g.moves.length + 1} 手`;
    let txt;
    if (g.over) txt = g.winner === 'draw' ? '平局' : (g.resigned ? '认输' : '五连成珠');
    else if (thinking) txt = '思考中';
    else if (ai_) txt = '轮到你';
    else txt = g.turn === BLACK ? '黑方落子' : '白方落子';
    $('statusText').textContent = txt;

    $('btnUndo').disabled = g.moves.length === 0 && !g.resigned;
    $('btnHint').disabled = g.over || thinking || aiTurn();
    $('btnResign').hidden = g.over;
    $('btnReplay').disabled = g.moves.length === 0;
  }

  /* ================= 落子 ================= */
  function onMoved() {
    const g = session.game, last = g.lastMove;
    sfx.place(last.player);
    view.dropped(last.x, last.y);
    clearHint();
    persist();
    renderStatus();
    if (g.over) onGameOver(); else maybeAI();
  }

  function handlePlace(x, y) {
    if (!canHumanMove()) return;
    const g = session.game;
    if (!g.canPlay(x, y)) return;
    if (!g.play(x, y)) {
      if (g.error) { toast(`${g.error}，黑棋不能下在这里`); sfx.error(); }
      return;
    }
    view.hover = null;
    onMoved();
  }

  async function maybeAI() {
    if (!aiTurn() || replay) return;
    const token = ++aiToken;
    thinking = true; renderStatus();
    const g = session.game, t0 = Date.now();
    let res = null;
    try {
      res = await ai.think(g.board, g.turn, session.level, { forbidden: g.forbidden });
    } catch (e) { res = null; }
    const rest = MIN_THINK_MS - (Date.now() - t0);
    if (rest > 0) await new Promise(r => setTimeout(r, rest));
    if (token !== aiToken || !session) return;      // 期间悔棋 / 重开 / 离开了
    thinking = false;
    if (res && res.move && session.game.play(res.move.x, res.move.y)) onMoved();
    else renderStatus();
  }

  function cancelAI() { aiToken++; thinking = false; }

  /* ================= 结束 ================= */
  function onGameOver() {
    const g = session.game;
    view.celebrate();
    if (!session.counted) {
      session.counted = true;
      if (session.mode === 'ai') {
        const outcome = g.winner === 'draw' ? 'draw' : (g.winner === session.human ? 'win' : 'loss');
        store.recordAI(session.level, outcome);
      } else store.recordPvp(g.winner === 'draw' ? 'draw' : (g.winner === BLACK ? 'black' : 'white'));
      persist();
    }
    const humanWon = session.mode === 'pvp' || g.winner === session.human;
    if (g.winner === 'draw') sfx.draw(); else if (humanWon) sfx.win(); else sfx.lose();
    if (g.winner !== 'draw' && humanWon) setTimeout(confetti, 350);
    setTimeout(() => { if (session && session.game === g && g.over && !replay) showResult(); }, 1000);
  }

  function showResult() {
    const g = session.game, ai_ = session.mode === 'ai';
    let emoji, title, sub;
    if (g.winner === 'draw') { emoji = '🤝'; title = '平局'; sub = '棋盘已下满，不分胜负'; }
    else if (!ai_) { emoji = '🏆'; title = `${g.winner === BLACK ? '黑' : '白'}方获胜`; sub = g.resigned ? '对方认输' : '五子连珠'; }
    else if (g.winner === session.human) { emoji = '🏆'; title = '你赢了！'; sub = g.resigned ? '电脑认输' : `用 ${g.moves.length} 手战胜了「${LEVELS[session.level].name}」`; }
    else { emoji = '😮‍💨'; title = '电脑获胜'; sub = g.resigned ? '你认输了' : '再接再厉，复盘看看哪步可以改进'; }

    const st = store.getStats();
    let chips;
    if (ai_) {
      const r = st[session.level];
      chips = `<span class="chip">${LEVELS[session.level].name} <b>${r.w}</b>胜 <b>${r.l}</b>负 <b>${r.d}</b>平</span>` +
              (st.streak >= 2 ? `<span class="chip">🔥 <b>${st.streak}</b> 连胜</span>` : '');
    } else chips = `<span class="chip">黑 <b>${st.pvp.black}</b> · 白 <b>${st.pvp.white}</b> · 平 <b>${st.pvp.draw}</b></span>`;

    openModal(`
      <div class="result">
        <div class="big">${emoji}</div>
        <h2>${title}</h2>
        <p class="sub">${sub}</p>
        <div class="chips">${chips}</div>
        <div class="btns">
          <button class="btn" data-act="replay">复盘</button>
          <button class="btn primary" data-act="again">再来一局</button>
        </div>
        <div class="btns" style="margin-top:10px"><button class="btn" data-act="home">返回首页</button></div>
      </div>`);
  }

  /* ================= 提示 / 悔棋 / 认输 / 重开 ================= */
  function clearHint() { hintToken++; clearTimeout(hintTimer); view.hint = null; if (view.game) view.draw(); }

  async function giveHint() {
    if (!canHumanMove()) return;
    const token = ++hintToken, g = session.game;
    $('btnHint').disabled = true; toast('正在为你找好棋…', 1200);
    let res = null;
    try { res = await ai.think(g.board, g.turn, 'hard', { forbidden: g.forbidden, timeMs: 900 }); } catch (e) { /* ignore */ }
    $('btnHint').disabled = false;
    if (token !== hintToken || !session || session.game !== g || g.over) return;
    if (res && res.move) {
      view.setHint({ x: res.move.x, y: res.move.y });
      hintTimer = setTimeout(clearHint, 4500);
    }
  }

  function undo() {
    if (!session || replay) return;
    const g = session.game;
    cancelAI(); clearHint();
    if (session.mode === 'pvp') g.undo();
    else do { if (!g.undo()) break; } while (g.moves.length && g.turn !== session.human);
    if (session.resignedBy) session.resignedBy = null;
    sfx.click();
    persist(); view.setGame(g); renderStatus(); maybeAI();
  }

  function confirmBox(title, text, okLabel, onOk, danger = false) {
    openModal(`
      <h2>${title}</h2><p class="sub">${text}</p>
      <div class="btns">
        <button class="btn" data-act="cancel">取消</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${okLabel}</button>
      </div>`);
    sheet.querySelector('[data-act=ok]').onclick = () => { closeModal(); onOk(); };
  }

  function resign() {
    if (!session || session.game.over || replay) return;
    confirmBox('确定认输吗？', session.mode === 'ai' ? '认输会记为一场失败。' : `${session.game.turn === BLACK ? '黑' : '白'}方将认输。`, '认输', () => {
      cancelAI(); clearHint();
      const who = session.mode === 'ai' ? session.human : session.game.turn;
      session.game.resign(who); session.resignedBy = who;
      persist(); renderStatus(); onGameOver();
    }, true);
  }

  function restart() {
    if (!session) return;
    const again = () => startGame({ mode: session.mode, level: session.level, side: session.human === WHITE ? 'white' : 'black', forbidden: session.forbidden });
    if (session.game.moves.length && !session.game.over) confirmBox('重新开始？', '当前这一局将被放弃（不计入战绩）。', '重新开始', again, true);
    else again();
  }

  /* ================= 复盘 ================= */
  const slider = $('rpSlider');

  function startReplay() {
    if (!session || !session.game.moves.length) return;
    cancelAI(); clearHint(); closeModal();
    replay = { step: 0, timer: 0 };
    $('game').classList.add('replaying');
    slider.max = session.game.moves.length;
    gotoStep(0);
  }

  function gotoStep(k, animate = false) {
    const n = session.game.moves.length;
    replay.step = Math.max(0, Math.min(n, k));
    const snap = session.game.snapshot(replay.step);
    view.setGame(snap);
    if (animate && snap.lastMove) { view.dropped(snap.lastMove.x, snap.lastMove.y); sfx.place(snap.lastMove.player); }
    if (replay.step === n && session.game.winLine) { snap.winLine = session.game.winLine; view.draw(); }
    slider.value = replay.step;
    $('rpLabel').textContent = `第 ${replay.step} / ${n} 手`;
    if (replay.step >= n) stopReplayTimer();
  }

  function setPlayIcon(playing) {
    $('rpPlayIcon').innerHTML = playing ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M5 3l14 9-14 9V3z"/>';
  }
  function stopReplayTimer() { if (replay && replay.timer) { clearInterval(replay.timer); replay.timer = 0; } setPlayIcon(false); }

  function toggleReplayPlay() {
    if (!replay) return;
    if (replay.timer) return stopReplayTimer();
    if (replay.step >= session.game.moves.length) gotoStep(0);
    setPlayIcon(true);
    replay.timer = setInterval(() => gotoStep(replay.step + 1, true), 750);
  }

  function exitReplayQuiet() {
    if (!replay) return;
    stopReplayTimer(); replay = null;
    $('game').classList.remove('replaying');
  }
  function exitReplay() {
    exitReplayQuiet();
    if (!session) return;
    view.setGame(session.game); renderStatus(); maybeAI();
  }

  /* ================= 弹层：开局设置 / 设置 / 战绩 / 玩法 ================= */
  function openSetup(mode) {
    const cur = Object.assign({}, settings.setup);
    const render = () => {
      const levels = Object.entries(LEVELS).map(([k, v]) => `
        <button class="opt ${cur.level === k ? 'on' : ''}" data-level="${k}">
          <b>${v.name}</b><span class="stars">${'★'.repeat(v.stars)}${'☆'.repeat(4 - v.stars)}</span><small>${v.desc}</small>
        </button>`).join('');
      const sides = [['black', '执黑 · 先手'], ['white', '执白 · 后手'], ['random', '随机']].map(([k, t]) =>
        `<button class="opt ${cur.side === k ? 'on' : ''}" data-side="${k}"><b>${t}</b></button>`).join('');
      sheet.innerHTML = `
        <h2>${mode === 'ai' ? '人机对战' : '双人对战'}</h2>
        <p class="sub">${mode === 'ai' ? '选择难度和执子，然后开始。' : '两人轮流在同一设备上落子，黑棋先手。'}</p>
        ${mode === 'ai' ? `<h3>难度</h3><div class="grid2">${levels}</div><h3>执子</h3><div class="seg">${sides}</div>` : ''}
        <h3>规则</h3>
        <div class="row">
          <div class="lbl"><span>黑棋禁手</span><small>禁止黑棋三三、四四、长连，黑棋须恰好五连才赢</small></div>
          <label class="switch"><input type="checkbox" id="setForbidden" ${cur.forbidden ? 'checked' : ''}><span></span></label>
        </div>
        <div class="btns">
          <button class="btn" data-act="cancel">取消</button>
          <button class="btn primary" data-act="start">开始对局</button>
        </div>`;
    };
    openModal(''); render();
    sheet.onclick = e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.level) { cur.level = t.dataset.level; sfx.click(); render(); }
      else if (t.dataset.side) { cur.side = t.dataset.side; sfx.click(); render(); }
      else if (t.dataset.act === 'start') {
        cur.forbidden = $('setForbidden').checked;
        settings.setup = Object.assign({}, cur); store.saveSettings(settings);
        closeModal(); startGame({ mode, level: cur.level, side: cur.side, forbidden: cur.forbidden });
      }
    };
  }

  function openSettings() {
    const sw = (key, title, desc) => `
      <div class="row">
        <div class="lbl"><span>${title}</span>${desc ? `<small>${desc}</small>` : ''}</div>
        <label class="switch"><input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}><span></span></label>
      </div>`;
    const themes = Object.entries(GomokuView.THEMES).map(([k, t]) => `
      <button class="swatch ${settings.theme === k ? 'on' : ''}" data-theme="${k}">
        <i style="background:linear-gradient(135deg,${t.swatch[0]},${t.swatch[1]})"></i>${t.name}
      </button>`).join('');
    openModal(`
      <h2>设置</h2>
      <h3>棋盘主题</h3><div class="swatches">${themes}</div>
      <h3>体验</h3>
      ${sw('sound', '音效', '落子声与胜负提示音')}
      ${sw('haptics', '震动', '落子时轻微震动（仅支持的手机）')}
      ${sw('numbers', '显示步数', '在棋子上标出落子顺序')}
      ${sw('coords', '显示坐标', '棋盘四边的字母与数字')}
      <div class="btns"><button class="btn primary" data-act="cancel">完成</button></div>`);
    sheet.onclick = e => {
      const sw_ = e.target.closest('[data-theme]');
      if (sw_) {
        settings.theme = sw_.dataset.theme; applySettings();
        for (const b of sheet.querySelectorAll('.swatch')) b.classList.toggle('on', b === sw_);
      }
    };
    sheet.onchange = e => {
      const k = e.target.dataset && e.target.dataset.setting;
      if (k) { settings[k] = e.target.checked; applySettings(); if (k === 'sound' && settings.sound) sfx.click(); }
    };
  }

  function openStats() {
    const st = store.getStats();
    const rows = Object.entries(LEVELS).map(([k, v]) => {
      const r = st[k], total = r.w + r.l + r.d;
      return `<tr><td>${v.name}</td><td>${r.w}</td><td>${r.l}</td><td>${r.d}</td><td class="rate">${total ? Math.round(r.w / total * 100) + '%' : '–'}</td></tr>`;
    }).join('');
    openModal(`
      <h2>战绩</h2>
      <p class="sub">当前 <b>${st.streak}</b> 连胜 · 最高 <b>${st.best}</b> 连胜</p>
      <table class="stats">
        <tr><th>人机难度</th><th>胜</th><th>负</th><th>平</th><th>胜率</th></tr>${rows}
      </table>
      <h3>双人对战</h3>
      <p class="sub">黑方胜 <b>${st.pvp.black}</b> · 白方胜 <b>${st.pvp.white}</b> · 平局 <b>${st.pvp.draw}</b></p>
      <div class="btns">
        <button class="btn danger" id="btnResetStats">清空战绩</button>
        <button class="btn primary" data-act="cancel">关闭</button>
      </div>`);
    const reset = $('btnResetStats');
    reset.onclick = () => {
      if (reset.dataset.armed) { store.resetStats(); refreshHome(); openStats(); }
      else { reset.dataset.armed = '1'; reset.textContent = '再点一次确认'; }
    };
  }

  function openRules() {
    openModal(`
      <div class="rules">
        <h2>玩法</h2>
        <p>黑白双方轮流在 15×15 的棋盘交叉点落子，黑棋先手。<b>横、竖、斜任意方向先连成五子者获胜</b>；棋盘下满则为平局。</p>
        <h3>黑棋禁手（可选）</h3>
        <p>先手黑棋优势很大，职业规则对黑棋加了限制，开局时可以打开：</p>
        <ul>
          <li><b>三三禁手</b>：一子落下同时形成两个活三</li>
          <li><b>四四禁手</b>：一子落下同时形成两个四</li>
          <li><b>长连禁手</b>：形成六子或更多的连线</li>
        </ul>
        <p>黑棋必须<b>恰好五连</b>才算赢；若落子同时成五，则不算禁手。白棋不受限制。四三（一个四加一个活三）是允许的。</p>
        <h3>小技巧</h3>
        <ul>
          <li>活三（两头都空的三连）必须马上处理，否则对方走成活四就赢了</li>
          <li>卡在对手的关键点上，一手兼顾进攻与防守最厉害</li>
          <li>觉得没思路时，点「提示」让大师级 AI 帮你看一步</li>
        </ul>
        <div class="btns"><button class="btn primary" data-act="cancel">明白了</button></div>
      </div>`);
  }

  /* 弹层里通用按钮 */
  sheet.addEventListener('click', e => {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act;
    if (a === 'cancel') closeModal();
    else if (a === 'replay') startReplay();
    else if (a === 'again') {
      closeModal();
      startGame({ mode: session.mode, level: session.level, side: session.human === WHITE ? 'white' : 'black', forbidden: session.forbidden });
    } else if (a === 'home') { closeModal(); goHome(); }
  });

  function goHome() {
    cancelAI(); clearHint(); exitReplayQuiet();
    refreshHome(); showScreen('home');
  }

  /* ================= 撒花 ================= */
  function confetti() {
    const c = $('fx'), cx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#ff5a3c', '#ffc247', '#4cc38a', '#4aa3ff', '#c26bff'];
    const ps = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * 0.45,
      vx: (Math.random() - .5) * 11, vy: -Math.random() * 12 - 3, r: 3 + Math.random() * 4,
      rot: Math.random() * 6, vr: (Math.random() - .5) * .4, color: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    (function frame(now) {
      const t = now - t0;
      cx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of ps) {
        p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vx *= 0.992;
        cx.save(); cx.globalAlpha = Math.max(0, 1 - t / 2600);
        cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.color;
        cx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); cx.restore();
      }
      if (t < 2600) requestAnimationFrame(frame); else cx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }

  /* ================= 事件绑定 ================= */
  const board = $('board');
  const forbiddenAt = (x, y) => (session && session.game.forbidden ? session.game.forbiddenAt(x, y) : null);

  board.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || !session || replay || !canHumanMove()) return;
    const c = view.cellAt(e.clientX, e.clientY);
    view.setHover(c ? { x: c.x, y: c.y, bad: !!forbiddenAt(c.x, c.y) } : null);
  });
  board.addEventListener('pointerleave', () => view.setHover(null));
  board.addEventListener('click', e => {
    sfx.unlock();
    const c = view.cellAt(e.clientX, e.clientY);
    if (c) handlePlace(c.x, c.y);
  });
  document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

  $('btnAI').onclick = () => { sfx.click(); openSetup('ai'); };
  $('btnPVP').onclick = () => { sfx.click(); openSetup('pvp'); };
  $('btnStats').onclick = () => { sfx.click(); openStats(); };
  $('btnSettings').onclick = () => { sfx.click(); openSettings(); };
  $('btnRules').onclick = () => { sfx.click(); openRules(); };
  $('btnResume').onclick = () => {
    const saved = restore(store.getGame());
    if (!saved) return refreshHome();
    session = saved; sfx.click(); enterGame();
  };

  $('btnBack').onclick = goHome;
  $('btnGameSettings').onclick = openSettings;
  $('btnUndo').onclick = undo;
  $('btnHint').onclick = () => { sfx.click(); giveHint(); };
  $('btnResign').onclick = resign;
  $('btnRestart').onclick = restart;
  $('btnReplay').onclick = startReplay;

  $('rpExit').onclick = exitReplay;
  $('rpFirst').onclick = () => { stopReplayTimer(); gotoStep(0); };
  $('rpPrev').onclick = () => { stopReplayTimer(); gotoStep(replay.step - 1); };
  $('rpNext').onclick = () => { stopReplayTimer(); gotoStep(replay.step + 1, true); };
  $('rpLast').onclick = () => { stopReplayTimer(); gotoStep(session.game.moves.length); };
  $('rpPlay').onclick = toggleReplayPlay;
  slider.oninput = () => { stopReplayTimer(); gotoStep(Number(slider.value)); };

  window.addEventListener('resize', () => view.resize());

  /* ================= 启动 ================= */
  applySettings();
  refreshHome();

  // 测试与调试入口
  window.__gomoku = {
    get game() { return session && session.game; },
    get session() { return session; },
    get thinking() { return thinking; },
    view, store, ai, settings: () => settings,
  };
})();
