// Service worker: makes the app installable and usable offline.
// Bump VERSION when you publish a new version so devices pick it up.
const VERSION = 'acqc-1.0.1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/auth.js', 'js/config.js', 'js/store.js', 'js/logic.js', 'js/models.js',
  'js/checklists.js', 'js/pdf.js', 'js/qrcode.js',
  'fonts/poppins-Light.woff', 'fonts/poppins-Regular.woff', 'fonts/poppins-Medium.woff', 'fonts/poppins-Bold.woff',
  'icons/icon-192.png', 'icons/icon-512.png', 'assets/logo.svg',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // never touch Microsoft/Graph calls
  // network first (so updates arrive quickly), cache as fallback for offline use
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
