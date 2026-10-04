/* =====================================================
   TONIX — treasury.js
   Он-чейн казна DAO.
   Читает баланс multisig-контракта прямо из блокчейна TON
   (публичный API toncenter) и показывает его во вкладке «Казна».
   ТОЛЬКО ЧТЕНИЕ: никаких ключей, подписей и денег здесь нет.
   Управление казной — на multisig.ton.org, подписывают кошельками.
   ===================================================== */

(function () {

    /* Ключ toncenter поднимает лимит запросов: без него публичный API
       отдаёт 429 при нагрузке. Ключ виден в клиенте — это штатно, он
       лишь снимает лимит и не даёт доступа к средствам или данным. */
    var TONCENTER_KEY = "4dd7f5b05be6418cb3e4920b690cbe41eb7c349732123846d0d15773fd3bd600";
    var TONCENTER_HEADERS = { "X-API-Key": TONCENTER_KEY };

    /* Подписи блока (ru + en; остальные языки падают на en) */
    var TR_TXT = {
        ru: {
            tokens: "Токены в казне",
            onchain: "ончейн →",
            more: "и ещё",
            addr: "Адрес казны (multisig-контракт)",
            view: "История операций в обозревателе →",
            manage: "Управление казной — для подписантов →",
            testnet: "тестовая сеть (testnet)",
            live: "баланс из блокчейна",
            err: "не удалось загрузить баланс — показан последний известный",
            copied: "Адрес скопирован"
        },
        en: {
            tokens: "Tokens in treasury",
            onchain: "on-chain →",
            more: "and",
            addr: "Treasury address (multisig contract)",
            view: "Operations history in explorer →",
            manage: "Manage treasury — for signers →",
            testnet: "test network (testnet)",
            live: "balance from blockchain",
            err: "failed to load balance — showing last known",
            copied: "Address copied"
        },
        es: {
            tokens: "Tokens en la tesorería",
            onchain: "en cadena →",
            more: "y",
            addr: "Dirección de la tesorería (contrato multisig)",
            view: "Historial de operaciones en el explorador →",
            manage: "Gestionar tesorería — para firmantes →",
            testnet: "red de prueba (testnet)",
            live: "saldo desde la blockchain",
            err: "no se pudo cargar el saldo — se muestra el último conocido",
            copied: "Dirección copiada"
        },
        pt: {
            tokens: "Tokens na tesouraria",
            onchain: "on-chain →",
            more: "e mais",
            addr: "Endereço da tesouraria (contrato multisig)",
            view: "Histórico de operações no explorador →",
            manage: "Gerenciar tesouraria — para signatários →",
            testnet: "rede de teste (testnet)",
            live: "saldo da blockchain",
            err: "falha ao carregar o saldo — mostrando o último conhecido",
            copied: "Endereço copiado"
        },
        fr: {
            tokens: "Jetons en trésorerie",
            onchain: "on-chain →",
            more: "et",
            addr: "Adresse de la trésorerie (contrat multisig)",
            view: "Historique des opérations dans l'explorateur →",
            manage: "Gérer la trésorerie — pour les signataires →",
            testnet: "réseau de test (testnet)",
            live: "solde depuis la blockchain",
            err: "échec du chargement du solde — dernier connu affiché",
            copied: "Adresse copiée"
        },
        de: {
            tokens: "Token in der Kasse",
            onchain: "on-chain →",
            more: "und",
            addr: "Treasury-Adresse (Multisig-Vertrag)",
            view: "Vorgangshistorie im Explorer →",
            manage: "Treasury verwalten — für Unterzeichner →",
            testnet: "Testnetz (testnet)",
            live: "Guthaben aus der Blockchain",
            err: "Guthaben nicht ladbar — letzter bekannter Stand",
            copied: "Adresse kopiert"
        },
        zh: {
            tokens: "金库中的代币",
            onchain: "链上 →",
            more: "还有",
            addr: "金库地址（多签合约）",
            view: "在浏览器中查看操作记录 →",
            manage: "管理金库 — 供签署人使用 →",
            testnet: "测试网（testnet）",
            live: "来自链上的余额",
            err: "余额加载失败 — 显示最后已知值",
            copied: "地址已复制"
        },
        ar: {
            tokens: "الرموز في الخزينة",
            onchain: "على السلسلة →",
            more: "و",
            addr: "عنوان الخزينة (عقد متعدد التواقيع)",
            view: "سجل العمليات في المستكشف →",
            manage: "إدارة الخزينة — للموقّعين →",
            testnet: "شبكة اختبار (testnet)",
            live: "الرصيد من البلوكشين",
            err: "تعذّر تحميل الرصيد — يُعرض آخر رصيد معروف",
            copied: "تم نسخ العنوان"
        },
        hi: {
            tokens: "कोष में टोकन",
            onchain: "ऑन-चेन →",
            more: "और",
            addr: "ट्रेज़री पता (मल्टीसिग कॉन्ट्रैक्ट)",
            view: "एक्सप्लोरर में संचालन इतिहास →",
            manage: "ट्रेज़री प्रबंधित करें — हस्ताक्षरकर्ताओं के लिए →",
            testnet: "टेस्ट नेटवर्क (testnet)",
            live: "ब्लॉकचेन से बैलेंस",
            err: "बैलेंस लोड नहीं हुआ — अंतिम ज्ञात दिखाया जा रहा है",
            copied: "पता कॉपी हुआ"
        },
        ja: {
            tokens: "トレジャリーのトークン",
            onchain: "オンチェーン →",
            more: "ほか",
            addr: "トレジャリーのアドレス（マルチシグ契約）",
            view: "エクスプローラーで操作履歴を見る →",
            manage: "トレジャリーを管理 — 署名者向け →",
            testnet: "テストネット（testnet）",
            live: "ブロックチェーン上の残高",
            err: "残高を読み込めません — 最後に取得した値を表示",
            copied: "アドレスをコピーしました"
        }
    };

    function tr(key) {
        var lang = (typeof curLang !== "undefined" && TR_TXT[curLang]) ? curLang : "en";
        return TR_TXT[lang][key] || TR_TXT.en[key] || key;
    }

    /* 1234567.891 -> "1 234 567.89" (как принято в интерфейсе) */
    function fmtTon(n) {
        if (!isFinite(n)) return "0";
        var s = (Math.round(n * 100) / 100).toFixed(2);
        s = s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
        var parts = s.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
        return parts.join(".");
    }

    function shortAddr(a) {
        return a.length > 16 ? a.slice(0, 8) + "…" + a.slice(-6) : a;
    }

    /* Панель под балансом: адрес + ссылки (обозреватель, управление) */
    function renderPanel(cfg) {
        var page = document.getElementById("d-treasury");
        if (!page) return;
        var host = page.querySelector(".treas");
        if (!host) return;

        var el = document.getElementById("treasuryOnchain");
        if (!el) {
            el = document.createElement("div");
            el.id = "treasuryOnchain";
            el.style.cssText = "margin-top:12px;padding:14px 16px;border:1px solid rgba(255,255,255,.08);border-radius:14px;font-size:13px;line-height:1.7";
            host.parentNode.insertBefore(el, host.nextSibling);
        }

        var viewer = (cfg.testnet ? "https://testnet.tonviewer.com/" : "https://tonviewer.com/") + cfg.address;
        var manage = "https://multisig.ton.org/" + (cfg.testnet ? "?testnet=true" : "") + "#" + cfg.address;

        el.innerHTML =
            '<div style="color:var(--dim)">' + tr("addr") + (cfg.testnet ? ' · <span style="color:#e0a64f">' + tr("testnet") + "</span>" : "") + "</div>" +
            '<div><a href="javascript:void(0)" id="treAddrCopy" title="' + cfg.address + '" style="color:var(--accent);text-decoration:none;font-family:monospace">' + shortAddr(cfg.address) + "</a></div>" +
            '<div><a href="' + viewer + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">' + tr("view") + "</a></div>" +
            '<div><a href="' + manage + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">' + tr("manage") + "</a></div>";

        var cp = document.getElementById("treAddrCopy");
        if (cp) cp.onclick = function () {
            try {
                navigator.clipboard.writeText(cfg.address);
                var old = cp.textContent;
                cp.textContent = tr("copied");
                setTimeout(function () { cp.textContent = old; }, 1200);
            } catch (e) { /* буфер недоступен — не страшно */ }
        };
    }

    function hidePanel() {
        var el = document.getElementById("treasuryOnchain");
        if (el) el.style.display = "none";
    }

    /* ═══ Токены казны (жетоны) ═══

       Зачем. Целевая аудитория Tonix — токен-сообщества: у DAO есть свой
       мем-токен, и казна живёт в нём, а не только в TON. Раньше вкладка
       показывала лишь TON, и такая казна выглядела пустой при полном
       кошельке.

       Как. Спрашиваем tonapi — он отдаёт сразу все жетоны кошелька вместе
       с названием, символом и точностью. Считать адреса жетонных кошельков
       вручную не нужно, и это важно: ошибка в такой арифметике показала бы
       чужой баланс как свой.

       Точность у каждого жетона своя: девять знаков у одних, шесть или ноль
       у других. Делить всё на миллиард, как TON, нельзя — сумма выйдет
       неправильной в тысячи раз. */

    function fmtAmount(raw, decimals) {
        var d = Number(decimals);
        if (!isFinite(d) || d < 0) d = 9;
        var n = Number(raw) / Math.pow(10, d);
        if (!isFinite(n)) return "0";
        if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
        if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
        if (n >= 1e3) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
        if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
        if (n > 0) return n.toFixed(Math.min(8, d));
        return "0";
    }

    function jettonsHost() {
        var page = document.getElementById("d-treasury");
        if (!page) return null;
        var anchor = document.getElementById("treasuryOnchain");
        if (!anchor) return null;
        var el = document.getElementById("treasuryJettons");
        if (!el) {
            el = document.createElement("div");
            el.id = "treasuryJettons";
            el.style.cssText = "margin-top:12px";
            anchor.parentNode.insertBefore(el, anchor.nextSibling);
        }
        return el;
    }

    function loadJettons(daoKey, cfg) {
        var el = jettonsHost();
        if (!el) return;
        el.innerHTML = "";

        var base = cfg.testnet ? "https://testnet.tonapi.io" : "https://tonapi.io";
        var url = base + "/v2/accounts/" + encodeURIComponent(cfg.address) + "/jettons";

        fetch(url, { headers: { "Accept": "application/json" } })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var list = (j && j.balances) || [];
                /* Нулевые кошельки не показываем: они остаются после любого
                   перевода и засоряли бы список навсегда. */
                list = list.filter(function (b) { return Number(b.balance) > 0; });
                console.log("[treasury] токенов в казне", daoKey + ":", list.length);
                if (!list.length) return;

                /* Крупные суммы вперёд — по количеству единиц с учётом точности */
                list.sort(function (a, b) {
                    var da = Number((a.jetton && a.jetton.decimals) || 9);
                    var db = Number((b.jetton && b.jetton.decimals) || 9);
                    return (Number(b.balance) / Math.pow(10, db)) - (Number(a.balance) / Math.pow(10, da));
                });

                var h = '<div style="color:var(--dim);font-size:12px;margin-bottom:8px">' + tr("tokens") + "</div>";
                list.slice(0, 12).forEach(function (b) {
                    var jt = b.jetton || {};
                    var sym = esc(jt.symbol || "?");
                    var nm = esc(jt.name || "");
                    var img = jt.image ? esc(jt.image) : "";
                    var amt = fmtAmount(b.balance, jt.decimals);
                    var link = (cfg.testnet ? "https://testnet.tonviewer.com/" : "https://tonviewer.com/") +
                        encodeURIComponent(jt.address || "");
                    h += '<div style="display:flex;align-items:center;gap:10px;padding:9px 11px;margin-bottom:6px;' +
                        'background:var(--surface2);border:1px solid var(--border);border-radius:11px">' +
                        (img
                            ? '<img src="' + img + '" alt="" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0">'
                            : '<div style="width:26px;height:26px;border-radius:50%;flex-shrink:0;' +
                              'background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;' +
                              'font-size:10px;font-weight:700;color:#fff">' + sym.substring(0, 2).toUpperCase() + "</div>") +
                        '<div style="min-width:0;flex:1">' +
                          '<div style="font-size:14px;font-weight:600;color:var(--text)">' + amt + " " + sym + "</div>" +
                          (nm ? '<div style="font-size:11.5px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + nm + "</div>" : "") +
                        "</div>" +
                        '<a href="' + link + '" target="_blank" rel="noopener" ' +
                        'style="color:var(--accent);text-decoration:none;font-size:11.5px;flex-shrink:0">' + tr("onchain") + "</a>" +
                        "</div>";
                });
                if (list.length > 12) {
                    h += '<div style="font-size:11.5px;color:var(--dim)">' + tr("more") + " " + (list.length - 12) + "</div>";
                }
                el.innerHTML = h;
            })
            .catch(function (e) {
                /* Токены — дополнение к TON. Если справочник недоступен,
                   молчим: пустой блок лучше ложной надписи об ошибке казны. */
                console.warn("[treasury] токены не загрузились:", e);
            });
    }

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /* Нормализация адреса токена к raw-форме — тот же приём, что в
       entry-fee: адрес из настроек (EQ…) и из tonapi (0:…) должны
       сравниваться в одной форме. */
    function _normAddr(a) {
        if (!a) return "";
        var s = String(a).trim();
        if (s.indexOf(":") !== -1) {
            var p = s.split(":");
            return parseInt(p[0], 10) + ":" + String(p[1]).toLowerCase();
        }
        try {
            var b64 = s.replace(/-/g, "+").replace(/_/g, "/");
            var bin = atob(b64);
            if (bin.length < 34) return s.toLowerCase();
            var by = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) by[i] = bin.charCodeAt(i);
            var wc = by[1]; if (wc === 0xff) wc = -1;
            var hex = "";
            for (var k = 2; k < 34; k++) hex += by[k].toString(16).padStart(2, "0");
            return wc + ":" + hex;
        } catch (e) { return s.toLowerCase(); }
    }

    /* Если у DAO задан главный токен казны — показываем крупным числом
       его баланс вместо TON, а подпись-заголовок меняем на его символ.
       Пусто, токен не найден или сеть молчит — оставляем TON как есть,
       без ошибки. Это только отображение, казну не трогает. */
    function applyMainToken(daoKey, cfg) {
        try {
            if (typeof sb === "undefined") return;
            sb.from("dao_settings").select("treasury_main_jetton")
                .eq("dao_key", daoKey).limit(1).maybeSingle()
                .then(function (res) {
                    var mainJet = res && res.data && res.data.treasury_main_jetton;
                    if (!mainJet) return; /* TON остаётся главным */
                    var want = _normAddr(mainJet);
                    var base = cfg.testnet ? "https://testnet.tonapi.io" : "https://tonapi.io";
                    return fetch(base + "/v2/accounts/" + encodeURIComponent(cfg.address) + "/jettons",
                        { headers: { "Accept": "application/json" } })
                        .then(function (r) { return r.json(); })
                        .then(function (j) {
                            var list = (j && j.balances) || [];
                            for (var i = 0; i < list.length; i++) {
                                var jt = list[i].jetton || {};
                                if (_normAddr(jt.address || "") === want) {
                                    var sym = esc(jt.symbol || "?");
                                    var amt = fmtAmount(list[i].balance, jt.decimals);
                                    var v = document.querySelector("#d-treasury .treas .v");
                                    if (v) v.innerHTML = amt + ' <span style="font-size:18px;color:var(--dim)">' + sym + "</span>";
                                    var lbl = document.querySelector("#d-treasury .treas .l");
                                    if (lbl) {
                                        var ru = (typeof curLang === "undefined" || curLang === "ru");
                                        lbl.textContent = (ru ? "Баланс казны в " : "Treasury balance in ") + (jt.symbol || "?");
                                    }
                                    var m3 = document.getElementById("dhM3");
                                    if (m3) m3.textContent = amt;
                                    /* Подпись под числом на обзоре: «HPO в казне»
                                       вместо «TON в казне». Ищем соседний .l в
                                       той же карточке. */
                                    if (m3) {
                                        var card = m3.closest ? m3.closest(".gminicard") : null;
                                        var lbl2 = card ? card.querySelector(".l") : null;
                                        if (lbl2) {
                                            var ru2 = (typeof curLang === "undefined" || curLang === "ru");
                                            lbl2.removeAttribute("data-i18n");
                                            lbl2.textContent = (jt.symbol || "?") + (ru2 ? " в казне" : " in treasury");
                                        }
                                    }
                                    return;
                                }
                            }
                            /* токена нет в казне — TON остаётся */
                        });
                });
        } catch (e) { /* тихо: TON остаётся главным */ }
    }

    /* Главная функция: вызывается при открытии DAO (см. openDao в index.html) */
    window.tonixLoadTreasury = function (daoKey) {
        var map = (typeof TONIX_CONFIG !== "undefined" && TONIX_CONFIG.daoTreasury) || {};
        var cfg = map[daoKey];

        if (!cfg || !cfg.address) { hidePanel(); return; } /* демо-DAO — витрина остаётся как есть */

        var el = document.getElementById("treasuryOnchain");
        if (el) el.style.display = "";
        renderPanel(cfg);
        if (typeof tonixRenderTreasuryGuide === "function") tonixRenderTreasuryGuide();
        loadJettons(daoKey, cfg);   /* токены казны — рядом с балансом TON */

        var api = (cfg.testnet ? "https://testnet.toncenter.com" : "https://toncenter.com") +
            "/api/v2/getAddressBalance?address=" + encodeURIComponent(cfg.address);

        fetch(api, { headers: TONCENTER_HEADERS })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                if (!j || j.ok !== true) throw new Error("bad response");
                var ton = Number(j.result) / 1e9; /* нанотоны -> TON */
                window._tonixTreasuryTon = ton;   /* нужен форме выплаты для подсказки */
                console.log("[treasury] баланс", daoKey, ton, "TON");

                var v = document.querySelector("#d-treasury .treas .v");
                if (v) v.innerHTML = fmtTon(ton) + ' <span style="font-size:18px;color:var(--dim)">TON</span>';

                var usd = document.querySelector("#d-treasury .treas .usd");
                if (usd) usd.textContent = cfg.testnet ? tr("testnet") : tr("live");

                var m3 = document.getElementById("dhM3");
                if (m3) m3.textContent = fmtTon(ton);

                /* Если задан главный токен — показать его баланс крупно
                   поверх TON. Делается после TON, чтобы подмена легла
                   последней. TON остаётся, если токен не задан/не найден. */
                applyMainToken(daoKey, cfg);
            })
            .catch(function (e) {
                console.warn("[treasury] ошибка загрузки баланса:", e);
                var usd = document.querySelector("#d-treasury .treas .usd");
                if (usd) usd.textContent = tr("err");
            });
    };

})();
