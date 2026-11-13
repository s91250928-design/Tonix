// =====================================================
// TONIX — check-token-gate (Supabase Edge Function)
//
// Что делает: проверяет, можно ли пользователю войти в DAO по балансу токена.
//  1. Берёт uid из ПРОВЕРЕННОЙ сессии (JWT) — клиент не может подделать
//  2. Находит кошелёк этого пользователя в user_wallets
//  3. Берёт из dao_settings: адрес токена (gate_jetton) и порог (gate_min)
//  4. Читает баланс токена на кошельке через tonapi
//  5. Возвращает allowed:true/false — решает СЕРВЕР, не браузер
//
// Почему безопасно: адрес кошелька берётся из сессии (tonProof-подпись
// доказала владение), а НЕ из того, что прислал клиент. Нельзя вписать
// чужой богатый адрес и войти.
//
// Деплой: Supabase Dashboard → Edge Functions → check-token-gate
//  → заменить код → Deploy. Verify JWT не трогать.
// =====================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Приводим TON-адрес к hex-хвосту raw-вида (32 байта) для честного сравнения.
// tonapi отдаёт master как 0:hex, а в настройках DAO часто лежит EQ…/UQ….
// Раньше friendly-адрес только приводился к нижнему регистру и никогда
// не совпадал с hex — баланс честно лежащего токена читался как 0.
function rawTail(addr: string): string {
  if (!addr) return "";
  const a = addr.trim();
  const m = a.match(/^-?\d+:([0-9a-fA-F]{64})$/);
  if (m) return m[1].toLowerCase();
  try {
    const b64 = a.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    if (bin.length < 34) return "";
    let hex = "";
    for (let i = 2; i < 34; i++) {
      hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const daoKey = body?.dao_key ?? null;
    const mode = String(body?.mode ?? "join"); // "join" | "proposal"
    if (!daoKey) throw new Error("dao_key не передан");

    // service role — для чтения служебных таблиц в обход RLS
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- 1. Кто пользователь: берём uid из JWT (проверенная сессия) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) throw new Error("нет авторизации");
    const { data: userData, error: uErr } = await sb.auth.getUser(jwt);
    if (uErr || !userData?.user) throw new Error("сессия недействительна");
    const uid = userData.user.id;

    // --- 2. Кошелёк пользователя из user_wallets ---
    const { data: wRow } = await sb
      .from("user_wallets")
      .select("wallet_address")
      .eq("user_id", uid)
      .maybeSingle();
    const wallet = wRow?.wallet_address ?? null;
    if (!wallet) {
      return json({ allowed: false, reason: "no_wallet",
        message: "Кошелёк не привязан — войди через TON Connect" });
    }

    // --- 3. Условия входа для этого DAO ---
    const { data: s } = await sb
      .from("dao_settings")
      .select("gate_jetton, gate_min, entry_threshold_ton, proposal_threshold_ton")
      .eq("dao_key", daoKey)
      .maybeSingle();

    const gateJetton = s?.gate_jetton ?? null;          // адрес токена (master)
    const gateMin = Number(s?.gate_min ?? 0);           // минимум токенов
    // Режим: "join" — порог входа в DAO, "proposal" — порог на создание предложения.
    // Один механизм на оба случая: условия должны выполняться, а не просто быть объявлены.
    const isProposal = mode === "proposal";
    const needTon = isProposal
      ? Number(s?.proposal_threshold_ton ?? 0)
      : Number(s?.entry_threshold_ton ?? 0);

    const hasJettonGate = !isProposal && !!gateJetton && gateMin > 0;
    const hasTonGate = needTon > 0;

    // Условий нет — вход открыт
    if (!hasJettonGate && !hasTonGate) {
      return json({ allowed: true, reason: "no_gate",
        message: isProposal ? "Порог для предложений не задан" : "Условий входа нет — вход открыт" });
    }

    // --- 4. Порог по TON: смотрим баланс кошелька в сети ---
    let heldTon = 0;
    if (hasTonGate) {
      const accApi = "https://tonapi.io/v2/accounts/" + encodeURIComponent(wallet);
      const ar = await fetch(accApi, { headers: { "Accept": "application/json" } });
      if (!ar.ok) throw new Error("tonapi (аккаунт) статус " + ar.status);
      const ad = await ar.json();
      heldTon = Number(ad?.balance ?? 0) / 1e9; // нанотоны → TON

      if (heldTon < needTon) {
        return json({
          allowed: false,
          reason: "insufficient_ton",
          held: heldTon,
          required: needTon,
          unit: "TON",
          message: isProposal
          ? `Чтобы создать предложение, нужно ≥ ${needTon} TON. На кошельке ${heldTon.toFixed(3)}.`
          : `Нужно держать ≥ ${needTon} TON. На кошельке ${heldTon.toFixed(3)}.`,
        });
      }
    }

    // --- 5. Порог по токену DAO ---
    let held = 0;
    if (hasJettonGate) {
      const api = "https://tonapi.io/v2/accounts/" +
        encodeURIComponent(wallet) + "/jettons";
      const r = await fetch(api, { headers: { "Accept": "application/json" } });
      if (!r.ok) throw new Error("tonapi статус " + r.status);
      const jd = await r.json();
      const balances = jd?.balances ?? [];

      const wantTail = rawTail(gateJetton);
      for (const b of balances) {
        const mAddr = String(b?.jetton?.address ?? "");
        const mTail = rawTail(mAddr);
        // сверяем по hex-хвосту raw-адреса: в настройках может лежать EQ...,
        // а tonapi всегда отдаёт raw — так совпадение находится в обоих случаях
        const match = (mTail && wantTail && mTail === wantTail) ||
                      (mAddr.toLowerCase() === String(gateJetton).toLowerCase());
        if (match) {
          const dec = Number(b?.jetton?.decimals ?? 9);
          held = Number(b?.balance ?? 0) / Math.pow(10, dec);
          break;
        }
      }

      if (held < gateMin) {
        return json({
          allowed: false,
          reason: "insufficient",
          held,
          required: gateMin,
          unit: "токенов",
          message: `Нужно держать ≥ ${gateMin} токенов. У тебя ${held}.`,
        });
      }
    }

    // Все заявленные условия выполнены
    return json({
      allowed: true,
      reason: "ok",
      held,
      heldTon,
      required: gateMin,
      requiredTon: needTon,
      message: "Условия входа выполнены",
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
