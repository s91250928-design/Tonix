/* =====================================================
   TONIX — supabase-init.js
   Подключение к базе + вход/регистрация/сессия.

   Требует: config.js (TONIX_CONFIG), SDK supabase-js на странице.
   ===================================================== */

let sb = null;              // клиент Supabase
let isOnlineMode = false;   // есть ли связь с базой
let currentUID = null;      // id вошедшего пользователя

// Доступ из других модулей
try {
    Object.defineProperty(window, 'sb', {
        get: function () { return sb; },
        set: function (v) { sb = v; },
        configurable: true
    });
    Object.defineProperty(window, 'currentUID', {
        get: function () { return currentUID; },
        set: function (v) { currentUID = v; },
        configurable: true
    });
} catch (e) { console.warn('window bind:', e.message); }

// --- Инициализация клиента (настройки realtime) ---
function initSupabase() {
    try {
        if (typeof supabase !== 'undefined') {
            sb = supabase.createClient(TONIX_CONFIG.supabase.url, TONIX_CONFIG.supabase.anonKey, {
                realtime: {
                    params: { eventsPerSecond: 2 },
                    heartbeatIntervalMs: 30000,
                    reconnectAfterMs: function (tries) {
                        return Math.min(1000 * Math.pow(2, tries), 30000);
                    }
                }
            });
            isOnlineMode = !(typeof navigator !== 'undefined' && navigator.onLine === false);
            return true;
        }
        return false;
    } catch (e) {
        console.error('initSupabase:', e.message);
        return false;
    }
}

// Вход в Tonix — только через TON-кошелёк (см. auth.js).
// Email/пароль намеренно НЕ используются: меньше кода, меньше поверхности атаки.

// --- Выход ---
async function tonixLogout() {
    if (!isOnlineMode || !currentUID) return;
    try {
        await sb.from('users').update({ status: 'offline' }).eq('id', currentUID);
        await sb.auth.signOut();
        currentUID = null;
        sb.removeAllChannels();
    } catch (e) { console.error('Выход:', e); }
}

// --- Восстановление сессии ---
async function ensureAuth() {
    if (currentUID) return true;
    try {
        const { data: { session } } = await sb.auth.getSession();
        if (session && session.user) { currentUID = session.user.id; return true; }
    } catch (e) { }
    try {
        const { data: r } = await sb.auth.refreshSession();
        if (r && r.session) { currentUID = r.session.user.id; return true; }
    } catch (e) { }
    return false;
}

// --- Хелпер: base64 → Blob (нужен для загрузки медиа) ---
function base64ToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const b64 = atob(parts[1]);
    const arr = new Uint8Array(b64.length);
    for (let i = 0; i < b64.length; i++) arr[i] = b64.charCodeAt(i);
    return new Blob([arr], { type: mime });
}
