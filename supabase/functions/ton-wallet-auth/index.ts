// =====================================================================
// Supabase Edge Function: ton-wallet-auth  (версия 2026-10-21, TON Connect 5)
// =====================================================================
//
// Вход через TON-кошелёк по подписи ton_proof. Проверка сделана строго по
// спецификации: https://docs.ton.org/applications/ton-connect/how-to/ton-proof
//
// ДВА ДЕЙСТВИЯ:
//   POST {action:"challenge"}  → {payload}
//       Сервер выдаёт одноразовую случайную строку (живёт 10 минут).
//       Кошелёк подписывает именно её — подпись нельзя «переиграть».
//   POST {address, proof, network, walletStateInit, publicKey?}  → сессия
//       1) payload из подписи должен быть выдан нами и ещё не использован
//          (удаляется одним запросом DELETE … RETURNING — повтор невозможен)
//       2) домен = наш домен, подпись не старше 10 минут
//       3) адрес, вычисленный из walletStateInit, = адрес кошелька
//       4) публичный ключ берём НЕ у клиента, а:
//          - для обычных кошельков (v3R1, v3R2, v4R2, v5R1) — из walletStateInit
//          - для кошелька Telegram (WalletTg / tg-wallet-v1) — из блокчейна,
//            геттером get_public_key, после проверки, что код кошелька — это
//            «трамплин» Telegram (ключ у таких кошельков может меняться)
//       5) подпись Ed25519 проверяется этим ключом
//   Дальше — как раньше: детерминированные email/пароль из адреса,
//   вход или создание пользователя, сессия Supabase.
//
// ЧТО БЫЛО НЕ ТАК В ПРЕЖНЕЙ ВЕРСИИ:
//   - ключ для проверки подписи брался из запроса клиента и никак не
//     сверялся с адресом → можно было подписать своим ключом чужой адрес;
//   - кошелёк Telegram не присылает publicKey → вход отклонялся всегда
//     («Missing required fields»);
//   - payload придумывал сам браузер, домен не проверялся.
//
// ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ (Settings → Edge Functions → Secrets):
//   TON_AUTH_SALT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — как и раньше
//   TON_PROOF_DOMAINS  — необязательно; домены через запятую (по умолчанию tonix.app)
//   TONCENTER_API_KEY  — необязательно; ключ toncenter, чтобы не упираться в лимит
//
// НУЖНА ТАБЛИЦА: sql/2026-10-21-ton-proof-challenges.sql
// =====================================================================

// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
// @ts-ignore
import nacl from "https://esm.sh/tweetnacl@1.0.3";
// @ts-ignore
import { Address, Cell, contractAddress, loadStateInit } from "npm:@ton/core@0.62.0";
// @ts-ignore
import { Buffer } from "node:buffer";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Константы ton_proof ---
const TON_PROOF_PREFIX = "ton-proof-item-v2/";
const TON_CONNECT_PREFIX = "ton-connect";
const PROOF_MAX_AGE_SEC = 10 * 60;     // подпись не старше 10 минут (спецификация)
const PROOF_MAX_FUTURE_SEC = 60;       // небольшой запас на расхождение часов
const CHALLENGE_TTL_SEC = 10 * 60;     // одноразовый payload живёт 10 минут
// Сети TON Connect: -239 = mainnet, -3 = testnet
const ACCEPTED_NETWORKS = ["-239", "-3"];

// --- Известные кошельки: хеш кода → где в data лежит публичный ключ (смещение в битах) ---
// Хеши сверены с кодом из @ton/ton 16.1.0.
const STANDARD_WALLETS: Record<string, { name: string; keyOffsetBits: number }> = {
    // v3: seqno(32) subwallet(32) pubkey(256)
    "b61041a58a7980b946e8fb9e198e3c904d24799ffa36574ea4251c41a566f581": { name: "v3R1", keyOffsetBits: 64 },
    "84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599": { name: "v3R2", keyOffsetBits: 64 },
    // v4: seqno(32) subwallet(32) pubkey(256) plugins(dict)
    "feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0": { name: "v4R2", keyOffsetBits: 64 },
    // v5r1: is_signature_allowed(1) seqno(32) wallet_id(32) pubkey(256) extensions(dict)
    "20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f": { name: "v5R1", keyOffsetBits: 65 },
};
// Кошелёк Telegram (WalletTg): код в StateInit — «трамплин» с этим хешем
// https://docs.ton.org/contracts/standard/wallets/telegram/integrate
const WALLET_TG_TRAMPOLINE_HASH = "9149ae51c1e4689710cebf7830297b16acfbadb363a920a537893e7ffeeca768";

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
function bytesToHex(b: Uint8Array): string {
    return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex: string): Uint8Array {
    const clean = String(hex || "").replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2) throw new Error("bad hex");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
}
function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
async function sha256(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}
function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}

