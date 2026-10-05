/* =====================================================
   TONIX — verify-entry-fee
   Подтверждение взноса за вступление в DAO.

   Это единственное место, которое имеет право сказать «оплачено».
   Браузеру здесь не верят ни в чём: сумму, адрес казны и кошелёк
   отправителя функция берёт из базы и блокчейна, а не из запроса.
   Из запроса приходит только ключ DAO.

   Деньги функция не двигает и не хранит — она лишь смотрит
   историю входящих переводов мультисига.
   ===================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

/* Один и тот же кошелёк записывается по-разному: сырой вид 0:hex
   и удобный EQ.../UQ... Для сравнения приводим оба к сырому виду,
   иначе платёж «от другого адреса» будет ложно отвергнут. */
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

/* Сумма токена в самых мелких единицах — строками, без умножения
   (так же, как в entry-fee.js): 0.1 * 10^9 в двоичной арифметике
   даёт мусорный хвост, а здесь это порог, по которому открывается вход. */
function toUnits(amount: unknown, decimals: number): bigint | null {
    let s = String(amount ?? "").trim();
    if (!s) return null;
    if (/e/i.test(s)) s = Number(s).toFixed(decimals);
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const [whole, frac0 = ""] = s.split(".");
    const frac = (frac0 + "0".repeat(decimals)).slice(0, decimals);
    try { return BigInt((whole + frac).replace(/^0+(?=\d)/, "")); } catch { return null; }
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return reply({ paid: false, error: "method" }, 405);

    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, svc, { auth: { persistSession: false } });

    /* --- 1. Кто спрашивает --- */
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return reply({ paid: false, error: "no-token" }, 401);
    const { data: ures, error: uerr } = await admin.auth.getUser(jwt);
    const uid = ures?.user?.id;
    if (uerr || !uid) return reply({ paid: false, error: "bad-token" }, 401);

    let daoKey = "";
    try {
        const body = await req.json();
        daoKey = String(body?.dao_key || "").trim();
    } catch { /* пустое тело */ }
    if (!daoKey) return reply({ paid: false, error: "no-dao" }, 400);

    /* --- 2. Уже оплачено раньше? Взнос разовый --- */
    const { data: paidRow } = await admin.from("dao_entry_payments")
        .select("id").eq("dao_key", daoKey).eq("user_uid", uid)
        .eq("status", "paid").limit(1).maybeSingle();
    if (paidRow) return reply({ paid: true, already: true });

    /* --- 3. Открытая заявка. Её время — отсечка: переводы, сделанные
             раньше, не засчитываются, иначе один старый платёж можно было бы
             предъявлять снова и снова. --- */
    const { data: tick } = await admin.from("dao_entry_payments")
        .select("id,requested_at").eq("dao_key", daoKey).eq("user_uid", uid)
        .eq("status", "pending").limit(1).maybeSingle();
    if (!tick) return reply({ paid: false, reason: "no-request" });

    /* --- 4. Настоящие условия входа: из базы, не из браузера --- */
    const { data: st } = await admin.from("dao_settings")
        .select("entry_type,entry_fee_ton,fee_jetton,fee_decimals").eq("dao_key", daoKey).limit(1).maybeSingle();
    if (!st || st.entry_type !== "fee") return reply({ paid: false, reason: "not-fee" });
    const feeTon = Number(st.entry_fee_ton);
    if (!(feeTon > 0)) return reply({ paid: false, reason: "bad-fee" });

    /* --- 5. Настоящий адрес казны: из базы DAO --- */
    const { data: dao } = await admin.from("daos")
        .select("treasury_address,testnet").eq("slug", daoKey).limit(1).maybeSingle();
    if (!dao?.treasury_address) return reply({ paid: false, reason: "no-treasury" });

    /* --- 6. Настоящий кошелёк человека: тот, которым он подтвердил вход --- */
    const { data: w } = await admin.from("user_wallets")
        .select("wallet_address").eq("user_id", uid).limit(1).maybeSingle();
    if (!w?.wallet_address) return reply({ paid: false, reason: "no-wallet" });

    const sender = normAddr(w.wallet_address);
    const since = Math.floor(new Date(tick.requested_at).getTime() / 1000) - 90; // запас на расхождение часов

    /* --- 7а. Взнос токеном (Jetton). Перевод токена приходит в казну не как
              TON, а как jetton transfer на кошелёк токена казны, поэтому его
              ищем отдельно — в истории jetton-переводов, где получатель —
              казна, отправитель — кошелёк человека, токен — тот, что задан
              в условиях DAO. --- */
    if (st.fee_jetton) {
        const dec = Number.isInteger(Number(st.fee_decimals)) ? Number(st.fee_decimals) : 9;
        const need = toUnits(st.entry_fee_ton, dec);
        if (need === null || need <= 0n) return reply({ paid: false, reason: "bad-fee" });

        const jBase = dao.testnet ? "https://testnet.toncenter.com" : "https://toncenter.com";
        const jApi = `${jBase}/api/v3/jetton/transfers?owner_address=${encodeURIComponent(dao.treasury_address)}` +
            `&jetton_master=${encodeURIComponent(st.fee_jetton)}&direction=in&start_utime=${since}&limit=100&sort=desc`;

        let transfers: any[] = [];
        try {
            const key = Deno.env.get("TONCENTER_API_KEY");
            const r = await fetch(jApi, key ? { headers: { "X-API-Key": key } } : undefined);
            if (!r.ok) return reply({ paid: false, reason: "chain-unavailable" });
            const j = await r.json();
            transfers = j?.jetton_transfers || [];
        } catch {
            return reply({ paid: false, reason: "chain-unavailable" });
        }

        const treasury = normAddr(dao.treasury_address);
        const master = normAddr(st.fee_jetton);
        let gotUnits = 0n;
        let jHash = "";
        for (const t of transfers) {
            if (t?.transaction_aborted) continue;                       // неуспешный перевод не считается
            if (Number(t?.transaction_now || 0) < since) continue;
            if (normAddr(t?.source) !== sender) continue;               // от кошелька этого человека
            if (normAddr(t?.destination) !== treasury) continue;        // именно в казну
            if (normAddr(t?.jetton_master) !== master) continue;        // именно нужный токен
            let amt: bigint;
            try { amt = BigInt(String(t?.amount ?? "0")); } catch { continue; }
            if (amt <= 0n) continue;
            gotUnits += amt;
            if (!jHash) jHash = String(t?.transaction_hash || "");
        }

        if (gotUnits < need) {
            return reply({
                paid: false, reason: "not-enough", jetton: true,
                needed_units: need.toString(), received_units: gotUnits.toString(),
            });
        }

        if (jHash) {
            const { data: dupJ } = await admin.from("dao_entry_payments")
                .select("id").eq("tx_hash", jHash).eq("status", "paid").limit(1).maybeSingle();
            if (dupJ) return reply({ paid: false, reason: "tx-reused" });
        }

        /* paid_ton для токенного взноса хранит сумму в токенах */
        const gotTokens = Number(gotUnits) / Math.pow(10, dec);
        const { error: jErr } = await admin.from("dao_entry_payments")
            .update({
                status: "paid",
                paid_ton: gotTokens,
                tx_hash: jHash || null,
                confirmed_at: new Date().toISOString(),
            })
            .eq("id", tick.id).eq("status", "pending");
        if (jErr) return reply({ paid: false, reason: "save-failed", detail: jErr.message });

        return reply({ paid: true, jetton: true, received: gotTokens, needed: Number(st.entry_fee_ton) });
    }

    /* --- 7. История входящих переводов мультисига (взнос в TON) --- */
    const base = dao.testnet ? "https://testnet.toncenter.com" : "https://toncenter.com";
    const api = `${base}/api/v2/getTransactions?address=${encodeURIComponent(dao.treasury_address)}&limit=60&archival=true`;

    let txs: any[] = [];
    try {
        const key = Deno.env.get("TONCENTER_API_KEY");
        const r = await fetch(api, key ? { headers: { "X-API-Key": key } } : undefined);
        const j = await r.json();
        if (!j?.ok) return reply({ paid: false, reason: "chain-unavailable" });
        txs = j.result || [];
    } catch {
        return reply({ paid: false, reason: "chain-unavailable" });
    }

    /* --- 8. Ищем перевод: от этого кошелька, после отсечки, на нужную сумму.
             Переводы суммируются: человек мог отправить двумя частями. --- */
    let got = 0;
    let hash = "";
    for (const t of txs) {
        const inMsg = t?.in_msg;
        if (!inMsg) continue;
        if (Number(t.utime || 0) < since) continue;
        if (normAddr(inMsg.source) !== sender) continue;
        const val = Number(inMsg.value || 0);
        if (!(val > 0)) continue;
        got += val / 1e9;
        if (!hash) hash = String(t.transaction_id?.hash || "");
    }

    /* Небольшой допуск: кошелёк может списать доли нанотона на округлении,
       и отвергать платёж из-за этого было бы издевательством. */
    if (got + 1e-6 < feeTon) {
        return reply({ paid: false, reason: "not-enough", needed: feeTon, received: got });
    }

    /* --- 9. Одна и та же транзакция не может открыть вход дважды --- */
    if (hash) {
        const { data: dup } = await admin.from("dao_entry_payments")
            .select("id").eq("tx_hash", hash).eq("status", "paid").limit(1).maybeSingle();
        if (dup) return reply({ paid: false, reason: "tx-reused" });
    }

    /* --- 10. Подтверждаем. Служебный ключ обходит RLS — это единственный
              путь, которым статус может стать «оплачено». --- */
    const { error: uperr } = await admin.from("dao_entry_payments")
        .update({
            status: "paid",
            paid_ton: got,
            tx_hash: hash || null,
            confirmed_at: new Date().toISOString(),
        })
        .eq("id", tick.id).eq("status", "pending");

    if (uperr) return reply({ paid: false, reason: "save-failed", detail: uperr.message });

    return reply({ paid: true, received: got, needed: feeTon });
});
