# Migrácia autentifikácie na Supabase Auth

Stav: **fázy 1–2 implementované vrátane 2b sessions** (27. 8. 2026) — GoTrue
je v Supabase driveri autoritou pre identity, heslá aj sessions:

- Overenie a zápis hesiel cez `server/utils/supabaseAuthIdentity.ts`
  (login/registrácia/zmena/obnova hesla aj zmazanie účtu), legacy scrypt ako
  fallback s lazy migráciou pri prvom úspešnom prihlásení.
- Session nesie GoTrue access token (JWT) + refresh token v httpOnly cookies
  (`server/utils/authSessionTokens.ts`): identita sa číta lokálne z claims
  (`app_metadata.app_account_id`/`app_role`) bez DB dotazu, expirácia sa rieši
  tichým refreshom (single-use rotácia s dedupe paralelných requestov) a staré
  opaque tokeny v `app_sessions` sa počas prechodného okna ďalej akceptujú
  (dual-read). Nové stacky podpisujú ES256 (JWKS), legacy HS256 cez
  `SUPABASE_JWT_SECRET`. GoTrue revokuje refresh rodiny pri zmene hesla
  (overené integračne) — cudzie sessions zomrú najneskôr s expiráciou access
  tokenu (~1 h).

File driver (dev/test adaptér) beží naďalej čisto na legacy ceste, takže unit
testy ostávajú hermetické. Otvorené ostáva klientske RLS čítanie — vyžaduje
normalizáciu dátového modelu (runtime dokumentový store nemá na čom postaviť
per-user policies) a pôjde spolu s remodelovaním dát. Pôvodný plán nasleduje
nižšie.

## Dnešný stav

- **Identity:** 8 seed rolí (owner, manager, marshal, organizer, team,
  accountant, worker, angler-marek) definovaných v kóde (`useMockAuth`),
  registrovaní rybári v runtime store `account-state`
  (`registeredAccounts` + `credentialOverrides`, scrypt hash).
- **Sessions:** vlastné tokeny (sha256 hash v tabuľke `app_sessions`),
  cookies `rybolov_cetin_mock_session` (+ angler variant), TTL 14 dní.
- **Autorizácia:** server-only — všetky DB operácie idú cez secret key,
  RLS bez policies; roly vyhodnocujú `adminAccessGuard`/`adminAccess.ts`.
- **Obnova hesla:** vlastné jednorazové tokeny (SHA-256, 30 min) s Resend-ready
  providerom.

## Cieľový stav

- Identity aj sessions drží **Supabase Auth (GoTrue)**: `auth.users` +
  refresh/access JWT v httpOnly cookies cez `@nuxtjs/supabase` alebo vlastný
  tenký server wrapper (odporúčam vlastný wrapper — modul @nuxtjs/supabase si
  vynucuje vlastné route middleware vzory, ktoré nesedia s existujúcimi guardmi).
- **Aplikačné roly** v `app_metadata.role` (nastavuje výhradne server admin
  API); mapping na moduly ostáva v `adminAccess.ts` bezo zmeny.
- **RLS:** prvá fáza ponecháva server-only prístup (secret key) — JWT slúži
  len ako identita. Otvorenie priamych klientských RLS čítaní je samostatná
  neskoršia fáza (vyžaduje policies per tabuľka + audit).
- Tímový prechodový prístup cez kód/link ostáva bez Auth účtu (ako dnes).

## Fázy implementácie

1. **Príprava dát** — migračný skript: seed roly → `auth.users`
   (deterministické UUID, e-mail, `app_metadata.role`), registrovaní rybári →
   `auth.users`. Scrypt hashe sa do GoTrue preniesť nedajú (podporuje bcrypt
   import) → dve možnosti:
   a) jednorazový reset hesiel (e-mail flow), alebo
   b) lazy migrácia: prvé prihlásenie overí scrypt hash starým kódom a hneď
      nastaví heslo v GoTrue (odporúčané — nulový dopad na používateľov).
2. **Server vrstva** — `serverSupabaseClient` rozšíriť o auth klienta;
   `login.post.ts`/`logout`/`register`/`session.get` prepnúť na GoTrue;
   `appSession.ts` číta identitu z JWT (fallback na staré cookie sessions
   počas prechodného okna, potom odstrániť `app_sessions`).
3. **Klient** — `useMockAuth` zredukovať na wrapper nad session endpointom
   (public API composablu zachovať, aby sa 30+ použití nemuselo meniť).
4. **Obnova hesla** — nahradiť GoTrue recovery flowom (Resend SMTP v Supabase
   configu); zachovať slovenské šablóny.
5. **Testy** — `e2e/global-setup.ts` provisionuje účty cez GoTrue admin API
   namiesto credentialOverrides; integračné testy pre login/refresh/logout;
   unit testy guardov bezo zmeny (mock identity).
6. **Cleanup** — odstrániť `accountAuthentication`, `localSessionStore`,
   `credentialOverrides` (po deprecačnom okne), zaktualizovať
   `docs/architecture.md` a runbook.

## Riziká

- **Lokálny dev:** GoTrue beží v `supabase start` stacku — od fázy 2 je Docker
  stack povinný aj pre auth flow (file driver fallback prestane pokrývať login).
- **E-mail flows:** GoTrue recovery vyžaduje SMTP config (lokálne Inbucket
  z CLI stacku, produkčne Resend) — treba otestovať slovenské šablóny.
- **Session okno:** používatelia prihlásení starým cookie sa musia prihlásiť
  znova, ak sa nespraví prechodný dual-read (odporúčam dual-read na 14 dní).
- **`operationsMode` a tímové kódy:** nesmú regresnúť — pokryté e2e suitou.

## Definícia hotovo

Login/logout/registrácia/obnova hesla cez GoTrue vo všetkých roliach, e2e
20/20 + nové auth testy, žiadne čítanie `credentialOverrides` v runtime ceste,
runbook aktualizovaný o produkčné SMTP a auth migračný krok.
