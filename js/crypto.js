/* =====================================================
   TONIX — crypto.js
   Шифрование сообщений (перенесено из Quantum Messenger).

   Модель как у Telegram (облачные чаты):
   единый ключ чата = chatId + '_quantum_e2e'.
   Любой участник (включая нового) читает всю историю.
   ===================================================== */

// Шифрование данных (UTF-8 safe) — 1:1 из Quantum
function simpleEncrypt(data, key) {
    if (!data) return '';
    try {
        // Кодируем UTF-8 строку в bytes
        var bytes = new TextEncoder().encode(data);
        var keyBytes = new TextEncoder().encode(key);
        var result = new Uint8Array(bytes.length);
        for (var i = 0; i < bytes.length; i++) {
            result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
        }
        // Конвертируем в base64
        var binary = '';
        for (var j = 0; j < result.length; j++) {
            binary += String.fromCharCode(result[j]);
        }
        return btoa(binary);
    } catch (e) {
        console.error('Ошибка шифрования:', e);
        return btoa(unescape(encodeURIComponent(data)));
    }
}

// Дешифрование данных (UTF-8 safe) — 1:1 из Quantum
function simpleDecrypt(encryptedData, key) {
    if (!encryptedData) return '';
    // E2E v2 данные (личные переписки Quantum) — не наш формат, пропускаем
    if (typeof encryptedData === 'string' && encryptedData.startsWith('E2Ev2:')) return '';
    try {
        var binary = atob(encryptedData);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        var keyBytes = new TextEncoder().encode(key);
        var result = new Uint8Array(bytes.length);
        for (var j = 0; j < bytes.length; j++) {
            result[j] = bytes[j] ^ keyBytes[j % keyBytes.length];
        }
        return new TextDecoder().decode(result);
    } catch (e) {
        // Тихий fail — данные не в этом формате или повреждены
        return '';
    }
}

// Ключ чата — как в Quantum
function chatKey(chatId) {
    return chatId + '_quantum_e2e';
}
