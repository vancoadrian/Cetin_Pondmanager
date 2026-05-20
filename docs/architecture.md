# Architektúra

## Cieľ

Rybolov Cetín má spojiť prevádzku revíru do jednej PWA:

- obsadenosť lovných miest a chát,
- rezervácie a budúce platby,
- evidencia úlovkov s fotkami,
- súťaže so sektorovou mapou,
- push výstrahy a prevádzkové oznamy.

## Navrhované Supabase tabuľky

Prvý návrh je zapísaný aj ako migrácia v `supabase/migrations/202605160001_rybolov_cetin_core.sql`.
Detailnejší popis je v `docs/database.md`.

| Tabuľka | Účel |
| --- | --- |
| `venues` | prevádzkovateľ alebo samostatné nasadenie |
| `lakes` | jazerá, pravidlá, režim, vybavenie |
| `pegs` | lovné miesta, chaty, kapacita, pozícia na mape |
| `users` | používatelia, kontakt, stav účtu |
| `user_roles` | roly owner, manager, tournament_organizer, marshal, tournament_team, accountant, worker, angler |
| `payment_methods` | zapínateľné spôsoby platby: hotovosť, prevod, budúca brána |
| `reservations` | termíny, rybári, platby, stav schválenia |
| `catch_records` | druh, váha, miera, nástraha, čas, miesto, počasie, rybár, stav schválenia |
| `catch_photos` | fotky k úlovkom a budúce AI embeddingy |
| `lake_closures` | uzávierky pre sezónu, neres, údržbu, preteky a mimoriadne stavy |
| `alerts` | búrky, servis, prevádzkové oznamy |
| `tournaments` | preteky, termíny, pravidlá |
| `tournament_sectors` | sektor, tím, priebežná váha |
| `tournament_marshals` | kontrolóri/rozhodcovia, kontakt, stav služby |
| `tournament_marshal_sectors` | priradenie kontrolórov k sektorom |
| `tournament_requests` | hlásenia tímov: úlovok, porušenie pravidiel, technická pomoc |
| `tournament_catches` | súťažné úlovky overené kontrolórom |
| `tournament_penalties` | napomenutia, stop lovu, zníženie počtu prútov, odvolanie |
| `tournament_rule_checks` | kontroly sektorov a záznam zistení |
| `sponsors` | partneri revíru alebo súťaže |
| `sponsor_placements` | umiestnenie partnerov: homepage, sektor, súťaž, výsledkovka |
| `push_subscriptions` | web push odbery zariadení |
| `audit_events` | audit stopa lokálnych a produkčných mutácií |

## Roly

| Rola | Práva |
| --- | --- |
| `owner` | všetko vrátane nastavení revíru |
| `manager` | rezervácie, miesta, výstrahy |
| `tournament_organizer` | súťaže, sektory, tímy, pravidlá a výsledkovka |
| `marshal` | pridelené sektory, kontroly pravidiel, merania, tresty |
| `tournament_team` | vlastný sektor, hlásenie úlovku, hlásenie porušenia, námietky |
| `accountant` | platby, rezervácie, exporty a účtovné podklady |
| `worker` | nástupy, požičovňa, údržba a prevádzkové úlohy |
| `angler` | vlastné rezervácie a úlovky mimo súťaže |
| `public` | verejný prehľad, kontakt, pravidlá |

## Public vs interné

Public časť obsahuje prehľad revíru, mapu, obsadenosť, pravidlá, kontakt, sponzorov a verejné súťažné informácie.
Interná časť obsahuje admin dashboard, uzávierky, schvaľovanie rezervácií, požičovňu, notifikácie, sponzorské umiestnenia a súťažný dispečing.

Notifikačná vrstva má prechodový lokálny store `.data/rybolov-cetin/notification-state.json`. Verejná PWA stránka ukladá odbery zariadení cez `/api/notifications/subscribe`, vie ich vypnúť cez `/api/notifications/unsubscribe` a číta aktívne oznamy cez `/api/notifications`. Admin `/admin/notifikacie` pripravuje nový verejný oznam a mock broadcast cez `/api/admin/notifications/broadcast`; broadcast zatiaľ počíta cieľové odbery podľa okruhov a zapisuje audit udalosť, reálny Web Push dispatcher príde po doplnení VAPID kľúčov.
V prototype je interná časť mocknutá cez cookie login. Produkčne ju nahradí auth, role-based access control a row-level security.

