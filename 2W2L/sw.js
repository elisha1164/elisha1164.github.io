/**
 * 版本號：v1.0 (Stale-while-revalidate Pattern)
 * 修改主旨：實作背景驗證機制，透過 ETag 比對達成自動更新，無需維護版本號。
 */

const CACHE_NAME = 'twoways-app-cache-v1';

// 預先快取應用程式外殼 (App Shell)
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './Badge1.json',
    './Badge2.json',
    './Badge3.json',
    './Badge4.json',
    './Badge5.json',
    './Badge6.json'
];

// 安裝 Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
});

// 啟動 Service Worker：清理舊快取
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
});

// 攔截請求：實作 Stale-while-revalidate
self.addEventListener('fetch', (event) => {
    // 我們只針對 GET 請求進行處理
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                
                // 背景執行：驗證與更新
                const fetchPromise = fetch(event.request, { 
                    cache: 'no-cache', // 強制命令瀏覽器略過 HTTP Cache，直接詢問伺服器最新狀態
                    mode: 'no-cors'    // 對於外部 CDN 資源保持相容
                }).then((networkResponse) => {
                    // 若網路請求成功，檢查是否需要更新
                    if (networkResponse.ok) {
                        // 比對 ETag
                        const oldETag = cachedResponse ? cachedResponse.headers.get('ETag') : null;
                        const newETag = networkResponse.headers.get('ETag');

                        // 若 ETag 不同，更新快取 (即使沒有 ETag，只要有新內容也更新)
                        if (newETag && oldETag !== newETag) {
                            cache.put(event.request, networkResponse.clone());
                        }
                    }
                    return networkResponse;
                }).catch(() => {
                    // 網路失敗則忽略
                });

                // 回傳邏輯：有快取則回傳快取，否則等待網路請求
                return cachedResponse || fetchPromise;
            });
        })
    );
});