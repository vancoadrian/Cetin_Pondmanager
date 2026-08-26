# Databázový kontrakt

## Stav

Prvá Supabase migrácia je v `supabase/migrations/202605160001_rybolov_cetin_core.sql`.

Migrácia zatiaľ neslúži ako finálne produkčné rozhodnutie o každom stĺpci. Je to pracovný kontrakt medzi prototypom a budúcim backendom: pomenúva tabuľky, vzťahy, enumy, indexy a základné RLS politiky tak, aby sa dalo pokračovať na repository implementácii bez ďalšieho veľkého prepisu.

Prvý seed export aktuálnych mock dát vzniká cez `pnpm seed:export` do `supabase/seed/rybolov-cetin.seed.json` a vykonateľného `supabase/seed.sql`. Export používa deterministické UUID, takže sa dá opakovane regenerovať bez rozbitia referencií. SQL používa explicitné poradie závislostí, transakciu a `on conflict do nothing`; neupravuje sa ručne.

## Lokálny Supabase

Projekt má lokálny Supabase CLI/Docker profil v `supabase/config.toml`:

- API `http://127.0.0.1:54321`,
- PostgreSQL `127.0.0.1:54322`,
- Studio `http://127.0.0.1:54323`,
- Mailpit `http://127.0.0.1:54324`,
- privátne Storage buckety `catch-photos`, `sponsor-assets`, `map-assets` a `data-backups`.

Prvé spustenie:

```bash
pnpm supabase:start
pnpm local:setup
```

`local:setup` načíta lokálne Supabase URL/kľúče, zachová alebo vytvorí VAPID pár a zapíše ignorovaný `.env` s právami `0600`. Tajomstvá nevypisuje. Pri zmene migrácie alebo seed dát:

```bash
pnpm seed:export
pnpm supabase:reset
```

Reset musí skončiť bez chyby, anonymous REST čítanie verejných dát musí prejsť cez RLS a v databáze musia zostať všetky štyri Storage buckety. Lokálny stack nie je určený na verejné vystavenie ani produkciu.

Supabase CLI už automaticky nevystavuje nové tabuľky Data API rolám. Migrácia `202607150001_explicit_api_grants.sql` preto udeľuje oprávnenia existujúcim tabuľkám explicitne; nové tabuľky musia mať vlastné granty aj RLS politiky v tej istej migrácii. Budúce tabuľky sa anonymous roli neudeľujú cez default privileges.

## Runtime perzistencia

Migrácia `supabase/migrations/202608260001_runtime_state_sessions_and_buckets.sql` presúva runtime stav aplikácie z bývalých `.data/rybolov-cetin` JSON súborov do databázy a Storage. Prístupové testy sú v `tests/integration/runtimeStores.test.ts` a jednorazový import legacy `.data` dát rieši idempotentný `pnpm data:import` (bez `--force` nikdy nič neprepíše).

`public.runtime_store_states` drží každý runtime store ako jeden verzovaný jsonb dokument; názov dokumentu je pôvodný názov súboru bez `.json` (napr. `reservation-state`, `tournament-state`, `audit-log`, `catch-reports`):

- `name` — primárny kľúč s check constraintom na tvar `[a-z0-9][a-z0-9-]*`,
- `payload` — jsonb obsah store,
- `revision` — bigint pre optimistické zamykanie, štartuje na 1,
- `created_at`, `updated_at` — timestamptz.

Zápisy idú výhradne cez atomické RPC funkcie: `runtime_store_upsert(store_name, store_payload)` vloží alebo prepíše dokument a zvýši revíziu, `runtime_store_compare_and_set(store_name, store_payload, expected_revision)` zapíše iba pri zhode očakávanej revízie a vráti boolean, takže cross-instance mutácie nekolidujú.

`public.app_sessions` nahrádza bývalý `session-state.json` a drží cookie sessions aplikačných účtov:

