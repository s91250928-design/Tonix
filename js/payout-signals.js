/* =====================================================
   TONIX — payout-signals.js
   Сигнал подписантам: решения по казне, ждущие подписи.

   Показывает во вкладке «Казна» список принятых предложений
   о выплате, у которых payout_status = 'awaiting_signature'.

   ДЕНЕГ ЗДЕСЬ НЕТ И НЕ БУДЕТ. Модуль ничего не переводит и
   не может перевести: он читает решение сообщества и даёт
   подписантам адрес, сумму и ссылку на мультисиг. Перевод
   делают люди своими подписями на multisig.ton.org.

   Кнопки «исполнено» и «отклонить» — это отметка о том, что
   стало с решением. Право на неё проверяет сама база
   (функция mark_payout, только владелец DAO).
   ===================================================== */

(function () {

    /* Адрес контракта токена хранится в raw-форме (0:hex), а мультисиг
       (multisig.ton.org) принимает только дружелюбную форму EQ…. Эта
       функция переводит raw → EQ прямо в браузере, чтобы подписант мог
       просто скопировать готовый адрес и вставить в форму ордера.

       Алгоритм TON: байт флага (0x11 bounceable) + workchain + 32 байта
       хеша + 2 байта CRC16-CCITT, затем base64url. Если вход не raw
       (уже EQ/UQ или мусор) — возвращаем как есть, не ломая. */
    function crc16(data) {
        var crc = 0;
        for (var i = 0; i < data.length; i++) {
            crc ^= data[i] << 8;
            for (var j = 0; j < 8; j++) {
                crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
                crc &= 0xffff;
            }
        }
        return crc;
    }
    function rawToFriendly(addr) {
        try {
            var s = String(addr || "").trim();
            if (s.indexOf(":") === -1) return s; /* не raw — вернуть как есть */
            var parts = s.split(":");
            var wc = parseInt(parts[0], 10);
            var hex = parts[1];
            if (!/^[0-9a-fA-F]{64}$/.test(hex)) return s; /* не 32 байта — не трогаем */
            var hash = new Uint8Array(32);
            for (var i = 0; i < 32; i++) hash[i] = parseInt(hex.substr(i * 2, 2), 16);
            var buf = new Uint8Array(36);
            buf[0] = 0x11;                       /* bounceable, non-testnet */
            buf[1] = (wc === -1) ? 0xff : (wc & 0xff);
            buf.set(hash, 2);
            var crc = crc16(buf.subarray(0, 34));
            buf[34] = (crc >> 8) & 0xff;
            buf[35] = crc & 0xff;
            var bin = "";
            for (var k = 0; k < 36; k++) bin += String.fromCharCode(buf[k]);
            /* base64url */
            return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_");
        } catch (e) { return String(addr || ""); }
    }

    var TXT = {
        ru: {
            head: "Решения, ждущие подписи",
            lead: "Сообщество проголосовало «за». Перевод делают подписанты мультисига вручную — Tonix деньги не двигает.",
            from: "из казны",
            to: "Получатель",
            copy: "Копировать адрес",
            copied: "Скопировано",
            open: "Открыть мультисиг →",
            ms_head: "Что заполнить в мультисиге",
            ms_hint: "Мультисиг просит сумму в мелких единицах, а не в токенах. Вставь число выше как есть — оно уже пересчитано.",
            done: "Отметить исполненным",
            verify: "Проверить перевод",
            verify_hint: "Tonix найдёт перевод в блокчейне сам и подтвердит решение. Отметить решение исполненным можно только по найденной транзакции.",
            checking: "Проверяю блокчейн…",
            v_ok: "Перевод найден в блокчейне. Решение подтверждено.",
            v_none: "Перевод не найден. Возможно, он ещё не прошёл — подожди минуту и попробуй снова. Или сумма и адрес не совпали с решением.",
            v_chain: "Блокчейн сейчас недоступен. Попробуй через минуту.",
            decline: "Отклонить",
            note_ph: "Причина (необязательно)",
            ask_decl: "Отметить решение как отклонённое подписантами?",
            saved: "Отмечено",
            err: "Не удалось отметить: ",
            not_owner: "Отмечать решения может только владелец DAO",
            not_await: "Это решение уже закрыто — обнови страницу"
        },
        en: {
            head: "Decisions awaiting signature",
            lead: "The community voted yes. Multisig signers make the transfer manually — Tonix moves no money.",
            from: "from treasury",
            to: "Recipient",
            copy: "Copy address",
            copied: "Copied",
            open: "Open multisig →",
            ms_head: "What to fill in the multisig",
            ms_hint: "The multisig asks for the amount in the smallest units, not in tokens. Paste the number above as is — it is already converted.",
            done: "Mark as executed",
            verify: "Verify transfer",
            verify_hint: "Tonix will find the transfer on-chain and confirm the decision. A decision can be marked executed only by a transaction found on-chain.",
            checking: "Checking the blockchain…",
            v_ok: "Transfer found on-chain. Decision confirmed.",
            v_none: "No transfer found. It may not have gone through yet — wait a minute and retry. Or the amount and address do not match the decision.",
            v_chain: "The blockchain is unavailable right now. Try again in a minute.",
            decline: "Decline",
            note_ph: "Reason (optional)",
            ask_decl: "Mark this decision as declined by signers?",
            saved: "Marked",
            err: "Could not mark: ",
            not_owner: "Only the DAO owner can mark decisions",
            not_await: "This decision is already closed — refresh the page"
        }
    };

    function t(k) {
        var lang = (typeof curLang !== "undefined" && TXT[curLang]) ? curLang : "en";
        return TXT[lang][k] || TXT.en[k] || k;
    }

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function fmt(n) {
        var s = (Math.round(Number(n) * 1e6) / 1e6).toString();
        return s;
    }

    /* Контейнер создаём один раз, первым блоком вкладки «Казна»:
       решение, ждущее подписи, важнее, чем текущий баланс. */
    /* Сумма в самых мелких единицах токена — то, что просит мультисиг.
       Считаем строками, а не умножением: 0.1 умножить на 10^9 в
       двоичной арифметике даёт 100000000.00000001, и подписант
       вставил бы в контракт мусор. */
    function unitsOf(amount, decimals) {
        var s = String(amount).trim();
        if (s.indexOf("e") !== -1 || s.indexOf("E") !== -1) s = Number(s).toFixed(decimals);
        var neg = s.charAt(0) === "-";
        if (neg) s = s.slice(1);
        var parts = s.split(".");
        var whole = parts[0] || "0";
        var frac = (parts[1] || "");
        if (frac.length > decimals) frac = frac.slice(0, decimals);      // лишние знаки токен не примет
        while (frac.length < decimals) frac += "0";
        var out = (whole + frac).replace(/^0+(?=\d)/, "");
        return (neg ? "-" : "") + (out || "0");
    }

    function host() {
        var page = document.getElementById("d-treasury");
        if (!page) return null;
        var el = document.getElementById("payoutSignals");
        if (!el) {
            el = document.createElement("div");
            el.id = "payoutSignals";
            el.style.cssText = "margin-bottom:16px";
            page.insertBefore(el, page.firstChild);
        }
        return el;
    }

    function isOwner(daoKey) {
        try { return !!(DAOS[daoKey] && DAOS[daoKey].owner); } catch (e) { return false; }
    }

    function multisigLink(daoKey) {
        var map = (typeof TONIX_CONFIG !== "undefined" && TONIX_CONFIG.daoTreasury) || {};
        var cfg = map[daoKey];
        if (!cfg || !cfg.address) return "https://multisig.ton.org/";
        return "https://multisig.ton.org/" + (cfg.testnet ? "?testnet=true" : "") + "#" + cfg.address;
    }

    function card(p, daoKey, owner) {
        var link = multisigLink(daoKey);
        var sym = p.payout_symbol || "TON";

        /* Инструкция для мультисига: названия полей ровно те, что видит
           подписант в multisig.ton.org, и в том же порядке. Иначе он
           сопоставляет наши формулировки с чужими на глаз и ошибается. */
        function fld(label, value, copy) {
            return '<div style="margin-top:7px">' +
                '<div style="font-size:11px;color:var(--dim)">' + esc(label) + '</div>' +
                '<div style="font-family:monospace;font-size:12.5px;color:var(--text);word-break:break-all">' + esc(value) + '</div>' +
                (copy ? '<a href="javascript:void(0)" onclick="tonixCopyPayoutAddr(this,\'' + esc(value) + '\')" style="color:var(--accent);text-decoration:none;font-size:11.5px">' + esc(t("copy")) + '</a>' : '') +
                '</div>';
        }
        var howTo = '<div style="margin-top:10px;padding:10px 12px;border-radius:9px;' +
            'background:color-mix(in srgb,var(--warn) 10%,transparent);' +
            'border:1px solid color-mix(in srgb,var(--warn) 30%,transparent)">' +
            '<div style="font-size:11.5px;color:var(--warn);font-weight:600">' + esc(t("ms_head")) + '</div>';

        if (p.payout_jetton) {
            var dec = Number(p.payout_decimals);
            if (!(dec >= 0)) dec = 9;
            var units = unitsOf(p.payout_amount, dec);
            howTo += fld("Order Type", "Transfer Jetton", false) +
                fld("Jetton Minter Address", rawToFriendly(p.payout_jetton), true) +
                fld("Jetton Amount (in units)", units, true) +
                fld("To Address", p.payout_address, true) +
                '<div style="font-size:11px;color:var(--dim);margin-top:7px;line-height:1.5">' +
                esc(t("ms_hint")) + '</div>';
        } else {
            howTo += fld("Order Type", "Transfer TON", false) +
                fld("TON Amount", String(p.payout_amount), true) +
                fld("Destination Address", p.payout_address, true);
        }
        howTo += '</div>';
        var btns = owner
            ? '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
              '<button class="btn btn-main" style="flex:1;min-width:170px" onclick="tonixVerifyPayout(\'' + esc(p.id) + '\',this)">' + esc(t("verify")) + '</button>' +
              '<button class="btn" style="flex:1;min-width:120px" onclick="tonixMarkPayout(\'' + esc(p.id) + '\',\'declined\')">' + esc(t("decline")) + '</button>' +
              '</div>' +
              '<div style="font-size:11.5px;color:var(--dim);line-height:1.5;margin-top:8px">' + esc(t("verify_hint")) + '</div>'
            : "";

        return '<div style="border:1px solid var(--warn,#e0a64f);border-radius:14px;padding:14px 16px;margin-bottom:10px;background:var(--surface2)">' +
            '<div style="font-size:15px;font-weight:600;color:var(--text)">' + esc(p.title) + '</div>' +
            (p.description ? '<div style="font-size:12.5px;color:var(--dim);margin-top:3px">' + esc(p.description) + '</div>' : "") +
            '<div style="font-size:20px;font-weight:700;color:var(--text);margin-top:10px">' + esc(fmt(p.payout_amount)) + ' ' + esc(p.payout_symbol || 'TON') + ' <span style="font-size:13px;font-weight:400;color:var(--dim)">' + esc(t("from")) + '</span></div>' +
            '<div style="font-size:11.5px;color:var(--dim);margin-top:6px">' + esc(t("to")) + '</div>' +
            '<div style="font-family:monospace;font-size:12px;color:var(--text);word-break:break-all">' + esc(p.payout_address) + '</div>' +
            howTo +
            '<div style="display:flex;gap:14px;margin-top:8px;flex-wrap:wrap">' +
              '<a href="javascript:void(0)" onclick="tonixCopyPayoutAddr(this,\'' + esc(p.payout_address) + '\')" style="color:var(--accent);text-decoration:none;font-size:12.5px">' + esc(t("copy")) + '</a>' +
              '<a href="' + esc(link) + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;font-size:12.5px">' + esc(t("open")) + '</a>' +
            '</div>' + btns +
        '</div>';
    }

    /* Проверка перевода в блокчейне. Решение подтверждает не человек,
       а найденная транзакция: тот получатель, та сумма, после закрытия
       голосования. Без найденной транзакции решение не закрывается. */
    window.tonixVerifyPayout = async function (id, btn) {
        var old = btn ? btn.textContent : "";
        if (btn) { btn.disabled = true; btn.textContent = t("checking"); }
        try {
            var s = await sb.auth.getSession();
            var jwt = s && s.data && s.data.session ? s.data.session.access_token : null;
            if (!jwt) { alert(t("err") + "no-session"); return; }

            var r = await fetch(TONIX_CONFIG.supabase.url + "/functions/v1/verify-payout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": TONIX_CONFIG.supabase.anonKey,
                    "Authorization": "Bearer " + jwt
                },
                body: JSON.stringify({ proposal_id: id })
            });
            var j = await r.json();
            console.log("[payout] проверка перевода:", JSON.stringify(j));

            if (j && j.ok) {
                /* Момент, ради которого всё строилось: деньги реально ушли,
                   и это подтверждено сетью. Показываем сценой, а не окошком. */
                var ruV = (typeof curLang === "undefined" || curLang === "ru");
                if (typeof tonixScene === "function") {
                    tonixScene("create", {
                        title: ruV ? "Решение исполнено" : "Decision executed",
                        text: ruV
                            ? "Перевод найден в блокчейне и подтверждён. Ссылка на транзакцию сохранена в решении."
                            : "The transfer was found on-chain and confirmed. The transaction link is saved with the decision.",
                        need: (j.amount ? (j.amount + " TON") : ""),
                        buttons: [{ label: ruV ? "Отлично" : "Great", cls: "btn-main" }]
                    });
                } else alert(t("v_ok"));
                window.tonixLoadPayoutSignals(window._tonixDaoKey);
                if (typeof tonixVoteTabOpened === "function" &&
                    document.getElementById("voteContent")) tonixVoteTabOpened();
                return;
            }

            var err = j && j.error;
            if (err === "chain-unavailable") alert(t("v_chain"));
            else if (err === "not-found") {
                alert(t("v_none"));
            } else if (err === "not-awaiting") {
                alert(t("not_await"));
                window.tonixLoadPayoutSignals(window._tonixDaoKey);
            } else {
                alert(t("err") + (err || "?"));
            }
        } catch (e) {
            alert(t("err") + (e && e.message ? e.message : e));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = old; }
        }
    };

    window.tonixCopyPayoutAddr = function (el, addr) {
        try {
            navigator.clipboard.writeText(addr);
            var old = el.textContent;
            el.textContent = t("copied");
            setTimeout(function () { el.textContent = old; }, 1200);
        } catch (e) { /* буфер недоступен — не страшно */ }
    };

    /* Отметка решения. Всю проверку прав делает база:
       mark_payout пускает только владельца DAO и только то,
       что действительно ждёт подписи. */
    window.tonixMarkPayout = async function (id, status) {
        var ru = (typeof curLang === "undefined" || curLang === "ru");
        /* Исполненным решение отмечает только проверка в блокчейне
           (tonixVerifyPayout). Вручную можно лишь отклонить. */
        if (status !== "declined") return;
        if (!confirm(t("ask_decl"))) return;
        var noteEl = document.getElementById("pnote_" + id);
        var note = noteEl ? (noteEl.value || "").trim() : "";
        try {
            var r = await sb.rpc("mark_payout", { p_id: id, p_status: status, p_note: note || null });
            if (r.error) { alert(t("err") + r.error.message); return; }
            var res = r.data || {};
            if (res.ok !== true) {
                var m = (res.error === "not-owner") ? t("not_owner")
                      : (res.error === "not-awaiting") ? t("not_await")
                      : (t("err") + (res.error || "?"));
                alert(m);
                return;
            }
            alert(t("saved"));
            window.tonixLoadPayoutSignals(window._tonixDaoKey);
            /* Вкладка голосований показывает тот же статус — обновим, если открыта */
            if (typeof tonixVoteTabOpened === "function" &&
                document.getElementById("voteContent")) tonixVoteTabOpened();
        } catch (e) {
            alert(t("err") + (e && e.message ? e.message : e));
        }
    };

    /* Просим сервер разослать уведомления о решениях, ждущих подписи.
       Здесь только просьба: кому писать и писать ли вообще, решает
       сервер. Повторы отсекает поле notified_at, поэтому звать эту
       функцию при каждом открытии вкладки безопасно. */
    async function tonixNotifyPayout(daoKey) {
        try {
            if (typeof sb === "undefined" || !sb || !daoKey) return;
            var s = await sb.auth.getSession();
            var jwt = s && s.data && s.data.session ? s.data.session.access_token : null;
            if (!jwt) return;
            var r = await fetch(TONIX_CONFIG.supabase.url + "/functions/v1/notify-payout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": TONIX_CONFIG.supabase.anonKey,
                    "Authorization": "Bearer " + jwt
                },
                body: JSON.stringify({ dao_key: daoKey })
            });
            var j = await r.json();
            /* Логируем любой ответ, а не только успешный: молчание при
               отказе означало, что причину невозможно увидеть. */
            if (j && j.sent) {
                console.log("[payout] уведомлений отправлено:", j.sent, j.report || "");
            } else if (j && j.nothing) {
                console.log("[payout] рассылать нечего: всё уже разослано");
            } else {
                console.warn("[payout] рассылка не сработала:", JSON.stringify(j));
            }
        } catch (e) {
            /* Уведомления — дополнение. Их отсутствие не должно
               мешать показу карточек, поэтому молча. */
            console.warn("[payout] уведомления не отправлены:", e && e.message);
        }
    }

    try { window.tonixNotifyPayout = tonixNotifyPayout; } catch (e) { }

    /* Точка на вкладке «Казна»: чтобы решение было видно, даже когда
       человек смотрит другую вкладку. Класс переживает смену языка. */
    function setTabDot(on) {
        try {
            var links = document.querySelectorAll('[data-tab="treasury"], .daotabs a, .daoside a, .daobottom a');
            for (var i = 0; i < links.length; i++) {
                var a = links[i];
                var isTre = (a.getAttribute('data-tab') === 'treasury') ||
                            /dtab\(\s*'treasury'/.test(a.getAttribute('onclick') || '');
                if (!isTre) continue;
                if (on) a.classList.add('tab-signal'); else a.classList.remove('tab-signal');
            }
        } catch (e) { /* разметка навигации могла поменяться — не критично */ }
    }

    /* Главная функция: вызывается при открытии DAO */
    window.tonixLoadPayoutSignals = async function (daoKey) {
        var el = host();
        if (!el) return;
        el.innerHTML = "";
        setTabDot(false);
        if (!daoKey || typeof sb === "undefined") return;

        var r;
        try {
            r = await sb.from("dao_proposals")
                .select("id,title,description,payout_address,payout_amount,payout_status,payout_symbol,payout_jetton,payout_decimals")
                .eq("dao_key", daoKey)
                .eq("payout_status", "awaiting_signature")
                .order("created_at", { ascending: true });
        } catch (e) {
            console.warn("[payout] не удалось загрузить решения:", e);
            return;
        }
        if (r.error) { console.warn("[payout] ошибка:", r.error.message); return; }

        var rows = r.data || [];
        console.log("[payout] решений ждёт подписи:", rows.length, "в", daoKey);
        if (!rows.length) return;

        setTabDot(true);
        tonixNotifyPayout(daoKey);
        var owner = isOwner(daoKey);
        var h = '<div style="font-size:13px;font-weight:600;color:var(--warn,#e0a64f);text-transform:uppercase;letter-spacing:.5px">' + esc(t("head")) + '</div>' +
                '<div style="font-size:12.5px;color:var(--dim);line-height:1.6;margin:4px 0 10px">' + esc(t("lead")) + '</div>';
        for (var i = 0; i < rows.length; i++) h += card(rows[i], daoKey, owner);
        el.innerHTML = h;
    };

})();
