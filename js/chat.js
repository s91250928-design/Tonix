/* =====================================================
   TONIX — chat.js
   Групповой чат DAO. Логика перенесена из Quantum Messenger:
   те же таблицы (chats, user_chats, messages), тот же Storage
   (bucket chat-media), тот же формат сообщений — чаты Tonix
   при желании открываются и в Quantum.

   Модель как у групп Telegram: без сквозного шифрования, история
   видна всем участникам; см. пояснение в crypto.js.
   Требует: config.js, crypto.js, supabase-init.js.
   ===================================================== */

/* =====================================================
   Ссылки на медиа чата.

   Раньше файлы лежали в публичном бакете: ссылка на фото из
   закрытого DAO открывалась кем угодно без входа. Политики базы
   тут не помогали — они защищают строки, а не содержимое
   хранилища. Получалось, что переписка закрыта, а картинки из
   неё нет.

   Теперь бакет приватный, и ссылка выдаётся на время — только
   тому, кто состоит в этом чате. Проверяет это сама база.

   Старые сообщения хранят полный публичный адрес. Путь внутри
   него тот же, поэтому вытаскиваем путь и подписываем его —
   переписка не ломается.
   ===================================================== */

var _tonixUrlCache = new Map();

function tonixMediaPath(raw) {
    if (!raw) return '';
    var s = String(raw);
    var bucket = TONIX_CONFIG.mediaBucket;
    // Полный публичный адрес: …/object/public/<bucket>/<путь>
    var marker = '/' + bucket + '/';
    var at = s.indexOf(marker);
    if (at !== -1) return s.slice(at + marker.length).split('?')[0];
    // Уже голый путь
    if (s.indexOf('http') !== 0) return s.split('?')[0];
    return '';
}

async function tonixMediaUrl(raw) {
    var path = tonixMediaPath(raw);
    if (!path) return null;

    var hit = _tonixUrlCache.get(path);
    if (hit && hit.until > Date.now()) return hit.url;

    try {
        // Четыре часа: достаточно для долгого чтения чата,
        // но ссылка не живёт вечно, если её кому-то переслали.
        var r = await sb.storage.from(TONIX_CONFIG.mediaBucket)
            .createSignedUrl(path, 4 * 3600);
        if (r.error || !r.data || !r.data.signedUrl) {
            console.warn('[TonixChat] ссылка на медиа не выдана:', r.error && r.error.message);
            return null;
        }
        _tonixUrlCache.set(path, {
            url: r.data.signedUrl,
            until: Date.now() + 3.5 * 3600 * 1000 // обновим заранее
        });
        return r.data.signedUrl;
    } catch (e) {
        console.warn('[TonixChat] ссылка на медиа:', e && e.message);
        return null;
    }
}

try { window.tonixMediaUrl = tonixMediaUrl; } catch (e) { }

// --- Чат DAO существует? Если нет — создаём (первый вошедший) ---
async function ensureDaoChat(daoKey, daoName) {
    const chatId = TONIX_CONFIG.daoChats[daoKey];
    if (!chatId) { console.error('[TonixChat] Нет chat_id для DAO:', daoKey); return null; }
    try {
        const { data: existing } = await sb.from('chats').select('id').eq('id', chatId).maybeSingle();
        if (!existing) {
            // Формат создания — как onlineCreateChat в Quantum
            const { error } = await sb.from('chats').insert({
                id: chatId, name: daoName || 'Tonix DAO', is_group: true,
                participants: [currentUID], created_by: currentUID,
                created_at: new Date().toISOString(),
                last_message: '', last_time: new Date().toISOString()
            });
            if (error) { console.error('[TonixChat] Не удалось создать чат:', error.message); return null; }
        }
        return chatId;
    } catch (e) { console.error('[TonixChat] ensureDaoChat:', e.message); return null; }
}