- `token_hash` — primárny kľúč,
- `account_id`, `role` — identita a rola session,
- `created_at`, `expires_at` — timestamptz,
- indexy `app_sessions_account_id_idx` a `app_sessions_expires_at_idx`.

Obe tabuľky sú výhradne serverové: RLS je zapnuté bez policies, granty pre `anon`/`authenticated` sú odobraté a execute na oboch RPC má iba `service_role`. Všetko tečie cez serverové endpointy so service-role klientom; klientske RLS toky ostávajú pre normalizované doménové tabuľky z core migrácie.

Binárne assety žijú v privátnych Storage bucketoch bez storage policies, takže každý asset sa vydáva iba cez serverové endpointy:

| Bucket | Limit | MIME typy |
| --- | --- | --- |
| `catch-photos` | 15 MiB | `image/avif`, `image/jpeg`, `image/png`, `image/webp` |
| `sponsor-assets` | 10 MiB | `image/avif`, `image/jpeg`, `image/png`, `image/svg+xml`, `image/webp` |
| `map-assets` | 15 MiB | `image/jpeg`, `image/png`, `image/webp` |
| `data-backups` | 50 MiB | `application/json` |

Filesystem layout `.data/rybolov-cetin` prežíva iba ako explicitný dev/test adaptér `RYBOLOV_STORAGE_DRIVER=file`; v produkcii je zakázaný a žiadny tichý fallback neexistuje (detaily v `docs/architecture.md`).

## Multi-tenant jadro

- `venues` reprezentuje samostatnú inštanciu jedného majiteľa alebo prevádzkovateľa.
- `lakes` patria pod venue, takže jedna inštancia môže mať 1 až X jazier.
- `pegs` patria pod jazero a nesú mapovú pozíciu, kapacitu, typ miesto/chata a pravidlo `requires_cabin_reservation`.
- `map_layers` držia obrázkový alebo SVG podklad vrátane `image_settings` pre napasovanie obrázka.
- `map_facilities` patria pod jazero a držia servisné body ako WC, sprchy, sklad, drevo, elektrická rozvodňa, vjazd alebo recepcia.
- `map_shapes` patria pod jazero a držia polygonové plochy pre vodnú oblasť, zákaz, súťažný sektor alebo servisnú zónu; sektorový polygon sa môže voliteľne viazať na `tournaments` a `tournament_sectors`.
- `user_roles` viaže používateľa na venue, prípadne jazero alebo súťaž.

Roly sú: `owner`, `manager`, `tournament_organizer`, `marshal`, `tournament_team`, `accountant`, `worker`, `angler`.

Notifikačný kontrakt počíta s verejnými oznamami v `alerts`, topicmi v `target_topics` a interným cieľovaním v `target_audience`. `push_subscriptions` nesú bežné push údaje aj `topics`, `audience_role` a `audience_scope`, aby bolo možné cieliť súťažné správy na organizátora, kontrolóra, konkrétne sektory alebo konkrétneho kontrolóra. `notification_delivery_logs` drží stav doručenia po zariadeniach, provider, endpoint, hlášku a čas pokusu.

## Prevádzka revíru

Rezervácie sú rozdelené na:

- `reservations` ako hlavička termínu,
- `reservation_items` ako budúci univerzálny košík,
- `payment_methods` ako zapínateľné spôsoby platby: hotovosť, prevod a budúca brána,
- `rental_bookings` ako termínové blokovanie skladových položiek,
- `lake_closures` a `lake_closure_pegs` pre uzávierky celého venue, jazera alebo konkrétnych miest,
- `season_rules` pre opakované pravidlá typu zima alebo neres.
- `place_issues` pre nahlásené nedostatky na mieste, chate, jazere alebo servisnom bode vrátane priority, stavu, kontaktu a interného riešenia.

`reservations` ukladajú povinný telefón a voliteľný `contact_email`, aby správca mohol po rozhodnutí pripraviť e-mailový draft alebo zostať pri telefonickom/SMS potvrdení.

Tento model zodpovedá aktuálnemu availability engine: dostupnosť sa nemá čítať iba z jednej tabuľky.

