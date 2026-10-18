# 五子棋

纯前端（HTML + Canvas + 原生 JS）实现，无需构建，直接用浏览器打开 `index.html` 即可。

## 功能
- 15×15 棋盘，黑先；横、竖、斜任意方向连成五子（含长连）获胜
- 人机对战（可选执黑/执白，简单/普通/困难三档）与双人同屏对战
- 悔棋（人机模式下一次撤回双方各一步）、重新开始
- 最后一步标记、获胜连线高亮、悬停落子预览；手机和深色模式适配
- **可安装的 App（PWA）**：全屏运行、完全离线可用，关闭后自动保存并继续上一局

## 结构
| 文件 | 作用 |
|---|---|
| `src/rules.js` | 棋盘与胜负判定（纯函数） |
| `src/game.js`  | 对局状态：落子、悔棋 |
| `src/ai.js`    | AI：五格窗口启发式评分（进攻 + 防守） |
| `src/ui.js`    | Canvas 绘制与交互 |
| `tests/test.js`| `node tests/test.js` 运行规则与 AI 测试 |

## 安装成手机 App
1. 在仓库 **Settings → Pages** 把 Source 设为 **GitHub Actions**，推送后会自动部署到
   `https://<用户名>.github.io/gomoku/`
2. 用手机打开该地址：
   - **iPhone（Safari）**：点分享按钮 → 添加到主屏幕
   - **Android（Chrome）**：菜单 → 安装应用 / 添加到主屏幕
3. 之后从桌面图标打开即可，无需联网。

本地预览：`python3 -m http.server 8000`，访问 `http://localhost:8000`
（Service Worker 需要 http(s)，直接双击打开 `index.html` 也能玩，只是没有离线缓存）。

更新应用文件后，记得递增 `sw.js` 里的 `CACHE` 版本号，用户才会拿到新版。
