# 项目说明

五子棋网页游戏，可安装为 PWA。纯前端，无构建步骤。

## 用户偏好（必须遵守）
- **发链接时，每个链接单独占一行**，前后不要紧挨着中文或其他文字，否则链接会被识别错误、点不开。
  正确写法：先写一句说明，换行，单独一行放链接，再换行继续写。
- 与用户用中文交流。

## 开发约定
- 运行测试：`node tests/test.js`
- 本地预览：`python3 -m http.server 8000`（Service Worker 需要 http）
- 修改任何被缓存的文件（`index.html`、`style.css`、`src/*`、`icons/*`、`manifest.webmanifest`）后，
  递增 `sw.js` 里的 `CACHE` 版本号，否则用户拿不到新版。
- 仓库地址是 `zxy8125ss/gomoku`，不是 `Game`。
