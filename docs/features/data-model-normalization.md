# Normalizácia dátového modelu a klientske RLS

Stav: **návrh** (27. 8. 2026). Posledná otvorená časť auth plánu
(`docs/features/supabase-auth-migration.md`) — klientske RLS čítania — nemá na
čom stáť, kým runtime dáta žijú ako 18 JSON dokumentov v
`runtime_store_states`. Tento dokument definuje cieľový normalizovaný model,
RLS maticu a poradie migrácie. **Odporúčané načasovanie: až po produkčnom
nasadení** — ide o viactýždňový refaktor so zásahom do backup/restore
subsystému, ktorý predpokladá dokumentový store; robiť ho pred nasadením by
zbytočne blokovalo produkciu bez používateľského prínosu (API vrstva dnes
plní rovnakú funkciu server-side).

## Prečo vôbec

- **Realtime:** live výsledkovka súťaží a live obsadenosť cez Supabase
  Realtime kanály na normalizovaných tabuľkách (dnes polling).
- **Klientske čítania s RLS:** verejné dáta (mapa, schválené úlovky, oznamy)
  čitateľné priamo z klienta bez Nitro roundtripu.
- **Per-user dáta:** rybár číta vlastné rezervácie/výpravy cez
  `auth.uid()`-viazané policies — identita už je pripravená
  (`app_metadata.app_account_id` v JWT).
- **Menšie dokumenty:** dnes každá mutácia prepisuje celý JSON dokument
  (optimistic-lock cez revision) — normalizácia odstráni write amplification.

## Cieľové domény (poradie migrácie)

| # | Doména | Tabuľky (náčrt) | RLS |
| - | ------ | --------------- | --- |
| 1 | Úlovky | `catches`, `catch_photos` (FK) | anon SELECT schválené; angler SELECT vlastné; write server-only |
| 2 | Rezervácie | `reservations`, `reservation_extras` | angler SELECT vlastné (`app_account_id`); anon nič (redigovaná dostupnosť ostáva cez API); write server-only |
| 3 | Súťaže | `tournaments`, `tournament_teams`, `tournament_weighins` | anon SELECT publikované; tím SELECT vlastný sektor; write server-only |
| 4 | Mapa | `map_pegs`, `map_facilities`, `map_shapes` (+ draft variant) | anon SELECT publikovanú verziu; write server-only |
| 5 | Katalógy | `rental_products`, `cabin_products`, `payment_methods`, `sponsors` | anon SELECT aktívne; write server-only |
| 6 | Účty/notifikácie/audit | `account_profiles`, `push_subscriptions`, `audit_events` | prísne server-only, audit append-only |

Zásada: **write path ostáva server-only** (secret key) vo všetkých fázach —
RLS otvára iba čítania. Zápisové policies by vyžadovali preniesť doménové
validácie (Zod + business pravidlá služieb) do Postgresu, čo neplánujeme.

## Postup pre každú doménu (vzor)

1. Migrácia: nové tabuľky + backfill z JSON dokumentu v jednej transakcii;
   dokument ostáva ako read-fallback počas prechodu.
2. Repository vrstva domény prepne čítania/zápisy na tabuľky (service API sa
   nemení — testy služieb ostávajú).
3. `data:import`/`data-export`/restore: doména sa presunie z dokumentovej
   sekcie do tabuľkovej (export formát verzovať — `integrity` blok už
   existuje).
4. RLS policies + integračné testy (vzor v `tests/integration/rls.test.ts`).
5. Až potom prípadné klientske čítanie/Realtime pre konkrétnu obrazovku.
6. Po stabilizácii zmazať JSON dokument domény.

## Riziká

- Backup/restore subsystém (`/api/admin/data-export`, safety backupy) je
  stavaný na dokumenty — treba ho rozšíriť o tabuľkové domény **pred** prvou
  migrovanou doménou, inak vznikne okno bez konzistentných záloh.
- Optimistic-lock semantika (revision na dokument) sa mení na riadkové
  transakcie — dotknuté služby treba prejsť po jednej.
- Dual-read okno pre každú doménu držať krátke; feature flag per doména.

## Definícia hotovo (celok)

Všetkých 6 domén na tabuľkách, `runtime_store_states` obsahuje už len
konfiguračné dokumenty (alebo nič), export/restore pracuje s tabuľkami,
verejná mapa/úlovky/výsledkovka čítané klientsky s RLS + Realtime, RLS
integračná suita pokrýva každú policy.