// =====================================================================
// Блокчейн (toncenter): состояние аккаунта и геттер get_public_key
// =====================================================================
type ChainApi = {
    accountState(address: string, testnet: boolean): Promise<{ active: boolean; codeHash: string | null }>;
    getPublicKey(address: string, testnet: boolean): Promise<Uint8Array>;
};

export function toncenterApi(apiKey?: string): ChainApi {
    const base = (testnet: boolean) => testnet ? "https://testnet.toncenter.com/api/v2" : "https://toncenter.com/api/v2";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;
    async function call(testnet: boolean, path: string, init?: RequestInit) {
        // toncenter без ключа пускает ~1 запрос в секунду — на 429 ждём и повторяем
        for (let attempt = 0; attempt < 3; attempt++) {
            const r = await fetch(base(testnet) + path, { ...init, headers });
            if (r.status === 429) { await new Promise((res) => setTimeout(res, 1100 * (attempt + 1))); continue; }
            const j = await r.json();
            if (!j || j.ok !== true) throw new Error("toncenter: " + (j && (j.error || j.code) || r.status));
            return j.result;
        }
        throw new Error("toncenter: rate limited");
    }
    return {
        async accountState(address, testnet) {
            const res = await call(testnet, "/getAddressInformation?address=" + encodeURIComponent(address));
            const active = res && res.state === "active";
            let codeHash: string | null = null;
            if (active && res.code) {
                codeHash = Cell.fromBoc(Buffer.from(res.code, "base64"))[0].hash().toString("hex");
            }
            return { active, codeHash };
        },
        async getPublicKey(address, testnet) {
            const res = await call(testnet, "/runGetMethod", {
                method: "POST",
                body: JSON.stringify({ address, method: "get_public_key", stack: [] }),
            });
            if (!res || res.exit_code !== 0 || !Array.isArray(res.stack) || !res.stack[0]) {
                throw new Error("get_public_key failed");
            }
            const [type, value] = res.stack[0];
            if (type !== "num") throw new Error("get_public_key: unexpected stack");
            const n = BigInt(value);
            if (n < 0n || n >= (1n << 256n)) throw new Error("get_public_key: out of range");
            return hexToBytes(n.toString(16).padStart(64, "0"));
        },
    };
}

// =====================================================================
// Проверка ton_proof по спецификации. Возвращает проверенный публичный ключ.
// =====================================================================
export type ProofInput = {
    address: string;                // адрес кошелька из TON Connect (raw "0:…")
    network: string;                // "-239" | "-3"
    walletStateInit: string;        // base64 BoC
    publicKey?: string;             // hex, если кошелёк прислал — должен совпасть
    proof: {
        timestamp: number | string;
        domain: { lengthBytes: number; value: string };
        payload: string;
        signature: string;          // base64
    };
};
export type VerifyResult = { ok: true; publicKeyHex: string; wallet: string } | { ok: false; reason: string };

