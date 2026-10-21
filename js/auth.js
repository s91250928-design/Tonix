/* =====================================================
   TONIX — auth.js
   Вход через TON-кошелёк: TON Connect 5 → подпись (tonProof)
   → edge-функция ton-wallet-auth → сессия Supabase.
   Порядок: сервер выдаёт одноразовый payload → кошелёк его подписывает →
   сервер проверяет подпись по спецификации (адрес из walletStateInit,
   ключ из walletStateInit или для кошелька Telegram — из блокчейна).

   Аккаунт создаётся
   автоматически при первом входе (это делает edge-функция).

   Требует: config.js, supabase-init.js, SDK @tonconnect/ui.
   ===================================================== */

let tonConnectUI = null;
let _tonixSignIn = false;      // флаг: идёт вход (а не другая операция)
let _tonixAuthResolve = null;  // промис входа: разрешается после успеха

// --- Инициализация TON Connect (один раз при загрузке) ---
async function initTonConnect() {
    if (tonConnectUI) { try{ window.tonConnectUI = tonConnectUI; }catch(e){} return tonConnectUI; }
    if (typeof TON_CONNECT_UI === 'undefined') {
        console.warn('[TON] SDK не загружен');
        return null;
    }
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: window.location.origin + '/tonconnect-manifest.json',
        buttonRootId: null,
        // config.ton.org недоступен в ряде регионов → зеркало официального списка кошельков.
        // Свою запись «telegram-wallet» больше не добавляем: в ней были устаревшие
        // ссылка t.me/wallet и мост bridge.ton.space. Актуальные кошельки Telegram
        // (Walt, встроенный кошелёк Telegram, Gram Wallet) приходят из официального списка.
        walletsListSource: 'https://raw.githubusercontent.com/ton-blockchain/wallets-list/main/wallets-v2.json'
    });

    // Кошелёк подключился → если это вход, проверяем подпись и получаем сессию
    tonConnectUI.onStatusChange(async function (wallet) {        if (!wallet || !_tonixSignIn) return;
        _tonixSignIn = false;
        const proofItem = wallet.connectItems && wallet.connectItems.tonProof;
        if (!proofItem || !('proof' in proofItem)) {
            _finishAuth({ ok: false, error: 'Кошелёк не вернул подпись (tonProof)' });
            try { await tonConnectUI.disconnect(); } catch (e) { }
            return;
        }
        const result = await tonWalletAuth(wallet, proofItem.proof);
        if (result.ok) {
            currentUID = result.user_id;
        } else {
            try { await tonConnectUI.disconnect(); } catch (e) { }
        }
        _finishAuth(result);
    });

    console.log('[TON] Connect UI готов');
    /* Делаем объект глобальным — иначе multisig-deploy.js (авто-деплой контракта)
       не видит tonConnectUI (он объявлен через let и виден только в этом файле). */
    try{ window.tonConnectUI = tonConnectUI; }catch(e){}
    return tonConnectUI;
}

function _finishAuth(result) {
    if (_tonixAuthResolve) { _tonixAuthResolve(result); _tonixAuthResolve = null; }
    /* Единая точка: интерфейс обновляется после ЛЮБОГО успешного входа,
       откуда бы его ни запустили (шапка, вступление в DAO, создание DAO). */
    try {
        if (result && result.ok && typeof window.tonixOnAuth === 'function') {
            window.tonixOnAuth(result);
        }
    } catch (e) { }
}

// --- Кнопка «Привязать кошелёк»: открывает выбор кошелька и ждёт входа ---
// Возвращает Promise<{ok, user_id?, is_new_user?, error?}>
async function tonixConnectWallet() {
    const ui = await initTonConnect();
    if (!ui) return { ok: false, error: 'TON Connect не готов, перезагрузите страницу' };

    // Чистим мусор прошлых сессий TonConnect
    try {
        Object.keys(localStorage)
            .filter(function (k) { return k.indexOf('ton-connect-') === 0; })
            .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { }
    try { if (ui.connected) await ui.disconnect(); } catch (e) { }

    // Одноразовую строку для подписи (payload) выдаёт сервер — так требует
    // спецификация ton_proof: подпись нельзя переиграть или подделать заранее.
    let payload;
    try {
        payload = await tonixGetProofPayload();
    } catch (e) {
        return { ok: false, error: 'Не удалось начать вход: ' + (e && e.message || 'сеть') };
    }
    ui.setConnectRequestParameters({ state: 'ready', value: { tonProof: payload } });

    _tonixSignIn = true;
    const done = new Promise(function (resolve) { _tonixAuthResolve = resolve; });
    await ui.openModal();
    return done;
}

// Адрес edge-функции входа
function tonixAuthFnUrl() {
    const supabaseUrl = sb.supabaseUrl || (sb.rest && sb.rest.url) || '';
    return supabaseUrl.replace('/rest/v1', '') + '/functions/v1/ton-wallet-auth';
}

// --- Одноразовый payload для ton_proof (живёт 10 минут) ---
async function tonixGetProofPayload() {
    if (!sb) throw new Error('Supabase не готов');
    const anonKey = sb.supabaseKey || '';
    const res = await fetch(tonixAuthFnUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + anonKey, 'apikey': anonKey },
        body: JSON.stringify({ action: 'challenge' })
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.payload) throw new Error(data.error || ('HTTP ' + res.status));
    return data.payload;
}

// --- Подпись кошелька → сессия Supabase ---
async function tonWalletAuth(wallet, proof) {
    try {
        if (!sb) return { ok: false, error: 'Supabase не готов' };
        if (!wallet || !wallet.account || !proof) return { ok: false, error: 'Невалидные параметры' };

        const url = tonixAuthFnUrl();
        const anonKey = sb.supabaseKey || '';

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + anonKey,
                'apikey': anonKey
            },
            body: JSON.stringify({
                address: wallet.account.address,
                // publicKey есть не у всех кошельков (у кошелька Telegram его нет) —
                // сервер берёт ключ сам из walletStateInit или из блокчейна
                publicKey: wallet.account.publicKey || null,
                walletStateInit: wallet.account.walletStateInit,
                proof: proof,
                network: wallet.account.chain
            })
        });
        const data = await res.json();
        if (!res.ok) {
            // reason — короткий код причины от сервера (например wallettg-inactive), пишем в консоль для разбора
            if (data.reason) console.warn('[TON] вход отклонён сервером:', data.reason);
            return { ok: false, error: data.error || ('HTTP ' + res.status), reason: data.reason || null };
        }

        // Применяем сессию — с этого момента пользователь «вошёл»
        if (data.access_token && data.refresh_token) {
            const { error: setErr } = await sb.auth.setSession({
                access_token: data.access_token,
                refresh_token: data.refresh_token
            });
            if (setErr) return { ok: false, error: 'Не удалось применить сессию: ' + setErr.message };
        }
        return {
            ok: true,
            user_id: data.user_id,
            is_new_user: data.is_new_user,
            wallet_address: data.wallet_address
        };
    } catch (err) {
        return { ok: false, error: 'Ошибка сети: ' + (err && err.message) };
    }
}

// --- Отключение кошелька ---
async function tonixDisconnectWallet() {
    if (tonConnectUI && tonConnectUI.connected) {
        try { await tonConnectUI.disconnect(); } catch (e) { }
    }
}
