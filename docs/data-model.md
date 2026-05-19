# Dátový model

## Princípy

- Public aj interná časť majú čítať rovnaké doménové dáta, ale s rozdielnymi právami.
- UI nemá robiť priame databázové dotazy. Cieľová vrstva je `Page / Component → Composable → Service → Repository → Supabase`.
- Statusy a enumy majú byť typované, nie roztrúsené ako náhodné stringy.
- Model má počítať so samostatnou inštanciou pre každého majiteľa a s 1 až X jazerami v rámci tejto inštancie.

## Multi-tenant jadro

| Entita | Účel |
| --- | --- |
| `venues` | samostatné stredisko alebo prevádzkovateľ |
| `lakes` | jazero v rámci strediska |
| `pegs` | lovné miesto, chata alebo kombinácia miesto + chata |
| `map_layers` | mapové podklady: obrázok, SVG, súťažná mapa |
| `map_points` | body na mape: lovné miesto, chata, sektor, servisný bod |
| `users` | používateľské účty |
| `user_roles` | roly a väzba na venue, jazero, súťaž alebo tím |
| `audit_events` | append-only stopa dôležitých mutácií a rozhodnutí |

## Prevádzka revíru

| Entita | Účel |
| --- | --- |
| `reservations` | rezervácie lovných miest, chát a doplnkov |
| `reservation_items` | položky rezervácie: povolenka, chata, požičovňa, doplnok |
| `payment_methods` | zapínateľné platobné metódy: hotovosť, prevod, budúca brána |
| `rental_items` | požičovňa výbavy |
| `rental_bookings` | rezervované kusy výbavy k termínu |
| `lake_closures` | uzávierky jazera alebo celého strediska |
| `peg_closures` | uzávierky konkrétnych miest alebo chát |
| `season_rules` | sezónne pravidlá, neres, zimný režim, otváracie obdobia |
| `alerts` | výstrahy a prevádzkové oznamy |

## Úlovky

| Entita | Účel |
| --- | --- |
| `catch_records` | úlovok s miestom, časom, váhou, mierou, nástrahou, počasím a stavom schválenia |
| `catch_photos` | fotky úlovku |
| `angler_trip_logs` | skupinová alebo osobná zápisová tabuľka výpravy |
| `trip_members` | rybári v spoločnej výprave |
| `fish_identity_candidates` | budúce AI porovnanie opakovaných jedincov |

## Súťaže

| Entita | Účel |
| --- | --- |
| `tournaments` | preteky a ich pravidlá |
| `tournament_organizations` | organizátor alebo externá organizácia |
| `tournament_sectors` | sektory na mape |
| `tournament_teams` | tímy a ich kontakty |
| `tournament_marshals` | kontrolóri/rozhodcovia |
| `tournament_marshal_sectors` | priradenie kontrolórov k sektorom |
| `tournament_requests` | hlásenia tímov |
| `tournament_catches` | úlovky overené kontrolórom |
| `tournament_penalties` | tresty a napomenutia |
| `tournament_rule_checks` | kontrolné záznamy zo sektorov |

## Sponzori

| Entita | Účel |
| --- | --- |
| `sponsors` | partneri revíru alebo súťaže |
| `sponsor_assets` | logá a vizuály |
| `sponsor_placements` | umiestnenie: homepage, súťaž, sektor, výsledkovka |

## Availability engine

Rezervovateľnosť miesta sa nemá počítať len z tabuľky `reservations`.

Výpočet dostupnosti musí skladať:

- existujúce rezervácie,
- blokácie miesta,
- uzávierku jazera,
- uzávierku celého strediska,
- uzávierku konkrétnych miest cez `pegIds`,
- sezónne pravidlá,
- neres,
- údržbu,
- súťažné termíny,
- pravidlo chata + lovné miesto,
- dostupnosť požičovne.

Výstupom engine má byť stav:

- `available`,
- `limited`,
- `reserved`,
- `blocked`,
- `closed`,
- `requires_approval`.