// --- Вступление в чат DAO (членство: строка в user_chats + participants) ---
async function joinDaoChat(chatId) {
    if (!currentUID || !chatId) return false;
    try {
        // Связь user_chats (как в Quantum). Дубликат — не ошибка.
        const { data: link } = await sb.from('user_chats').select('user_id')
            .eq('user_id', currentUID).eq('chat_id', chatId).maybeSingle();
        if (!link) {
            const { error } = await sb.from('user_chats').insert({ user_id: currentUID, chat_id: chatId });
            if (error && error.code !== '23505') { console.warn('[TonixChat] user_chats:', error.message); }
        }
        // Добавляем себя в participants чата
        const { data: chatRow } = await sb.from('chats').select('participants').eq('id', chatId).maybeSingle();
        if (chatRow && Array.isArray(chatRow.participants) && chatRow.participants.indexOf(currentUID) === -1) {
            const updated = chatRow.participants.concat([currentUID]);
            await sb.from('chats').update({ participants: updated }).eq('id', chatId);
        }
        return true;
    } catch (e) { console.warn('[TonixChat] joinDaoChat:', e.message); return false; }
}

// --- Загрузка сообщений (расшифровка: JSON → XOR-ключ чата) ---
async function loadChatMessages(chatId, limit) {
    const { data, error } = await sb.from('messages')
        .select('id, sender_uid, content, created_at, edited_at, pinned_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(limit || 100);
    if (error) { console.error('[TonixChat] load:', error.message); return []; }

    const key = chatKey(chatId);
    const out = [];
    (data || []).reverse().forEach(function (row) {
        const contentStr = (typeof row.content === 'string') ? row.content
            : (row.content != null ? JSON.stringify(row.content) : '');
        let m = null;
        try {
            // Уже объект (JSONB) или открытый JSON
            m = (typeof row.content === 'object' && row.content !== null) ? row.content : JSON.parse(contentStr);
        } catch (e) {
            // Telegram-style XOR (наш формат)
            try { m = JSON.parse(simpleDecrypt(contentStr, key)); }
            catch (e2) {
                // Старые E2E-сообщения Quantum (Sender Keys / E2Ev2) — нам не прочитать
                m = { id: row.id, text: '🔒 Сообщение из старой версии', type: 'text' };
            }
        }
        if (!m || typeof m !== 'object') return;
        if (!m.id) m.id = row.id;
        m.senderUid = m.senderUid || row.sender_uid;
        m._ts = row.created_at;
        m._edited = row.edited_at || null;   // отметку ставит база, не клиент
        m._pinned = row.pinned_at || null;
        out.push(m);
    });

    // Имена и аватарки отправителей — из профилей Tonix.
    // Если профиля нет, подставляем короткий адрес кошелька: людям нужны
    // различимые собеседники, а не одинаковые «Участник».
    const uids = Array.from(new Set(out.map(m => m.senderUid).filter(Boolean)));
    if (uids.length) {
        try {
            if (typeof tonixGetProfiles === 'function') await tonixGetProfiles(uids);
            const wal = {};
            try {
                const { data: ws } = await sb.from('user_wallets').select('user_id, wallet_address').in('user_id', uids);
                (ws || []).forEach(w => { wal[w.user_id] = w.wallet_address; });
            } catch (e) { }
            out.forEach(m => {
                if (!m.senderName) {
                    m.senderName = (typeof tonixDisplayName === 'function')
                        ? tonixDisplayName(m.senderUid, wal[m.senderUid])
                        : (typeof T === 'function' ? T('g_member') : 'Member');
                }
                m.senderWallet = wal[m.senderUid] || null;
            });
        } catch (e) { }
    }
    return out;
}

// --- Отправка (текст / медиа / голосовое) ---
// media: { dataUrl, name, mime } | audio: { dataUrl }
async function sendChatMessage(chatId, opts) {
    if (!currentUID) { console.warn('[TonixChat] Не авторизован'); return null; }
    const msgId = crypto.randomUUID ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).substr(2);

    const now = new Date();
    const msgData = {
        id: msgId,
        text: (opts.text || '').trim(),
        type: 'text',
        time: ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2),
        senderUid: currentUID
    };

    // Медиа-файл → Storage (пути как в Quantum: chat_media/<chatId>/<msgId>)
    if (opts.media && opts.media.dataUrl) {
        const blob = base64ToBlob(opts.media.dataUrl);
        const path = 'chat_media/' + chatId + '/' + msgId;
        const { error: upErr } = await sb.storage.from(TONIX_CONFIG.mediaBucket).upload(path, blob, { upsert: true });
        if (!upErr) {
            /* Храним путь, а не адрес: адрес теперь временный
               и выдаётся при показе тому, у кого есть доступ. */
            msgData.fileUrl = path;
            msgData.fileData = path;
            msgData.fileName = opts.media.name || 'file';
            const mime = opts.media.mime || blob.type || '';
            msgData.type = mime.indexOf('image') === 0 ? 'image'
                : mime.indexOf('video') === 0 ? 'video' : 'file';
        } else {
            // Тихо терять файл нельзя: человек ждёт, что вложение ушло.
            console.error('[TonixChat] upload:', upErr.message);
            const ru = (typeof curLang === 'undefined' || curLang === 'ru');
            try {
                alert(ru ? ('Файл не загрузился: ' + upErr.message + '\nПопробуй ещё раз или вступи в DAO заново.')
                         : ('File upload failed: ' + upErr.message));
            } catch (e) { }
            return null;
        }
    }

    // Голосовое → Storage (chat_audio/<chatId>/<msgId>)
    if (opts.audio && opts.audio.dataUrl) {
        const blob = base64ToBlob(opts.audio.dataUrl);
        const path = 'chat_audio/' + chatId + '/' + msgId;
        const { error: upErr } = await sb.storage.from(TONIX_CONFIG.mediaBucket).upload(path, blob, { upsert: true });
        if (!upErr) {
            msgData.audioUrl = path;
            msgData.audioData = path;
            msgData.type = 'voice';
        } else {
            console.error('[TonixChat] audio upload:', upErr.message);
            const ru = (typeof curLang === 'undefined' || curLang === 'ru');
            try {
                alert(ru ? ('Голосовое не загрузилось: ' + upErr.message)
                         : ('Voice upload failed: ' + upErr.message));
            } catch (e) { }
            return null;
        }
    }

    if (!msgData.text && msgData.type === 'text') return null; // пустое

    // Replay-защита — как в Quantum (метки внутри шифруемой части)
    msgData._ts = Date.now();
    const nonceArr = crypto.getRandomValues(new Uint8Array(12));
    msgData._nonce = Array.from(nonceArr).map(b => b.toString(16).padStart(2, '0')).join('');

    // Шифруем единым ключом чата и пишем в БД (формат строки — как в Quantum)
    const encrypted = simpleEncrypt(JSON.stringify(msgData), chatKey(chatId));
    const { error: insErr } = await sb.from('messages').insert({
        id: msgId, chat_id: chatId, sender_uid: currentUID,
        content: encrypted, created_at: new Date().toISOString()
    });
    if (insErr) {
        console.error('[TonixChat] insert:', insErr.code, insErr.message);
        // Тихая потеря сообщения недопустима — объясняем причину человеку.
        const ru = (typeof curLang === 'undefined' || curLang === 'ru');
        let text;
        if (insErr.code === '42501') {
            // RLS отклонил запись: пользователь не состоит в этом чате
            text = ru ? 'Сообщение не отправлено: ты не участник этого DAO. Вступи заново — условия входа проверяются по текущему кошельку.'
                      : 'Message not sent: you are not a member of this DAO. Join again — entry conditions are checked for the current wallet.';
            try { if (typeof tonixRevokeMember === 'function' && window._tonixDaoKey) tonixRevokeMember(window._tonixDaoKey); } catch (e) { }
        } else {
            text = (ru ? 'Сообщение не отправлено: ' : 'Message not sent: ') + (insErr.message || 'ошибка базы');
        }
        try { alert(text); } catch (e) { }
        return null;
    }

    // Превью в списке чатов (🔒 без открытого текста — как в Quantum)
    const preview = msgData.type === 'image' ? '📷 Фото' : msgData.type === 'video' ? '🎥 Видео'
        : msgData.type === 'voice' ? '🎤 Голосовое' : msgData.type === 'file' ? '📎 Файл' : '🔒 Сообщение';
    sb.from('chats').update({
        last_message: preview, last_time: new Date().toISOString(), last_sender_uid: currentUID
    }).eq('id', chatId).then(function () { });

    // Realtime-уведомление другим участникам (broadcast как в Quantum)
    try {
        sb.channel('chat-' + chatId).send({
            type: 'broadcast', event: 'new-message',
            payload: { id: msgId, senderUid: currentUID, type: msgData.type }
        });
    } catch (e) { }

    return msgData;
}


