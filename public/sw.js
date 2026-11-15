// Network first, cache as fallback: always the latest version when online, fully usable offline.
const CACHE = 'cuaderno-v36';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/store.js', 'js/model.js', 'js/history.js', 'js/tabs.js', 'js/ui.js', 'js/util.js', 'js/parts.js', 'js/editor.js', 'js/drawing.js', 'js/sheet.js', 'js/image.js', 'js/pdf.js', 'js/theme.js', 'js/transfer.js', 'js/board.js', 'js/widgets.js', 'js/cloud.js', 'js/synccore.js', 'js/firestore.js', 'js/firebase-config.js', 'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs',
  'js/views/home.js', 'js/views/page.js', 'js/views/timetable.js', 'js/views/calendar.js', 'js/views/tasks.js',
  'js/views/trash.js', 'js/views/settings.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    // Only our own old caches: other apps published on the same address (Mi App) keep theirs.
    .then(keys => Promise.all(keys.filter(k => k.startsWith('cuaderno-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
