/* =====================================================
   TONIX — entry-fee.js
   Взнос в казну при вступлении в DAO.

   Деньги идут напрямую в мультисиг DAO. Tonix их не держит
   и не двигает — платформа только фиксирует факт платежа.

   Порядок намеренно такой: сначала запись в базу, потом деньги.
   Если сделать наоборот, человек может заплатить в момент, когда
   база недоступна, и платёж повиснет без следа.

   Участником делает СЕРВЕР — после того как сам увидел перевод
   в блокчейне. Браузер такое решение не принимает.
   Требует: config.js, supabase-init.js, TON Connect.
   ===================================================== */

(function () {

    /* Ключ toncenter — снимает лимит при проверке взноса. */
    var TONCENTER_KEY = "4dd7f5b05be6418cb3e4920b690cbe41eb7c349732123846d0d15773fd3bd600";
    var TONCENTER_HEADERS = { "X-API-Key": TONCENTER_KEY };
    "use strict";

    function ru() { return (typeof curLang === "undefined" || curLang === "ru"); }

    /* Условия входа этого DAO. Читаем из базы, а не из памяти:
       владелец мог поменять их минуту назад из панели. */
    async function entrySettings(daoKey) {
        if (typeof sb === "undefined" || !sb || !daoKey) return null;
        try {
            var r = await sb.from("dao_settings")
                .select("entry_type,entry_fee_ton,fee_jetton,fee_symbol,fee_decimals")
                .eq("dao_key", daoKey).limit(1);
            if (r.error || !r.data || !r.data[0]) return null;
            return r.data[0];
        } catch (e) { return null; }
    }
    window.tonixEntrySettings = entrySettings;

    /* Адрес казны и сеть DAO */
    function treasuryOf(daoKey) {
        try {
            var t = (typeof TONIX_CONFIG !== "undefined") ? TONIX_CONFIG.daoTreasury[daoKey] : null;
            if (!t || !t.address) return null;
            return { address: t.address, testnet: !!t.testnet };
        } catch (e) { return null; }
    }

    /* TON в нанотоны, без плавающей точки в итоге.
       0.1 + 0.2 в JS даёт 0.30000000000000004 — в деньгах такое недопустимо. */
    function toNano(ton) {
        var n = Math.round(Number(ton) * 1e9);
        if (!isFinite(n) || n <= 0) return null;
        return String(n);
    }

    /* Сумма токена в самых мелких единицах — строками, без умножения:
       0.1 умножить на 10^9 в двоичной арифметике даёт хвост из мусора,
       а здесь это сумма реального перевода. */
    function unitsOf(amount, decimals) {
        var d = Number(decimals);
        if (!isFinite(d) || d < 0) d = 9;
        var str = String(amount).trim();
        if (str.indexOf("e") !== -1 || str.indexOf("E") !== -1) str = Number(str).toFixed(d);
        var parts = str.split(".");
        var frac = (parts[1] || "").slice(0, d);
        while (frac.length < d) frac += "0";
        var out = ((parts[0] || "0") + frac).replace(/^0+(?=\d)/, "");
        return out || "0";
    }

    /* Жетоны не отправляются «на адрес», как TON. У каждого владельца
       каждого токена есть свой жетонный кошелёк-контракт, и перевод —
       это команда СВОЕМУ жетонному кошельку. Его адрес спрашиваем
       у контракта токена. */
    async function jettonWalletOf(master, owner, testnet) {
        var base = testnet ? "https://testnet.tonapi.io" : "https://tonapi.io";
        var u = base + "/v2/blockchain/accounts/" + encodeURIComponent(master) +
            "/methods/get_wallet_address?args=" + encodeURIComponent(owner);
        var r = await fetch(u, { headers: { "Accept": "application/json" } });
        var j = await r.json();
        var addr = j && j.decoded && j.decoded.jetton_wallet_address;
        if (!addr) throw new Error("jetton-wallet-not-found");
        return addr;
    }

    /* Баланс токена у человека — чтобы не отправлять его в кошелёк
       за заведомо провальным переводом. */
    /* Приводим адрес токена к raw-форме (0:...) через tonapi. Один и тот
       же токен в TON записывается по-разному — EQ.../UQ.../0:... — и
       буквальное сравнение строк их не совпадает. Владелец вводит адрес
       в форме EQ..., а кошелёк отдаёт 0:..., поэтому баланс не находился
       и показывал 0. Приводим обе стороны к raw и сравниваем их. */
    var _tonixRawCache = {};
    async function toRawAddr(a, testnet) {
        if (!a) return null;
        var s = String(a).trim();
        if (s.indexOf("0:") === 0) return s.toLowerCase(); /* уже raw */
        if (_tonixRawCache[s] !== undefined) return _tonixRawCache[s];
        try {
            var base = testnet ? "https://testnet.tonapi.io" : "https://tonapi.io";
            var r = await fetch(base + "/v2/address/" + encodeURIComponent(s) + "/parse",
                { headers: { "Accept": "application/json" } });
            if (!r.ok) { _tonixRawCache[s] = null; return null; }
            var j = await r.json();
            var raw = (j && (j.raw_form || j.raw)) ? String(j.raw_form || j.raw).toLowerCase() : null;
            _tonixRawCache[s] = raw;
            return raw;
        } catch (e) { _tonixRawCache[s] = null; return null; }
    }

    async function jettonBalance(owner, master, testnet) {
        try {
            var base = testnet ? "https://testnet.tonapi.io" : "https://tonapi.io";
            var r = await fetch(base + "/v2/accounts/" + encodeURIComponent(owner) + "/jettons",
                { headers: { "Accept": "application/json" } });
            var j = await r.json();
            /* Введённый адрес токена — к raw-форме, чтобы сравнивать с тем,
               что отдаёт tonapi (оно уже в raw). */
            var want = await toRawAddr(master, testnet);
            if (!want) want = String(master).toLowerCase(); /* запас: хоть как-то */
            var list = (j && j.balances) || [];
            for (var i = 0; i < list.length; i++) {
                var jt = list[i].jetton || {};
                var got = String(jt.address || "").toLowerCase(); /* tonapi отдаёт raw */
                if (got === want) {
                    var dec = Number(jt.decimals); if (!(dec >= 0)) dec = 9;
                    return Number(list[i].balance) / Math.pow(10, dec);
                }
            }
            return 0; /* жетонного кошелька нет — токена ноль */
        } catch (e) { return null; }
    }

    /* Спрашиваем сервер, видит ли он платёж. Ответ сервера — единственная
       правда: браузер не может объявить себя оплатившим. */
    async function askServer(daoKey) {
        try {
            var ses = await sb.auth.getSession();
            var tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
            if (!tok) return { paid: false, error: "no-session" };
            var r = await fetch(TONIX_CONFIG.supabase.url + "/functions/v1/verify-entry-fee", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + tok,
                    "apikey": TONIX_CONFIG.supabase.anonKey
                },
                body: JSON.stringify({ dao_key: daoKey })
            });
            var j = await r.json();
            return j || { paid: false };
        } catch (e) {
            /* Сюда попадаем, когда запрос не дошёл вообще: функция не развёрнута,
               отбит предварительный запрос или нет сети. Помечаем одинаково,
               чтобы опрос сдавался быстро, а не долбился две минуты. */
            return { paid: false, error: "network", detail: (e && e.message) || "" };
        }
    }
    window.tonixVerifyEntryFee = askServer;

    /* Уже оплачивал раньше? Тогда второй раз платить не заставляем.
       Взнос разовый: заплатил один раз — участник навсегда. */
    async function alreadyPaid(daoKey) {
        try {
            var r = await sb.from("dao_entry_payments")
                .select("id").eq("dao_key", daoKey)
                .eq("user_uid", currentUID).eq("status", "paid").limit(1);
            return !!(r.data && r.data[0]);
        } catch (e) { return false; }
    }

    /* Заявка на оплату. Она же — отсечка по времени: платежи, сделанные
       раньше этого момента, сервер не засчитает. Иначе один старый перевод
       можно было бы предъявлять при каждом вступлении. */
    async function openTicket(daoKey, fee, tre, wallet, jetton) {
        var row = {
            dao_key: daoKey, user_uid: currentUID,
            wallet_address: wallet, treasury_address: tre.address,
            amount_ton: fee, testnet: tre.testnet,
            jetton: jetton || null   /* чем платят: пусто = TON */
        };
        var r = await sb.from("dao_entry_payments").insert(row).select("id,requested_at").limit(1);
        if (!r.error) return { ok: true, row: r.data && r.data[0] };

        /* Незакрытая заявка уже есть — не плодим вторую, работаем с ней.
           Так человек, нажавший «вступить» дважды, не платит дважды. */
        if (r.error.code === "23505") {
            var ex = await sb.from("dao_entry_payments")
                .select("id,requested_at").eq("dao_key", daoKey)
                .eq("user_uid", currentUID).eq("status", "pending").limit(1);
            if (ex.data && ex.data[0]) return { ok: true, row: ex.data[0], reused: true };
        }
        console.error("[entry-fee] заявка не создана:", r.error.code, r.error.message);
        return { ok: false, error: r.error.message };
    }

    /* Ждём, пока TON Connect восстановит подключение после перезагрузки.
       Интерфейс успевает показать кошелёк подключённым раньше, чем появятся
       данные аккаунта — если спросить адрес сразу, вернётся пустота,
       и человек получит ложное «кошелёк не подключён». */
    async function waitWallet() {
        if (typeof initTonConnect === "function") { try { await initTonConnect(); } catch (e) { } }
        var ui = window.tonConnectUI;
        if (!ui) return "";
        try {
            if (ui.connectionRestored && typeof ui.connectionRestored.then === "function") {
                await ui.connectionRestored;
            }
        } catch (e) { }
        for (var i = 0; i < 24; i++) {
            try {
                var a = ui.account && ui.account.address;
                if (a) return a;
            } catch (e) { }
            await new Promise(function (r) { setTimeout(r, 250); });
        }
        return "";
    }

    /* Перевод токена в мультисиг. Полезная нагрузка — стандартное
       сообщение transfer жетонного кошелька. Сумма кладётся строкой
       из мелких единиц. К сообщению прикладывается 0.1 TON на газ:
       большая часть вернётся, но без запаса перевод не пройдёт. */
    async function sendJettonFee(tre, feeSt, wallet, units) {
        await waitWallet();
        var ui = window.tonConnectUI;
        if (!ui) throw new Error(ru() ? "Кошелёк не готов, перезагрузи страницу" : "Wallet not ready");
        if (!ui.connected) throw new Error(ru() ? "Подключи кошелёк и повтори" : "Connect your wallet and retry");
        if (!window.TonCore) throw new Error(ru() ? "Библиотека TON не загрузилась, обнови страницу" : "TON library not loaded, refresh the page");

        var t = window.TonCore;
        /* tonapi возвращает адрес в сыром виде 0:hex, а кошелёк через
           TON Connect требует дружелюбный формат — иначе отправка падает
           с «Wrong address format», не дойдя до кошелька. */
        var jwRaw = await jettonWalletOf(feeSt.fee_jetton, wallet, tre.testnet);
        var jw = t.Address.parse(jwRaw).toString();

        var body = t.beginCell()
            .storeUint(0x0f8a7ea5, 32)               // op: transfer
            .storeUint(0, 64)                        // query id
            .storeCoins(BigInt(units))               // сколько токена
            .storeAddress(t.Address.parse(tre.address))  // получатель — казна
            .storeAddress(t.Address.parse(wallet))       // сдача газа — обратно
            .storeBit(0)                             // custom payload: нет
            .storeCoins(BigInt(1))                   // forward 1 нанотон — уведомление
            .storeBit(0)                             // forward payload: пустой
            .endCell();

        var tx = {
            validUntil: Math.floor(Date.now() / 1000) + 300,
            network: tre.testnet ? "-3" : "-239",
            messages: [{
                address: jw,
                amount: "100000000", // 0.1 TON на газ, излишек вернётся
                payload: body.toBoc().toString("base64")
            }]
        };
        console.log("[entry-fee] перевод токена в казну:", units, "units,",
            feeSt.fee_symbol, "через", jw, "сеть:", tre.testnet ? "testnet" : "MAINNET");
        return await ui.sendTransaction(tx);
    }

    /* Перевод в мультисиг. Без текстового комментария намеренно:
       Multisig v2 разбирает входящие по кодам операций, и сообщение
       с произвольным текстом может отскочить обратно. Платёж опознаётся
       по адресу отправителя — он подтверждён кошельком при входе. */
    async function sendFee(tre, nano) {
        await waitWallet();
        var ui = window.tonConnectUI;
        if (!ui) throw new Error(ru() ? "Кошелёк не готов, перезагрузи страницу" : "Wallet not ready");
        if (!ui.connected) throw new Error(ru() ? "Подключи кошелёк и повтори" : "Connect your wallet and retry");

        var tx = {
            validUntil: Math.floor(Date.now() / 1000) + 300,
            network: tre.testnet ? "-3" : "-239",
            messages: [{ address: tre.address, amount: nano }]
        };
        console.log("[entry-fee] перевод в казну", tre.address, nano, "нанотон, сеть:",
            tre.testnet ? "testnet" : "MAINNET");
        return await ui.sendTransaction(tx);
    }

    /* Ждём подтверждения в сети. Транзакция в TON проходит секунд за пять,
       но иногда дольше — человека нельзя оставлять перед замершим экраном. */
    async function waitPaid(daoKey, onTick) {
        var tries = 24;      // ~2 минуты
        var dead = 0;        // подряд идущие «сервер недоступен»
        for (var i = 0; i < tries; i++) {
            await new Promise(function (r) { setTimeout(r, i < 5 ? 3000 : 5000); });
            var res = await askServer(daoKey);
            if (res && res.paid) return { ok: true };

            /* Если сервер проверки вообще не отвечает, ждать две минуты
               бессмысленно — ответ не появится. Говорим об этом сразу,
               а не заставляем человека смотреть на крутящуюся кнопку. */
            if (res && res.error === "network") {
                dead++;
                if (dead >= 3) return { ok: false, unreachable: true };
            } else {
                dead = 0;
                if (res && res.reason) console.log("[entry-fee] сервер:", res.reason, res);
            }
            if (typeof onTick === "function") onTick(i + 1, tries);
        }
        return { ok: false, timeout: true };
    }

    /* Баланс кошелька человека. Нужен, чтобы не отправлять его в кошелёк
       за отказом «недостаточно средств»: об этом честнее сказать заранее. */
    async function walletBalance(addr, testnet) {
        try {
            var api = (testnet ? "https://testnet.toncenter.com" : "https://toncenter.com") +
                "/api/v2/getAddressBalance?address=" + encodeURIComponent(addr);
            var r = await fetch(api, { headers: TONCENTER_HEADERS });
            var j = await r.json();
            if (!j || j.ok !== true) return null;
            return Number(j.result) / 1e9;
        } catch (e) { return null; }
    }

    function shortAddr(a) {
        return (a && a.length > 16) ? (a.slice(0, 6) + "…" + a.slice(-6)) : (a || "");
    }

    /* Экран подтверждения. Человек видит сумму, адрес казны, сеть и то,
       что взнос невозвратный — ДО того, как откроется кошелёк.
       Возвращает true, если согласился. */
    function confirmScreen(o) {
        return new Promise(function (resolve) {
            var R = ru();
            var sym = o.sym || "TON";
            /* Для токена «хватает» — это две проверки сразу: сам токен
               на взнос и немного TON на газ перевода. */
            var enough = o.isJet
                ? (((o.tokBalance == null) || (o.tokBalance >= o.fee)) &&
                   ((o.balance == null) || (o.balance >= 0.15)))
                : ((o.balance == null) || (o.balance >= o.fee + 0.05));
            var wrap = document.createElement("div");
            wrap.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(8,12,18,.78);" +
                "backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:18px";

            var money = function (n) { return (Math.round(n * 1000) / 1000); };
            var rows =
                '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">' +
                '<span style="color:var(--dim);font-size:13px">' + (R ? "Взнос" : "Fee") + '</span>' +
                '<b style="font-size:15px">' + money(o.fee) + ' ' + sym + '</b></div>' +
                '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">' +
                '<span style="color:var(--dim);font-size:13px">' + (R ? "Куда" : "To") + '</span>' +
                '<span style="font-size:13px;font-family:ui-monospace,monospace">' + shortAddr(o.address) + '</span></div>' +
                '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">' +
                '<span style="color:var(--dim);font-size:13px">' + (R ? "Сеть" : "Network") + '</span>' +
                '<span style="font-size:13px">' + (o.testnet ? (R ? "Тестовая сеть TON" : "TON testnet") : (R ? "Сеть TON" : "TON network")) + '</span></div>' +
                (o.isJet && o.tokBalance != null ?
                    '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">' +
                    '<span style="color:var(--dim);font-size:13px">' + (R ? "У тебя " + sym : "Your " + sym) + '</span>' +
                    '<b style="font-size:14px;color:' + ((o.tokBalance >= o.fee) ? "var(--text)" : "#e0824b") + '">' + money(o.tokBalance) + ' ' + sym + '</b></div>' : "") +
                (o.balance == null ? "" :
                    '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0">' +
                    '<span style="color:var(--dim);font-size:13px">' + (R ? "На твоём кошельке" : "Your balance") + '</span>' +
                    '<b style="font-size:14px;color:' + ((o.isJet ? (o.balance >= 0.15) : enough) ? "var(--text)" : "#e0824b") + '">' + money(o.balance) + ' TON</b></div>');

            var warn = enough ? "" :
                '<div style="background:rgba(224,130,75,.12);border:1px solid rgba(224,130,75,.35);border-radius:12px;' +
                'padding:12px 14px;margin:14px 0 0;font-size:13px;color:#e0824b;line-height:1.5">' +
                (o.isJet
                    ? (R ? "Не хватает средств. Нужно " + money(o.fee) + " " + sym + " и примерно 0.15 TON на комиссию перевода."
                         : "Not enough funds. You need " + money(o.fee) + " " + sym + " plus about 0.15 TON for the transfer fee.")
                    : (R ? "Средств не хватает. Нужно " + money(o.fee) + " TON плюс небольшая комиссия сети. Пополни кошелёк и вернись."
                         : "Not enough funds. You need " + money(o.fee) + " TON plus a small network fee.")) + '</div>';

            wrap.innerHTML =
                '<div style="max-width:420px;width:100%;background:var(--surface);border:1px solid var(--border);' +
                'border-radius:20px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.5)">' +
                '<div style="font-size:18px;font-weight:700;margin:0 0 6px">' +
                (R ? "Вступление платное" : "Paid entry") + '</div>' +
                '<p style="color:var(--dim);font-size:13px;line-height:1.55;margin:0 0 14px">' +
                (R ? "Чтобы вступить в это DAO, нужно внести взнос в казну сообщества."
                   : "Joining this DAO requires a contribution to the community treasury.") + '</p>' +
                rows + warn +
                '<p style="color:var(--dim);font-size:12px;line-height:1.55;margin:14px 0 0">' +
                (R ? "Деньги уходят прямо в мультисиг-контракт DAO. Tonix их не хранит и не двигает. Взнос не возвращается: из мультисига средства уходят только по подписям участников."
                   : "Funds go straight into the DAO multisig contract. Tonix never holds or moves them. The fee is non-refundable.") +
                (o.isJet ? (R ? " К переводу токена кошелёк добавит примерно 0.1 TON на комиссию — излишек вернётся."
                              : " The wallet attaches about 0.1 TON for the transfer fee — the excess returns.") : "") + '</p>' +
                '<div style="display:flex;gap:10px;margin:18px 0 0">' +
                '<button id="efNo" style="flex:1;padding:12px;border-radius:12px;border:1px solid var(--border);' +
                'background:transparent;color:var(--text);font-size:14px;font-family:inherit;cursor:pointer">' +
                (R ? "Отмена" : "Cancel") + '</button>' +
                '<button id="efYes" ' + (enough ? "" : "disabled ") + 'style="flex:1.4;padding:12px;border-radius:12px;border:0;' +
                'background:linear-gradient(135deg,#2D83EC,#1AC9FF);color:#fff;font-size:14px;font-weight:600;' +
                'font-family:inherit;cursor:pointer;opacity:' + (enough ? "1" : ".45") + '">' +
                (R ? "Внести " + money(o.fee) + " " + sym : "Pay " + money(o.fee) + " " + sym) + '</button></div></div>';

            function close(v) { try { wrap.remove(); } catch (e) { } resolve(v); }
            wrap.addEventListener("click", function (e) { if (e.target === wrap) close(false); });
            document.body.appendChild(wrap);
            wrap.querySelector("#efNo").onclick = function () { close(false); };
            wrap.querySelector("#efYes").onclick = function () { if (enough) close(true); };
        });
    }

    /* ---------- Главный сценарий ----------
       Возвращает {ok:true} — можно впускать; {ok:false,error} — нельзя. */
    window.tonixEntryFeeFlow = async function (daoKey, setStatus) {
        var say = function (t) { try { if (typeof setStatus === "function") setStatus(t); } catch (e) { } };

        var st = await entrySettings(daoKey);
        if (!st || st.entry_type !== "fee") return { ok: true, skipped: true };

        var fee = Number(st.entry_fee_ton);
        if (!(fee > 0)) {
            return { ok: false, error: ru() ? "У этого DAO включён платный вход, но сумма не задана. Напиши владельцу." : "Paid entry is on but no amount is set. Contact the owner." };
        }

        /* Взнос может быть в токене DAO. Тогда сумма — в этом токене,
           а не в TON, и весь путь платежа другой. */
        var isJet = !!(st.fee_jetton);
        var sym = isJet ? (st.fee_symbol || "?") : "TON";
        var units = isJet ? unitsOf(fee, st.fee_decimals) : null;
        if (isJet && (!units || units === "0")) {
            return { ok: false, error: ru() ? "Некорректный размер взноса" : "Invalid fee amount" };
        }

        if (await alreadyPaid(daoKey)) return { ok: true, alreadyPaid: true };

        var tre = treasuryOf(daoKey);
        if (!tre) {
            return { ok: false, error: ru() ? "У DAO нет адреса казны — взнос отправлять некуда. Напиши владельцу." : "This DAO has no treasury address. Contact the owner." };
        }

        var nano = isJet ? null : toNano(fee);
        if (!isJet && !nano) return { ok: false, error: ru() ? "Некорректный размер взноса" : "Invalid fee amount" };

        say(ru() ? "Проверяю подключение кошелька…" : "Checking wallet connection…");
        var wallet = await waitWallet();
        if (!wallet) {
            return { ok: false, error: ru() ? "Кошелёк не отвечает. Переподключи его и повтори." : "Wallet is not responding. Reconnect and retry." };
        }

        say(ru() ? "Проверяю кошелёк…" : "Checking wallet…");
        var bal = await walletBalance(wallet, tre.testnet);
        var tokBal = isJet ? await jettonBalance(wallet, st.fee_jetton, tre.testnet) : null;

        /* Сначала спрашиваем человека, потом трогаем деньги.
           Заявку создаём только после согласия — иначе в базе копились бы
           висяки от тех, кто просто посмотрел и передумал. */
        var agreed = await confirmScreen({
            fee: fee, sym: sym, isJet: isJet, tokBalance: tokBal,
            address: tre.address, testnet: tre.testnet, balance: bal
        });
        if (!agreed) {
            return {
                ok: false, cancelled: true,
                error: ru() ? "Вступление отменено — взнос не внесён." : "Cancelled — no fee was paid."
            };
        }

        say(ru() ? "Готовлю платёж…" : "Preparing payment…");
        var ticket = await openTicket(daoKey, fee, tre, wallet, st.fee_jetton);
        if (!ticket.ok) {
            return { ok: false, error: (ru() ? "Не удалось создать заявку на оплату: " : "Could not create payment request: ") + ticket.error };
        }

        /* Заявка уже была — возможно, человек оплатил в прошлый раз,
           но не дождался подтверждения. Сначала спросим сервер. */
        if (ticket.reused) {
            say(ru() ? "Проверяю прошлый платёж…" : "Checking previous payment…");
            var pre = await askServer(daoKey);
            if (pre && pre.paid) return { ok: true };
        }

        say(ru() ? "Подтверди перевод в кошельке" : "Confirm the transfer in your wallet");
        try {
            if (isJet) await sendJettonFee(tre, st, wallet, units);
            else await sendFee(tre, nano);
        } catch (e) {
            var m = (e && e.message) || "";
            if (/reject|cancel|declin|abort|user/i.test(m)) {
                return { ok: false, cancelled: true, error: ru() ? "Перевод отменён — вступление не завершено." : "Transfer cancelled — you did not join." };
            }
            return { ok: false, error: (ru() ? "Кошелёк не отправил перевод: " : "Wallet failed to send: ") + m };
        }

        say(ru() ? "Жду подтверждения в сети…" : "Waiting for network confirmation…");
        var w = await waitPaid(daoKey, function (i, n) {
            say((ru() ? "Жду подтверждения в сети… " : "Waiting for confirmation… ") + i + "/" + n);
        });
        if (w.ok) return { ok: true };

        /* Сервер проверки недоступен. Деньги при этом уже в казне —
           об этом надо сказать прямо, иначе человек решит, что потерял их. */
        if (w.unreachable) {
            return {
                ok: false, pending: true,
                error: ru()
                    ? "Перевод отправлен и деньги в казне, но сервер проверки платежей сейчас недоступен. Вход откроется позже: зайди в DAO и нажми «вступить» снова — платить второй раз не нужно."
                    : "Transfer sent and funds are in the treasury, but the verification server is unavailable. Press join again later — no second payment is needed."
            };
        }

        /* Деньги ушли, подтверждение не пришло вовремя. Это не потеря:
           перевод в блокчейне, заявка в базе — вход откроется, когда сеть догонит. */
        return {
            ok: false, pending: true,
            error: ru()
                ? "Перевод отправлен, но сеть ещё не подтвердила его. Деньги не потеряны — они идут в казну. Открой DAO через пару минут и нажми «вступить» снова: платёж зачтётся."
                : "Transfer sent but not confirmed yet. Funds are not lost. Reopen the DAO in a couple of minutes and press join again."
        };
    };

})();
