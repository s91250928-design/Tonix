/* =====================================================
   TONIX — treasury-guide.js
   Пошаговая инструкция подписанту: как двигать деньги казны.

   Зачем в продукте. Подписант обычно не разработчик. Он попадает
   в чужой интерфейс мультисига с десятком типов операций и полями
   вроде «Jetton Amount (in units)». Ошибка там стоит реальных денег
   и необратима. Поэтому инструкция живёт рядом с казной, а не в
   документации, куда никто не идёт.

   Почему схемы, а не скриншоты. Настоящие снимки чужого интерфейса
   устаревают молча: сайт поменяет вёрстку — картинки останутся, и
   человек будет искать кнопку, которой больше нет. Рисованная схема
   показывает суть (какое поле заполнять), не притворяясь фотографией,
   и живёт в стиле платформы.

   Один шаг за раз: длинная простыня текста не читается, а короткий
   шаг с подсветкой нужного поля — читается.
   ===================================================== */

(function () {

    var T9 = {
        ru: {
            head: "Как подписантам двигать деньги",
            sub: "Пошагово: от ордера до подтверждения",
            open: "Открыть инструкцию",
            close: "Свернуть",
            back: "Назад",
            next: "Дальше",
            done: "Готово",
            of: "из",
            note: "Tonix деньги не держит и двигать не может. Всё ниже делают подписанты своими подписями в мультисиге.",
            steps: {
                open: ["Открой мультисиг казны",
                    "Ссылка «Управление казной» на этой вкладке ведёт в мультисиг с уже подставленным адресом. Подключи кошелёк подписанта — тот, который указан в контракте. Нажми «Create new order»."],
                type: ["Выбери тип операции",
                    "Из всего списка нужны только два пункта. «Transfer TON» — если отправляешь сам TON. «Transfer Jetton» — если отправляешь любой другой токен сети TON: DUREV, USDT, токен своего DAO. Остальные пункты про выпуск и сжигание токенов, к выплатам они не относятся."],
                fieldsTon: ["Поля для перевода TON",
                    "Два поля: сумма в TON как есть, и адрес получателя. Значения для конкретного решения Tonix уже посчитал — они в карточке «Требуется подпись» на этой вкладке и в уведомлении, каждое с кнопкой копирования."],
                fieldsJet: ["Поля для перевода токена",
                    "Три поля: адрес контракта токена, сумма и адрес получателя. Адрес контракта — это не адрес получателя и не адрес токен-кошелька; Tonix даёт готовый в карточке решения."],
                units: ["Сумма токена — в мелких единицах",
                    "Мультисиг просит не «10 токенов», а число с учётом точности: 10 токенов при 9 знаках это 10000000000. Лишний ноль — перевод в десять раз больше. Копируй готовое число из карточки решения, не считай в голове."],
                first: ["Создай ордер и подпиши",
                    "«Create» отправит транзакцию с твоего кошелька. Это первая подпись, а не перевод: деньги пока на месте. Списание в кошельке — это создание контракта ордера, большая часть вернётся при исполнении."],
                second: ["Остальные подписанты подтверждают",
                    "Каждый открывает тот же ордер своим кошельком и подтверждает. Счётчик подписей растёт. Пока порог не набран, перевод не уходит — это и есть защита, а не сбой."],
                exec: ["Перевод уходит сам",
                    "Как только подписей набралось столько, сколько задано порогом, контракт исполняет операцию. Отдельно «отправлять» ничего не нужно."],
                verify: ["Вернись и подтверди в Tonix",
                    "На этой вкладке нажми «Проверить перевод». Платформа найдёт транзакцию в блокчейне и отметит решение исполненным со ссылкой на неё. Отметка вручную остаётся на случай, когда перевод сделан иначе, и видна всем как непроверенная."]
            },
            gas: "Держи на мультисиге небольшой запас TON: он тратится на создание и исполнение ордера даже при переводе токена. Без запаса контракт не отправит ничего.",
            forever: "Подписанты и порог задаются при создании контракта. Изменить их можно только отдельным ордером, который одобрит нужное число текущих подписантов; платформа сделать это не может. Сид-фразы храни офлайн: потеря доступа к нужному числу кошельков означает потерю казны."
        },
        en: {
            head: "How signers move the money",
            sub: "Step by step: from order to confirmation",
            open: "Open the guide",
            close: "Collapse",
            back: "Back",
            next: "Next",
            done: "Done",
            of: "of",
            note: "Tonix neither holds nor moves funds. Everything below is done by signers in the multisig.",
            steps: {
                open: ["Open the treasury multisig",
                    "The «Manage treasury» link on this tab opens the multisig with the address filled in. Connect a signer wallet — one listed in the contract. Press «Create new order»."],
                type: ["Pick the order type",
                    "Only two entries matter. «Transfer TON» — when sending TON itself. «Transfer Jetton» — when sending any other token on TON: DUREV, USDT, your DAO token. The rest are about minting and burning and are unrelated to payouts."],
                fieldsTon: ["Fields for a TON transfer",
                    "Two fields: the amount in TON as is, and the recipient address. Tonix has already computed the values for this decision — they are in the «Requires signature» card and in the notification, each with a copy button."],
                fieldsJet: ["Fields for a token transfer",
                    "Three fields: the token contract address, the amount, and the recipient. The contract address is not the recipient and not the token wallet; Tonix gives the ready one in the decision card."],
                units: ["Token amount is in the smallest units",
                    "The multisig asks not for «10 tokens» but for the amount with decimals: 10 tokens at 9 decimals is 10000000000. One extra zero means ten times the transfer. Copy the ready number from the decision card."],
                first: ["Create the order and sign",
                    "«Create» sends a transaction from your wallet. That is the first signature, not the transfer: funds stay put. The charge in your wallet creates the order contract, and most of it returns on execution."],
                second: ["Other signers confirm",
                    "Each one opens the same order with their wallet and confirms. The signature counter grows. Until the threshold is met nothing moves — that is the protection working."],
                exec: ["The transfer goes out by itself",
                    "Once the threshold is reached the contract executes the operation. There is nothing extra to «send»."],
                verify: ["Return and confirm in Tonix",
                    "Press «Verify transfer» on this tab. The platform finds the transaction on-chain and marks the decision executed with a link. Manual marking stays for other cases and is shown to everyone as unverified."]
            },
            gas: "Keep a small TON reserve in the multisig: creating and executing an order costs TON even for token transfers. With none left the contract cannot send anything.",
            forever: "Signers and threshold are set when the contract is created. They can only be changed by a separate order approved by the required number of current signers; the platform cannot change them. Keep seed phrases offline: losing access to enough wallets means losing the treasury."
        }
    };

    function t9() {
        var l = (typeof curLang !== "undefined" && T9[curLang]) ? curLang : "en";
        return T9[l];
    }

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /* ── Схемы экранов ──
       Рисуем сами: подсветка ведёт взгляд к нужному месту, а стиль
       остаётся своим. Подписи внутри схем — названия полей мультисига
       буква в букву, чтобы человек сопоставлял без догадок. */

    function svgWrap(inner, h) {
        return '<svg viewBox="0 0 320 ' + h + '" style="width:100%;height:auto;display:block">' +
            '<defs><linearGradient id="tgGrad" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="var(--accent2)"/><stop offset="1" stop-color="var(--accent)"/>' +
            '</linearGradient></defs>' + inner + "</svg>";
    }
    function box(x, y, w, h, hl) {
        return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6" ' +
            'fill="' + (hl ? "color-mix(in srgb,var(--accent) 16%,transparent)" : "var(--surface2)") + '" ' +
            'stroke="' + (hl ? "url(#tgGrad)" : "var(--border2)") + '" stroke-width="' + (hl ? 1.6 : 1) + '">' +
            (hl ? '<animate attributeName="opacity" values="1;.55;1" dur="2.2s" repeatCount="indefinite"/>' : "") +
            "</rect>";
    }
    function label(x, y, txt, dim, size) {
        return '<text x="' + x + '" y="' + y + '" font-size="' + (size || 8.5) + '" ' +
            'font-family="ui-monospace,monospace" fill="' + (dim ? "var(--dim2)" : "var(--dim)") + '">' + esc(txt) + "</text>";
    }
    function val(x, y, txt) {
        return '<text x="' + x + '" y="' + y + '" font-size="9" font-family="ui-monospace,monospace" fill="var(--text)">' + esc(txt) + "</text>";
    }
    function btn(x, y, w, txt, hl) {
        return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="20" rx="10" ' +
            'fill="' + (hl ? "url(#tgGrad)" : "var(--surface2)") + '" stroke="' + (hl ? "none" : "var(--border2)") + '"/>' +
            '<text x="' + (x + w / 2) + '" y="' + (y + 13.5) + '" font-size="9" text-anchor="middle" ' +
            'font-family="system-ui,sans-serif" fill="' + (hl ? "#fff" : "var(--dim)") + '">' + esc(txt) + "</text>";
    }

    function svgOpen() {
        return svgWrap(
            box(10, 10, 300, 34) + label(20, 24, "Multisig Address") + val(20, 37, "EQBD…AdcNHP") +
            box(10, 52, 300, 24) + label(20, 67, "TON Balance:  0.39") +
            btn(100, 86, 120, "Create new order", true), 118);
    }
    function svgType() {
        /* Подсвечены оба нужных пункта: какой из них — зависит от того,
           что переводится. Остальные к выплатам не относятся. */
        var rows = ["Transfer TON", "Transfer Jetton", "Mint Jetton", "Change Jetton Admin"];
        var s = box(10, 8, 300, 18) + label(20, 20, "Order Type");
        for (var i = 0; i < rows.length; i++) {
            var y = 32 + i * 22, hl = (i < 2);
            s += box(10, y, 300, 18, hl) +
                '<text x="20" y="' + (y + 12.5) + '" font-size="9" font-family="ui-monospace,monospace" fill="' +
                (hl ? "var(--text)" : "var(--dim2)") + '">' + esc(rows[i]) + "</text>";
        }
        return svgWrap(s, 126);
    }
    function svgUnits() {
        /* Наглядно: сколько нулей добавляет точность токена */
        return svgWrap(
            label(14, 18, "10 DUREV") +
            '<text x="14" y="40" font-size="11" font-family="ui-monospace,monospace" fill="var(--dim2)">10</text>' +
            '<text x="40" y="40" font-size="11" font-family="ui-monospace,monospace" fill="var(--dim2)">×</text>' +
            '<text x="58" y="40" font-size="11" font-family="ui-monospace,monospace" fill="var(--dim2)">10^9</text>' +
            box(10, 50, 300, 26, true) +
            '<text x="20" y="67" font-size="12" font-family="ui-monospace,monospace" fill="var(--text)">10000000000</text>' +
            label(14, 92, "Jetton Amount (in units)", true), 100);
    }
    function svgFields(jet) {
        var s = "";
        var f = jet
            ? [["Jetton Minter Address", "EQB02DJ0…"], ["Jetton Amount (in units)", "10000000000"], ["To Address", "UQAv…CjCW"]]
            : [["TON Amount", "1"], ["Destination Address", "UQAv…CjCW"]];
        for (var i = 0; i < f.length; i++) {
            var y = 8 + i * 40;
            s += label(14, y + 9, f[i][0]) + box(10, y + 14, 300, 22, true) + val(20, y + 29, f[i][1]);
        }
        s += btn(120, 8 + f.length * 40 + 4, 80, "Create", true);
        return svgWrap(s, 8 + f.length * 40 + 34);
    }
    function svgSign(n, total) {
        var s = box(10, 8, 300, 20) + label(20, 21, "Approvals:  " + n + " / " + total);
        for (var i = 0; i < total; i++) {
            var y = 34 + i * 24, ok = i < n;
            s += box(10, y, 300, 20, !ok && i === n) +
                '<circle cx="24" cy="' + (y + 10) + '" r="5" fill="' + (ok ? "var(--ok)" : "none") +
                '" stroke="' + (ok ? "none" : "var(--dim2)") + '" stroke-width="1.2"/>' +
                label(38, y + 13.5, "signer #" + (i + 1) + (ok ? "  ✓" : "  …"));
        }
        return svgWrap(s, 34 + total * 24 + 8);
    }
    function svgExec() {
        return svgWrap(
            box(10, 8, 300, 22) + label(20, 22, "Executed:") +
            '<text x="82" y="22" font-size="9" font-family="ui-monospace,monospace" fill="var(--ok)">Yes — Tx Link</text>' +
            box(10, 36, 300, 22) + label(20, 50, "Approvals:  2 / 2") +
            '<g><circle cx="160" cy="80" r="13" fill="none" stroke="var(--ok)" stroke-width="2"/>' +
            '<path d="M154 80l4.5 4.5L167 76" fill="none" stroke="var(--ok)" stroke-width="2" stroke-linecap="round">' +
            '<animate attributeName="stroke-dasharray" values="0 30;30 30" dur=".6s" fill="freeze"/></path></g>', 102);
    }
    function svgVerify() {
        return svgWrap(
            box(10, 8, 300, 26) + label(20, 24, "Требуется подпись → исполнено") +
            btn(90, 42, 140, "Проверить перевод", true) +
            label(56, 82, "исполнено · подтверждено в блокчейне"), 96);
    }

    /* ── Шаги ── */
    /* Один поток для обоих случаев. Отдельные вкладки «TON» и «токен»
       заставляли выбирать до того, как человек понял разницу, — а разница
       ровно в двух шагах, и её проще показать рядом. */
    function steps() {
        var s = t9().steps;
        return [
            { t: s.open[0], d: s.open[1], img: svgOpen() },
            { t: s.type[0], d: s.type[1], img: svgType() },
            { t: s.fieldsTon[0], d: s.fieldsTon[1], img: svgFields(false) },
            { t: s.fieldsJet[0], d: s.fieldsJet[1], img: svgFields(true) },
            { t: s.units[0], d: s.units[1], img: svgUnits() },
            { t: s.first[0], d: s.first[1], img: svgSign(1, 2) },
            { t: s.second[0], d: s.second[1], img: svgSign(2, 2) },
            { t: s.exec[0], d: s.exec[1], img: svgExec() },
            { t: s.verify[0], d: s.verify[1], img: svgVerify() }
        ];
    }

    var st = { i: 0 };

    function paint() {
        var wrap = document.getElementById("tgStage");
        if (!wrap) return;
        var g = t9(), list = steps();
        if (st.i >= list.length) st.i = list.length - 1;
        var s = list[st.i];

        var dots = "";
        for (var k = 0; k < list.length; k++) {
            dots += '<i data-k="' + k + '" style="width:' + (k === st.i ? 18 : 6) + 'px;height:6px;border-radius:3px;cursor:pointer;' +
                'background:' + (k <= st.i ? "var(--accent)" : "var(--border2)") + ';transition:width .2s,background .2s"></i>';
        }

        wrap.innerHTML =
            '<div style="display:flex;gap:5px;align-items:center;margin-bottom:10px">' + dots +
            '<span style="margin-left:auto;font-size:12.5px;color:var(--dim2)">' + (st.i + 1) + " " + esc(g.of) + " " + list.length + "</span></div>" +
            '<div id="tgCard" style="opacity:0;transform:translateY(6px);transition:opacity .22s,transform .22s;max-width:900px;margin:0 auto">' +
              '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:18px;max-width:900px;margin:0 auto">' + s.img + "</div>" +
              '<div style="font-size:18px;font-weight:700;color:var(--text);margin:18px 0 7px;max-width:760px">' + esc(s.t) + "</div>" +
              '<div style="font-size:15.5px;color:var(--dim);line-height:1.7;max-width:760px">' + esc(s.d) + "</div>" +
            "</div>" +
            '<div style="display:flex;gap:8px;margin-top:16px;max-width:900px;margin-left:auto;margin-right:auto">' +
              '<button id="tgPrev" class="btn" style="flex:1"' + (st.i === 0 ? " disabled" : "") + ">" + esc(g.back) + "</button>" +
              '<button id="tgNext" class="btn btn-main" style="flex:1">' + esc(st.i === list.length - 1 ? g.done : g.next) + "</button>" +
            "</div>" +
            '<div style="font-size:13px;color:var(--dim2);line-height:1.65;margin-top:14px">' + esc(g.gas) + "</div>" +
            '<div style="font-size:13px;color:var(--dim2);line-height:1.65;margin-top:8px">' + esc(g.forever) + "</div>";

        requestAnimationFrame(function () {
            var c = document.getElementById("tgCard");
            if (c) { c.style.opacity = "1"; c.style.transform = "none"; }
        });

        wrap.querySelectorAll("i[data-k]").forEach(function (d) {
            d.onclick = function () { st.i = parseInt(d.getAttribute("data-k"), 10); paint(); };
        });
        var pv = document.getElementById("tgPrev"), nx = document.getElementById("tgNext");
        if (pv) pv.onclick = function () { if (st.i > 0) { st.i--; paint(); } };
        if (nx) nx.onclick = function () {
            if (st.i < list.length - 1) { st.i++; paint(); }
            else { var b = document.getElementById("tgBody"); if (b) document.getElementById("tgToggle").click(); }
        };
    }

    window.tonixRenderTreasuryGuide = function () {
        var anchor = document.getElementById("treasuryOnchain");
        if (!anchor) return;
        var el = document.getElementById("treasuryGuide");
        if (!el) {
            el = document.createElement("div");
            el.id = "treasuryGuide";
            el.style.cssText = "margin-top:12px";
            anchor.parentNode.insertBefore(el, anchor.nextSibling);
        }
        var g = t9();
        el.innerHTML =
            '<div id="tgToggle" style="display:flex;align-items:center;gap:10px;cursor:pointer;' +
            'padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface2)">' +
              '<svg style="width:16px;height:16px;fill:none;stroke:var(--accent);stroke-width:1.9;flex-shrink:0" viewBox="0 0 24 24">' +
              '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1" stroke-linecap="round"/></svg>' +
              '<div style="flex:1;min-width:0">' +
                '<div style="font-size:13.5px;font-weight:600;color:var(--text)">' + esc(g.head) + "</div>" +
                '<div id="tgSub" style="font-size:11.5px;color:var(--dim)">' + esc(g.sub) + "</div></div>" +
              '<svg id="tgArrow" style="width:16px;height:16px;fill:none;stroke:var(--dim);stroke-width:2;transition:transform .2s" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>' +
            "</div>" +
            '<div id="tgBody" style="display:none;padding:12px 2px 2px">' +
              '<div style="font-size:13.5px;color:var(--dim);line-height:1.65;margin-bottom:14px">' + esc(g.note) + "</div>" +
              '<div id="tgStage"></div>' +
            "</div>";

        var body = el.querySelector("#tgBody");
        el.querySelector("#tgToggle").onclick = function () {
            var open = (body.style.display === "none");
            body.style.display = open ? "block" : "none";
            var sub = el.querySelector("#tgSub");
            if (sub) sub.textContent = open ? g.close : g.sub;
            var ar = el.querySelector("#tgArrow");
            if (ar) ar.style.transform = open ? "rotate(180deg)" : "none";
            if (open) { st.i = 0; paint(); }
        };

    };

})();