## Aktuálny prototyp

Aktuálne sú všetky entity seednuté v `app/data/pond.ts`.
Tieto dáta sú zámerne typované a slúžia ako prechodový model pred Supabase.
Prvý databázový kontrakt je pripravený v `supabase/migrations/202605160001_rybolov_cetin_core.sql` a popísaný v `docs/database.md`.
Seed export aktuálnych dát je pripravený cez `app/services/supabaseSeedService.ts` a skript `pnpm seed:export`.
Stránky a komponenty čítajú doménové dáta cez `usePondData()`, `app/services/pondService.ts` a `app/repositories/pondRepository.ts`.
Doménové vstupy sú validované cez `app/schemas/pondSchemas.ts`.
Prvý výpočet rezervovateľnosti je oddelený v `app/utils/availability.ts`, aby UI nepoužívalo iba statický status lovného miesta.
Skupinové zápisníky výprav sú v prototype cez `tripLogbooks` a `tripLogbookEntries`; cieľ je podporiť link alebo kód bez účtu aj neskoršie priradenie k účtu rybára.
Mapový prototyp používa `mapLayers`, `mapShapes` a pomocné SVG funkcie v `app/utils/map.ts`. Produkčný smer je plný SVG editor s nahrateľným podkladovým obrázkom.
Požičovňa má prvý prechodový model cez `rentalBookings`; dostupnosť kusov podľa termínu počíta `app/utils/rentals.ts`.
Rezervácie už v mock modeli nesú kontaktný telefón, povolenku, voliteľnú chatu, výbavu, doplnky, zdroj žiadosti a internú poznámku správcu.
Platobné metódy sú v `paymentMethods`: hotovosť a prevod sú zapnuté, platobná brána je pripravená ako vypnutý budúci modul.
Admin kalendár skladá `reservations`, `lakeClosures` a `pegs` do týždňovej mriežky cez helpery v `app/utils/calendar.ts`.
Admin schvaľovanie používa lokálnu kópiu `reservations` a `rentalBookings` cez `useAdminReservationWorkflow()` a čistú mutačnú logiku v `reservationWorkflowService`; produkčne sa rovnaké rozhranie nahradí repository/Supabase mutáciou.
Úlovky a skupinové zápisníky majú lokálnu kópiu v `.data/rybolov-cetin/catch-state.json`; produkčne sa nahradí tabuľkami `catch_records`, `catch_photos`, `trip_logbooks` a `trip_logbook_entries`. Fotky sa v prototype ukladajú ako súbory do `.data/rybolov-cetin/catch-photos/` a metadata sú v `catchPhotos`. Verejný denník filtruje iba schválené úlovky, `/admin/ulovky` opravuje chyby pred zverejnením, pri korekcii vie presunúť alebo odpojiť väzbu na zápisník, zapisuje stav schválenia s poznámkou správcu a interný report agreguje dôveryhodné úlovky pre správcu vrátane sezónnych okien odvodených z `lakeClosures`, sezónneho porovnania, mesačného trendu, trendu podľa druhu ryby, trendu kombinácie druh + lovné miesto a CSV exportu trendových signálov. `CatchRecord.weather` je prvý prechodový weather snapshot pre teplotu vody/vzduchu, tlak, vietor a oblačnosť; nové zápisy ho dostávajú cez konfigurovateľný provider `mock`, `station`, `manual`, `weather-api` alebo `disabled` a admin korekcia ho prepočíta pri zmene času alebo miesta. Uložené konfigurácie reportov majú lokálnu kópiu v `.data/rybolov-cetin/catch-reports.json` a produkčne smerujú do tabuľky typu `catch_saved_reports` s filtrom, periodicitu, príjemcami a voľbou payloadu.
Audit udalosti majú lokálnu kópiu v `.data/rybolov-cetin/audit-log.json`; produkčne sa nahradia tabuľkou `audit_events` napojenou na venue, aktéra, entitu, závažnosť a detaily zmeny.
