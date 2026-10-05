/* =====================================================
   TONIX — crypto.js
   Кодирование сообщений чата.

   ВАЖНО: это НЕ сквозное (E2E) шифрование. Ключ выводится из id чата
   (chatId + суффикс — он не меняется ради совместимости со старыми
   сообщениями), поэтому кодирование лишь скрывает текст от случайного
   взгляда. Защиту чата обеспечивают права доступа в базе (RLS).

   Модель как у групп Telegram (облачные чаты): любой участник,
   включая нового, читает всю историю. Сквозное шифрование в группах
   (Signal, WhatsApp, MLS) этого не позволяет — новичок не видит
   сообщений, отправленных до его входа.
   ===================================================== */

// Кодирование данных (UTF-8 safe)
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

// Декодирование данных (UTF-8 safe)
function simpleDecrypt(encryptedData, key) {
    if (!encryptedData) return '';
    // Данные в чужом формате (E2Ev2) — не наш формат, пропускаем
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

// Ключ чата. Суффикс — часть формата уже сохранённых сообщений: его смена сделает их нечитаемыми
function chatKey(chatId) {
    return chatId + '_quantum_e2e';
}
