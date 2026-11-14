const CACHE_NAME = 'cmv-pwa-v2';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // SE FOR CHAMADA PARA A API NO RENDER, NUNCA CACHEAR! Vai direto à rede.
    if (url.hostname.includes('onrender.com') || url.pathname.includes('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({ erro: 'Servidor indisponível ou dormindo. Tente novamente.' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Para arquivos estáticos do app
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});