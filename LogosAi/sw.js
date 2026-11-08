/* 
 * Version: v5.1.1
 * Summary: 更新 PWA 快取版本並為 HTML 導覽請求改採 Network-First（離線退回快取）且預快取時繞過瀏覽器 HTTP 磁碟快取，確保新版部署立即生效。
 */

const CACHE_NAME = 'logosai-v5.1.1';
const LOCAL_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];
const CDN_STATIC_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Noto+Sans+TC:wght@300;400;500;600;700&family=Noto+Serif+TC:wght@400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

// Install Event: Cache essential static resources (bypassing stale HTTP disk cache for local shell)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[LogosAI SW] Pre-caching static assets');
      const localRequests = LOCAL_SHELL_ASSETS.map((url) => new Request(url, { cache: 'reload' }));
      await cache.addAll(localRequests).catch((err) => {
        console.warn('[LogosAI SW] Local shell precache warning:', err);
      });
      await cache.addAll(CDN_STATIC_ASSETS).catch((err) => {
        console.warn('[LogosAI SW] Non-critical CDN assets precache warning:', err);
      });
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
            console.log('[LogosAI SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Network-first for API, Cache-first with stale-while-revalidate for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass cache for API calls (Cloudflare Worker or Gemini API)
  if (event.request.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  // Network first for workers / API endpoints
  if (url.hostname.includes('workers.dev') || url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: '網路連線中斷，無法連接至 LogosAI 後端' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Network-first for HTML navigation / index.html so new deployments take effect on first load
  const isHtmlNavigation =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html');

  if (isHtmlNavigation && url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => cached || caches.match('./index.html'));
        })
    );
    return;
  }

  // Cache-first for static resources
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for stale-while-revalidate
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Ignore offline errors for bg fetch */});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      });
    })
  );
});
