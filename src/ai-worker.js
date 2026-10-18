/* 在 Web Worker 里跑 AI 搜索，避免卡住界面。 */
importScripts('rules.js', 'ai.js');

self.onmessage = e => {
  const { id, board, player, level, opts } = e.data;
  const t0 = Date.now();
  const move = GomokuAI.chooseMoveDetailed(board, player, level, opts || {});
  self.postMessage({ id, move, ms: Date.now() - t0 });
};