// --- Удаление своего сообщения ---
// Удалять можно только собственное сообщение: это гарантирует политика в базе,
// поэтому даже правка кода в браузере не даст стереть чужое.
// --- Изменение своего сообщения ---
//
// Правится только текст. Всё остальное — автор, чат, время создания,
// вложения — остаётся как было: их пинует триггер в базе, даже если
// кто-то попробует передать другое.
//
// Отметку «изменено» ставит база сама. Клиент её не передаёт и убрать
// не может: в чате про деньги важно, чтобы переписанную фразу было
// видно, иначе спор о договорённостях становится нерешаемым.
async function editChatMessage(chatId, msg, newText) {
    if (!currentUID) return { ok: false, error: 'not_authed' };
    if (!msg || !msg.id) return { ok: false, error: 'no_message' };

    const text = String(newText == null ? '' : newText).trim();
    if (!text) return { ok: false, error: 'empty' };
    if (text === String(msg.text || '')) return { ok: true, unchanged: true };
    if (text.length > 4000) return { ok: false, error: 'too_long' };

    // Пересобираем тот же объект с новым текстом и шифруем заново:
    // содержимое лежит одним блоком, отдельного поля под текст нет.
    const body = {};
    Object.keys(msg).forEach(function (k) {
        if (k.charAt(0) === '_') return;          // служебные поля не храним
        if (k === 'senderName' || k === 'senderWallet') return; // подставляются при чтении
        body[k] = msg[k];
    });
    body.text = text;

    const key = chatKey(chatId);
    const { error } = await sb.from('messages')
        .update({ content: simpleEncrypt(JSON.stringify(body), key) })
        .eq('id', msg.id)
        .eq('sender_uid', currentUID);

    if (error) {
        console.error('[TonixChat] edit:', error.code, error.message);
        return { ok: false, error: error.message, code: error.code };
    }

    // Чтобы у остальных текст поменялся без перезагрузки
    try {
        sb.channel('chat-' + chatId).send({
            type: 'broadcast', event: 'edit-message',
            payload: { id: msg.id, text: text, senderUid: currentUID }
        });
    } catch (e) { }

    return { ok: true, text: text };
}

