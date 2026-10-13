/* =====================================================
   TONIX — remove-member
   Удаляет участника из DAO (из чата, а с ним из голосований).

   Право проверяет база: tonix_can_moderate(dao, actor, target) знает
   иерархию — владелец убирает админа и участника, админ только
   участника, себя этой дорогой не убрать. Здесь мы лишь спрашиваем
   разрешение и, если да, выполняем удаление служебным ключом.

   Что удаляется:
   - членство в user_chats (человек выпадает из чата и списка участников);
   - строка админа в dao_admins, если удаляемый был админом (владелец
     разжаловал и удалил разом);
   - активные делегации, где удаляемый — делегатор или делегат: иначе
     повис бы вес от того, кого уже нет.
   Голоса в закрытых предложениях НЕ трогаем — это история.

   Деплой:
     Supabase → Edge Functions → Deploy new function
       имя: remove-member
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

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return reply({ ok: false, error: "method" }, 405);

    const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } },
    );

    /* --- Кто просит --- */
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return reply({ ok: false, error: "no-token" }, 401);
    const { data: ures, error: uerr } = await admin.auth.getUser(jwt);
    const actor = ures?.user?.id;
    if (uerr || !actor) return reply({ ok: false, error: "bad-token" }, 401);

    let daoKey = "", target = "";
    try {
        const b = await req.json();
        daoKey = String(b?.dao_key || "").trim();
        target = String(b?.target_uid || "").trim();
    } catch { /* пустое тело */ }
    if (!daoKey || !target) return reply({ ok: false, error: "bad-input" }, 400);

    /* --- Право. Всю иерархию держит база в одной функции, чтобы правила
             не расходились между разными местами кода. --- */
    const { data: can, error: cerr } = await admin
        .rpc("tonix_can_moderate", { p_dao: daoKey, p_actor: actor, p_target: target });
    if (cerr) return reply({ ok: false, error: "check-failed", detail: cerr.message }, 500);
    if (!can) return reply({ ok: false, error: "not-allowed" }, 403);

    /* --- Нужен chat_id, чтобы убрать членство --- */
    const { data: dao } = await admin.from("daos")
        .select("chat_id").eq("slug", daoKey).limit(1).maybeSingle();
    if (!dao?.chat_id) return reply({ ok: false, error: "no-such-dao" }, 404);

    /* --- Удаляем: членство, админку, делегации удаляемого --- */
    const { error: mErr } = await admin.from("user_chats")
        .delete().eq("chat_id", dao.chat_id).eq("user_id", target);
    if (mErr) return reply({ ok: false, error: "remove-failed", detail: mErr.message }, 500);

    await admin.from("dao_admins")
        .delete().eq("dao_key", daoKey).eq("user_uid", target);

    /* Делегации в обе стороны: где удаляемый отдавал вес и где ему
       отдавали. Оставить их — значит держать вес от/к тому, кого нет. */
    await admin.from("dao_delegations")
        .delete().eq("dao_key", daoKey).eq("delegator_uid", target);
    await admin.from("dao_delegations")
        .delete().eq("dao_key", daoKey).eq("delegate_uid", target);

    console.log("[remove-member]", daoKey, "actor:", actor, "removed:", target);
    return reply({ ok: true });
});
