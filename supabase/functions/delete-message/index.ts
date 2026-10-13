/* =====================================================
   TONIX — delete-message
   Удаляет сообщение вместе с его файлом в хранилище.

   Зачем сервер. Раньше браузер удалял только строку в базе, а файл
   оставался в хранилище навсегда. Удалять файл из браузера нельзя:
   путь файла построен от чата и сообщения, без идентификатора автора,
   поэтому по пути невозможно проверить, чей он. Политика в хранилище
   тут не спасает — она видит только имя объекта.

   Поэтому авторство проверяет сервер по базе, а файлы удаляет
   служебным ключом. Порядок важен: сначала убеждаемся в праве,
   потом убираем файлы, и только затем строку. Если файл почему-то
   не удалился, строку всё равно удаляем — оставить человеку висящее
   сообщение хуже, чем оставить лишний файл.

   Деплой:
     Supabase → Edge Functions → Deploy new function
       имя: delete-message
     Settings → Verify JWT: ВЫКЛЮЧИТЬ (токен проверяем сами)
   ===================================================== */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BUCKET = "chat-media";

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

    /* --- 1. Кто просит --- */
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return reply({ ok: false, error: "no-token" }, 401);
    const { data: ures, error: uerr } = await admin.auth.getUser(jwt);
    const uid = ures?.user?.id;
    if (uerr || !uid) return reply({ ok: false, error: "bad-token" }, 401);

    let msgId = "";
    try {
        const body = await req.json();
        msgId = String(body?.message_id || "").trim();
    } catch { /* пустое тело */ }
    if (!msgId) return reply({ ok: false, error: "no-message" }, 400);

    /* --- 2. Право на удаление. Своё сообщение может убрать автор.
             Владелец DAO убирает любое сообщение в чате. Админ DAO
             убирает сообщения обычных участников, но не владельца и
             не других админов — та же иерархия, что при удалении
             участников. Роли берём из базы (tonix_dao_role). --- */
    const { data: msg } = await admin.from("messages")
        .select("id,chat_id,sender_uid")
        .eq("id", msgId).limit(1).maybeSingle();
    if (!msg) return reply({ ok: false, error: "no-such-message" }, 404);

    let allowed = (msg.sender_uid === uid);
    if (!allowed) {
        const { data: dao } = await admin.from("daos")
            .select("slug,owner_uid").eq("chat_id", msg.chat_id).limit(1).maybeSingle();
        if (dao && dao.owner_uid === uid) {
            allowed = true;
        } else if (dao?.slug) {
            const { data: myRole } = await admin
                .rpc("tonix_dao_role", { p_dao: dao.slug, p_uid: uid });
            if (myRole === "admin") {
                const { data: senderRole } = await admin
                    .rpc("tonix_dao_role", { p_dao: dao.slug, p_uid: msg.sender_uid });
                allowed = senderRole !== "owner" && senderRole !== "admin";
            }
        }
    }
    if (!allowed) return reply({ ok: false, error: "not-allowed" }, 403);

    /* --- 3. Файлы. Путь детерминированный, поэтому его не нужно
             хранить: он собирается из чата и сообщения. Пробуем оба
             варианта — вложение и голосовое; лишний промах безвреден. --- */
    const paths = [
        "chat_media/" + msg.chat_id + "/" + msg.id,
        "chat_audio/" + msg.chat_id + "/" + msg.id,
    ];
    let filesRemoved = 0;
    try {
        const { data: rm } = await admin.storage.from(BUCKET).remove(paths);
        filesRemoved = Array.isArray(rm) ? rm.length : 0;
    } catch (e) {
        /* Не роняем удаление из-за файла: висящее сообщение хуже,
           чем лишний объект в хранилище. */
        console.warn("[delete-message] storage:", (e as Error).message);
    }

    /* --- 4. Строка --- */
    const { error: derr } = await admin.from("messages").delete().eq("id", msgId);
    if (derr) return reply({ ok: false, error: "delete-failed", detail: derr.message }, 500);

    console.log("[delete-message]", msgId, "файлов удалено:", filesRemoved);
    return reply({ ok: true, files: filesRemoved });
});
