/* Build replaces these values with a release-specific complete asset manifest. */
const CACHE_NAME = '__OFFLINE_CACHE_NAME__';
const ASSETS_TO_CACHE = __OFFLINE_ASSETS__;
const OWNED_PREFIXES = ['maranatha-app-', 'morgenster-hospital-'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)));
  // A new release waits until old tabs close, so the shell and JS stay consistent.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE_NAME && OWNED_PREFIXES.some(prefix => name.startsWith(prefix))) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // The SDK handles Firestore/Auth traffic. Cache only this release's own files.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const shell = await cache.match('/index.html');
      return shell || fetch(request);
    }));
    return;
  }
  if (!ASSETS_TO_CACHE.includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(url.pathname, response.clone());
    return response;
  }));
});
