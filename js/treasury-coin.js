/* ============================================================
   TONIX — treasury-coin.js
   Монета слева от панели баланса казны.

   Что показываем (по приоритету):
     1. Своя картинка DAO (dao_settings.treasury_coin_url) — например,
        3D-рендер токена с прозрачным фоном. Её просто «оживляем».
     2. Иконка главного токена казны (если владелец его выбрал) —
        кладём на лицевую сторону нарисованной CSS-монеты.
     3. Монета TON — по умолчанию, ведь баланс показан в TON.

   Анимация:
     • при открытии вкладки «Казна» монета собирается из частиц
       (canvas, ~1,3 с, один раз) и «защёлкивается»;
     • дальше — только CSS transform/opacity: парение, лёгкий наклон,
       блик и орбиты. Это дёшево для видеокарты, телефоны не греются;
     • если в системе включено «меньше движения» — без частиц и анимаций.

   Это только отображение. На деньги, подписи и TON Connect не влияет.
   ============================================================ */
(function () {
    "use strict";

    var REDUCE = false;
    try { REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

    /* Иконки главных токенов по DAO: { daoKey: {img, sym} } */
    var jettonFace = {};
    var raf = 0;

    /* ---------- стили (один раз) ---------- */
    function injectCss() {
        if (document.getElementById("tcoinCss")) return;
        var css = [
            /* Сетка вкладки: монета слева, панель баланса справа, остальное — на всю ширину */
            /* Третья колонка 1fr — пустое место справа: панель баланса не шире ~520px,
               а блоки ниже (адрес казны, токены) по-прежнему на всю ширину */
            "#d-treasury.on.tcoin-on{display:grid;grid-template-columns:1fr auto minmax(0,520px) 1fr;column-gap:28px;row-gap:16px;align-items:start}",
            "#d-treasury.tcoin-on>*{grid-column:1/-1}",
            "#d-treasury.tcoin-on>.tcoin-stage{grid-column:2;grid-row:1}",
            "#d-treasury.tcoin-on>.treas{grid-column:3;grid-row:1;align-self:center;margin-bottom:0;min-height:var(--tc,156px);display:flex;flex-direction:column;justify-content:center}",
            "#d-treasury.tcoin-on>.treas .v{overflow-wrap:anywhere}",
            ".tcoin-stage{--tc:184px;align-self:center;position:relative;width:var(--tc);height:var(--tc);perspective:700px;pointer-events:none}",
            "@media(max-width:560px){.tcoin-stage,#d-treasury.tcoin-on>.treas{--tc:124px}#d-treasury.on.tcoin-on{column-gap:12px;row-gap:0;grid-template-columns:auto minmax(0,1fr)}#d-treasury.tcoin-on>.tcoin-stage{grid-column:1}#d-treasury.tcoin-on>.treas{grid-column:2;align-self:start;margin-bottom:16px}#d-treasury.tcoin-on>.treas{padding:16px 14px}#d-treasury.tcoin-on>.treas .v{font-size:clamp(24px,8vw,40px);line-height:1.15}}",
            /* свечение под монетой */
            ".tc-glow{position:absolute;inset:-18%;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--accent) 45%,transparent),transparent 72%);opacity:.0;transition:opacity .6s}",
            ".tcoin-stage.tc-in .tc-glow{opacity:.85}",
            /* орбиты — эллипсы, вращаются через transform */
            ".tc-orb{position:absolute;inset:-6%;border-radius:50%;border:1px solid color-mix(in srgb,var(--accent2) 40%,transparent);transform:rotateX(74deg) rotateZ(0deg);animation:tcOrb 14s linear infinite;opacity:0;transition:opacity .8s .2s}",
            ".tc-orb.b{inset:-14%;border-color:color-mix(in srgb,var(--accent) 28%,transparent);animation-duration:22s;animation-direction:reverse}",
            ".tc-orb::before{content:'';position:absolute;top:-3px;left:50%;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:#fff;box-shadow:0 0 10px var(--accent2),0 0 18px var(--accent)}",
            ".tcoin-stage.tc-in .tc-orb{opacity:1}",
            "@keyframes tcOrb{to{transform:rotateX(74deg) rotateZ(360deg)}}",
            /* сама монета */
            ".tc-coin{position:absolute;inset:9%;transform-style:preserve-3d;opacity:0;transform:scale(.8);transition:opacity .35s ease,transform .6s cubic-bezier(.16,1.25,.3,1)}",
            ".tcoin-stage.tc-in .tc-coin{opacity:1;transform:scale(1)}",
            ".tc-float{position:absolute;inset:0;transform-style:preserve-3d;animation:tcFloat 6s ease-in-out infinite}",
            ".tc-tilt{position:absolute;inset:0;transform-style:preserve-3d;animation:tcTilt 9s ease-in-out infinite}",
            "@keyframes tcFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6%)}}",
            "@keyframes tcTilt{0%,100%{transform:rotateY(-18deg) rotateX(6deg)}50%{transform:rotateY(18deg) rotateX(-4deg)}}",
            /* готовый 3D-рендер уже наклонён — качаем мягче, чтобы не сплющить */
            ".tcoin-stage.tc-custom .tc-tilt{animation-name:tcTilt2}",
            "@keyframes tcTilt2{0%,100%{transform:rotateY(-9deg) rotateZ(-2deg)}50%{transform:rotateY(9deg) rotateZ(2deg)}}",
            /* нарисованная монета: ребро, обод, лицо, блик */
            ".tc-edge{position:absolute;inset:0;border-radius:50%;transform:translateZ(-7px);background:conic-gradient(from 210deg,#0b1220,#3d4a63 14%,#0e1626 30%,#56627a 48%,#0b1220 64%,#46536c 80%,#0b1220);box-shadow:0 14px 30px rgba(0,0,0,.55)}",
            ".tc-rim{position:absolute;inset:0;border-radius:50%;background:radial-gradient(70% 70% at 28% 22%,color-mix(in srgb,var(--accent2) 45%,transparent),transparent 60%),conic-gradient(from 0deg,#7d8aa3,#eef4ff 8%,#3a455c 18%,#d5deee 30%,#2b3448 42%,#f5f9ff 56%,#46526b 68%,#dfe7f4 80%,#323c52 90%,#7d8aa3);background-blend-mode:screen,normal;box-shadow:0 0 0 1px rgba(255,255,255,.18),0 0 26px color-mix(in srgb,var(--accent) 45%,transparent)}",
            ".tc-rim::after{content:'';position:absolute;inset:0;border-radius:50%;background:repeating-conic-gradient(rgba(255,255,255,.28) 0 .5deg,transparent .5deg 1.6deg);-webkit-mask:radial-gradient(closest-side,transparent 86%,#000 88%);mask:radial-gradient(closest-side,transparent 86%,#000 88%);opacity:.6}",
            ".tc-face{position:absolute;inset:11%;border-radius:50%;overflow:hidden;background:#0098EA center/cover no-repeat;box-shadow:inset 0 3px 12px rgba(0,0,0,.55),inset 0 -2px 8px rgba(255,255,255,.18)}",
            ".tc-face svg{position:absolute;left:50%;top:52%;width:58%;transform:translate(-50%,-50%);filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))}",
            ".tc-shine{position:absolute;inset:0;border-radius:50%;overflow:hidden}",
            ".tc-shine::after{content:'';position:absolute;top:-20%;bottom:-20%;left:-60%;width:38%;transform:skewX(-18deg) translateX(0);background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);animation:tcShine 5.5s ease-in-out infinite}",
            "@keyframes tcShine{0%,62%{transform:skewX(-18deg) translateX(0)}100%{transform:skewX(-18deg) translateX(560%)}}",
            /* своя картинка DAO вместо нарисованной монеты */
            ".tc-img{position:absolute;inset:-6%;width:112%;height:112%;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(0,0,0,.5)) drop-shadow(0 0 16px color-mix(in srgb,var(--accent) 50%,transparent))}",
            ".tcoin-stage.tc-custom .tc-edge,.tcoin-stage.tc-custom .tc-rim,.tcoin-stage.tc-custom .tc-face,.tcoin-stage.tc-custom .tc-shine{display:none}",
            ".tcoin-stage:not(.tc-custom) .tc-img{display:none}",
            /* частицы рисуются на холсте больше монеты, чтобы прилетали издалека */
            ".tc-parts{position:absolute;left:-40%;top:-40%;width:180%;height:180%;transition:opacity .4s}",
            "@media(prefers-reduced-motion:reduce){.tc-float,.tc-tilt,.tc-orb,.tc-shine::after{animation:none!important}}"
        ].join("\n");
        var st = document.createElement("style");
        st.id = "tcoinCss";
        st.textContent = css;
        document.head.appendChild(st);
    }

    /* Ромб TON — белым по синему */
    var TON_SVG = '<svg viewBox="0 0 56 56" fill="none"><path d="M37.6 15.6H18.4c-3.5 0-5.7 3.8-4 6.9l11.9 20.6c.8 1.3 2.6 1.3 3.4 0l11.9-20.6c1.8-3-.5-6.9-4-6.9Zm-11.4 21.3-2.6-5-6.2-11.2c-.4-.7.1-1.6 1-1.6h7.8v17.8Zm12.4-16.2-6.2 11.2-2.6 5V19.1h7.8c.9 0 1.4.9 1 1.6Z" fill="#fff"/></svg>';

    /* Ключ открытого DAO: window._tonixDaoKey ставит openDao, curKey — запасной */
    function daoKey() {
        return window._tonixDaoKey || window.curKey || "";
    }
    function safeUrl(u) {
        u = String(u || "");
        if (!/^https?:\/\//i.test(u) && !/^data:image\//i.test(u)) return "";
        return u.replace(/["'()\\\s]/g, function (c) { return encodeURIComponent(c); });
    }

    /* ---------- разметка: создаём один раз ---------- */
    function stage() {
        var page = document.getElementById("d-treasury");
        if (!page) return null;
        var st = page.querySelector(".tcoin-stage");
        if (st) return st;
        injectCss();
        st = document.createElement("div");
        st.className = "tcoin-stage";
        st.setAttribute("aria-hidden", "true");
        st.innerHTML =
            '<div class="tc-glow"></div>' +
            '<div class="tc-orb"></div><div class="tc-orb b"></div>' +
            '<div class="tc-coin"><div class="tc-float"><div class="tc-tilt">' +
                '<div class="tc-edge"></div><div class="tc-rim"></div>' +
                '<div class="tc-face"></div><div class="tc-shine"></div>' +
                '<img class="tc-img" alt="" decoding="async">' +
            "</div></div></div>" +
            '<canvas class="tc-parts"></canvas>';
        page.insertBefore(st, page.firstChild);
        page.classList.add("tcoin-on");
        return st;
    }

    /* ---------- лицо монеты под текущее DAO ---------- */
    function refresh() {
        var st = stage();
        if (!st) return;
        var key = daoKey();
        var look = ((window._tonixDaoLook || {})[key]) || {};
        var custom = safeUrl(look.treasury_coin_url);
        var img = st.querySelector(".tc-img");
        var face = st.querySelector(".tc-face");
        if (custom) {
            st.classList.add("tc-custom");
            if (img.getAttribute("src") !== custom) img.setAttribute("src", custom);
            return;
        }
        st.classList.remove("tc-custom");
        img.removeAttribute("src");
        var jf = jettonFace[key];
        var ji = jf ? safeUrl(jf.img) : "";
        if (ji) {
            face.innerHTML = "";
            face.style.backgroundImage = 'url("' + ji + '")';
            face.style.backgroundColor = "#0b1220";
        } else {
            face.style.backgroundImage = "";
            face.style.backgroundColor = "";
            face.innerHTML = TON_SVG;
        }
    }

    /* ---------- сборка из частиц ---------- */
    function play() {
        var st = stage();
        if (!st) return;
        refresh();
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        var cv = st.querySelector(".tc-parts");
        st.classList.remove("tc-in");
        if (REDUCE || !cv.getContext) { st.classList.add("tc-in"); cv.style.opacity = "0"; return; }

        var ctx = cv.getContext("2d");
        var size = st.clientWidth || 156;
        if (!size) { st.classList.add("tc-in"); return; }
        var W = size * 1.8, H = W;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cv.style.opacity = "1";

        var cs = getComputedStyle(st);
        var c1 = (cs.getPropertyValue("--accent") || "#2d83ec").trim() || "#2d83ec";
        var c2 = (cs.getPropertyValue("--accent2") || "#1ac9ff").trim() || "#1ac9ff";
        var cols = [c1, c2, "#ffffff", c2];

        /* Меньше частиц на маленьких экранах — анимация та же, нагрузка ниже */
        var N = size < 130 ? 140 : 200;
        var cx = W / 2, cy = H / 2, R = size * 0.41;
        var P = [];
        for (var i = 0; i < N; i++) {
            var a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * R;
            var a0 = Math.random() * 6.2832, r0 = W * (0.45 + Math.random() * 0.5);
            P.push({
                sx: cx + Math.cos(a0) * r0, sy: cy + Math.sin(a0) * r0,
                tx: cx + Math.cos(a) * r, ty: cy + Math.sin(a) * r,
                s: 0.8 + Math.random() * 1.7, c: cols[i % cols.length],
                d: Math.random() * 260
            });
        }
        var T = 820, t0 = performance.now(), shown = false;
        function ease(t) { return 1 - Math.pow(1 - t, 3); }
        function frame(now) {
            var el = now - t0;
            ctx.clearRect(0, 0, W, H);
            var done = true;
            for (var i = 0; i < N; i++) {
                var p = P[i];
                var k = Math.max(0, Math.min(1, (el - p.d) / T));
                if (k < 1) done = false;
                var e = ease(k);
                var x = p.sx + (p.tx - p.sx) * e, y = p.sy + (p.ty - p.sy) * e;
                ctx.globalAlpha = 0.25 + 0.75 * k;
                ctx.fillStyle = p.c;
                ctx.beginPath(); ctx.arc(x, y, p.s * (1.4 - 0.5 * k), 0, 6.2832); ctx.fill();
            }
            ctx.globalAlpha = 1;
            if (done && !shown) {
                shown = true;
                st.classList.add("tc-in");   /* монета «защёлкивается» */
                cv.style.opacity = "0";      /* частицы растворяются */
                setTimeout(function () { ctx.clearRect(0, 0, W, H); }, 450);
                raf = 0;
                return;                      /* холст больше не рисуем */
            }
            raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);
    }

    /* ---------- настройки: своя картинка монеты ---------- */
    async function loadCoin(e) {
        var f = e && e.target && e.target.files && e.target.files[0];
        if (!f) return;
        try { e.target.value = ""; } catch (x) {}
        if (f.size > 2 * 1024 * 1024) { alert((typeof curLang !== "undefined" && curLang !== "ru") ? "Image is too large (max 2 MB)" : "Картинка слишком большая (до 2 МБ)"); return; }
        var key = daoKey();
        var look = ((window._tonixDaoLook || {})[key]) || {};
        var old = look.treasury_coin_url || null;
        /* сразу показываем */
        var rd = new FileReader();
        rd.onload = function (ev) {
            window._tonixDaoLook = window._tonixDaoLook || {};
            window._tonixDaoLook[key] = window._tonixDaoLook[key] || {};
            window._tonixDaoLook[key].treasury_coin_url = ev.target.result;
            play();
        };
        rd.readAsDataURL(f);
        try {
            if (typeof currentUID === "undefined" || !currentUID) { alert(T("g_connect_first")); return; }
            var ext = (f.type === "image/webp") ? "webp" : "png";
            var path = currentUID + "/dao_" + key + "_coin_" + Date.now() + "." + ext;
            var up = await sb.storage.from("dao-media").upload(path, f, { upsert: true, contentType: f.type || "image/png" });
            if (up.error) { alert(T("g_bg_fail") + up.error.message); return; }
            var url = sb.storage.from("dao-media").getPublicUrl(path).data.publicUrl;
            var ok = await tonixSaveDaoSettings({ treasury_coin_url: url });
            if (!ok) return;
            window._tonixDaoLook[key].treasury_coin_url = url;
            refresh();
            if (old && old !== url && /^https?:/i.test(old) && typeof tonixDropOld === "function") tonixDropOld("dao-media", old);
        } catch (x) { alert(T("g_bg_err") + (x && x.message || "")); }
    }
    function clearCoin() {
        var key = daoKey();
        var look = ((window._tonixDaoLook || {})[key]) || {};
        var old = look.treasury_coin_url || null;
        if (window._tonixDaoLook && window._tonixDaoLook[key]) window._tonixDaoLook[key].treasury_coin_url = null;
        refresh();
        try { tonixSaveDaoSettings({ treasury_coin_url: null }); } catch (e) {}
        if (old && /^https?:/i.test(old) && typeof tonixDropOld === "function") tonixDropOld("dao-media", old);
    }

    /* ---------- наружу ---------- */
    window.tonixTreasuryCoinPlay = play;
    window.tonixTreasuryCoinRefresh = refresh;
    window.tonixTreasuryCoinSetJetton = function (key, img, sym) {
        jettonFace[key] = { img: img || "", sym: sym || "" };
        if (key === daoKey()) refresh();
    };
    window.tonixLoadTreasuryCoin = loadCoin;
    window.tonixClearTreasuryCoin = clearCoin;

    /* Монета на месте сразу, даже до первого открытия вкладки */
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { stage(); refresh(); });
    else { stage(); refresh(); }
})();