// --- Закрепить / открепить сообщение (только владелец DAO) ---
//
// Право проверяет сама база: функция tonix_pin_message смотрит, кто
// владелец DAO этого чата. Из браузера закрепить чужое сообщение,
// не будучи владельцем, нельзя.
//
// Закреплённое сообщение в чате одно: второе закрепление снимает
// первое. Полоса сверху одна, и выбирать, какое из пяти в ней
// показать, было бы хуже, чем просто заменять.
async function pinChatMessage(chatId, msgId, pin) {
    if (!currentUID) return { ok: false, error: 'not_authed' };
    try {
        const r = await sb.rpc('tonix_pin_message', { p_msg: msgId, p_pin: !!pin });
        if (r.error) {
            console.warn('[TonixChat] pin:', r.error.message);
            return { ok: false, error: r.error.message, code: r.error.code };
        }
        const res = r.data || {};
        if (res.ok !== true) return { ok: false, error: res.error || 'failed' };

        try {
            sb.channel('chat-' + chatId).send({
                type: 'broadcast', event: 'pin-message',
                payload: { id: msgId, pinned: !!pin }
            });
        } catch (e) { }
        return { ok: true, pinned: !!pin };
    } catch (e) {
        return { ok: false, error: e && e.message };
    }
}

// Закреплённое сообщение чата — для полосы сверху
async function getPinnedMessage(chatId) {
    try {
        const { data } = await sb.from('messages')
            .select('id, sender_uid, content, created_at, pinned_at')
            .eq('chat_id', chatId).not('pinned_at', 'is', null)
            .order('pinned_at', { ascending: false }).limit(1).maybeSingle();
        if (!data) return null;
        const key = chatKey(chatId);
        let m = null;
        const cs = (typeof data.content === 'string') ? data.content
            : (data.content != null ? JSON.stringify(data.content) : '');
        try {
            m = (typeof data.content === 'object' && data.content !== null) ? data.content : JSON.parse(cs);
        } catch (e) {
            try { m = JSON.parse(simpleDecrypt(cs, key)); } catch (e2) { return null; }
        }
        if (!m) return null;
        m.id = m.id || data.id;
        m.senderUid = m.senderUid || data.sender_uid;
        m._ts = data.created_at;
        m._pinned = data.pinned_at;
        return m;
    } catch (e) { return null; }
}

