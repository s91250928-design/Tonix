// =====================================================
// TONIX — finish-proposal (Supabase Edge Function)
//
// Что делает: закрывает голосования, у которых вышел срок.
//  1. Находит предложения со статусом active и ends_at < сейчас
//  2. Считает голоса за/против (ничья = отклонено)
//  3. Если «за» победило и действие set_entry_threshold —
//     САМА меняет порог входа в dao_settings
//  3b. Если «за» победило и действие remove_member —
//     исключает участника (action_target) из DAO. Владельца — нельзя.
//  4. Ставит статус: executed / passed / rejected
//  5. Если это предложение о выплате (есть payout_address и
//     payout_amount) — ставит payout_status:
//       победа   → awaiting_signature (подписанты увидят карточку)
//       провал   → declined
//     Деньги функция НЕ двигает. Казна живёт в мультисиге,
//     распоряжаются только подписанты вручную.
//
// Работает с service role — то, что не может никто через API.
//
// Как задеплоить (5 минут):
//  Supabase Dashboard → Edge Functions → Deploy new function
//  → имя: finish-proposal → вставить этот код → Deploy.
// =====================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const daoKey = body?.dao_key ?? null;

    // Ключи подставляет сам Supabase — вписывать ничего не нужно
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Просроченные активные голосования
    let q = sb
      .from("dao_proposals")
      .select("*")
      .eq("status", "active")
      .lt("ends_at", new Date().toISOString());
    if (daoKey) q = q.eq("dao_key", daoKey);

    const { data: props, error } = await q;
    if (error) throw error;

    const results: unknown[] = [];

    for (const p of props ?? []) {
      // 2. Честный подсчёт голосов.
      //
      //    С весом по токену — в два снимка. Вес записан в момент голоса,
      //    а здесь, при закрытии, берётся МЕНЬШЕЕ из «сколько было тогда»
      //    и «сколько на кошельке сейчас». Это закрывает пересылку токенов
      //    по кругу: проголосовал и переслал — вес обнулился; получил и
      //    проголосовал — засчитан один раз. Умножить влияние нельзя.
      const { data: votes } = await sb
        .from("dao_votes")
        .select("voter_uid, choice, weight")
        .eq("proposal_id", p.id);

      const { data: vs } = await sb
        .from("dao_settings")
        .select("vote_jetton,vote_decimals")
        .eq("dao_key", p.dao_key).limit(1).maybeSingle();

      let yes = 0, no = 0;
      const yesPeople = (votes ?? []).filter((v) => v.choice === "yes").length;
      const noPeople = (votes ?? []).filter((v) => v.choice === "no").length;

      if (vs?.vote_jetton && (votes ?? []).length > 0) {
        const dRaw = Number(vs.vote_decimals);
        const dec = (Number.isFinite(dRaw) && dRaw >= 0) ? dRaw : 9;
        const want = String(vs.vote_jetton).toLowerCase();

        const { data: daoRow } = await sb.from("daos")
          .select("testnet").eq("slug", p.dao_key).limit(1).maybeSingle();
        const apiBase = daoRow?.testnet ? "https://testnet.tonapi.io" : "https://tonapi.io";

        const uids = (votes ?? []).map((v) => v.voter_uid);
        const { data: ws } = await sb.from("user_wallets")
          .select("user_id, wallet_address").in("user_id", uids);
        const wByUid: Record<string, string> = {};
        for (const w of (ws ?? [])) wByUid[w.user_id] = w.wallet_address;

        /* Баланс токена сейчас. Раньше при сбое сети брался «вес на момент
           голоса», а при ответе-ошибке (например, 429 «слишком много запросов»)
           баланс молча считался нулём. Первое позволяло засчитать токены,
           которые уже переслали другому голосующему, второе — обнулить честные
           голоса. Теперь: несколько попыток, а если баланс так и не получен —
           голосование НЕ закрываем в этот раз, оно закроется при следующем вызове. */
        const tonapiKey = Deno.env.get("TONAPI_KEY") || "";
        async function jettonBalance(addr: string): Promise<number | null> {
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              const r = await fetch(
                `${apiBase}/v2/accounts/${encodeURIComponent(addr)}/jettons`,
                { headers: { "Accept": "application/json", ...(tonapiKey ? { "Authorization": `Bearer ${tonapiKey}` } : {}) } },
              );
              if (r.status === 404) return 0; // кошелёк ещё не активирован — токенов нет
              if (r.ok) {
                const j = await r.json();
                for (const b of (j?.balances || [])) {
                  if (String(b?.jetton?.address || "").toLowerCase() === want) {
                    return Number(b.balance) / Math.pow(10, dec);
                  }
                }
                return 0;
              }
            } catch { /* сеть — пробуем ещё раз */ }
            await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
          }
          return null;
        }

        let unreliable = false;
        const finals: { uid: string; used: number }[] = [];
        for (const v of (votes ?? [])) {
          const was = Number(v.weight);
          let nowBal = 0;
          const addr = wByUid[v.voter_uid];
          if (addr) {
            const b = await jettonBalance(addr);
            if (b === null) { unreliable = true; break; }
            nowBal = b;
          }
          const used = Math.min(
            Number.isFinite(was) ? was : 0,
            Number.isFinite(nowBal) ? nowBal : 0,
          );
          if (v.choice === "yes") yes += used; else no += used;
          finals.push({ uid: v.voter_uid, used });
        }
        if (unreliable) {
          console.warn("[finish-proposal] баланс не получен, закрытие отложено:", p.id);
          results.push({ id: p.id, title: p.title, status: "active", deferred: true });
          continue;
        }
        /* Пишем пересчитанный вес — для прозрачности в интерфейсе */
        for (const f of finals) {
          await sb.from("dao_votes").update({ weight_final: f.used })
            .eq("proposal_id", p.id).eq("voter_uid", f.uid);
        }
        yes = Math.round(yes * 1e6) / 1e6;
        no = Math.round(no * 1e6) / 1e6;
      } else {
        for (const v of (votes ?? [])) {
          const w = Number(v.weight);
          const used = (Number.isFinite(w) && w > 0) ? w : 1;
          if (v.choice === "yes") yes += used; else no += used;
        }
      }

      const passed = yes > no; // ничья или ноль голосов = отклонено

      let status = passed ? "passed" : "rejected";
      let executedAt: string | null = null;

      // 3. Исполнение: меняем порог входа DAO.
      //    Просим базу вернуть изменённые строки: если строки настроек
      //    у DAO ещё нет, update молча меняет ноль строк и ошибки не даёт.
      //    Без этой проверки предложение помечалось бы «исполнено»,
      //    хотя в настройках ничего не поменялось.
      if (
        passed &&
        p.action_type === "set_entry_threshold" &&
        p.action_value != null
      ) {
        const { data: updated, error: e2 } = await sb
          .from("dao_settings")
          .update({
            entry_threshold_ton: p.action_value,
            updated_at: new Date().toISOString(),
          })
          .eq("dao_key", p.dao_key)
          .select("dao_key");
        if (!e2 && updated && updated.length > 0) {
          status = "executed";
          executedAt = new Date().toISOString();
        }
      }

      // 3b. Исполнение: исключение участника по голосованию.
      //     Делаем то же, что remove-member: убираем членство в чате,
      //     роль админа и делегации. Владельца исключить нельзя —
      //     проверяем роль в базе в момент исполнения. Если человек уже
      //     вышел сам, предложение остаётся просто «принято».
      if (
        passed &&
        p.action_type === "remove_member" &&
        typeof p.action_target === "string" &&
        p.action_target.length > 0
      ) {
        const { data: role } = await sb.rpc("tonix_dao_role", {
          p_dao: p.dao_key,
          p_uid: p.action_target,
        });
        if (role === "member" || role === "admin") {
          const { data: dao } = await sb.from("daos")
            .select("chat_id").eq("slug", p.dao_key).limit(1).maybeSingle();
          if (dao?.chat_id) {
            const { error: rmErr } = await sb.from("user_chats")
              .delete().eq("chat_id", dao.chat_id).eq("user_id", p.action_target);
            if (!rmErr) {
              await sb.from("dao_admins")
                .delete().eq("dao_key", p.dao_key).eq("user_uid", p.action_target);
              await sb.from("dao_delegations")
                .delete().eq("dao_key", p.dao_key).eq("delegator_uid", p.action_target);
              await sb.from("dao_delegations")
                .delete().eq("dao_key", p.dao_key).eq("delegate_uid", p.action_target);
              status = "executed";
              executedAt = new Date().toISOString();
            }
          }
        }
      }

      // 4. Собираем итоговую запись
      const patch: Record<string, unknown> = { status, executed_at: executedAt };

      // 4a. Предложение о выплате? Тогда поднимаем флаг для подписантов.
      //     Проверяем оба поля: без адреса или без суммы карточка бессмысленна.
      const amount = Number(p.payout_amount);
      const isPayout =
        typeof p.payout_address === "string" &&
        p.payout_address.trim().length > 0 &&
        Number.isFinite(amount) &&
        amount > 0;

      let payoutStatus: string | null = null;
      if (isPayout) {
        payoutStatus = passed ? "awaiting_signature" : "declined";
        patch.payout_status = payoutStatus;
      }

      // 5. Фиксируем итог.
      //    Условие status = 'active' — страховка от гонки: если два
      //    вызова функции пришли одновременно, второй ничего не перепишет.
      await sb
        .from("dao_proposals")
        .update(patch)
        .eq("id", p.id)
        .eq("status", "active");

      results.push({
        id: p.id,
        title: p.title,
        yes,
        no,
        yes_people: yesPeople,
        no_people: noPeople,
        status,
        payout_status: payoutStatus,
      });
    }

    return new Response(
      JSON.stringify({ processed: results.filter((r: any) => !r.deferred).length, results }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message ?? e) }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
