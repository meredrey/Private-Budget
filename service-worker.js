const CACHE = ‘private-budget-v1’;
const FILES = [
‘./index.html’
];

// Install — cache the app shell
self.addEventListener(‘install’, e => {
e.waitUntil(
caches.open(CACHE).then(cache => cache.addAll(FILES))
);
self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener(‘activate’, e => {
e.waitUntil(
caches.keys().then(keys =>
Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
)
);
self.clients.claim();
});

// Fetch — serve from cache, fall back to network
self.addEventListener(‘fetch’, e => {
e.respondWith(
caches.match(e.request).then(cached => {
if (cached) return cached;
return fetch(e.request).then(response => {
// Cache new successful responses
if (response && response.status === 200 && response.type === ‘basic’) {
const clone = response.clone();
caches.open(CACHE).then(cache => cache.put(e.request, clone));
}
return response;
}).catch(() => caches.match(’./index.html’));
})
);
});
