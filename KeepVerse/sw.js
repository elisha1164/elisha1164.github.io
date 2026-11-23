/* v1.2.0 - KeepVerse 離線 PWA Service Worker */

const CACHE_NAME = 'keepverse-v3';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './og-image.png',
  './css/style.css',
  './js/app.js',
  './js/bible.js',
  './js/decks.js',
  './js/diff.js',
  './js/storage.js',
  './js/zhuyin.js',
  './js/zhuyin-data.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  '../rcuv.json',
  '../esv2016.json',
  './decks/index.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      try {
        const res = await fetch('./decks/index.json');
        if (res.ok) {
          const deckFiles = await res.json();
          if (Array.isArray(deckFiles)) {
            await cache.addAll(deckFiles.map((f) => `./decks/${f}`));
          }
        }
      } catch {
        // Ignore if index fetch fails during offline install retry
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('Network and cache miss');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) {
    cache.put(request, fresh.clone());
  }
  return fresh;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok) {
        cache.put(request, fresh.clone());
      }
      return fresh;
    })
    .catch(() => null);

  if (cached) return cached;
  const networkRes = await fetchPromise;
  if (networkRes) return networkRes;
  if (request.mode === 'navigate') {
    const shell = await cache.match('./index.html');
    if (shell) return shell;
  }
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/decks/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.pathname.endsWith('/rcuv.json') ||
    url.pathname.endsWith('/esv2016.json') ||
    url.pathname.includes('/icons/') ||
    url.pathname.endsWith('/og-image.png')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
