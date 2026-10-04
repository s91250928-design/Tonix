/* TONIX — sw.js (kill-switch)
   На tonix.app раньше жил Quantum Messenger со своим service worker,
   который кэшировал старые страницы. Этот файл встаёт на его место,
   сносит все старые кэши, снимает регистрацию и перезагружает вкладки.
   После этого пользователи видят только новый Tonix. */

self.addEventListener('install', function (e) {
    self.skipWaiting();
});

self.addEventListener('activate', function (e) {
    e.waitUntil((async function () {
        try {
            // 1. Удаляем все кэши старого Quantum
            const keys = await caches.keys();
            await Promise.all(keys.map(function (k) { return caches.delete(k); }));
        } catch (err) { }
        try {
            // 2. Снимаем регистрацию этого service worker
            await self.registration.unregister();
        } catch (err) { }
        try {
            // 3. Перезагружаем открытые вкладки, чтобы показать свежий Tonix
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach(function (c) { c.navigate(c.url); });
        } catch (err) { }
    })());
});