export async function verifyTonProof(
    input: ProofInput,
    opts: { allowedDomains: string[]; chain: ChainApi; now?: number },
): Promise<VerifyResult> {
    try {
        const p = input.proof;
        if (!p || !p.domain || typeof p.signature !== "string" || typeof p.payload !== "string") {
            return { ok: false, reason: "bad-proof-format" };
        }
        // 1. Сеть — только mainnet/testnet
        const network = String(input.network ?? "");
        if (!ACCEPTED_NETWORKS.includes(network)) return { ok: false, reason: "bad-network" };
        const testnet = network === "-3";

        // 2. Домен: ровно наш, и длина в байтах совпадает
        const domainBytes = new TextEncoder().encode(String(p.domain.value || ""));
        if (!opts.allowedDomains.includes(String(p.domain.value).toLowerCase())) return { ok: false, reason: "bad-domain" };
        if (Number(p.domain.lengthBytes) !== domainBytes.length) return { ok: false, reason: "bad-domain-length" };

        // 3. Время подписи (timestamp может прийти числом или строкой)
        const ts = Number(p.timestamp);
        if (!Number.isFinite(ts) || ts <= 0 || !Number.isInteger(ts)) return { ok: false, reason: "bad-timestamp" };
        const now = opts.now ?? Math.floor(Date.now() / 1000);
        if (now - ts > PROOF_MAX_AGE_SEC) return { ok: false, reason: "proof-expired" };
        if (ts - now > PROOF_MAX_FUTURE_SEC) return { ok: false, reason: "proof-from-future" };

        // 4. Ограничения длины (спецификация: домен ≤128, payload ≤128, вместе ≤222 байт)
        const payloadBytes = new TextEncoder().encode(p.payload);
        if (domainBytes.length > 128 || payloadBytes.length > 128 || domainBytes.length + payloadBytes.length > 222) {
            return { ok: false, reason: "too-long" };
        }

        // 5. Адрес из walletStateInit должен совпасть с адресом кошелька
        if (!input.walletStateInit) return { ok: false, reason: "no-state-init" };
        const addr = Address.parse(input.address);
        const stateInit = loadStateInit(Cell.fromBase64(input.walletStateInit).beginParse());
        if (!stateInit.code || !stateInit.data) return { ok: false, reason: "bad-state-init" };
        const derived = contractAddress(addr.workChain, stateInit);
        if (!derived.equals(addr)) return { ok: false, reason: "address-mismatch" };

        // 6. Публичный ключ — из доверенного источника, не от клиента
        const codeHash = stateInit.code.hash().toString("hex");
        let key: Uint8Array;
        let walletName: string;
        const std = STANDARD_WALLETS[codeHash];
        if (std) {
            const s = stateInit.data.beginParse();
            s.skip(std.keyOffsetBits);
            key = new Uint8Array(s.loadBuffer(32));
            walletName = std.name;
        } else if (codeHash === WALLET_TG_TRAMPOLINE_HASH) {
            // Кошелёк Telegram: ключ мог смениться, поэтому берём живой ключ из сети,
            // но только если аккаунт активен и его код — тот же трамплин.
            const raw = addr.toRawString();
            const st = await opts.chain.accountState(raw, testnet);
            if (!st.active) return { ok: false, reason: "wallettg-inactive" };
            if (st.codeHash !== WALLET_TG_TRAMPOLINE_HASH) return { ok: false, reason: "wallettg-code-mismatch" };
            key = await opts.chain.getPublicKey(raw, testnet);
            walletName = "WalletTg";
        } else {
            return { ok: false, reason: "unsupported-wallet" };
        }

        // 7. Если кошелёк сам прислал publicKey — он должен совпасть с проверенным
        const keyHex = bytesToHex(key);
        if (input.publicKey && String(input.publicKey).toLowerCase().replace(/^0x/, "") !== keyHex) {
            return { ok: false, reason: "public-key-mismatch" };
        }

        // 8. Сообщение и подпись по стандарту
        const wc = new Uint8Array(4);
        new DataView(wc.buffer).setInt32(0, addr.workChain, false);
        const dlen = new Uint8Array(4);
        new DataView(dlen.buffer).setUint32(0, domainBytes.length, true);
        const tsb = new Uint8Array(8);
        new DataView(tsb.buffer).setBigUint64(0, BigInt(ts), true);
        const message = concat(
            new TextEncoder().encode(TON_PROOF_PREFIX), wc, new Uint8Array(addr.hash), dlen, domainBytes, tsb, payloadBytes,
        );
        const full = concat(new Uint8Array([0xff, 0xff]), new TextEncoder().encode(TON_CONNECT_PREFIX), await sha256(message));
        const digest = await sha256(full);
        const sig = base64ToBytes(p.signature);
        if (sig.length !== 64) return { ok: false, reason: "bad-signature" };
        if (!nacl.sign.detached.verify(digest, sig, key)) return { ok: false, reason: "bad-signature" };

        return { ok: true, publicKeyHex: keyHex, wallet: walletName };
    } catch (e) {
        console.error("[ton-wallet-auth] verify error:", String(e));
        return { ok: false, reason: "verify-error" };
    }
}

