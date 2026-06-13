/* Hifz Progress — offline service worker */
const CACHE = "hifz-v11";
const ASSETS = ["./","index.html","styles.css","app.js","quran-data.js","fonts/scheherazade-arabic.woff2","vendor/firebase-app-compat.js","vendor/firebase-auth-compat.js","firebase-config.js","manifest.json","icon.svg","icon-192.png","icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
// cache-first for our OWN files only. Cross-origin calls (Firebase sign-in,
// Firestore sync to Google's servers) must pass straight through untouched —
// never cache or intercept them, or login/sync would break.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(hit =>
      hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match("index.html"))
    )
  );
});
