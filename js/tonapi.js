/* ============================================================
   TONIX — tonapi.js
   Один вход для всех запросов к tonapi.io.

   Зачем: при открытии DAO разные части страницы (казна, список
   токенов, главный токен, настройки владельца, выплаты, история)
   одновременно спрашивали у tonapi ОДНО И ТО ЖЕ — до 5 раз подряд.
   Бесплатный tonapi без ключа пускает примерно 1 запрос в секунду,
   на остальные отвечает 429 «слишком много запросов». Такие ответы
   тихо терялись: главный токен казны откатывался на TON, а список
   токенов в настройках приходил пустым — «настройка слетает».

   Что делает:
     • одинаковые запросы склеиваются в один (общий ответ);
     • ответ хранится 20 секунд — повторные вызовы берут его;
     • запросы идут по очереди, не чаще ~1 в секунду;
     • на 429 — ещё до 3 попыток с паузой.
   Только чтение публичных данных блокчейна. Ключей и денег не касается.
   ============================================================ */
(function () {
    "use strict";

    var TTL = 20000;          /* сколько держим готовый ответ, мс */
    var GAP = 1100;           /* пауза между запросами к tonapi, мс */
    var cache = {};           /* url -> {t, data} */
    var inflight = {};        /* url -> Promise */
    var queue = Promise.resolve();
    var last = 0;

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    /* Ставим запрос в общую очередь, чтобы не превышать лимит */
    function scheduled(url) {
        var run = queue.then(async function () {
            var wait = last + GAP - Date.now();
            if (wait > 0) await sleep(wait);
            for (var attempt = 0; attempt < 4; attempt++) {
                last = Date.now();
                var r = await fetch(url, { headers: { "Accept": "application/json" } });
                if (r.status === 429 && attempt < 3) {
                    console.warn("[tonapi] 429, повтор через", (attempt + 1) * 1200, "мс:", url);
                    await sleep((attempt + 1) * 1200);
                    continue;
                }
                if (!r.ok) {
                    var err = new Error("tonapi " + r.status);
                    err.status = r.status;
                    throw err;
                }
                return r.json();
            }
        });
        /* Очередь не должна «застревать» на ошибке одного запроса */
        queue = run.catch(function () {});
        return run;
    }

    /* Главная функция: JSON по адресу tonapi (с кешем и склейкой) */
    window.tonixTonapi = function (url) {
        var hit = cache[url];
        if (hit && Date.now() - hit.t < TTL) return Promise.resolve(hit.data);
        if (inflight[url]) return inflight[url];
        var p = scheduled(url).then(function (data) {
            cache[url] = { t: Date.now(), data: data };
            delete inflight[url];
            return data;
        }, function (e) {
            delete inflight[url];
            throw e;
        });
        inflight[url] = p;
        return p;
    };

    /* Сбросить кеш (например, после перевода из казны) */
    window.tonixTonapiForget = function (prefix) {
        Object.keys(cache).forEach(function (k) { if (!prefix || k.indexOf(prefix) === 0) delete cache[k]; });
    };
})();