// =====================================================================
// Детерминированные email + пароль из адреса (без изменений)
// =====================================================================
async function deriveCredentials(walletAddress: string, salt: string): Promise<{ email: string; password: string }> {
    const cleanAddress = walletAddress.replace(/^0:/, "").toLowerCase();
    const emailLocalPart = `wallet_${cleanAddress.substring(0, 8)}_${cleanAddress.substring(cleanAddress.length - 8)}`;
    const email = `${emailLocalPart}@quantum-wallet.local`;
    const passwordHash = await sha256(new TextEncoder().encode(cleanAddress + salt));
    const password = bytesToHex(passwordHash);
    return { email, password };
}

// Понятные сообщения для пользователя по причине отказа
function userMessage(reason: string): string {
    switch (reason) {
        case "challenge-unknown":
        case "proof-expired":
            return "Запрос на вход устарел. Нажми «Войти» ещё раз.";
        case "wallettg-inactive":
            return "Кошелёк Telegram ещё не активирован в сети. Сделай в нём любую транзакцию (например, получи немного TON) и попробуй снова.";
        case "unsupported-wallet":
            return "Этот тип кошелька пока не поддерживается. Попробуй Telegram Wallet, Tonkeeper или MyTonWallet.";
        case "bad-domain":
            return "Подпись сделана для другого сайта.";
        default:
            return "Не удалось проверить подпись кошелька. Попробуй ещё раз.";
    }
}

