/* =====================================================
   TONIX — dao-admin.js
   Панель управления DAO. Только для админов
   (UID из TONIX_CONFIG.admins). Показывает все DAO и даёт:
     • поставить/снять галочку «проверено» (verified) —
       защита от самозванцев: у настоящих DAO есть галочка,
       у остальных видно «не проверено»;
     • удалить DAO (зачистка фейков постфактум).
   Права проверяются ещё и в базе (RLS).
   ===================================================== */

(function () {

    function isAdmin() {
        try {
            return !!(typeof currentUID !== "undefined" && currentUID &&
                      TONIX_CONFIG.admins.indexOf(currentUID) >= 0);
        } catch (e) { return false; }
    }

    function esc(s) {
        s = (s == null ? "" : String(s));
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function shortAddr(a){ a=String(a||""); return a.length>14?(a.slice(0,6)+"\u2026"+a.slice(-4)):(a||"\u2014"); }

    var btn, overlay;

    function ensureButton() {
        if (btn) return;
        btn = document.createElement("div");
        btn.id = "daoModBtn";
        btn.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:9998;" +
            "background:linear-gradient(135deg,#2d83ec,#1ac9ff);color:#fff;padding:12px 16px;" +
            "border-radius:12px;font-weight:600;font-size:14px;cursor:pointer;" +
            "box-shadow:0 6px 20px rgba(0,0,0,.35)";
        btn.textContent = "Управление DAO";
        btn.onclick = openPanel;
        document.body.appendChild(btn);
    }
    function setCount(n) { if (btn) btn.textContent = "Управление DAO" + (n ? (" (" + n + ")") : ""); }

    window.__daoModClose = function () { if (overlay) overlay.style.display = "none"; };

    function ensureOverlay() {
        if (overlay) return;
        overlay = document.createElement("div");
        overlay.id = "daoModOverlay";
        overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);" +
            "display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:40px 16px";
        overlay.onclick = function (e) { if (e.target === overlay) window.__daoModClose(); };
        document.body.appendChild(overlay);
    }

    function box(inner) {
        ensureOverlay();
        overlay.innerHTML =
            '<div style="background:#10161F;border:1px solid #24313f;border-radius:16px;max-width:560px;width:100%;padding:22px;color:#e7eef7">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
            '<h2 style="margin:0;font-size:19px">Управление DAO</h2>' +
            '<span style="cursor:pointer;font-size:24px;line-height:1;color:#8aa" onclick="window.__daoModClose()">&times;</span></div>' +
            inner + "</div>";
    }

    function openPanel() { ensureOverlay(); overlay.style.display = "flex"; renderList(); }

    function renderList() {
        if (typeof sb === "undefined" || !sb) { box('<div style="color:#8aa">\u041d\u0435\u0442 \u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u044f \u0441 \u0431\u0430\u0437\u043e\u0439</div>'); return; }
        box('<div style="color:#8aa;padding:20px;text-align:center">\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u044e DAO\u2026</div>');
        sb.from("daos").select("*").order("created_at", { ascending: false })
            .then(function (res) {
                if (res.error) { box('<div style="color:#e88">\u041e\u0448\u0438\u0431\u043a\u0430: ' + esc(res.error.message) + "</div>"); return; }
                var rows = res.data || [];
                setCount(rows.length);
                if (!rows.length) { box('<div style="color:#8aa;padding:20px;text-align:center">\u0412 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0435 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 DAO</div>'); return; }
                var h = "";
                rows.forEach(function (r) {
                    var v = !!r.verified;
                    var badge = v
                        ? '<span style="color:#3ecf8e;font-size:12px;font-weight:600">\u2713 \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u043e</span>'
                        : '<span style="color:#e0a458;font-size:12px;font-weight:600">\u26a0 \u043d\u0435 \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u043e</span>';
                    h += '<div style="border:1px solid #24313f;border-radius:12px;padding:14px;margin-bottom:12px">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
                        '<div style="font-weight:600;font-size:16px">' + esc(r.name) + "</div>" + badge + "</div>" +
                        '<div style="color:#8aa;font-size:12px;margin:4px 0 10px">' +
                        esc(r.description || "\u0431\u0435\u0437 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u044f") + '<br><span style="color:#9bb;font-family:ui-monospace,monospace">\u043a\u0430\u0437\u043d\u0430: ' +
                        shortAddr(r.treasury_address) + (r.testnet ? " \u00b7 testnet" : "") + "</span></div>" +
                        '<div style="display:flex;gap:8px">' +
                        (v
                            ? '<button onclick="window.__daoVerify(\'' + r.id + '\',false)" style="flex:1;background:transparent;color:#e0a458;border:1px solid #5a4a33;border-radius:9px;padding:9px;font-weight:600;cursor:pointer">\u0421\u043d\u044f\u0442\u044c \u0433\u0430\u043b\u043e\u0447\u043a\u0443</button>'
                            : '<button onclick="window.__daoVerify(\'' + r.id + '\',true)" style="flex:1;background:linear-gradient(135deg,#2d83ec,#1ac9ff);color:#fff;border:0;border-radius:9px;padding:9px;font-weight:600;cursor:pointer">\u2713 \u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c</button>'
                        ) +
                        '<button onclick="window.__daoDelete(\'' + r.id + '\')" style="flex:0 0 auto;background:transparent;color:#e88;border:1px solid #533;border-radius:9px;padding:9px 14px;font-weight:600;cursor:pointer">\u0423\u0434\u0430\u043b\u0438\u0442\u044c</button>' +
                        "</div></div>";
                });
                box(h);
            })
            .catch(function (e) { box('<div style="color:#e88">\u0421\u0431\u043e\u0439: ' + esc(e && e.message) + "</div>"); });
    }

    window.__daoVerify = function (id, val) {
        if (typeof sb === "undefined" || !sb) return;
        sb.from("daos").update({ verified: !!val }).eq("id", id)
            .then(function (res) {
                if (res.error) { alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u044c: " + res.error.message); return; }
                if (typeof tonixLoadDaos === "function") tonixLoadDaos();
                renderList();
            });
    };

    window.__daoDelete = function (id) {
        if (typeof sb === "undefined" || !sb) return;
        if (!confirm("\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u043e DAO \u0438\u0437 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0430? \u041a\u043e\u043d\u0442\u0440\u0430\u043a\u0442 \u0432 \u0431\u043b\u043e\u043a\u0447\u0435\u0439\u043d\u0435 \u043e\u0441\u0442\u0430\u0451\u0442\u0441\u044f, \u0443\u0431\u0438\u0440\u0430\u0435\u0442\u0441\u044f \u0442\u043e\u043b\u044c\u043a\u043e \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u043d\u0430 \u043f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u0435.")) return;
        sb.from("daos").delete().eq("id", id)
            .then(function (res) {
                if (res.error) { alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0443\u0434\u0430\u043b\u0438\u0442\u044c: " + res.error.message); return; }
                if (typeof tonixLoadDaos === "function") tonixLoadDaos();
                renderList();
            });
    };

    window.tonixInitDaoAdmin = function () {
        if (!isAdmin()) return;
        ensureButton();
        if (typeof sb !== "undefined" && sb) {
            sb.from("daos").select("id")
                .then(function (res) { if (!res.error) setCount((res.data || []).length); });
        }
    };

})();