## Dátová vrstva v prototype

Aktuálny smer toku dát je:

`Page / Component → usePondData → pondService → pondRepository → app/data/pond.ts`

`app/data/pond.ts` je stále seed zdroj, ale stránky už nemajú importovať hodnoty priamo. Výmena za Supabase má prebehnúť tak, že pribudne Supabase repository s rovnakým kontraktom ako mock repository.

Kapacitné výpočty mimo samotných miest sú oddelené do utility vrstvy. Požičovňa používa `app/utils/rentals.ts`, ktorý skladá `rentalItems` a `rentalBookings` do vysvetliteľného stavu pre public rezerváciu aj admin sklad.
Úlovkové reporty používajú `app/utils/catchAnalytics.ts`. Utility vrstva počíta agregácie zo schválených úlovkov vrátane weather snapshotov, skladá sezónne okná z pravidiel a uzávierok revíru, aplikuje filtre pre admin report, generuje surový CSV úlovkov aj manažérsky CSV trendových signálov, porovnáva aktuálne obdobie s rovnakým obdobím minulý rok, skladá mesačný trend váhy úlovkov, trend podľa druhu ryby, trend kombinácie druh + lovné miesto a dá sa neskôr nahradiť Supabase materialized view.

Uložené reporty úlovkov rieši `app/services/catchReportService.ts`. Správca vie v `/admin/ulovky` uložiť aktuálny filter ako manuálny, týždenný alebo mesačný report s cieľovou rolou, príjemcami a výberom payloadu. Rovnaká service vrstva vie uložený report vygenerovať do súhrnu, CSV úlovkov a CSV trendových signálov, pripraviť e-mailový draft s prílohami a spustiť plánovač splatných týždenných alebo mesačných reportov. Doručovací provider má režimy `mock`, `resend` a `disabled`; pri `resend` služba volá Resend Email API endpoint z `.env` a do delivery logu uloží stav `sent` alebo `failed`. Lokálny prechodový store je `.data/rybolov-cetin/catch-reports.json`; produkčne sa má nahradiť tabuľkou report definícií, delivery logom a cron/serverless plánovačom. Serverless vstup je oddelený cez `/api/cron/catch-reports/run-due` a chránený `RYBOLOV_REPORT_SCHEDULER_SECRET`.

Weather snapshot pri nových úlovkoch rieši `app/services/catchWeatherService.ts`. Teraz ide o konfigurovateľný resolver s providermi `mock`, `station`, `manual`, `weather-api` a `disabled`. Deterministický mock zostáva fallback, station/manual vie použiť kompletný snapshot z prostredia a `weather-api` drží miesto pre konkrétny externý adaptér bez zmeny kontraktu úlovkových služieb.

Admin schvaľovanie rezervácií má prvú mutačnú service vrstvu v `app/services/reservationWorkflowService.ts`.
Obrazovka `/admin/rezervacie` ju používa cez `useAdminReservationWorkflow()`. Kým nie je pripravený Supabase, stav rezervácií a výpožičiek sa číta a zapisuje cez lokálny JSON store.
Audit udalosti sa zapisujú do samostatného lokálneho store `.data/rybolov-cetin/audit-log.json`, aby každá mutácia mala stopu mimo doménového stavu.

Prvá API vrstva je pripravená nad rovnakými službami:

- `GET /api/reservations` vracia aktuálny lokálny stav rezervácií a výpožičiek.
- `POST /api/reservations` prijíma verejnú žiadosť, overí ju cez `reservationApiService` a uloží pending rezerváciu s výpožičkami.
- `POST /api/admin/reservations/:id/decision` prijíma admin rozhodnutie, používa rovnaký workflow service ako admin obrazovka a zapisuje výsledok.
- `GET /api/catches` vracia lokálny stav úlovkov, skupinových zápisníkov a riadkov zápisníkov.
- `POST /api/catches` validuje úlovok, voliteľne ho priradí do kompatibilného zápisníka a uloží ho do lokálneho store v stave čakajúcom na schválenie.
- `GET /api/catch-photos/:id` vráti binárnu fotku z lokálneho mock storage adresára `.data/rybolov-cetin/catch-photos/`.
- `POST /api/admin/catches/:id/correction` opravuje údaje úlovku pred zverejnením a vie ponechať, presunúť alebo odpojiť väzbu na skupinový zápisník.
- `POST /api/admin/catches/:id/decision` schvaľuje, vracia do kontroly alebo zamieta úlovok pred verejným zobrazením.
- `GET /api/admin/catch-reports` vracia uložené konfigurácie interných reportov úlovkov.
- `POST /api/admin/catch-reports` uloží alebo aktualizuje report z aktuálneho filtra a zapíše audit udalosť.
- `POST /api/admin/catch-reports/:id/generate` vygeneruje reportový payload, uloží `lastGeneratedAt` a zapíše audit udalosť.
- `POST /api/admin/catch-reports/:id/email-draft` pripraví e-mailový draft reportu, uloží delivery log a zapíše audit udalosť.
- `POST /api/admin/catch-reports/run-due` spustí splatné týždenné a mesačné reporty, aktualizuje lokálny store a zapíše audit udalosť.
- `GET/POST /api/cron/catch-reports/run-due` spustí rovnaký plánovač pre hostingový cron, ale iba so správnym `Authorization: Bearer <secret>` alebo `x-rybolov-cron-secret`.
- `GET /api/notifications` vracia verejné oznamy a počet aktívnych PWA odberov.
- `POST /api/notifications/subscribe` uloží alebo aktualizuje PWA odber zariadenia.
- `POST /api/notifications/unsubscribe` vypne uložený PWA odber zariadenia.
- `GET /api/admin/notifications` vracia interný stav oznamov, odberov a broadcastov.
- `POST /api/admin/notifications/broadcast` vytvorí verejný oznam, mock broadcast a audit udalosť.
- `POST /api/logbooks` vytvorí aktívny osobný, skupinový alebo súťažný zápisník výpravy.
- `GET /api/tournaments` vracia lokálny stav súťaží, kontrolórov, hlásení, vážení, trestov a kontrol.
- `POST /api/tournament-requests` validuje tímové hlásenie a uloží ho do súťažného dispečingu.
- `POST /api/admin/tournaments/requests/:id/action` priraďuje kontrolóra alebo uzatvára hlásenie.
- `POST /api/admin/tournaments/catches/:id/verify` overuje čakajúce súťažné váženie.
- `POST /api/admin/tournaments/penalties` vytvorí trest a zrkadlí ho do kontroly pravidiel.
- `POST /api/admin/tournaments/rule-checks` vytvorí samostatnú kontrolu pravidiel sektora.
- `GET /api/admin/audit` vracia posledné audit udalosti pre internú obrazovku `/admin/audit`.

Endpointy sú stále backend-agnostické. Ich zmysel je ustáliť kontrakt pred tým, než sa lokálny JSON store nahradí Supabase repository.

## Validácie vstupov

Doménové formuláre používajú Zod schémy v `app/schemas/pondSchemas.ts`.

Aktuálne validované vstupy:

- žiadosť o rezerváciu,
- úlovok,
- fotka úlovku,
- admin korekcia úlovku,
- admin rozhodnutie o úlovku,
- skupinový zápisník výpravy,
- súťažné hlásenie tímu,
- súťažný trest,
- kontrola pravidiel v sektore,
- mapový bod v admin editore.

Rovnaké schémy majú zostať použiteľné aj pre API route alebo server action pri prechode na Supabase.

## Testy a kvalita

Projekt má Vitest nastavený cez `vitest.config.ts`, vrátane Nuxt aliasov pre `~/data`, `~/utils` a `~/services`.

Aktuálne pokrytie je sústredené na čistú doménovú logiku a kontrakty, ktoré budú neskôr napojené na backend:

- `tests/availability.test.ts` kontroluje prekrývanie termínov, uzávierky, údržbu, rezervácie a neresový režim.
- `tests/rentals.test.ts` kontroluje kapacitu požičovne podľa termínu a ignorovanie vrátených/zrušených blokácií.
- `tests/reservationWorkflowService.test.ts` kontroluje lokálne schvaľovanie, zamietnutie a telefonický follow-up rezervácie.
- `tests/reservationApiService.test.ts` kontroluje rezervačný API kontrakt pre verejnú žiadosť a admin rozhodnutie.
- `tests/catchApiService.test.ts` kontroluje lokálny API kontrakt pre úlovky a skupinové zápisníky.
- `tests/catchCorrectionService.test.ts` kontroluje admin opravy úlovkov, zrkadlenie, presun a odpojenie zápisníkov.
- `tests/catchModerationService.test.ts` kontroluje admin rozhodnutia nad úlovkami pred zverejnením.
- `tests/catchWeatherService.test.ts` kontroluje automatický mock weather snapshot, provider konfiguráciu, station/manual hodnoty, fallback a vypnutie snapshotov.
- `tests/catchReportService.test.ts` kontroluje uložené reporty, normalizáciu príjemcov, validácie payloadu, generovanie reportových výstupov, e-mailové drafty a delivery provider konfiguráciu.
- `tests/catchAnalytics.test.ts` kontroluje interné agregácie úlovkov, report filtre, CSV exporty, sezónne okná, sezónne porovnanie, mesačný trend, trend podľa druhu a trend druh + lovné miesto.
- `tests/localCatchStore.test.ts` kontroluje JSON store pre úlovky a zápisníky.
- `tests/localCatchReportStore.test.ts` kontroluje JSON store pre uložené reporty úlovkov.
- `tests/localCatchPhotoStore.test.ts` kontroluje lokálne uloženie a načítanie binárnych fotiek úlovkov.
- `tests/tournamentApiService.test.ts` kontroluje lokálny API kontrakt pre súťažné hlásenia, priradenie kontrolóra, overenie váženia, tresty a kontroly pravidiel.
- `tests/localTournamentStore.test.ts` kontroluje JSON store pre súťažný dispečing.
- `tests/auditLogService.test.ts` kontroluje tvorbu a filtrovanie audit udalostí.
- `tests/localAuditLogStore.test.ts` kontroluje JSON store pre lokálny audit log.
- `tests/pondSchemas.test.ts` kontroluje Zod vstupy pre rezervácie, úlovky, skupinové zápisníky, súťažné hlásenia a mapové body.
- `tests/pondService.test.ts` kontroluje konzistenciu seed referencií a základné helpery `pondService`.

Tento smer je zámerný: logika, ktorú neskôr presunieme na Supabase mutácie alebo API routes, má zostať testovateľná mimo UI.

## Súťažný workflow

1. Organizátor vytvorí súťaž, sektory, tímy a priradí kontrolórov k sektorom.
2. Tím pri úlovku odošle požiadavku typu `catch-measurement`.
3. Dispečing alebo systém priradí požiadavku kontrolórovi podľa sektora.
4. Kontrolór príde k tímu, overí manipuláciu s rybou, váhu, mieru, fotku a pustenie ryby.
5. Overený úlovok sa zapíše do `tournament_catches` a prepočíta rebríček sektora/tímu.
6. Pri porušení pravidiel kontrolór vytvorí záznam v `tournament_penalties`.
7. Trest môže mať typ napomenutie, stop lovu na N hodín, zníženie počtu prútov na N hodín alebo stav na posúdenie organizátorom.
8. Tímy môžu cez `tournament_requests` hlásiť porušenie iného tímu, technický problém alebo iné udalosti.

## Ďalšie kroky

1. Pripraviť seed/import skript pre Cetín z aktuálnych mock dát.
2. Pripojiť Supabase env premenné a auth client, keď bude projekt vytvorený.
3. Pridať Supabase repository implementáciu za existujúci `pondService`.
4. Pridať upload fotiek úlovkov do Supabase Storage.
5. Pridať VAPID kľúče a reálne odosielanie push notifikácií.