// =====================================================================
// Главный обработчик
// =====================================================================
async function handler(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
        const body = await req.json();

        // @ts-ignore
        const env = (k: string) => Deno.env.get(k);
        const TON_AUTH_SALT = env("TON_AUTH_SALT");
        const SUPABASE_URL = env("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
        if (!TON_AUTH_SALT || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error("[ton-wallet-auth] Missing env variables");
            return json(500, { error: "Server configuration error" });
        }
        // Отдельный клиент для служебных таблиц: в него никто не «входит»
        const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // ---------- 1) Выдача одноразового payload ----------
        if (body && body.action === "challenge") {
            const bytes = new Uint8Array(32);
            crypto.getRandomValues(bytes);
            const payload = bytesToHex(bytes);
            const expires = new Date(Date.now() + CHALLENGE_TTL_SEC * 1000).toISOString();
            const ins = await db.from("ton_proof_challenges").insert({ payload, expires_at: expires });
            if (ins.error) {
                console.error("[ton-wallet-auth] challenge insert:", JSON.stringify(ins.error));
                return json(500, { error: "challenge-failed" });
            }
            // Заодно чистим просроченные (не критично, если не выйдет)
            try { await db.from("ton_proof_challenges").delete().lt("expires_at", new Date().toISOString()); } catch (_) { /* */ }
            return json(200, { payload });
        }

        // ---------- 2) Вход по подписи ----------
        const { address, publicKey, proof, network, walletStateInit } = body || {};
        if (!address || !proof || !walletStateInit) {
            return json(400, { error: "Missing required fields: address, proof, walletStateInit" });
        }

        // Payload должен быть выдан нами, не просрочен и использоваться один раз.
        // Один запрос DELETE … RETURNING: два одновременных входа с одним payload невозможны.
        const used = await db.from("ton_proof_challenges")
            .delete()
            .eq("payload", String(proof.payload || ""))
            .gt("expires_at", new Date().toISOString())
            .select("payload");
        if (used.error) {
            console.error("[ton-wallet-auth] challenge consume:", JSON.stringify(used.error));
            return json(500, { error: "challenge-failed" });
        }
        if (!used.data || used.data.length !== 1) {
            return json(401, { error: userMessage("challenge-unknown"), reason: "challenge-unknown" });
        }

        const allowedDomains = String(env("TON_PROOF_DOMAINS") || "tonix.app")
            .split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
        const v = await verifyTonProof(
            { address, publicKey, proof, network, walletStateInit },
            { allowedDomains, chain: toncenterApi(env("TONCENTER_API_KEY") || undefined) },
        );
        if (!v.ok) {
            console.error("[ton-wallet-auth] proof rejected:", v.reason, address);
            return json(401, { error: userMessage(v.reason), reason: v.reason });
        }
        const rawAddress = Address.parse(address).toRawString();
        console.log("[ton-wallet-auth] ✅ proof valid:", v.wallet, rawAddress);

        // ---------- 3) Вход или регистрация (логика прежняя) ----------
        const { email, password } = await deriveCredentials(rawAddress, TON_AUTH_SALT);
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        let signInResult = await supabaseAdmin.auth.signInWithPassword({ email, password });
        let userId: string | null = null;
        let isNewUser = false;

        if (signInResult.error) {
            // Создаём пользователя только если сервис прямо сказал «неверные данные»
            const siMsg = String(signInResult.error.message || "");
            const siStatus = Number((signInResult.error as any).status || 0);
            const looksMissing = siStatus === 400 || /invalid login credentials/i.test(siMsg);
            if (!looksMissing) {
                console.error("[ton-wallet-auth] transient signIn error:", siMsg);
                return json(503, { error: "auth-retry", detail: "Сервис входа временно недоступен — попробуй ещё раз через несколько секунд." });
            }
            const signUpResult = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { auth_method: "ton_wallet", wallet_address: rawAddress, network: network || "-239" },
            });
            if (signUpResult.error || !signUpResult.data.user) {
                const suMsg = String(signUpResult.error?.message || "");
                if (/already been registered|already registered/i.test(suMsg)) {
                    await new Promise((r) => setTimeout(r, 500));
                    const retry = await supabaseAdmin.auth.signInWithPassword({ email, password });
                    if (!retry.error && retry.data.session) {
                        signInResult = retry;
                        userId = retry.data.user!.id;
                    } else {
                        return json(503, { error: "auth-retry", detail: "Аккаунт найден, но вход не прошёл с первого раза. Попробуй ещё раз." });
                    }
                } else {
                    console.error("[ton-wallet-auth] signUp error:", signUpResult.error);
                    return json(500, { error: "Failed to create user: " + (signUpResult.error?.message || "unknown") });
                }
            } else {
                userId = signUpResult.data.user.id;
                isNewUser = true;
                signInResult = await supabaseAdmin.auth.signInWithPassword({ email, password });
            }
            if (signInResult.error || !signInResult.data.session) {
                console.error("[ton-wallet-auth] Failed to login after signUp:", signInResult.error);
                return json(500, { error: "Failed to create session for new user" });
            }
        } else {
            userId = signInResult.data.user!.id;
        }

        const session = signInResult.data.session!;

        // Кошелёк пользователя — в user_wallets (служебным клиентом, см. прежнюю версию)
        try {
            const upRes = await db.from("user_wallets").upsert({
                user_id: userId,
                wallet_address: rawAddress,
                public_key: v.publicKeyHex,            // теперь проверенный ключ, а не присланный
                verified_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
            if (upRes.error) console.error("[ton-wallet-auth] user_wallets upsert FAILED:", JSON.stringify(upRes.error));
        } catch (wErr) {
            console.error("[ton-wallet-auth] user_wallets exception:", String(wErr));
        }

        return json(200, {
            ok: true,
            user_id: userId,
            is_new_user: isNewUser,
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            wallet_address: rawAddress,
        });
    } catch (err) {
        console.error("[ton-wallet-auth] Unexpected error:", err);
        return json(500, { error: "Internal server error" });
    }
}

// Запуск сервера. TONIX_TEST=1 — только для локальных тестов проверки подписи.
// @ts-ignore
if (!Deno.env.get("TONIX_TEST")) Deno.serve(handler);
