/* =====================================================
   TONIX — governance.js
   Система управления DAO: предложения и голосования.

   Как это работает:
   1. Участник создаёт предложение (например «снизить порог
      входа до 300 TON») — оно живёт vote_hours часов.
   2. Участники голосуют за/против. Один человек — один голос
      (это гарантирует сама база, повторный голос не пройдёт).
   3. После дедлайна серверная функция finish-proposal считает
      итог и САМА применяет результат (меняет настройку DAO).
      Менять настройки руками не может никто — только она.

   Требует: config.js, supabase-init.js.
   ===================================================== */

// --- Настройки DAO (порог входа, длительность голосования и т.д.) ---
async function getDaoSettings(daoKey) {
    const { data, error } = await sb.from('dao_settings')
        .select('*').eq('dao_key', daoKey).maybeSingle();
    if (error) { console.error('[Gov] settings:', error.message); return null; }
    return data;
}

// --- Список предложений DAO + подсчёт голосов + мой голос ---
async function listProposals(daoKey) {
    const { data: props, error } = await sb.from('dao_proposals')
        .select('*').eq('dao_key', daoKey)
        .order('created_at', { ascending: false }).limit(50);
    if (error) { console.error('[Gov] proposals:', error.message); return []; }
    if (!props || !props.length) return [];

    const ids = props.map(p => p.id);
    const { data: votes } = await sb.from('dao_votes')
        .select('proposal_id, voter_uid, choice, weight, weight_final').in('proposal_id', ids);

    /* Символ токена голосования — для подписи «1 234 DUREV» вместо
       голого числа. Пусто = голоса считаются по людям, как раньше. */
    let voteSym = null;
    try {
        const { data: vst } = await sb.from('dao_settings')
            .select('vote_symbol,vote_jetton').eq('dao_key', daoKey).limit(1).maybeSingle();
        if (vst && vst.vote_jetton) voteSym = vst.vote_symbol || '?';
    } catch (e) { }

    // Имена авторов
    const uids = Array.from(new Set(props.map(p => p.author_uid)));
    let names = {};
    try {
        const { data: users } = await sb.from('users').select('id, name').in('id', uids);
        (users || []).forEach(u => { names[u.id] = u.name; });
    } catch (e) { }

    return props.map(function (p) {
        const v = (votes || []).filter(x => x.proposal_id === p.id);
        /* Вес: после закрытия берётся пересчитанный weight_final,
           до закрытия — вес на момент голоса. Люди считаются отдельно:
           «82% веса» и «3 человека из 40» — разные истории, и обе важны. */
        const wOf = function (x) {
            if (x.weight_final != null && Number.isFinite(Number(x.weight_final))) return Number(x.weight_final);
            const w = Number(x.weight);
            return (Number.isFinite(w) && w > 0) ? w : 1;
        };
        const yes = Math.round(v.filter(x => x.choice === 'yes')
            .reduce((a, x) => a + wOf(x), 0) * 1e6) / 1e6;
        const no = Math.round(v.filter(x => x.choice === 'no')
            .reduce((a, x) => a + wOf(x), 0) * 1e6) / 1e6;
        const yesPeople = v.filter(x => x.choice === 'yes').length;
        const noPeople = v.filter(x => x.choice === 'no').length;
        const mine = currentUID ? (v.find(x => x.voter_uid === currentUID) || null) : null;
        return {
            id: p.id, title: p.title, description: p.description,
            actionType: p.action_type, actionValue: p.action_value,
            status: p.status, endsAt: p.ends_at, createdAt: p.created_at,
            payoutAddress: p.payout_address || null,
            payoutAmount: (p.payout_amount != null) ? Number(p.payout_amount) : null,
            payoutStatus: p.payout_status || 'none',
            payoutJetton: p.payout_jetton || null,
            payoutSymbol: p.payout_symbol || null,
            payoutDecimals: (p.payout_decimals != null) ? Number(p.payout_decimals) : null,
            payoutNote: p.payout_note || null,
            payoutVerified: !!p.payout_verified,
            payoutAt: p.payout_at || null,
            authorUid: p.author_uid, authorName: names[p.author_uid] || (typeof T==='function' ? T('g_member') : 'Member'),
            yes: yes, no: no, total: yes + no,
            yesPeople: yesPeople, noPeople: noPeople,
            voteSymbol: voteSym,
            myChoice: mine ? mine.choice : null,
            expired: new Date(p.ends_at).getTime() < Date.now()
        };
    });
}

