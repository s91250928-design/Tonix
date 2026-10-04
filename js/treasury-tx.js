/* =====================================================
   TONIX — treasury-tx.js
   Реальная история операций казны (multisig-контракт).
   Тянет транзакции контракта прямо из блокчейна TON
   (toncenter getTransactions) и показывает во вкладке
   «Транзакции» для реального DAO.
   ТОЛЬКО ЧТЕНИЕ: ни ключей, ни подписей, ни денег здесь нет.
   Имена участников появятся, когда будут профили с адресами
   кошельков. Пока показываем адрес со ссылкой в обозреватель.
   ===================================================== */

(function () {

    /* Ключ toncenter — снимает лимит 429 на историю операций. Виден в
       клиенте штатно: только поднимает лимит, доступа к деньгам не даёт. */
    var TONCENTER_KEY = "4dd7f5b05be6418cb3e4920b690cbe41eb7c349732123846d0d15773fd3bd600";
    var TONCENTER_HEADERS = { "X-API-Key": TONCENTER_KEY };

    var TR = {
        ru: {
            head: "Операции казны",
            live: "реальная история из блокчейна",
            testnet: "тестовая сеть",
            loading: "Загружаю операции из блокчейна…",
            empty: "По этому контракту пока нет операций",
            err: "Не удалось загрузить историю — открыть в обозревателе →",
            deposit: "Пополнение казны",
            withdraw: "Вывод из казны",
            from: "от",
            to: "кому",
            justnow: "только что",
            min: "мин назад",
            hour: "ч назад",
            day: "дн назад"
        },
        en: {
            head: "Treasury operations",
            live: "real history from the blockchain",
            testnet: "test network",
            loading: "Loading operations from the blockchain…",
            empty: "No operations for this contract yet",
            err: "Failed to load history — open in explorer →",
            deposit: "Treasury deposit",
            withdraw: "Treasury withdrawal",
            from: "from",
            to: "to",
            justnow: "just now",
            min: "min ago",
            hour: "h ago",
            day: "d ago"
        },
        es: {
            head: "Operaciones de tesorería",
            live: "historial real de la cadena",
            testnet: "red de prueba",
            loading: "Cargando operaciones de la cadena…",
            empty: "Aún no hay operaciones para este contrato",
            err: "No se pudo cargar el historial — abrir en el explorador →",
            deposit: "Depósito en tesorería",
            withdraw: "Retiro de tesorería",
            from: "de",
            to: "para",
            justnow: "ahora mismo",
            min: "min atrás",
            hour: "h atrás",
            day: "d atrás"
        },
        pt: {
            head: "Operações da tesouraria",
            live: "histórico real da blockchain",
            testnet: "rede de teste",
            loading: "Carregando operações da blockchain…",
            empty: "Ainda não há operações para este contrato",
            err: "Falha ao carregar o histórico — abrir no explorador →",
            deposit: "Depósito na tesouraria",
            withdraw: "Retirada da tesouraria",
            from: "de",
            to: "para",
            justnow: "agora mesmo",
            min: "min atrás",
            hour: "h atrás",
            day: "d atrás"
        },
        fr: {
            head: "Opérations de trésorerie",
            live: "historique réel de la blockchain",
            testnet: "réseau de test",
            loading: "Chargement des opérations depuis la blockchain…",
            empty: "Aucune opération pour ce contrat",
            err: "Échec du chargement — ouvrir dans l'explorateur →",
            deposit: "Dépôt en trésorerie",
            withdraw: "Retrait de trésorerie",
            from: "de",
            to: "vers",
            justnow: "à l'instant",
            min: "min",
            hour: "h",
            day: "j"
        },
        de: {
            head: "Treasury-Vorgänge",
            live: "echte Historie aus der Blockchain",
            testnet: "Testnetz",
            loading: "Vorgänge werden aus der Blockchain geladen…",
            empty: "Noch keine Vorgänge für diesen Vertrag",
            err: "Historie konnte nicht geladen werden — im Explorer öffnen →",
            deposit: "Einzahlung in die Treasury",
            withdraw: "Auszahlung aus der Treasury",
            from: "von",
            to: "an",
            justnow: "gerade eben",
            min: "Min.",
            hour: "Std.",
            day: "Tg."
        },
        zh: {
            head: "金库操作",
            live: "来自链上的真实记录",
            testnet: "测试网",
            loading: "正在从链上加载操作…",
            empty: "该合约暂无操作",
            err: "加载记录失败 — 在浏览器中打开 →",
            deposit: "存入金库",
            withdraw: "从金库提取",
            from: "来自",
            to: "发往",
            justnow: "刚刚",
            min: "分钟前",
            hour: "小时前",
            day: "天前"
        },
        ar: {
            head: "عمليات الخزينة",
            live: "سجل حقيقي من البلوكشين",
            testnet: "شبكة اختبار",
            loading: "جارٍ تحميل العمليات من البلوكشين…",
            empty: "لا عمليات لهذا العقد بعد",
            err: "تعذّر تحميل السجل — افتح في المستكشف →",
            deposit: "إيداع في الخزينة",
            withdraw: "سحب من الخزينة",
            from: "من",
            to: "إلى",
            justnow: "الآن",
            min: "د",
            hour: "س",
            day: "ي"
        },
        hi: {
            head: "ट्रेज़री संचालन",
            live: "ब्लॉकचेन से वास्तविक इतिहास",
            testnet: "टेस्ट नेटवर्क",
            loading: "ब्लॉकचेन से संचालन लोड हो रहे हैं…",
            empty: "इस कॉन्ट्रैक्ट के लिए अभी कोई संचालन नहीं",
            err: "इतिहास लोड नहीं हुआ — एक्सप्लोरर में खोलें →",
            deposit: "ट्रेज़री में जमा",
            withdraw: "ट्रेज़री से निकासी",
            from: "से",
            to: "को",
            justnow: "अभी",
            min: "मिनट पहले",
            hour: "घंटे पहले",
            day: "दिन पहले"
        },
        ja: {
            head: "トレジャリーの操作",
            live: "ブロックチェーン上の実際の履歴",
            testnet: "テストネット",
            loading: "ブロックチェーンから操作を読み込み中…",
            empty: "このコントラクトの操作はまだありません",
            err: "履歴を読み込めません — エクスプローラーで開く →",
            deposit: "トレジャリーへの入金",
            withdraw: "トレジャリーからの出金",
            from: "送信元",
            to: "送信先",
            justnow: "たった今",
            min: "分前",
            hour: "時間前",
            day: "日前"
        }
    };

    function tr(k) {
        var l = (typeof curLang !== "undefined" && TR[curLang]) ? curLang : "en";
        return TR[l][k] || TR.en[k] || k;
    }

    /* 1.234 -> "1.23", 1000.5 -> "1 000.5" */
    function fmtTon(n) {
        if (!isFinite(n)) return "0";
        var s = (Math.round(n * 1000) / 1000).toFixed(3);
        s = s.replace(/\.000$/, "").replace(/(\.\d\d?)0$/, "$1");
        var p = s.split(".");
        p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
        return p.join(".");
    }

    function shortAddr(a) {
        if (!a) return "—";
        a = String(a);
        return a.length > 14 ? a.slice(0, 6) + "…" + a.slice(-4) : a;
    }

    function ago(utime) {
        var s = Math.max(0, Math.floor(Date.now() / 1000) - utime);
        if (s < 60) return tr("justnow");
        if (s < 3600) return Math.floor(s / 60) + " " + tr("min");
        if (s < 86400) return Math.floor(s / 3600) + " " + tr("hour");
        var d = Math.floor(s / 86400);
        if (d < 30) return d + " " + tr("day");
        return new Date(utime * 1000).toLocaleDateString();
    }

    function iconIn() { return '<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>'; }
    function iconOut() { return '<svg class="icon" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'; }

    /* ═══ Переводы токенов в истории ═══

       Историю TON отдаёт toncenter, и она работает — не трогаем.
       Но переводы жетонов там не видны как отдельные операции:
       технически это сообщения жетонным кошелькам, и в списке
       движений TON они выглядят как мелкие служебные суммы.
       Поэтому токены берём у tonapi, где перевод жетона приходит
       готовой записью с названием, символом и точностью.

       Складываем оба источника в один список по времени. Если tonapi
       не ответит, история TON всё равно покажется — токены лишь
       дополняют её, а не заменяют. */

    /* Адрес в сыром виде 0:hex — иначе EQ… и 0:… не совпадут
       сами с собой, и направление перевода определится неверно. */
    function rawAddr(a) {
        if (!a) return "";
        var s = String(a).trim();
        if (s.indexOf(":") !== -1) {
            var p = s.split(":");
            return parseInt(p[0], 10) + ":" + p[1].toLowerCase();
        }
        try {
            var b64 = s.replace(/-/g, "+").replace(/_/g, "/");
            var bin = atob(b64);
            if (bin.length < 34) return s.toLowerCase();
            var wc = bin.charCodeAt(1);
            if (wc === 0xff) wc = -1;
            var hex = "";
            for (var i = 2; i < 34; i++) {
                hex += (bin.charCodeAt(i) & 0xff).toString(16).padStart(2, "0");
            }
            return wc + ":" + hex;
        } catch (e) { return s.toLowerCase(); }
    }

    function fmtUnits(raw, decimals) {
        var d = Number(decimals);
        if (!isFinite(d) || d < 0) d = 9;
        var n = Number(raw) / Math.pow(10, d);
        if (!isFinite(n)) return "0";
        if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
        if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
        if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
        if (n > 0) return n.toFixed(Math.min(6, d));
        return "0";
    }

    function fetchJettonMoves(cfg) {
        var base = cfg.testnet ? "https://testnet.tonapi.io" : "https://tonapi.io";
        var url = base + "/v2/accounts/" + encodeURIComponent(cfg.address) + "/events?limit=30";
        var me = rawAddr(cfg.address);

        return fetch(url, { headers: { "Accept": "application/json" } })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var out = [];
                var evs = (j && j.events) || [];
                for (var i = 0; i < evs.length; i++) {
                    var ev = evs[i];
                    var acts = ev.actions || [];
                    for (var k = 0; k < acts.length; k++) {
                        var a = acts[k];
                        if (a.type !== "JettonTransfer") continue;
                        var jt = a.JettonTransfer || {};
                        var from = rawAddr(jt.sender && jt.sender.address);
                        var to = rawAddr(jt.recipient && jt.recipient.address);
                        var dir = (to === me) ? "in" : (from === me ? "out" : null);
                        if (!dir) continue;
                        var meta = jt.jetton || {};
                        out.push({
                            dir: dir,
                            token: true,
                            raw: jt.amount,
                            decimals: meta.decimals,
                            symbol: meta.symbol || "?",
                            peer: (dir === "in" ? (jt.sender && jt.sender.address) : (jt.recipient && jt.recipient.address)) || "",
                            t: Number(ev.timestamp || 0)
                        });
                    }
                }
                return out;
            })
            .catch(function (e) {
                /* Токены — дополнение. Молчим и показываем историю TON. */
                console.warn("[treasury-tx] переводы токенов не загрузились:", e);
                return [];
            });
    }

    /* Из одной транзакции достаём «движения денег»:
       входящее (in_msg с суммой) и исходящие (out_msgs с суммой). */
    function extractMoves(tx) {
        var moves = [];
        var t = tx.utime || tx.now || 0;
        var inm = tx.in_msg;
        if (inm && inm.value && Number(inm.value) > 0 && inm.source) {
            moves.push({ dir: "in", ton: Number(inm.value) / 1e9, peer: inm.source, t: t });
        }
        var outs = tx.out_msgs || [];
        for (var i = 0; i < outs.length; i++) {
            var o = outs[i];
            if (o && o.value && Number(o.value) > 0) {
                moves.push({ dir: "out", ton: Number(o.value) / 1e9, peer: o.destination, t: t });
            }
        }
        return moves;
    }

    /* Перевод жетона технически выглядит как служебное сообщение
       жетонному кошельку с копейками TON на комиссию. В истории такие
       строки лишние: перевод токена уже показан отдельной записью,
       а рядом с ним висело бы непонятное «−0.05 TON». Отсекаем мелочь,
       у которой в ту же секунду есть перевод токена. */
    function dropServiceTon(tonMoves, jetMoves) {
        if (!jetMoves.length) return tonMoves;
        var stamps = {};
        jetMoves.forEach(function (m) { stamps[m.t] = true; });
        return tonMoves.filter(function (m) {
            if (m.ton >= 0.2) return true;              // заметная сумма — оставляем
            for (var d = -3; d <= 3; d++) {             // запас на расхождение секунд
                if (stamps[m.t + d]) return false;
            }
            return true;
        });
    }

    function rowHtml(m, viewerBase) {
        var cls = m.dir === "in" ? "op inc" : "op exp";
        var icon = m.dir === "in" ? iconIn() : iconOut();
        var title = m.dir === "in" ? tr("deposit") : tr("withdraw");
        var peerLabel = (m.dir === "in" ? tr("from") : tr("to")) + " ";
        var peerLink = m.peer
            ? '<a href="' + viewerBase + m.peer + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;font-family:ui-monospace,monospace">' + shortAddr(m.peer) + "</a>"
            : "—";
        var sign = m.dir === "in" ? "+" : "−";
        /* Перевод токена подписываем его символом, а не TON: иначе
           62 durev выглядели бы как 62 TON, и это было бы вранье
           дороже, чем отсутствие строки. */
        var amount = m.token
            ? (sign + fmtUnits(m.raw, m.decimals) + ' <span style="font-size:12px;color:var(--dim)">' +
               String(m.symbol).replace(/[<>&"]/g, "") + "</span>")
            : (sign + fmtTon(m.ton) + ' <span style="font-size:12px;color:var(--dim)">TON</span>');
        return '<div class="' + cls + '">' +
            '<div class="oic">' + icon + "</div>" +
            '<div class="d"><div class="t">' + title + "</div>" +
            '<div class="s">' + peerLabel + peerLink + " · " + ago(m.t) + "</div></div>" +
            '<div class="amt">' + amount + "</div>" +
            "</div>";
    }

    /* Ссылки на элементы вкладки «Транзакции» */
    function els() {
        var tab = document.getElementById("d-transactions");
        if (!tab) return null;
        return {
            head: tab.querySelector(".sec-h"),
            contract: tab.querySelector(".txcontract"),
            filters: tab.querySelector(".filters"),
            demo: document.getElementById("txList"),
            real: document.getElementById("txListReal"),
            loadreal: document.getElementById("txLoadReal")
        };
    }

    function showDemo(e) {
        if (e.head) e.head.style.display = "";
        if (e.contract) e.contract.style.display = "";
        if (e.filters) e.filters.style.display = "";
        if (e.demo) e.demo.style.display = "";
        if (e.loadreal) e.loadreal.style.display = "";
        if (e.real) e.real.style.display = "none";
    }

    function showReal(e) {
        if (e.head) e.head.style.display = "none";
        if (e.contract) e.contract.style.display = "none";
        if (e.filters) e.filters.style.display = "none";
        if (e.demo) e.demo.style.display = "none";
        if (e.loadreal) e.loadreal.style.display = "none";
        if (e.real) e.real.style.display = "";
    }

    /* Вызывается из openDao (см. index.html) */
    window.tonixLoadTreasuryTx = function (daoKey) {
        var e = els();
        if (!e) return;

        var map = (typeof TONIX_CONFIG !== "undefined" && TONIX_CONFIG.daoTreasury) || {};
        var cfg = map[daoKey];

        /* Демо-витрины больше нет. Если у DAO нет казны, показываем
           честное «операций пока нет», а не выдуманную ленту. */
        if (!cfg || !cfg.address) {
            showReal(e);
            if (e.real) e.real.innerHTML =
                '<div style="text-align:center;color:var(--dim);padding:22px;font-size:13px">' +
                tr("empty") + "</div>";
            return;
        }
        var viewerBase = cfg.testnet ? "https://testnet.tonviewer.com/" : "https://tonviewer.com/";

        /* Прячем статичную разметку txList и показываем блок txListReal:
           раньше showReal здесь не вызывался, и застревала старая заглушка
           «Загружаю…» поверх реального результата. */
        showReal(e);

        e.real.innerHTML =
            '<div style="text-align:center;color:var(--dim);padding:22px;font-size:13px">' +
            '<div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">' + tr("head") + "</div>" +
            tr("loading") + "</div>";

        var api = (cfg.testnet ? "https://testnet.toncenter.com" : "https://toncenter.com") +
            "/api/v2/getTransactions?address=" + encodeURIComponent(cfg.address) + "&limit=25";

        /* Оба источника запрашиваем сразу: TON у toncenter, токены
           у tonapi. Ждём оба, но провал второго не срывает первый. */
        Promise.all([
            fetch(api, { headers: TONCENTER_HEADERS }).then(function (r) { return r.json(); }),
            fetchJettonMoves(cfg)
        ])
            .then(function (res) {
                var j = res[0], jet = res[1] || [];
                if (!j || j.ok !== true || !Array.isArray(j.result)) throw new Error("bad response");

                var tonMoves = [];
                for (var i = 0; i < j.result.length; i++) {
                    var mm = extractMoves(j.result[i]);
                    for (var k = 0; k < mm.length; k++) tonMoves.push(mm[k]);
                }
                tonMoves = dropServiceTon(tonMoves, jet);

                var moves = tonMoves.concat(jet);
                moves.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
                if (moves.length > 40) moves = moves.slice(0, 40);
                console.log("[treasury-tx] операции", daoKey + ":", tonMoves.length, "TON,", jet.length, "токен");

                var header =
                    '<div class="sec-h"><h2 style="font-size:18px">' + tr("head") + "</h2>" +
                    '<a href="' + viewerBase + cfg.address + '" target="_blank" rel="noopener" class="link" style="color:var(--accent);text-decoration:none">' +
                    (cfg.testnet ? tr("testnet") : tr("live")) + " →</a></div>";

                if (!moves.length) {
                    e.real.innerHTML = header +
                        '<div style="text-align:center;color:var(--dim);padding:22px;font-size:13px">' + tr("empty") + "</div>";
                    return;
                }

                var rows = "";
                for (var q = 0; q < moves.length; q++) rows += rowHtml(moves[q], viewerBase);
                e.real.innerHTML = header + rows;
            })
            .catch(function (err) {
                console.warn("[treasury-tx] ошибка загрузки истории:", err);
                e.real.innerHTML =
                    '<div style="text-align:center;padding:22px;font-size:13px">' +
                    '<a href="' + viewerBase + cfg.address + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">' +
                    tr("err") + "</a></div>";
            });
    };

})();
