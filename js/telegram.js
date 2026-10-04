/* =====================================================
   TONIX — telegram.js
   Обёртка Telegram Mini App.

   Если Tonix открыт ВНУТРИ Telegram — включается режим
   Mini App: раскрытие на весь экран, подстройка под тему,
   данные пользователя Telegram, кнопка «Назад».

   Если открыт в обычном браузере — ничего не мешает,
   всё работает как обычный сайт.

   Требует: скрипт telegram-web-app.js на странице (в <head>).
   ===================================================== */

// Внутри Telegram или нет?
function isTelegram() {
    return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
}

// Данные пользователя Telegram (имя, id) — если есть
function tgUser() {
    try {
        return window.Telegram.WebApp.initDataUnsafe.user || null;
    } catch (e) { return null; }
}

// Инициализация Mini App
function initTelegram() {
    if (!window.Telegram || !window.Telegram.WebApp) return false;
    const tg = window.Telegram.WebApp;
    try {
        tg.ready();          // сообщаем Telegram, что приложение загрузилось
        tg.expand();         // раскрываем на весь экран
        if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); // чтобы свайп не закрывал чат

        // Помечаем body — чтобы CSS мог подстроиться под Telegram
        document.body.classList.add('in-telegram');

        // Кнопка «Назад» Telegram → наша навигация домой
        if (tg.BackButton) {
            tg.BackButton.onClick(function () {
                if (typeof closeModal === 'function') closeModal();
                if (typeof go === 'function') go('home');
                tg.BackButton.hide();
            });
        }

        console.log('[Telegram] Mini App готов', tgUser() ? ('· ' + (tgUser().first_name || '')) : '');
        return true;
    } catch (e) {
        console.warn('[Telegram] init:', e.message);
        return false;
    }
}

// Показать/скрыть кнопку «Назад» Telegram (зовём при входе вглубь)
function tgBack(show) {
    try {
        const b = window.Telegram.WebApp.BackButton;
        if (show) b.show(); else b.hide();
    } catch (e) { }
}

// Лёгкая вибрация (приятная мелочь при действиях)
function tgHaptic(type) {
    try {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(type || 'light');
    } catch (e) { }
}

/* =====================================================
   Связка аккаунта Tonix с телеграм-аккаунтом.

   Нужна, чтобы бот мог написать человеку о решении,
   ждущем подписи. Работает только внутри Mini App:
   в обычном браузере брать нечего и ничего не делаем.

   Проверку подлинности делает сервер (link-telegram):
   строка initData подписана Telegram, и подпись
   пересчитывается ботовым токеном. Браузеру здесь
   не верят — он лишь передаёт строку дальше.
   ===================================================== */

// Чтобы не дёргать сервер на каждый чих: одна попытка за загрузку
let _tgLinkTried = false;

async function tonixLinkTelegram(force) {
    if (_tgLinkTried && !force) return null;
    if (!isTelegram()) return null;
    if (typeof currentUID === 'undefined' || !currentUID) return null;
    if (typeof sb === 'undefined' || !sb) return null;

    const initData = window.Telegram.WebApp.initData;
    if (!initData) return null;

    _tgLinkTried = true;

    try {
        // Уже связано? Тогда сервер не тревожим.
        const cur = await sb.from('user_telegram')
            .select('tg_id').eq('user_uid', currentUID).limit(1).maybeSingle();
        if (cur && cur.data && cur.data.tg_id) {
            console.log('[Telegram] аккаунт уже связан');
            return { ok: true, already: true };
        }
    } catch (e) { /* нет строки — значит связываем */ }

    try {
        const s = await sb.auth.getSession();
        const jwt = s && s.data && s.data.session ? s.data.session.access_token : null;
        if (!jwt) return null;

        const url = TONIX_CONFIG.supabase.url + '/functions/v1/link-telegram';
        const r = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': TONIX_CONFIG.supabase.anonKey,
                'Authorization': 'Bearer ' + jwt
            },
            body: JSON.stringify({ init_data: initData })
        });
        const j = await r.json();

        if (j && j.ok) {
            console.log('[Telegram] аккаунт связан, tg_id:', j.tg_id);
        } else {
            // Не ругаемся всплывающим окном: связка — вещь фоновая,
            // без неё платформа работает как раньше.
            console.warn('[Telegram] связать не удалось:', j && j.error,
                (j && j.hint) ? ('· ' + j.hint) : '',
                (j && j.fields) ? ('· поля: ' + j.fields) : '');
        }
        return j;
    } catch (e) {
        console.warn('[Telegram] связать не удалось:', e && e.message);
        return null;
    }
}

try { window.tonixLinkTelegram = tonixLinkTelegram; } catch (e) { }
