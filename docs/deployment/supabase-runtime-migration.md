# Migrácia runtime dát na Supabase

Postup prechodu z historického `.data/rybolov-cetin` filesystemu na Supabase
(Postgres + Storage) pre lokálne prostredie aj budúci staging/produkciu.
Architektúra vrstvy je popísaná v `docs/architecture.md` (sekcia „Runtime
perzistencia“), schéma v `docs/database.md`.

## Cieľové objekty

| Objekt | Obsah |
| --- | --- |
| `public.runtime_store_states` | 18 runtime dokumentov (rezervácie, účty, mapa + draft, úlovky, register rýb, súťaže, notifikácie, audit, error log, reporty, …) |
| `public.app_sessions` | cookie sessions všetkých rolí (predtým `session-state.json`) |
| bucket `catch-photos` | fotky úlovkov |
| bucket `map-assets` | podkladové obrázky mapy |
| bucket `sponsor-assets` | logá sponzorov a zdrojové logá |
| bucket `data-backups` | safety backupy restore workflowu |

Všetko je server-only (RLS bez policies, bez grantov pre anon/authenticated,
buckety privátne). Migrácia: `supabase/migrations/202608260001_runtime_state_sessions_and_buckets.sql`.

## Lokálny postup (vývojársky počítač)

```bash
pnpm install
pnpm supabase:start        # Docker stack (alternatíva bez Dockeru: pnpm dev:stack)
pnpm supabase:reset        # aplikuje migrácie + seed.sql
pnpm local:setup           # zapíše lokálne URL/kľúče a VAPID pár do .env
pnpm data:import -- --dry-run   # kontrola, čo by sa importovalo
pnpm data:import           # jednorazový import starších .data dát
pnpm dev
```

`pnpm data:import` je idempotentný: existujúce dokumenty a objekty nikdy
neprepíše (nahlási `preskočené (existuje)` alebo `zhodné (bez zmeny)`);
vedomý prepis vyžaduje `--force`. Sessions sa zámerne neimportujú.
Zdrojový adresár sa dá zmeniť cez `--source /cesta/k/datam`.

## Verifikácia po migrácii

1. `GET /api/health` — check `persistence` musí byť `ok` s driverom `supabase`
   a nulou chýbajúcich bucketov; žiadna položka readiness nesmie vyžadovať
   `RYBOLOV_LOCAL_*`.
2. `pnpm test` (unit, file adaptér) a `pnpm test:integration` (RLS + runtime
   store/bucket prístupy proti živému stacku).
3. Reštart aplikácie aj Supabase kontajnerov → registrované účty, sessions,
   rezervácie a assety musia prežiť (perzistencia je v Postgres/Storage).
4. `/admin/system` → panel dát ukazuje driver `supabase` a funkčný export.

## Backup a restore

- **Export:** `GET /api/admin/data-export` (admin UI `/admin/system`) skladá
  jeden JSON so store dokumentmi a manifestom alebo inline base64 assetmi
  (`assets=manifest|inline|none`) vrátane SHA-256 `integrity` bloku.
- **Kontrola:** `POST /api/admin/data-import/preview` overí integritu a
  kompatibilitu bez zápisu.
- **Restore:** `POST /api/admin/data-import/restore` s frázou `OBNOVIT DATA`;
  pred prepisom uloží safety backup aktuálneho stavu do bucketu
  `data-backups`. Inline assety sa obnovia iba pri `assetPolicy=inline`.
- **Archív:** `GET /api/admin/data-backups`, download cez `?download=1`,
  retencia cez dvojkrokový `POST /api/admin/data-backups/cleanup`
  (fráza `VYCISTIT BACKUPY`).
- **Databázové zálohy:** runtime dáta sú od migrácie súčasťou Postgres
  zálohy — na hostovanom Supabase zapnúť plánované zálohy/PITR; Storage
  buckety zálohovať exportom s `assets=inline` alebo replikáciou bucketov.

## Produkčný checklist (pred Preview/Production)

1. Vytvorený hostovaný Supabase projekt; migrácie aplikované cez CI
   (`supabase db push`/deploy pipeline), buckety existujú (migrácia ich
   vytvára idempotentne).
2. Vercel env: `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY` (server-only), voliteľne `SUPABASE_DB_URL` pre tooling;
   žiadne `RYBOLOV_LOCAL_*` a žiadny `RYBOLOV_STORAGE_DRIVER=file`.
3. `pnpm data:import -- --dry-run` a následný import produkčných dát bez
   `--force` konfliktov; konflikty vyriešiť vedome.
4. `/api/health` na nasadenej inštancii: `persistence` = `ok`,
   readiness bez chýbajúcich povinných položiek.
5. Smoke: registrácia + login + session po redeployi, rezervácia, upload a
   čítanie fotky, export + preview backupu.
6. Zapnuté databázové zálohy/PITR a Security Advisor na Supabase projekte.
7. Kompletné release brány z `docs/deployment/production-platform.md`.

## Rollback

Aplikačný rollback na Verceli nemení dáta v Supabase. Ak treba vrátiť obsah
runtime dokumentov, použi restore z posledného exportu/safety backupu
(`data-backups`). Migrácia `202608260001` je aditívna — starší build bez
Supabase vrstvy na ňu nie je závislý, ale vracať sa k `.data` produkčne už
nie je podporované.
