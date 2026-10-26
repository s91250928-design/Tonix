# Changelog

## 2026-10-26

### DAO pages
- Trust index removed from the DAO profile header; the overview now shows members, active vote and treasury.
- Leaders section subtitle no longer mentions a trust index (all languages).

## 2026-10-21

### Authentication — TON Connect 5
- `@tonconnect/ui` updated to 5.0.1; wallets list comes from the official TON registry (Telegram Wallet, Walt, Gram Wallet included).
- `ton_proof` verification follows the current [specification](https://docs.ton.org/applications/ton-connect/how-to/ton-proof):
  - server-issued single-use payload (`tonix_login_challenges`, consumed atomically);
  - address derived from `walletStateInit`;
  - public key resolved server-side: from `walletStateInit` for standard wallets (v3R1, v3R2, v4R2, v5R1), via `get_public_key` for Telegram Wallet (WalletTg);
  - domain, timestamp window and network checks.
- Edge function source added to the repository: `supabase/functions/ton-wallet-auth`.
- Connect flow waits for session restore, keeps existing wallet sessions, cancels quietly when the wallet modal is closed.
- CSP `connect-src` covers bridges of all wallets in the official list.

### DAO pages
- Public member list and member counts (wallet, nickname, avatar), visible to guests: `tonix_dao_members`, `tonix_member_counts`.
- Treasury: animated token next to the balance; custom token image per DAO (`treasury_coin_url`).
- DAO appearance: separate mobile background, background dimming setting (default 35%).
- Chat: Telegram-style message editing in the input bar.
- Notifications moved to the top of the screen.
- Shared, rate-limited tonapi requests (`js/tonapi.js`).
- Platform font: system UI font stack.

### Database migrations (run in order)
1. `sql/2026-10-18-dao-bg-mobile-dim.sql`
2. `sql/2026-10-18-treasury-coin.sql`
3. `sql/2026-10-21-tonix-login-challenges.sql`
4. `sql/2026-10-21-member-counts.sql`
5. `sql/2026-10-21-dao-members.sql`

### Edge function secrets
`TON_AUTH_SALT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (required); `TONCENTER_API_KEY`, `TON_PROOF_DOMAINS` (optional, default `tonix.app`).
