/* Service Worker：首次访问后缓存全部资源，之后可完全离线使用。
 * 更新应用文件时，递增 CACHE 版本号即可让用户拿到新版。 */
const CACHE = 'gomoku-v5';
const ASSETS = [
  './', 'index.html', 'style.css',
  'src/rules.js', 'src/game.js', 'src/ai.js', 'src/ai-worker.js',
  'src/store.js', 'src/audio.js', 'src/commentary.js', 'src/voice.js', 'src/render.js', 'src/ui.js',
  'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('gomoku-v') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 缓存优先；没命中再走网络，并顺手写入缓存
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
