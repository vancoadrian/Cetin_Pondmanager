# Dev-stack: náhrada `supabase start` bez Dockeru

Fallback pre prostredia, kde `pnpm supabase:start` nejde spustiť (CI runner bez
container registry, cloud sandbox). Na vývojárskom počítači s Dockerom vždy
preferuj reálny stack: `pnpm supabase:start` + `pnpm local:setup`.

## Čo poskytuje

Nad bežiacim obyčajným PostgreSQL (predvolene `postgresql://postgres@127.0.0.1:54322/postgres`,
konfigurovateľné cez `DEV_STACK_DB_URL`) spustí:

- **PostgREST** na porte `54331` (`/rest/v1` cez gateway) s rolami `anon`,
  `authenticated`, `service_role` a JWT overovaním,
- **gateway** na porte `54321` (rovnaké API URL ako `supabase start`), ktorý
  proxuje PostgREST a pridáva minimálne shim implementácie `/auth/v1`
  (signup, password grant, user, logout — dosť pre integračné testy) a
  `/storage/v1` (upload/download/list/remove nad tabuľkami v schéme `storage`,
  bajty v harness tabuľke `storage._harness_object_data`),
- **bootstrap SQL** (`bootstrap.sql`): API roly, schéma `auth` s minimálnou
  `auth.users` + `auth.uid()/role()/jwt()`, schéma `storage` s `buckets`/`objects`,
- **aplikáciu migrácií a seedu** zo `supabase/migrations` + `supabase/seed.sql`
  s evidenciou v `supabase_migrations.schema_migrations` (ako `supabase db reset`).

Tajomstvá (JWT secret, anon/service kľúče) sa generujú pri prvom štarte do
gitignorovaného `.dev-stack/secrets.json` a nikdy sa nelogujú.

## Použitie

```bash
pnpm dev:stack          # aplikuje SQL, spustí služby, zapíše kľúče do .env
pnpm dev:stack:reset    # navyše najprv zahodí schémy a aplikuje všetko odznova
pnpm dev:stack:stop     # zastaví postgrest + gateway
```

Potom bežia `pnpm dev`, `pnpm build` + preview, `pnpm test:integration` aj
`pnpm data:import` proti `http://127.0.0.1:54321` presne ako pri reálnom stacku.

Playwright v prostredí bez systémového Chrome spúšťaj cez
`pnpm test:e2e -- -c playwright.sandbox.config.ts` (voliteľne
`PLAYWRIGHT_CHROMIUM_PATH=<cesta k chromium binárke>`).

## Obmedzenia

- Auth shim nie je GoTrue: žiadne potvrdzovacie e-maily, refresh tokeny ani
  OAuth. Slúži iba na vytvorenie `auth.users` záznamov a `authenticated` JWT
  pre RLS testy.
- Storage shim vyžaduje service-role JWT (privátne buckety bez policies) a
  implementuje iba operácie používané aplikáciou a testami.
- Nikdy ho nepoužívaj ako produkčnú službu.
