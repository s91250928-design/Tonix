/* =====================================================
   TONIX — daos-loader.js
   Делает базу источником правды для DAO.
   Читает одобренные DAO из таблицы `daos` и:
     • подставляет их в DAOS / daoTreasury / daoChats,
       чтобы весь остальной код работал без изменений;
     • дорисовывает карточки тех DAO, которых ещё нет в каталоге.
   Уже существующие в HTML карточки (демо и т.п.) НЕ трогаются.
   ТОЛЬКО ЧТЕНИЕ базы. Любая ошибка логируется и не ломает сайт.
   ===================================================== */

(function () {

    function esc(s) {
        s = (s == null ? "" : String(s));
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function ru() { return !(typeof curLang !== "undefined" && curLang !== "ru"); }

    /* Уже есть карточка этого DAO в каталоге? (чтобы не дублировать) */
    /* Карточки опознаются по обработчику клика — единый способ для поиска и проверки */
    function findCard(slug) {
        var grid = document.getElementById("daoGrid");
        if (!grid) return null;
        var cards = grid.querySelectorAll(".dao-card");
        for (var i = 0; i < cards.length; i++) {
            var oc = cards[i].getAttribute("onclick") || "";
            if (oc.indexOf("openDao('" + slug + "')") >= 0) return cards[i];
        }
        return null;
    }

    function cardExists(slug) {
        var grid = document.getElementById("daoGrid");
        if (!grid) return true;
        return !!findCard(slug);
    }

    function verifiedBadge() {
        return ' <span class="verified"><svg class="icon" viewBox="0 0 24 24">' +
               '<path d="M20 6L9 17l-5-5"/></svg><span>' +
               (ru() ? "проверено" : "verified") + "</span></span>";
    }
    function unverifiedBadge() {
        return ' <span style="color:#e0a458;font-size:11px;font-weight:600;white-space:nowrap">\u26a0 ' +
               (ru() ? "не проверено" : "not verified") + "</span>";
    }

    /* Собираем карточку каталога из строки базы */
    function buildCard(row, isOwner) {
        var slug = row.slug;
        var name = esc(row.name || slug);
        var handle = esc(row.handle || "");
        var logo = esc(row.logo || (row.name ? row.name.slice(0, 2).toUpperCase() : "DA"));
        var grad = esc(row.grad || "#2d83ec,#1ac9ff");
        /* Аватар DAO: в ленте сообщества должны отличаться друг от друга */
        var ava = row.avatar_url ? esc(row.avatar_url) : "";
        var logoHtml = ava
            ? '<div class="dc-logo" style="background-image:url(\'' + ava + '\');background-size:cover;background-position:center"></div>'
            : '<div class="dc-logo" style="background:linear-gradient(135deg,' + grad + ')">' + logo + '</div>';
        var desc = esc((!ru() && row.description_en) ? row.description_en : (row.description || ""));

        var el = document.createElement("div");
        el.className = "dao-card";
        el.setAttribute("data-cat", "token" + (isOwner ? " my" : ""));
        el.setAttribute("data-name", (row.name || slug).toLowerCase());
        el.setAttribute("onclick", "openDao('" + slug + "')");
        el.innerHTML =
            '<div class="dc-top">' + logoHtml + 
            '<div><div class="dc-name">' + name + (row.verified ? verifiedBadge() : unverifiedBadge()) + "</div>" +
            '<div class="dc-handle">' + handle + "</div></div></div>" +
            '<div class="dc-desc">' + desc + "</div>" +
            '<div class="dc-foot"><span class="dc-net"><span class="nd"></span>TON</span>' +
            '<span class="dc-stat"><span>' + (ru() ? "Казна" : "Treasury") + "</span> <b>—</b></span></div>";
        return el;
    }

    /* Применяем одну строку базы: данные + карта казны/чата + карточка */
    function applyRow(row) {
        var slug = row.slug;
        if (!slug || typeof DAOS === "undefined") return;

        var uid = (typeof currentUID !== "undefined") ? currentUID : null;
        var isOwner = !!(uid && row.owner_uid && row.owner_uid === uid);

        /* Красивые поля из хардкода сохраняем (tags, members и т.п.), если были */
        var ex = DAOS[slug] || {};
        DAOS[slug] = {
            name: row.name || ex.name || slug,
            handle: row.handle || ex.handle || "",
            logo: row.logo || ex.logo || (row.name ? row.name.slice(0, 2).toUpperCase() : "DA"),
            grad: row.grad || ex.grad || "#2d83ec,#1ac9ff",
            avatarUrl: row.avatar_url || ex.avatarUrl || null,
            members: (ex.members != null ? ex.members : 0),
            treasury: ex.treasury || "—",
            treasuryFull: ex.treasuryFull || "",
            trust: (ex.trust != null ? ex.trust : 0),
            verified: !!row.verified,
            owner: isOwner,
            desc: ex.desc || row.description || "",
            descEn: ex.descEn || row.description_en || "",
            tags: ex.tags || ["TON"],
            tagsEn: ex.tagsEn || ["TON"]
        };

        /* Функциональная маршрутизация — всегда из базы */
        if (typeof TONIX_CONFIG !== "undefined") {
            if (row.treasury_address) TONIX_CONFIG.daoTreasury[slug] = { address: row.treasury_address, testnet: !!row.testnet };
            if (row.chat_id) TONIX_CONFIG.daoChats[slug] = row.chat_id;
        }

        /* Рисуем карточку только если её ещё нет (хардкод/демо не трогаем) */
        if (!cardExists(slug)) {
            var grid = document.getElementById("daoGrid");
            if (grid) grid.insertBefore(buildCard(row, isOwner), grid.firstChild);
        } else if (row.avatar_url) {
            /* Карточка уже нарисована — обновляем логотип на месте.
               Иначе аватар, загруженный позже, никогда бы не появился в каталоге. */
            try {
                var card = findCard(slug);
                var lg = card ? card.querySelector(".dc-logo") : null;
                if (lg) {
                    lg.textContent = "";
                    lg.style.backgroundImage = 'url("' + row.avatar_url + '")';
                    lg.style.backgroundSize = "cover";
                    lg.style.backgroundPosition = "center";
                }
            } catch (e) { }
        }
    }

    window.tonixLoadDaos = function () {
        if (typeof sb === "undefined" || !sb) { console.warn("[daos] база не готова"); return; }
        sb.from("daos").select("*").eq("status", "approved")
            .then(function (res) {
                if (res.error) { console.warn("[daos] ошибка чтения:", res.error.message); return; }
                var rows = res.data || [];
                console.log("[daos] загружено из базы:", rows.length);
                /* Аватары лежат в настройках DAO — подтягиваем одним запросом на весь каталог */
                sb.from("dao_settings").select("dao_key,avatar_url")
                    .then(function (st) {
                        var ava = {};
                        (st && st.data ? st.data : []).forEach(function (s) {
                            if (s.avatar_url) ava[s.dao_key] = s.avatar_url;
                        });
                        for (var i = 0; i < rows.length; i++) {
                            if (ava[rows[i].slug]) rows[i].avatar_url = ava[rows[i].slug];
                            applyRow(rows[i]);
                        }
                        if (typeof filterDaos === "function" && document.getElementById("daoGrid")) filterDaos();
                    })
                    .catch(function () {
                        /* Без аватаров каталог всё равно должен открыться */
                        for (var i = 0; i < rows.length; i++) applyRow(rows[i]);
                        if (typeof filterDaos === "function" && document.getElementById("daoGrid")) filterDaos();
                    });
            })
            .catch(function (e) { console.warn("[daos] сбой загрузки:", e && e.message); });
    };

})();
