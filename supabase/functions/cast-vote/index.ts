/* =====================================================
   TONIX — cast-vote
   Приём голоса с весом по токену DAO.

   Зачем отдельная функция. Вес голоса — это деньги влияния, и его
   нельзя доверять браузеру: человек написал бы себе любой вес через
   консоль. Сервер сам смотрит баланс токена у кошелька голосующего
   и записывает голос со своим числом. Браузер присылает только
   «какое предложение» и «за или против».

   Если у DAO взвешивание не включено — вес равен единице, как раньше.

   Деплой:
     Supabase → Edge Functions → Deploy new function
       имя: cast-vote
     Settings → Verify JWT: ВЫКЛЮЧИТЬ (токен проверяем сами)
   ===================================================== */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

/* Один адрес пишется двумя способами: сырой 0:hex (так отдаёт tonapi)
   и удобный EQ…/UQ… (так часто лежит в настройках DAO). Сравниваем
   в приведённом виде — иначе токен «не находится» и вес выходит 0.
   Та же функция, что в verify-payout и verify-entry-fee. */
function normAddr(a: string | null | undefined): string {
    if (!a) return "";
    const s = String(a).trim();
    if (s.includes(":")) {
        const [wc, hash] = s.split(":");
        return `${parseInt(wc, 10)}:${hash.toLowerCase()}`;
    }
    try {
        const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
        const bin = atob(b64);
        if (bin.length < 34) return s.toLowerCase();
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        let wc = bytes[1];
        if (wc === 0xff) wc = -1;
        let hex = "";
        for (let i = 2; i < 34; i++) hex += bytes[i].toString(16).padStart(2, "0");
        return `${wc}:${hex}`;
    } catch {
        return s.toLowerCase();
    }
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return reply({ ok: false, error: "method" }, 405);

    const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } },
    );

    /* --- 1. Кто голосует --- */
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return reply({ ok: false, error: "no-token" }, 401);
    const { data: ures, error: uerr } = await admin.auth.getUser(jwt);
    const uid = ures?.user?.id;
    if (uerr || !uid) return reply({ ok: false, error: "bad-token" }, 401);

    let propId = "", choice = "";
    try {
        const body = await req.json();
        propId = String(body?.proposal_id || "").trim();
        choice = String(body?.choice || "").trim();
    } catch { /* пустое тело */ }
    if (!propId) return reply({ ok: false, error: "no-proposal" }, 400);
    if (choice !== "yes" && choice !== "no") return reply({ ok: false, error: "bad-choice" }, 400);

    /* --- 2. Предложение: существует и ещё идёт --- */
    const { data: p } = await admin.from("dao_proposals")
        .select("id,dao_key,status,ends_at")
        .eq("id", propId).limit(1).maybeSingle();
    if (!p) return reply({ ok: false, error: "no-such-proposal" }, 404);
    if (p.status !== "active" || new Date(p.ends_at).getTime() < Date.now()) {
        return reply({ ok: false, error: "voting-closed" }, 409);
    }

    /* --- 3. Голосуют только участники. Членство — по чату DAO,
             как и везде в платформе. --- */
    const { data: dao } = await admin.from("daos")
        .select("chat_id,testnet").eq("slug", p.dao_key).limit(1).maybeSingle();
    if (!dao?.chat_id) return reply({ ok: false, error: "no-dao" }, 400);

    const { data: mem } = await admin.from("user_chats")
        .select("user_id").eq("chat_id", dao.chat_id).eq("user_id", uid)
        .limit(1).maybeSingle();
    if (!mem) return reply({ ok: false, error: "not-member" }, 403);

    /* --- 4. Делегирование. Если этот участник ОТДАЛ свой вес другому,
             сам голосовать он не может: голос один и он у делегата. --- */
    const { data: iDelegated } = await admin.from("dao_delegations")
        .select("delegate_uid").eq("dao_key", p.dao_key)
        .eq("delegator_uid", uid).limit(1).maybeSingle();
    if (iDelegated) return reply({ ok: false, error: "you-delegated" }, 409);

    /* Настройки взвешивания */
    const { data: st } = await admin.from("dao_settings")
        .select("vote_jetton,vote_symbol,vote_decimals")
        .eq("dao_key", p.dao_key).limit(1).maybeSingle();
    const symbol: string | null = st?.vote_jetton ? (st.vote_symbol || null) : null;

    /* Вес одного кошелька по правилам DAO. Без токена — единица.
       С токеном — баланс; «TON» — баланс основной монеты. Считаем
       здесь один раз и переиспользуем для голосующего и для каждого,
       кто ему делегировал. */
    async function weightOf(voterUid: string): Promise<number | null> {
        if (!st?.vote_jetton) return 1;
        const dRaw = Number(st.vote_decimals);
        const dec = (Number.isFinite(dRaw) && dRaw >= 0) ? dRaw : 9;
        const { data: w } = await admin.from("user_wallets")
            .select("wallet_address").eq("user_id", voterUid).limit(1).maybeSingle();
        if (!w?.wallet_address) return 0; /* нет кошелька — нулевой вес */

        if (st.vote_jetton === "TON") {
            const base = dao.testnet ? "https://testnet.toncenter.com" : "https://toncenter.com";
            try {
                const r = await fetch(`${base}/api/v2/getAddressBalance?address=${encodeURIComponent(w.wallet_address)}`);
                const j = await r.json();
                if (!j?.ok) return null; /* сеть недоступна */
                const v = Number(j.result) / 1e9;
                return (Number.isFinite(v) && v >= 0) ? v : 0;
            } catch { return null; }
        }
        const apiBase = dao.testnet ? "https://testnet.tonapi.io" : "https://tonapi.io";
        const want = normAddr(st.vote_jetton);

        /* tonapi иногда отвечает пусто или 429 даже когда токен на
           кошельке есть. Раньше это записывало вес 0 — голос проходил
           с ложным нулём. Теперь: (1) шлём ключ, чтобы не упираться в
           лимит; (2) до 3 попыток; (3) различаем «токена реально нет»
           (непустой ответ без нужного токена → 0) от «сеть подвела»
           (пусто/ошибка на всех попытках → null, голос не засчитается). */
        /* Ключ tonapi — только из секретов Supabase (TONAPI_KEY), не в коде.
           Нет ключа — работаем без него, как раньше. */
        const TONAPI_KEY = Deno.env.get("TONAPI_KEY") || "";
        const headers: Record<string, string> = { "Accept": "application/json" };
        if (TONAPI_KEY) {
            headers["Authorization"] = "Bearer " + TONAPI_KEY;
        }

        let emptyAnswers = 0; /* сколько раз tonapi уверенно ответил «жетонов нет» */
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const r = await fetch(
                    `${apiBase}/v2/accounts/${encodeURIComponent(w.wallet_address)}/jettons`,
                    { headers },
                );
                if (r.status === 404) return 0; /* кошелёк ещё не активирован — токенов нет */
                if (!r.ok) {
                    /* 429 или иная ошибка — ждём и пробуем ещё */
                    await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
                    continue;
                }
                const j = await r.json();
                const list = (j?.balances || []) as Array<Record<string, unknown>>;

                if (list.length === 0) {
                    /* Пустой ответ подозрителен: у голосующего кошелька
                       обычно есть хоть какие-то жетоны. Считаем это сбоем
                       и пробуем ещё, а не сразу нулём. */
                    emptyAnswers++;
                    await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
                    continue;
                }

                /* Ответ непустой — можно доверять: ищем нужный токен */
                for (const b of list) {
                    const jt = (b?.jetton || {}) as Record<string, unknown>;
                    if (normAddr(String(jt.address || "")) === want) {
                        const v = Number(b.balance) / Math.pow(10, dec);
                        return (Number.isFinite(v) && v >= 0) ? v : 0;
                    }
                }
                return 0; /* токен реально не найден среди жетонов кошелька */
            } catch {
                await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
            }
        }
        /* tonapi все три раза нормально ответил «пусто» — значит, жетонов
           на кошельке правда нет: вес 0, голос принимается. Раньше такой
           человек не мог проголосовать вообще («блокчейн недоступен»). */
        if (emptyAnswers === 3) return 0;
        /* Были ошибки сети — не засчитываем голос с ложным нулём,
           просим повторить позже. */
        return null;
    }

    /* --- 5. Собственный вес голосующего --- */
    const ownW = await weightOf(uid);
    if (ownW === null) return reply({ ok: false, error: "chain-unavailable" }, 503);

    /* --- 6. Кто делегировал СВОЙ вес этому участнику. Каждый такой
             делегатор получает отдельную строку голоса (on_behalf_of),
             чтобы на закрытии вес пересчитался по ЕГО балансу правилом
             минимума — та же защита от пересылки, что и для своего. --- */
    const { data: incoming } = await admin.from("dao_delegations")
        .select("delegator_uid").eq("dao_key", p.dao_key)
        .eq("delegate_uid", uid);

    /* Токенов нет и никто не отдал свой вес — голос ничего не весит.
       Говорим прямо «нет токенов», а не «блокчейн недоступен». */
    if (st?.vote_jetton && ownW === 0 && (incoming || []).length === 0) {
        return reply({ ok: false, error: "no-tokens", symbol }, 403);
    }

    /* Строка собственного голоса */
    const rows: Array<Record<string, unknown>> = [
        { proposal_id: propId, voter_uid: uid, choice, weight: ownW },
    ];

    let delegatedTotal = 0;
    let delegatedCount = 0;
    for (const d of (incoming || [])) {
        /* Если делегатор уже успел проголосовать сам до нас — его голос
           первичен, делегированную копию не добавляем (правило «кто
           первым нажал»). Уникальный индекс всё равно подстрахует. */
        const { data: already } = await admin.from("dao_votes")
            .select("id").eq("proposal_id", propId)
            .eq("voter_uid", d.delegator_uid).limit(1).maybeSingle();
        if (already) continue;

        /* Делегатор должен оставаться участником DAO. Вышел или удалён —
           его вес больше не голосует, даже если запись делегирования осталась. */
        const { data: dMem } = await admin.from("user_chats")
            .select("user_id").eq("chat_id", dao.chat_id).eq("user_id", d.delegator_uid)
            .limit(1).maybeSingle();
        if (!dMem) continue;

        const dw = await weightOf(d.delegator_uid);
        if (dw === null) continue; /* сеть подвела по этому — пропускаем, не валим весь голос */
        rows.push({
            proposal_id: propId,
            voter_uid: d.delegator_uid,   /* голос числится за делегатором */
            choice,
            weight: dw,
            on_behalf_of: d.delegator_uid, /* пометка: подан делегатом */
        });
        delegatedTotal += dw;
        delegatedCount++;
    }

    /* --- 7. Пишем. Свой голос — обязателен; конфликт на нём означает
             «уже голосовал». Делегированные строки, если наткнулись на
             конфликт (делегатор проголосовал в параллели), просто
             пропускаем по одной. --- */
    const { error: ownErr } = await admin.from("dao_votes").insert(rows[0]);
    if (ownErr) {
        if (ownErr.code === "23505") return reply({ ok: false, error: "already-voted" }, 409);
        return reply({ ok: false, error: "save-failed", detail: ownErr.message }, 500);
    }
    for (let k = 1; k < rows.length; k++) {
        const { error: de } = await admin.from("dao_votes").insert(rows[k]);
        if (de && de.code !== "23505") {
            console.warn("[cast-vote] делегированный голос не записан:", de.message);
        }
    }

    return reply({
        ok: true,
        weight: ownW,
        delegated: delegatedTotal,
        delegatedFrom: delegatedCount,
        symbol,
    });
});
