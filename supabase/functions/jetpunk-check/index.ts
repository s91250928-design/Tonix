/* =====================================================
   TONIX — jetpunk-check
   Проверка для заданий бота JetPunk по JETTON DAO.

   Бот присылает Telegram id человека, который нажал «Проверить».
   Отвечаем только двумя фактами, без лишних данных:
     joined — реально вступил в JETTON DAO (не просто открыл ссылку)
     voted  — хотя бы один раз голосовал в этом DAO
              (создать голосование — это не голос)
   Награды одноразовые, поэтому достаточно «да/нет»: факт не исчезает.

   Человек находится только если открывал Tonix внутри Telegram —
   тогда аккаунт связан с Telegram id. Иначе linked:false,
   и оба ответа «нет»: награждать нельзя.

   Вступление и голос считаются порознь. Человек может в ту же
   минуту и вступить, и проголосовать: второй факт не прячется
   за первым. Голос ищется во всех JETTON DAO (и в новом
   jetton-dao-wv3y, и в прежнем jetton-dao-gelq), у всех
   аккаунтов этого Telegram и у аккаунта с тем же кошельком.

   Вызов (GET или POST):
     https://uiguvfkpbbyvbrabjvso.supabase.co/functions/v1/jetpunk-check?tg_id=123456789
   Заголовок apikey — публичный ключ сайта (anon).

   Деплой:
     Supabase → Edge Functions → функция jetpunk-check
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

function uniq(list: Array<string | null | undefined>) {
  return [...new Set(list.map((v) => String(v || "").trim()).filter(Boolean))];
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

  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + key } },
  });

  /* Все аккаунты Tonix этого Telegram. Колонка id бывает числом или текстом.
     Берём все строки, не первую: человек мог войти кошельком отдельно. */
  const uids = new Set<string>();
  for (const val of [tg, Number(tg)]) {
    const link = await admin.from("user_telegram").select("user_uid").eq("tg_id", val).limit(20);
    for (const row of link.data || []) if (row.user_uid) uids.add(row.user_uid);
  }
  if (!uids.size) return reply({ ok: true, linked: false, joined: false, voted: false });

  /* Тот же кошелёк мог проголосовать с другого входа. Это тот же человек. */
  const { data: ownWallets } = await admin.from("user_wallets")
    .select("wallet_address").in("user_id", [...uids]);
  const addrs = uniq((ownWallets || []).map((w) => w.wallet_address));
  if (addrs.length) {
    const { data: same } = await admin.from("user_wallets")
      .select("user_id").in("wallet_address", addrs);
    for (const row of same || []) if (row.user_id) uids.add(row.user_id);
  }
  const people = [...uids];

  /* Все сообщества JETTON, не только первый попавшийся slug.
     Голоса старого jetton-dao-gelq тоже считаются. */
  const keys = new Set<string>(["jetton-dao-wv3y", "jetton-dao", "jetton-dao-gelq"]);
  const chats = new Set<string>();
  const { data: daos } = await admin.from("daos")
    .select("slug,chat_id,name")
    .or("slug.ilike.%jetton%,name.ilike.%JETTON%");
  for (const d of daos || []) {
    if (/demo/i.test(String(d.slug || "")) || /demo/i.test(String(d.name || ""))) continue;
    if (d.slug) keys.add(d.slug);
    if (d.chat_id) chats.add(d.chat_id);
  }
  const { data: oldProps } = await admin.from("dao_proposals")
    .select("dao_key").ilike("dao_key", "%jetton%").limit(1000);
  for (const p of oldProps || []) {
    if (p.dao_key && !/demo/i.test(String(p.dao_key))) keys.add(p.dao_key);
  }
  const daoKeys = [...keys];
  if (!daoKeys.length) return reply({ ok: false, error: "dao-not-found" }, 404);

  let joined = false;
  if (chats.size) {
    const { data: mem } = await admin.from("user_chats")
      .select("user_id").in("user_id", people).in("chat_id", [...chats]).limit(1);
    joined = !!(mem && mem.length);
  }

  /* Голос — строка в dao_votes, не авторство предложения.
     Ищем от голосов человека, а не от полного списка предложений:
     так голос виден сразу и не теряется, если предложений много. */
  let voted = false;
  const { data: votes } = await admin.from("dao_votes")
    .select("proposal_id").in("voter_uid", people).limit(200);
  const pids = uniq((votes || []).map((v) => v.proposal_id));
  if (pids.length) {
    const { data: hit } = await admin.from("dao_proposals")
      .select("id").in("id", pids).in("dao_key", daoKeys).limit(1);
    voted = !!(hit && hit.length);
  }

  return reply({ ok: true, linked: true, joined, voted });
});
