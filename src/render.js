/* 棋盘渲染：主题、落子动画、坐标、步数、提示、悬停预览、获胜连线。 */
(function (root, factory) {
  root.GomokuView = factory(root.GomokuRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  const { BLACK } = R;

  const THEMES = {
    wood: {
      name: '原木', swatch: ['#e8c27a', '#c99445'],
      boardA: '#ecc983', boardB: '#d2a04f', grain: 'rgba(110,70,20,.08)', edge: 'rgba(255,255,255,.35)',
      line: '#5a3d1a', star: '#5a3d1a', label: 'rgba(80,52,20,.7)',
      black: ['#707070', '#040404'], white: ['#ffffff', '#c6c6c6'],
      mark: '#ff5a3c', win: '#e0302a',
    },
    ink: {
      name: '墨玉', swatch: ['#3d4752', '#20262d'],
      boardA: '#414c58', boardB: '#232930', grain: 'rgba(255,255,255,.03)', edge: 'rgba(255,255,255,.10)',
      line: 'rgba(214,226,238,.42)', star: 'rgba(214,226,238,.75)', label: 'rgba(214,226,238,.6)',
      black: ['#5a5f66', '#000000'], white: ['#ffffff', '#b9c2cc'],
      mark: '#ffc247', win: '#ffc247',
    },
    jade: {
      name: '青瓷', swatch: ['#9fcaaf', '#5b9675'],
      boardA: '#9ccdad', boardB: '#5f9a78', grain: 'rgba(20,70,45,.07)', edge: 'rgba(255,255,255,.35)',
      line: '#1e4a35', star: '#1e4a35', label: 'rgba(24,70,48,.7)',
      black: ['#5f6e66', '#030504'], white: ['#ffffff', '#c9d5ce'],
      mark: '#ff6a3d', win: '#d8321f',
    },
  };

  const LETTERS = 'ABCDEFGHIJKLMNO';
  const DROP_MS = 170, WIN_MS = 550;
  const STARS = [3, 7, 11];

  class BoardView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.theme = THEMES.wood;
      this.opts = { numbers: false, coords: true };
      this.game = null;
      this.hover = null;          // {x, y, bad}
      this.hint = null;           // {x, y}
      this.drops = [];            // 进行中的落子动画
      this.winT0 = 0;
      this.geo = { size: 0, margin: 0, cell: 0 };
      this.raf = 0;
      this.grainSeed = 7;
    }

    setTheme(name) { this.theme = THEMES[name] || THEMES.wood; this.draw(); }
    setOptions(o) { Object.assign(this.opts, o); this.draw(); }
    setGame(g) { this.game = g; this.drops = []; this.draw(); }
    setHover(h) { this.hover = h; this.draw(); }
    setHint(h) { this.hint = h; this.draw(); }

    /* 有新落子：播放下落动画 */
    dropped(x, y) { this.drops.push({ x, y, t0: performance.now() }); this.draw(); }
    /* 对局刚刚结束：播放连线动画 */
    celebrate() { this.winT0 = performance.now(); this.draw(); }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const css = this.canvas.getBoundingClientRect().width;
      if (!css) return;
      this.canvas.width = this.canvas.height = Math.round(css * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = this.game ? this.game.size : R.SIZE;
      this.geo.size = css;
      this.geo.margin = css / (n + 0.6);
      this.geo.cell = (css - this.geo.margin * 2) / (n - 1);
      this.draw();
    }

    px(i) { return this.geo.margin + i * this.geo.cell; }

    /* 屏幕坐标 → 棋盘格；离开棋盘返回 null */
    cellAt(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const k = this.geo.size / rect.width;
      const x = Math.round(((clientX - rect.left) * k - this.geo.margin) / this.geo.cell);
      const y = Math.round(((clientY - rect.top) * k - this.geo.margin) / this.geo.cell);
      const n = this.game ? this.game.size : R.SIZE;
      return x < 0 || y < 0 || x >= n || y >= n ? null : { x, y };
    }

    /* ---------- 绘制 ---------- */
    drawBoard() {
      const { ctx, geo, theme: T } = this;
      const n = this.game.size, s = geo.size;
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, T.boardA); g.addColorStop(1, T.boardB);
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);

      // 木纹：用固定种子画几十条淡淡的起伏横线
      ctx.save();
      ctx.strokeStyle = T.grain; ctx.lineWidth = 1.2;
      let seed = this.grainSeed;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 46; i++) {
        const y0 = rnd() * s, amp = 2 + rnd() * 5, ph = rnd() * 6, w = 0.6 + rnd() * 1.6;
        ctx.lineWidth = w; ctx.beginPath();
        for (let x = 0; x <= s; x += 12) {
          const y = y0 + Math.sin(x / (40 + i) + ph) * amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();

      // 内沿高光
      ctx.strokeStyle = T.edge; ctx.lineWidth = 2; ctx.strokeRect(1, 1, s - 2, s - 2);

      // 网格
      ctx.strokeStyle = T.line; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        ctx.moveTo(this.px(0), Math.round(this.px(i)) + .5); ctx.lineTo(this.px(n - 1), Math.round(this.px(i)) + .5);
        ctx.moveTo(Math.round(this.px(i)) + .5, this.px(0)); ctx.lineTo(Math.round(this.px(i)) + .5, this.px(n - 1));
      }
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeRect(this.px(0), this.px(0), this.px(n - 1) - this.px(0), this.px(n - 1) - this.px(0));

      // 星位
      ctx.fillStyle = T.star;
      for (const a of STARS) for (const b of STARS) {
        ctx.beginPath(); ctx.arc(this.px(a), this.px(b), geo.cell * 0.1, 0, Math.PI * 2); ctx.fill();
      }

      // 坐标
      if (this.opts.coords && geo.margin > 14) {
        ctx.fillStyle = T.label;
        ctx.font = `600 ${Math.max(8, Math.min(12, geo.cell * 0.36))}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const off = geo.margin * 0.5;
        for (let i = 0; i < n; i++) {
          ctx.fillText(LETTERS[i], this.px(i), off);
          ctx.fillText(LETTERS[i], this.px(i), s - off);
          ctx.fillText(String(n - i), off, this.px(i));
          ctx.fillText(String(n - i), s - off, this.px(i));
        }
      }
    }

    stone(x, y, color, { alpha = 1, scale = 1, shadow = true } = {}) {
      const { ctx, geo, theme: T } = this;
      const r = geo.cell * 0.455 * scale;
      const cx = this.px(x), cy = this.px(y);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (shadow) {
        ctx.shadowColor = 'rgba(0,0,0,.38)'; ctx.shadowBlur = r * 0.4; ctx.shadowOffsetY = r * 0.14;
      }
      const [hi, lo] = color === BLACK ? T.black : T.white;
      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.38, r * 0.08, cx, cy, r);
      g.addColorStop(0, hi); g.addColorStop(1, lo);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    draw(now = performance.now()) {
      const { ctx, geo, game } = this;
      if (!game || !geo.size) return;
      ctx.clearRect(0, 0, geo.size, geo.size);
      this.drawBoard();

      let busy = false;
      this.drops = this.drops.filter(d => now - d.t0 < DROP_MS + 260);
      const dropOf = (x, y) => this.drops.find(d => d.x === x && d.y === y);

      game.moves.forEach((m, i) => {
        const d = dropOf(m.x, m.y);
        if (d) {
          const t = Math.min(1, (now - d.t0) / DROP_MS);
          const ease = 1 - Math.pow(1 - t, 3);
          this.stone(m.x, m.y, m.player, { alpha: 0.25 + 0.75 * ease, scale: 1.35 - 0.35 * ease });
          if (t < 1) busy = true;
          else {   // 落定后的一圈涟漪
            const u = Math.min(1, (now - d.t0 - DROP_MS) / 260);
            this.ctx.save();
            this.ctx.globalAlpha = 0.35 * (1 - u);
            this.ctx.strokeStyle = this.theme.mark; this.ctx.lineWidth = 2;
            this.ctx.beginPath(); this.ctx.arc(this.px(m.x), this.px(m.y), geo.cell * (0.45 + 0.35 * u), 0, Math.PI * 2); this.ctx.stroke();
            this.ctx.restore();
            if (u < 1) busy = true;
          }
        } else this.stone(m.x, m.y, m.player);

      });

      // 最后一步标记
      const last = game.lastMove;
      if (last && !dropOf(last.x, last.y)) {
        ctx.fillStyle = this.theme.mark;
        const r = geo.cell * 0.11;
        if (this.opts.numbers) {
          ctx.strokeStyle = this.theme.mark; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(this.px(last.x), this.px(last.y), geo.cell * 0.44, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(this.px(last.x), this.px(last.y), r, 0, Math.PI * 2); ctx.fill();
        }
      }

      // 悬停预览 / 禁手提示
      const h = this.hover;
      if (h && game.canPlay(h.x, h.y)) {
        if (h.bad) {
          const c = geo.cell * 0.26, cx = this.px(h.x), cy = this.px(h.y);
          ctx.strokeStyle = '#e0302a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx - c, cy - c); ctx.lineTo(cx + c, cy + c); ctx.moveTo(cx + c, cy - c); ctx.lineTo(cx - c, cy + c); ctx.stroke();
        } else this.stone(h.x, h.y, game.turn, { alpha: 0.42, shadow: false });
      }

      // 提示：脉动圆环
      if (this.hint && game.canPlay(this.hint.x, this.hint.y)) {
        const p = 0.5 + 0.5 * Math.sin(now / 180);
        this.stone(this.hint.x, this.hint.y, game.turn, { alpha: 0.35, shadow: false });
        ctx.strokeStyle = this.theme.mark; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5 + 0.5 * p;
        ctx.beginPath(); ctx.arc(this.px(this.hint.x), this.px(this.hint.y), geo.cell * (0.42 + 0.12 * p), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        busy = true;
      }

      // 获胜连线
      if (game.winLine) {
        const pts = game.winLine.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const [a, b] = [pts[0], pts[pts.length - 1]];
        const t = this.winT0 ? Math.min(1, (now - this.winT0) / WIN_MS) : 1;
        const ex = this.px(a[0]) + (this.px(b[0]) - this.px(a[0])) * t;
        const ey = this.px(a[1]) + (this.px(b[1]) - this.px(a[1])) * t;
        ctx.save();
        ctx.strokeStyle = this.theme.win; ctx.lineWidth = Math.max(3, geo.cell * 0.12); ctx.lineCap = 'round';
        ctx.shadowColor = this.theme.win; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(this.px(a[0]), this.px(a[1])); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.restore();
        if (t < 1) busy = true;
      }

      // 步数写在最上层，不被获胜连线盖住
      if (this.opts.numbers) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        game.moves.forEach((m, i) => {
          const label = String(i + 1);
          ctx.fillStyle = m.player === BLACK ? '#f3f3f3' : '#222';
          ctx.font = `700 ${geo.cell * (label.length > 2 ? 0.34 : 0.42)}px system-ui, sans-serif`;
          ctx.fillText(label, this.px(m.x), this.px(m.y) + 1);
        });
      }

      if (busy && !this.raf) {
        this.raf = requestAnimationFrame(ts => { this.raf = 0; this.draw(ts); });
      }
    }
  }

  return { BoardView, THEMES };
});
