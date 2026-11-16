const CACHE = 'll-v11';
const ASSETS = [
  './', './index.html', './style.css', './style2.css', './ll.css',
  './store.js', './bookstore.js', './lprompts.js', './api.js', './lcastparse.js', './gridmodel.js', './lengine.js', './lcheck.js', './lrelaycheck.js',
  './app.js', './appbook.js', './appunits.js', './appunit.js', './appflow.js', './appfacts.js', './appaudit.js', './backup.js', './appbackup.js', './revise.js', './apprevise.js', './appgrid.js',
  './manifest.json', './icon-120.png', './icon-152.png', './icon-167.png', './icon-180.png', './icon-192.png', './icon-256.png', './icon-512.png', './icon-1024.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const cp = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
  );
});