// --- Создать предложение ---
// action: { type:'set_entry_threshold', value:300 } или { type:'none' }
// durationMinutes: сколько минут идёт голосование. 0 или пусто — берём
//   длительность из настроек DAO (dao_settings.vote_hours), как было раньше.
async function govCreateProposal(daoKey, title, description, action, durationMinutes) {
    if (!currentUID) return { ok: false, error: 'Сначала войди кошельком' };
    if (!title || !title.trim()) return { ok: false, error: 'Введи заголовок' };

    // Порог на создание предложения проверяет СЕРВЕР по реальному балансу в сети.
    // Раньше он был объявлен в настройках, но не выполнялся — предложение мог
    // создать любой участник независимо от баланса.
    try {
        const sess = await sb.auth.getSession();
        const token = sess?.data?.session?.access_token;
        if (token) {
            const r = await fetch(TONIX_CONFIG.supabase.url + '/functions/v1/check-token-gate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'apikey': TONIX_CONFIG.supabase.anonKey
                },
                body: JSON.stringify({ dao_key: daoKey, mode: 'proposal' })
            });
            const g = await r.json();
            if (g && g.allowed === false) {
                return { ok: false, error: g.message || 'Недостаточно TON для создания предложения' };
            }
        }
    } catch (e) {
        // Проверка недоступна — не блокируем наглухо, но пишем в журнал
        console.warn('[Gov] порог не проверен:', e && e.message);
    }

    // Длительность голосования: либо выбранная в форме, либо из настроек DAO.
    let minutes = Number(durationMinutes);
    if (!(minutes > 0)) {
        const st = await getDaoSettings(daoKey);
        minutes = ((st && st.vote_hours) || 24) * 60;
    }
    if (minutes > 30 * 24 * 60) minutes = 30 * 24 * 60; // потолок — 30 дней
    const endsAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    // Микро-лог: видно в консоли (F12), какая длительность реально применилась
    console.log('[Gov] длительность голосования, мин:', minutes, '→ конец:', endsAt);

    const row = {
        dao_key: daoKey,
        author_uid: currentUID,
        title: title.trim(),
        description: (description || '').trim(),
        action_type: (action && action.type) || 'none',
        action_value: (action && action.value != null) ? action.value : null,
        ends_at: endsAt
    };

    /* Предложение о выплате из казны.
       Деньги не двигаются ни здесь, ни где-либо ещё в Tonix: это только
       запись решения. Перевод делают подписанты мультисига руками.
       База дополнительно требует адрес и сумму у такого предложения. */
    if (row.action_type === 'payout') {
        const addr = String((action && action.address) || '').trim();
        const amt = Number((action && action.amount));
        if (addr.length < 48) return { ok: false, error: 'Укажи корректный адрес получателя' };
        if (!(amt > 0)) return { ok: false, error: 'Сумма выплаты должна быть больше нуля' };
        row.payout_address = addr;
        row.payout_amount = amt;
        row.action_value = null;

        /* Выплата в токене. Символ и точность сохраняем копией на момент
           решения: у токена они могут поменяться, а в истории должно
           остаться то, что видели голосующие. Без точности проверка
           перевода посчитала бы сумму неверно в тысячи раз. */
        if (action && action.jetton) {
            const jm = String(action.jetton).trim();
            const dec = Number(action.decimals);
            if (jm.length < 48) return { ok: false, error: 'Некорректный адрес токена' };
            if (!(dec >= 0 && dec <= 30)) return { ok: false, error: 'Некорректная точность токена' };
            row.payout_jetton = jm;
            row.payout_symbol = String(action.symbol || '?').slice(0, 20);
            row.payout_decimals = dec;
        }
    }
    const { data, error } = await sb.from('dao_proposals').insert(row).select().maybeSingle();
    if (error) { console.error('[Gov] create:', error.message); return { ok: false, error: error.message }; }
    return { ok: true, proposal: data };
}