## Úlovky a výpravy

- `catch_records` drží druh, váhu, mieru, nástrahu, čas, miesto, počasie pri zábere, viditeľnosť, stav schválenia a review poznámku správcu. Počasie vie prísť z mock providera, manuálneho snapshotu, lokálnej meteostanice alebo serverového Open-Meteo kompatibilného weather API adaptéra.
- `catch_photos` drží názov súboru, MIME typ, veľkosť, storage cestu, verejnú URL a budúci AI stav.
- `trip_logbooks`, `trip_logbook_members`, `trip_logbook_pegs` a `trip_logbook_entries` pokrývajú skupinové zapisovacie tabuľky výprav.
- `tagged_fish` drží unikátne číslo čipu v rámci prevádzkovateľa, meno ryby, druh, stav a prvé označenie.
- `fish_observations` drží časovú históriu váhy, dĺžky, jazera, stanoviska, nástrahy, rybára a osoby, ktorá čip načítala. Voliteľne odkazuje na `catch_records` alebo `tournament_catches`.
- `lakes` nesie aj zapínateľné pravidlo veľkej ryby: limit váhy, spôsob kontaktu, telefón, e-mail, prevádzkový pokyn, pokyn mimo služby, týždenné kontaktné okná a dočasné potvrdenie prítomnosti správcu v JSON.
- `fish_identity_candidates` je pripravené pre budúce porovnávanie opakovaných jedincov.

## Súťaže

Súťažný model obsahuje:

- organizáciu a súťaž,
- sektory a tímy,
- kontrolórov a ich priradenie k sektorom,
- hlásenia tímov,
- kontrolórsky overené úlovky,
- tresty,
- kontroly pravidiel.

Tým je pokrytý scenár, kde tím požiada o príchod kontrolóra, kontrolór váži úlovok, zapíše trest alebo rieši hlásenie porušenia pravidiel. `tournament_requests.action_client_mutation_id`, `tournament_catches.verification_client_mutation_id`, `tournament_penalties.client_mutation_id` a `tournament_rule_checks.client_mutation_id` majú unikátne indexy v rámci súťaže, aby offline retry kontrolórskych úkonov nevytváral duplicity.

## RLS princíp

Migrácia zapína RLS na všetkých aplikačných tabuľkách.

Základné pravidlá:

- public číta len verejné a aktívne dáta,
- `owner` a `manager` spravujú venue-scoped dáta,
- `tournament_organizer`, `marshal` a `tournament_team` majú prístup cez súťažné politiky,
- `accountant` číta platobné a rezervačné podklady,
- `worker` číta prevádzkové rezervácie a výbavu potrebnú pri vode,
- rybár vidí vlastné rezervácie, úlovky, zápisníky a push odbery,
- citlivé prevádzkové dáta majú ísť cez server/API alebo service role.

## Audit log

`audit_events` je pripravená tabuľka pre append-only stopu mutácií. Prototyp už zapisuje rovnaký koncept do runtime store `audit-log` (dokument v `runtime_store_states`) pri rezerváciách, úlovkoch, registrácii a meraní čipovaných rýb, hláseniach nedostatkov, zápisníkoch, mapových úpravách, súťažných akciách a systémových backup/restore úkonoch.

## Ďalší krok

Runtime store dokumenty, sessions aj assety už bežia na Supabase. Ďalšie implementačné kroky sú:

1. presunúť klientske čítania na publishable-key Supabase repositories s RLS nad normalizovanými tabuľkami z core migrácie,
2. pridať RLS integračné testy pre anonymous, angler, team, marshal a prevádzkové roly,
3. presunúť rezervačné a notifikačné mutácie z runtime store dokumentov na normalizované tabuľky,
4. nahradiť aplikačný scrypt/cookie login Supabase Auth,
5. nasadiť SSR/API na Vercel podľa release brán v `docs/deployment/production-platform.md` (produkčný Supabase projekt, migrácie, `pnpm data:import`, env premenné).
