self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Permite que o app funcione e busque dados da API normalmente
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});