// --- Проголосовать (за/против). Повторно — не даст база. ---
async function voteProposal(proposalId, choice) {
    if (!currentUID) return { ok: false, error: 'Сначала войди кошельком' };
    if (choice !== 'yes' && choice !== 'no') return { ok: false, error: 'Голос: yes или no' };
    /* Голос принимает сервер: он сам считает вес по балансу токена DAO.
       Браузеру вес не доверяется — иначе его можно было бы нарисовать
       через консоль, а вес голоса — это деньги влияния. */
    try {
        const ses = await sb.auth.getSession();
        const tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
        if (!tok) return { ok: false, error: 'Сессия не найдена — войди заново' };
        const r = await fetch(TONIX_CONFIG.supabase.url + '/functions/v1/cast-vote', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + tok,
                'apikey': TONIX_CONFIG.supabase.anonKey
            },
            body: JSON.stringify({ proposal_id: proposalId, choice: choice })
        });
        const j = await r.json();
        if (j && j.ok) return { ok: true, weight: j.weight, symbol: j.symbol, delegated: j.delegated || 0, delegatedFrom: j.delegatedFrom || 0 };
        const err = (j && j.error) || 'failed';
        if (err === 'already-voted') return { ok: false, error: 'Ты уже голосовал(а) по этому предложению' };
        if (err === 'voting-closed') return { ok: false, error: 'Голосование уже закрыто' };
        if (err === 'not-member') return { ok: false, error: 'Голосуют только участники DAO' };
        if (err === 'you-delegated') return { ok: false, error: 'Ты отдал(а) свой голос делегату. Чтобы голосовать самому, сначала отзови делегирование.' };
        if (err === 'chain-unavailable') return { ok: false, error: 'Блокчейн сейчас недоступен — попробуй через минуту' };
        console.error('[Gov] vote:', err);
        return { ok: false, error: err };
    } catch (e) {
        return { ok: false, error: 'Сервер голосования недоступен: ' + ((e && e.message) || '') };
    }
}

// --- Делегирование: отдать свой вес доверенному участнику ---
// Токены не двигаются. Пока делегирование активно, свой голос отдать
// нельзя — он у делегата. Отзыв возможен всегда, но если делегат уже
// проголосовал этим весом в идущем голосовании, вернуть его в этом
// голосовании нельзя (сервер вернёт spent=true).
async function setDelegation(daoKey, delegateWallet) {
    try {
        const ses = await sb.auth.getSession();
        const tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
        if (!tok) return { ok: false, error: 'Войди заново' };
        const r = await fetch(TONIX_CONFIG.supabase.url + '/functions/v1/set-delegation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + tok,
                'apikey': TONIX_CONFIG.supabase.anonKey
            },
            body: JSON.stringify({ dao_key: daoKey, action: 'set', delegate_wallet: delegateWallet })
        });
        const j = await r.json();
        if (j && j.ok) return { ok: true };
        const e = (j && j.error) || 'failed';
        var map = {
            'delegate-not-found': 'Кошелёк не найден среди участников платформы',
            'delegate-not-member': 'Этот человек не участник данного DAO',
            'self-delegate': 'Нельзя делегировать самому себе',
            'delegate-delegated': 'Этот участник сам отдал свой голос дальше — выбери другого',
            'not-member': 'Делегировать может только участник DAO'
        };
        return { ok: false, error: map[e] || e };
    } catch (e) {
        return { ok: false, error: 'Сервер недоступен: ' + ((e && e.message) || '') };
    }
}