async function deleteChatMessage(chatId, msgId) {
    if (!currentUID) return { ok: false, error: 'not_authed' };

    /* Удаляет сервер: вместе со строкой нужно убрать файл из хранилища,
       а проверить право на файл может только он. Путь файла построен от
       чата и сообщения, без автора внутри, поэтому политика в хранилище
       тут бесполезна — она видит лишь имя объекта.

       Если функция ещё не задеплоена, работает старый путь ниже: строка
       удаляется, файл остаётся. Так деплой в два шага не ломает удаление. */
    var viaServer = false;
    try {
        const ses = await sb.auth.getSession();
        const tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
        if (tok) {
            const r = await fetch(TONIX_CONFIG.supabase.url + '/functions/v1/delete-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + tok,
                    'apikey': TONIX_CONFIG.supabase.anonKey
                },
                body: JSON.stringify({ message_id: msgId })
            });
            const j = await r.json();
            if (j && j.ok) {
                viaServer = true;
                console.log('[TonixChat] удалено сервером, файлов:', j.files);
            } else if (j && j.error === 'not-allowed') {
                return { ok: false, error: 'not_allowed' };
            }
        }
    } catch (e) {
        console.warn('[TonixChat] delete-message недоступна:', e && e.message);
    }

    if (!viaServer) {
        const { error } = await sb.from('messages')
            .delete()
            .eq('id', msgId)
            .eq('sender_uid', currentUID);
        if (error) {
            console.error('[TonixChat] delete:', error.code, error.message);
            return { ok: false, error: error.message, code: error.code };
        }
    }
    // Сообщаем остальным, чтобы сообщение исчезло и у них без перезагрузки
    try {
        sb.channel('chat-' + chatId).send({
            type: 'broadcast', event: 'del-message',
            payload: { id: msgId, senderUid: currentUID }
        });
    } catch (e) { }
    return { ok: true };
}

// --- Подписка на новые сообщения (broadcast-канал как в Quantum) ---
// onNew(payload) вызывается при каждом новом сообщении. Возвращает функцию отписки.
function subscribeChat(chatId, onNew, onDel, onEdit, onPin) {
    const channel = sb.channel('chat-' + chatId);
    channel.on('broadcast', { event: 'new-message' }, function (msg) {
        if (msg && msg.payload) onNew(msg.payload);
    });
    channel.on('broadcast', { event: 'del-message' }, function (msg) {
        if (msg && msg.payload && typeof onDel === 'function') onDel(msg.payload);
    });
    channel.on('broadcast', { event: 'edit-message' }, function (msg) {
        if (msg && msg.payload && typeof onEdit === 'function') onEdit(msg.payload);
    });
    channel.on('broadcast', { event: 'pin-message' }, function (msg) {
        if (msg && msg.payload && typeof onPin === 'function') onPin(msg.payload);
    });
    channel.subscribe();
    return function unsubscribe() { try { sb.removeChannel(channel); } catch (e) { } };
}
