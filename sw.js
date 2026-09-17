
const CACHE_NAME = 'morgenster-hospital-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://i.ibb.co/TDT9QtC9/images.png', // Explicitly cache the hospital logo
  'https://cdn.tailwindcss.com' // Explicitly cache Tailwind CSS
];

// Install Event: Cache core assets immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. EXCLUDE: Firebase/Firestore Data and Auth APIs
  // We MUST return here to let the Firebase SDK handle its own offline persistence (IndexedDB).
  // If the SW caches these, it breaks the SDK's sync logic.
  if (url.origin.includes('firestore.googleapis.com') || 
      url.origin.includes('identitytoolkit.googleapis.com') ||
      url.origin.includes('securetoken.googleapis.com') ||
      url.href.includes('firebaseio.com')) {
    return; 
  }

  // 2. NAVIGATION: Network First, Fallback to Cache
  // For HTML pages, try to get the latest from network. If offline, serve cached index.html.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 3. STATIC ASSETS (JS, CSS, Images): Stale-While-Revalidate
  // This handles local files AND external CDNs (React, Lucide, Tailwind, Logo).
  // We attempt to serve from cache for speed, but update the cache in the background.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Check if we received a valid response
        if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      }).catch(err => {
          // Network failed. If we have a cachedResponse, the app keeps working.
          // If no cache and no network, it will fail, but that's expected for new uncached assets.
          // console.log('Network fetch failed for', event.request.url);
      });

      return cachedResponse || fetchPromise;
    })
  );
});