async function revokeDelegation(daoKey) {
    try {
        const ses = await sb.auth.getSession();
        const tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
        if (!tok) return { ok: false, error: 'Войди заново' };
        const r = await fetch(TONIX_CONFIG.supabase.url + '/functions/v1/set-delegation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + tok,
                'apikey': TONIX_CONFIG.supabase.anonKey
            },
            body: JSON.stringify({ dao_key: daoKey, action: 'revoke' })
        });
        const j = await r.json();
        if (j && j.ok) return { ok: true, spent: !!j.spent };
        return { ok: false, error: (j && j.error) || 'failed' };
    } catch (e) {
        return { ok: false, error: 'Сервер недоступен: ' + ((e && e.message) || '') };
    }
}

// Моё текущее делегирование в этом DAO (кому я отдал) и кто отдал мне
async function myDelegation(daoKey) {
    try {
        if (!currentUID) return { out: null, inCount: 0 };
        var out = await sb.from('dao_delegations')
            .select('delegate_uid').eq('dao_key', daoKey)
            .eq('delegator_uid', currentUID).limit(1).maybeSingle();
        var inc = await sb.from('dao_delegations')
            .select('delegator_uid', { count: 'exact', head: true })
            .eq('dao_key', daoKey).eq('delegate_uid', currentUID);
        return {
            out: (out && out.data) ? out.data.delegate_uid : null,
            inCount: (inc && typeof inc.count === 'number') ? inc.count : 0
        };
    } catch (e) { return { out: null, inCount: 0 }; }
}

// --- Попросить сервер закрыть просроченные голосования и исполнить итог ---
// (edge-функция finish-proposal; появится следующим кирпичом — до неё
// вызов просто тихо вернёт false)
// --- Вступление в DAO. Настоящая причина «0 участников» и «не могу
// присоединиться»: эта функция вызывалась из index.html в трёх местах
// (создание DAO, вступление владельца, кнопка «Присоединиться»), но
// нигде не была объявлена — ни здесь, ни в других файлах. Вызов молча
// проваливался проверкой typeof==='function', и запись в user_chats
// никогда не делалась. Сервер (join-dao) всё это время был готов и
// рабочий — не хватало just этой клиентской обёртки.
async function tonixJoinDao(daoKey) {
    try {
        const ses = await sb.auth.getSession();
        const tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
        if (!tok) return { ok: false, error: 'no-session' };
        const r = await fetch(TONIX_CONFIG.supabase.url + '/functions/v1/join-dao', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + tok,
                'apikey': TONIX_CONFIG.supabase.anonKey
            },
            body: JSON.stringify({ dao_key: daoKey })
        });
        const j = await r.json();
        if (j && j.ok) return { ok: true, already: !!j.already, chat_id: j.chat_id, owner: !!j.owner };
        // Код ошибки отдаём как есть, без перевода: index.html уже сам
        // сопоставляет коды (fee-not-paid, gate-denied, ...) со своими
        // русско-английскими текстами через eMap — дублировать это здесь
        // означало бы разойтись с ним рано или поздно.
        return { ok: false, error: (j && j.error) || 'failed' };
    } catch (e) {
        return { ok: false, error: 'network-error' };
    }
}

async function finishExpiredProposals(daoKey) {
    try {
        const supabaseUrl = sb.supabaseUrl || '';
        const url = supabaseUrl.replace('/rest/v1', '') + '/functions/v1/finish-proposal';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (sb.supabaseKey || ''),
                'apikey': (sb.supabaseKey || '')
            },
            body: JSON.stringify({ dao_key: daoKey })
        });
        if (!res.ok) return false;
        const data = await res.json();
        return !!(data && data.processed);
    } catch (e) { return false; }
}

// --- Хелпер: «осталось 1 д 4 ч», а на последних минутах — секунды ---
function proposalTimeLeft(endsAt, lang) {
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0) return (lang === 'ru') ? 'завершено' : 'ended';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (lang === 'ru') {
        if (d > 0) return d + ' д ' + (h % 24) + ' ч';
        if (h > 0) return h + ' ч ' + (m % 60) + ' мин';
        if (m > 0) return m + ' мин ' + (s % 60) + ' сек';
        return s + ' сек';
    }
    if (d > 0) return d + 'd ' + (h % 24) + 'h';
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    if (m > 0) return m + 'm ' + (s % 60) + 's';
    return s + 's';
}
