/* =====================================================
   TONIX — jetpunk-check
   Проверка для заданий бота JetPunk по JETTON DAO.

   Бот присылает Telegram id человека, который нажал «Проверить».
   Отвечаем только двумя фактами, без лишних данных:
     joined — реально вступил в JETTON DAO (не просто открыл ссылку)
     voted  — хотя бы один раз голосовал в этом DAO
   Награды одноразовые, поэтому достаточно «да/нет»: факт не исчезает.

   Человек находится только если открывал Tonix внутри Telegram —
   тогда аккаунт связан с Telegram id. Иначе linked:false,
   и оба ответа «нет»: награждать нельзя.

   Вызов (GET или POST):
     https://uiguvfkpbbyvbrabjvso.supabase.co/functions/v1/jetpunk-check?tg_id=123456789
   Заголовок apikey — публичный ключ сайта (anon).

   Деплой:
     Supabase → Edge Functions → Deploy new function
       имя: jetpunk-check
     Вставить этот файл → Deploy
     Verify JWT: ВЫКЛЮЧИТЬ (бота пускает не сессия пользователя)
   ===================================================== */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") {
    return reply({ ok: false, error: "method" }, 405);
  }

  const url = new URL(req.url);
  let tg = url.searchParams.get("tg_id") || "";
  if (!tg && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    tg = String(body?.tg_id ?? body?.telegram_id ?? body?.user_id ?? "");
  }
  tg = tg.trim();
  if (!/^\d{5,20}$/.test(tg)) return reply({ ok: false, error: "tg_id" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  /* Связка Telegram → аккаунт Tonix. Колонка id бывает числом или текстом. */
  let link = await admin.from("user_telegram")
    .select("user_uid,tg_id").eq("tg_id", tg).limit(1);
  if (link.error || !link.data?.length) {
    link = await admin.from("user_telegram")
      .select("user_uid,tg_id").eq("tg_id", Number(tg)).limit(1);
  }
  const uid = link.data?.[0]?.user_uid ?? null;
  if (!uid) return reply({ ok: true, linked: false, joined: false, voted: false });

  /* Живой JETTON DAO: сначала известный адрес, потом короткое имя, потом название. */
  const slugs = ["jetton-dao-wv3y", "jetton-dao"];
  let dao: { slug: string; chat_id: string } | null = null;
  for (const slug of slugs) {
    const { data } = await admin.from("daos")
      .select("slug,chat_id,name").eq("slug", slug).limit(1).maybeSingle();
    if (data?.chat_id && !/demo/i.test(String(data.name || "")) && !/demo/i.test(slug)) {
      dao = data;
      break;
    }
  }
  if (!dao) {
    const { data } = await admin.from("daos").select("slug,chat_id,name").ilike("name", "JETTON DAO");
    dao = (data || []).find((d) => d.chat_id && !/demo/i.test(String(d.slug || "")) && !/demo/i.test(String(d.name || ""))) || null;
  }
  if (!dao) return reply({ ok: false, error: "dao-not-found" }, 404);

  const { data: mem } = await admin.from("user_chats")
    .select("user_id").eq("chat_id", dao.chat_id).eq("user_id", uid).limit(1);
  const joined = !!(mem && mem.length);

  let voted = false;
  if (joined) {
    const { data: props } = await admin.from("dao_proposals")
      .select("id").eq("dao_key", dao.slug);
    const ids = (props || []).map((p) => p.id).filter(Boolean);
    if (ids.length) {
      const { data: votes } = await admin.from("dao_votes")
        .select("id").eq("voter_uid", uid).in("proposal_id", ids).limit(1);
      voted = !!(votes && votes.length);
    }
  }

  return reply({ ok: true, linked: true, joined, voted });
});
