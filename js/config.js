/* =====================================================
   TONIX — config.js
   Все настройки проекта в одном месте.
   Меняешь здесь — работает везде.
   ===================================================== */

// Supabase — та же база, что у Quantum Messenger.
// Аккаунты, чаты и гильдии общие для мессенджера и платформы.
const TONIX_CONFIG = {
    // Сеть для авто-деплоя контрактов при создании DAO.
    // true = testnet (для проверки), false = mainnet (боевой запуск).
    deployTestnet: false,

    supabase: {
        url: "https://uiguvfkpbbyvbrabjvso.supabase.co",
        anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpZ3V2ZmtwYmJ5dmJyYWJqdnNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjkzNjIsImV4cCI6MjA4NzQ0NTM2Mn0.lqRTJJlX7erVRVhtHe-S4UNYf9r7Kk8-3_9PiwpVpCI"
    },

    // Storage-бакет для медиа и голосовых (тот же, что в Quantum)
    mediaBucket: "chat-media",

    // Админские UID (те же, что в Quantum)
    admins: [
        "5517e2d5-c502-4070-b9a1-158f13948a0c", // ПК (Mexc38)
        "63896ff1-c34b-4f44-bf31-cc3a5fa424a2"  // iPhone (Tus200)
    ],

    // Карта: какой DAO подключён к какому чату в базе.
    // Ключ — id DAO в интерфейсе Tonix, значение — chat_id из таблицы chats.
    // Чат создаётся автоматически при первом входе (см. chat.js → ensureDaoChat).
    daoChats: {
        "crypto-otc": "97f1e647-daa9-4811-aab8-f1a32f04cabe"
    },

    // Он-чейн казна DAO: multisig-контракт (официальный Multisig v2 от TON).
    // Ключ — id DAO, address — адрес мультисига, testnet: true = тестовая сеть.
    // Баланс читается прямо из блокчейна (см. js/treasury.js). Только чтение.
    daoTreasury: {
        "crypto-otc": {
            address: "EQBDIy4Ec4MCm1dYMht-4Rp6KMPhvWRunGOHg-x10cAdcNHP",
            testnet: false
        }
    },

    // Почта поддержки
    supportEmail: "support@tonix.app"
};

/* Как узнать chat_id гильдии:
   1. Открой Quantum Messenger, зайди в гильдию.
   2. В консоли браузера (F12) выполни:
      sb.from('guild_channels').select('*').eq('guild_id', 'ID_ГИЛЬДИИ').then(r => console.log(r.data))
   3. Скопируй chat_id нужного канала и вставь в daoChats выше. */
