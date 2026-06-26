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
| `map_facilities` | servisné body mapy, napríklad WC, sprchy, sklad, drevo, rozvodňa, vjazd, recepcia |
| `map_shapes` | polygonové plochy mapy, napríklad voda, zákazy, sektory a servisné zóny vrátane väzby na súťažný sektor |
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
| `notification_delivery_logs` | stav doručenia notifikácií po zariadeniach |
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

Sponzorský modul používa lokálny store `.data/rybolov-cetin/sponsor-state.json`. Public API `/api/sponsors` vracia iba aktívnych partnerov, admin API `/api/admin/sponsors` vracia celý zoznam a `PUT /api/admin/sponsors` zapisuje zmeny vrátane audit udalosti. Logo upload zapisuje súbory do `.data/rybolov-cetin/sponsor-assets/` a verejne ich servuje cez `/api/sponsor-assets/:id`; text loga ostáva fallback. Upload posiela aj šírku a výšku obrázka, takže validácia vie odlíšiť homepage, footer, výsledkovku, sektor a bežnú stránku sponzorov. `getSponsorLogo()` vyberá najprv variant pre konkrétne umiestnenie, potom všeobecný variant a potom hlavné logo. `sponsorPlacements` filtruje aktívnych partnerov pre súťažné sloty `tournament`, `sector` a `scoreboard`; používajú ho verejné súťaže aj admin dispečing. `sponsorLogoVariants` drží jednotné cieľové rozmery a výpočet canvas draw boxu pre hromadné generovanie variantov v admine vrátane X/Y ohniska pri cover oreze; admin UI vie ohnisko nastaviť posuvníkmi alebo priamo v náhľade cez pointer eventy. Zdrojové logo pre generovanie variantov sa dá uložiť ako samostatný lokálny asset a znovu použiť po reloade. Vygenerovaný variant ukladá `cropPreset`, takže lokálny store aj Supabase seed vedia zachovať spôsob vzniku assetu. Štruktúrované polia umiestnenia v prototype pripravujú budúcu tabuľku `sponsor_placements`: typ umiestnenia, poradie, platnosť od-do, súťaž a sektor.

Notifikačná vrstva má prechodový lokálny store `.data/rybolov-cetin/notification-state.json`. Verejná PWA stránka ukladá odbery zariadení cez `/api/notifications/subscribe`, vie ich vypnúť cez `/api/notifications/unsubscribe` a číta aktívne oznamy cez `/api/notifications`. Klientsky odber používa browser Push API, service worker a verejný VAPID kľúč; ak chýba podpora browsera alebo kľúč, stránka ostane funkčná cez mock fallback a zobrazí dôvod. Public subscribe orezáva internú audience vrstvu; mock interné odbery s rolou, turnajom, sektormi a kontrolórom vytvára iba admin endpoint `/api/admin/notifications/subscriptions`. Admin `/admin/notifikacie` pripravuje nový verejný oznam a mock broadcast cez `/api/admin/notifications/broadcast`; broadcast počíta cieľové odbery podľa okruhov a voliteľnej internej audience (`roles`, `tournamentId`, `sectorIds`, `marshalIds`), spúšťa delivery provider `mock`, `disabled` alebo `web-push`, zapisuje delivery log po zariadeniach a audit udalosť. Interný endpoint `/api/admin/notifications/test-broadcast` používa rovnaký delivery runner, ale nepridá alert do verejnej stránky výstrah; admin výpisy vedia verejné broadcasty a interné testy filtrovať oddelene vrátane delivery logov a odbery zariadení filtrovať podľa aktívnosti, interného alebo verejného typu a odoberaného okruhu. Endpoint `/api/admin/notifications/test-cleanup` čistí iba staré interné testy podľa retencie, ponechá zvolený počet posledných testov, odstráni ich delivery logy a zapíše audit. Web Push provider používa serverový `web-push` adaptér s VAPID nastavením, TTL, timeoutom a urgenciou z env; admin obrazovka zároveň ukazuje diagnostiku provideru, chýbajúce VAPID premenné a stav pripravenosti reálneho odosielania. VAPID pár sa dá vygenerovať cez `pnpm push:vapid`. Súťažný dispečing používa rovnaký dispatcher pri novom tímovom hlásení a pri priradení kontrolóra: hlásenie tímu cieli organizátora a kontrolórov daného sektora, priradenie cieli konkrétneho kontrolóra. Hlásenie nedostatku z public mapy pripravuje service broadcast pre interné role owner, manager a worker; verejné service odbery bez internej role ho nedostanú.

Privolanie správcu k veľkej rybe používa `POST /api/large-fish-assistance`, samostatný lokálny store a interný service broadcast pre owner/manager odbery. Push odkaz otvorí konkrétne privolanie v `/admin/ryby`. Odpoveď ide cez chránený admin endpoint a verejná stránka ju číta iba s tokenom požiadavky; odpoveď sa nepublikuje ako verejný oznam. Samotné `POST /api/catches` navyše pri úlovku nad limitom jazera pripraví nenaliehavý interný broadcast s odkazom `/admin/ulovky?catchId=...`. Dispatcher porovná jazero, miesto, rybára, druh, rozmery a čas s privolaniami správcu a pri zhode fallback notifikáciu potlačí.

Offline režim je riešený v app shelli cez `ConnectionStatusBanner`, stránkou `/offline` a Workbox runtime cache. Verejné API pre výstrahy, mapu, rezervácie, úlovky a súťaže používa `NetworkFirst` cache s krátkym timeoutom, obrázky revíru používajú `StaleWhileRevalidate`. Verejné formuláre a admin súťažný dispečing používajú spoločnú IndexedDB databázu `rybolov-cetin-offline` cez `offlineQueueDb`, ktorá drží samostatné store pre rezervácie, úlovky, súťažné hlásenia a kontrolórske admin úkony. Sieťové zlyhanie bez HTTP statusu uloží validovaný payload do zariadenia, návrat online stavu spustí opakované odoslanie na `POST /api/reservations`, `POST /api/catches`, `POST /api/tournament-requests` alebo príslušný admin endpoint pre overenie váženia, trest a kontrolu pravidiel; záznam zostáva vo fronte, ak ho server odmietne validáciou. Kontrolórske admin úkony majú `clientMutationId`, takže opakovaný sync neprepíše váženie novým časom a nevytvorí duplicitný trest, kontrolu ani audit udalosť. Stránka `/offline` je zároveň centrum fronty: vie spočítať všetky čakajúce položky, zvýrazniť položky na kontrolu, zobraziť počet pokusov a poslednú chybu, prekliknúť späť do príslušného formulára, odstrániť jednotlivé položky a ručne spustiť hromadné odoslanie. `useOfflineQueueSummary` číta počty front pre app shell a `OFFLINE_QUEUE_CHANGED_EVENT` aktualizuje header badge po lokálnych zmenách fronty.

Observability vrstva je prvý krok pred produkčným monitoringom. Verejný `/api/health` vracia stav `ok`, `degraded` alebo `down` podľa runtime, zapisovateľnosti lokálneho dátového adresára, environment readiness, pripravenosti notifikačného provideru a počtu posledných chýb. Admin modul `/admin/system` číta detailný `/api/admin/system`, ukazuje rovnaké health checky, cestu lokálneho dátového adresára, readiness profil dev/stage/prod, posledné zachytené chyby a súhrn lokálneho data exportu. Lokálny data panel skladá prevádzkový checklist z aktuálneho súhrnu, posledných audit udalostí, import preview a safety backup archívu, aby bolo vidieť stav krokov aktuálny stav → export → kontrola → obnova → archív. Readiness report kontroluje `RYBOLOV_ENVIRONMENT`, verejnú URL, perzistentný lokálny dátový adresár, Web Push/VAPID, Resend reporty, cron secret a weather provider podľa aktuálneho profilu. Klientsky plugin `client-error-reporter.client.ts` zachytáva Vue chyby, `window.error` a `unhandledrejection`, posiela skrátený payload na `/api/client-errors` a server ho ukladá do `.data/rybolov-cetin/error-log.json`. Admin endpoint `/api/admin/data-export` skladá jeden JSON backup z lokálnych store a asset adresárov; `assets=manifest` ponechá súbory ako inventár, `assets=inline` ich vloží do JSON ako base64 pre jednorazový presun. Nové exporty obsahujú `integrity` blok so SHA-256 checksumom kanonického payloadu bez samotného odtlačku. Endpoint `/api/admin/data-import/preview` validuje nahratý backup, overí integritu, porovnáva store s aktuálnym modelom a vracia upozornenia bez zápisu do `.data`; staršie backupy bez odtlačku zostávajú použiteľné, ale majú stav integrity `missing`. Endpoint `/api/admin/data-import/restore` vyžaduje frázu `OBNOVIT DATA`, odmietne neplatný alebo iba súhrnný export, pred zápisom vytvorí safety backup aktuálneho stavu v `.data/rybolov-cetin/backups/` a obnoví iba známe store; inline assety zapíše iba pri `assetPolicy=inline`. Endpointy `/api/admin/data-backups` a `/api/admin/data-backups/:id` listujú a načítajú iba rozpoznané safety backup JSON súbory; reálne stiahnutie používa `?download=1`. Endpoint `/api/admin/data-backups/cleanup` najprv v dry-run režime vráti kandidátov na odstránenie podľa počtu najnovších backupov, ostré čistenie vyžaduje frázu `VYCISTIT BACKUPY` a maže len rozpoznané safety backup súbory. Stiahnutie backupu, preview, úspešný restore, načítanie safety backupu, jeho stiahnutie aj retencia zapisujú systémovú audit udalosť. Produkčne sa táto vrstva nahradí alebo rozšíri o externý error reporting, uptime monitor a databázové zálohy.

Prihlásenie používa jednotný e-mailový a heslový formulár s cookie session. Globálny middleware oddeľuje rybársky účet, tímový panel, kontrolórsky panel, organizačný dispečing a prevádzkový admin. Spoločná access matrix v `app/utils/adminAccess.ts` riadi internú navigáciu, dashboard a route guard pre admin moduly. `useAdminModuleAccess()` premieta režimy `plný`, `prevádzka` a `prehľad` do zápisových akcií; exporty úlovkov ostávajú dostupné aj pre účtovnícky read-only režim. Rovnakú matrix používa `server/utils/adminAccessGuard.ts` pre `/api/admin/*`, takže server rozlišuje neprihlásený stav `401` a nedostatočné oprávnenie `403`.

## Dátová vrstva v prototype

Aktuálny smer toku dát je:

`Page / Component → usePondData → pondService → pondRepository → app/data/pond.ts`

`app/data/pond.ts` je stále seed zdroj, ale stránky už nemajú importovať hodnoty priamo. Výmena za Supabase má prebehnúť tak, že pribudne Supabase repository s rovnakým kontraktom ako mock repository.

Kapacitné výpočty mimo samotných miest sú oddelené do utility vrstvy. Požičovňa používa `app/utils/rentals.ts`, ktorý skladá `rentalItems` a `rentalBookings` do vysvetliteľného stavu pre public rezerváciu aj admin sklad. Katalóg položiek a doplnkov má prechodový store `.data/rybolov-cetin/rental-catalog-state.json`, public endpoint vracia iba aktívne položky a admin endpoint vracia celý katalóg na vytváranie a úpravu.

Public prehľad, mapa a rezervácia zdieľajú termín dostupnosti cez URL query parametre `od` a `do`; voliteľné `jazero` a `miesto` zachovávajú kontext pri prechode medzi obrazovkami. Normalizáciu rozsahu a rýchle voľby rieši `app/utils/availabilityDateRange.ts`, spoločné ovládanie `AvailabilityRangePicker` a samotný stav miest počíta `app/utils/availability.ts`. Parameter `volne=1` je mapový prezentačný filter a nemení rezervačné pravidlá.

Úlovkové reporty používajú `app/utils/catchAnalytics.ts`. Utility vrstva počíta agregácie zo schválených úlovkov vrátane weather snapshotov, skladá sezónne okná z pravidiel a uzávierok revíru, aplikuje filtre pre admin report, generuje surový CSV úlovkov aj manažérsky CSV trendových signálov, porovnáva aktuálne obdobie s rovnakým obdobím minulý rok, skladá mesačný trend váhy úlovkov, trend podľa druhu ryby, trend kombinácie druh + lovné miesto a dá sa neskôr nahradiť Supabase materialized view.

Uložené reporty úlovkov rieši `app/services/catchReportService.ts`. Správca vie v `/admin/ulovky` uložiť aktuálny filter ako manuálny, týždenný alebo mesačný report s cieľovou rolou, príjemcami a výberom payloadu. Rovnaká service vrstva vie uložený report vygenerovať do súhrnu, CSV úlovkov a CSV trendových signálov, pripraviť e-mailový draft s prílohami a spustiť plánovač splatných týždenných alebo mesačných reportov. Doručovací provider má režimy `mock`, `resend` a `disabled`; pri `resend` služba volá Resend Email API endpoint z `.env` a do delivery logu uloží stav `sent` alebo `failed`. Lokálny prechodový store je `.data/rybolov-cetin/catch-reports.json`; produkčne sa má nahradiť tabuľkou report definícií, delivery logom a cron/serverless plánovačom. Serverless vstup je oddelený cez `/api/cron/catch-reports/run-due` a chránený `RYBOLOV_REPORT_SCHEDULER_SECRET`.

Weather snapshot pri nových úlovkoch rieši `app/services/catchWeatherService.ts`. Teraz ide o konfigurovateľný resolver s providermi `mock`, `station`, `manual`, `weather-api` a `disabled`. Deterministický mock zostáva fallback, station/manual vie použiť kompletný snapshot z prostredia a `weather-api` drží miesto pre konkrétny externý adaptér bez zmeny kontraktu úlovkových služieb.

Admin schvaľovanie rezervácií má prvú mutačnú service vrstvu v `app/services/reservationWorkflowService.ts`.
Obrazovka `/admin/rezervacie` ju používa cez `useAdminReservationWorkflow()`. Kým nie je pripravený Supabase, stav rezervácií a výpožičiek sa číta a zapisuje cez lokálny JSON store.
Uzávierky, sezóny a servisné blokácie majú vlastný prechodový store `.data/rybolov-cetin/closure-state.json`. Admin `/admin/uzavierky` zapisuje cez `/api/admin/closures`, public rezervácia a mapa čítajú sanitizované blokácie cez `/api/closures` a serverové vytvorenie rezervácie vždy validuje termín proti aktuálnemu closure store. Shared `useClosureState()` drží public/admin obrazovky na rovnakom zdroji uzávierok.
Audit udalosti sa zapisujú do samostatného lokálneho store `.data/rybolov-cetin/audit-log.json`, aby každá mutácia mala stopu mimo doménového stavu.

Prvá API vrstva je pripravená nad rovnakými službami:

- `GET /api/health` vracia verejný health status pre uptime monitor bez interných ciest.
- `POST /api/client-errors` prijme skrátený klientsky error report a uloží ho do lokálneho error logu.
- `GET /api/admin/system` vracia interný health detail, lokálnu dátovú cestu a posledné error log záznamy.
- `GET /api/reservations` vracia aktuálny lokálny stav rezervácií a výpožičiek.
- `POST /api/reservations` prijíma verejnú žiadosť, overí ju cez `reservationApiService` a uloží pending rezerváciu s výpožičkami.
- `POST /api/admin/reservations/:id/decision` prijíma admin rozhodnutie, používa rovnaký workflow service ako admin obrazovka a zapisuje výsledok.
- `GET /api/closures` vracia sanitizované public uzávierky a interné blokácie bez interných poznámok, aby public dostupnosť sedela so serverom.
- `GET /api/admin/closures` vracia plný interný stav uzávierok.
- `POST /api/admin/closures` vytvorí alebo aktualizuje uzávierku, zapíše lokálny closure store a audit udalosť.
- `GET /api/map` vracia sanitizovanú publikovanú public mapu bez interných servisných bodov, interných zón a interných vrstiev.
- `GET /api/admin/map` vracia plný rozpracovaný SVG model mapy pre interné role s prístupom k mape.
- Admin mapové mutácie aj `GET /api/admin/map` vracajú `draftChanges`, aby UI vedelo pred publikovaním ukázať počet aj názvy pridaných, upravených a odstránených položiek oproti public mape.
- `PUT /api/admin/map` ukladá validované lovné miesta, chaty, servisné body, polygonové plochy a aktívne vrstvy do draftu.
- `POST /api/admin/map/publish` publikuje aktuálny draft do public mapy.
- `POST /api/admin/map/discard-draft` obnoví draft z publikovanej mapy bez zmeny public vrstvy.
- `POST /api/admin/map/background` ukladá nový podkladový obrázok do draftu mapy a `/api/map-assets/:id` verejne vydáva iba assety neinterných vrstiev v publikovanej mape.
- `GET /api/catches` vracia iba verejne schválené úlovky a fotky bez interných review polí; cudzie zápisníky ani share kódy nezoznamuje.
- `POST /api/catches` validuje úlovok, voliteľne ho priradí do kompatibilného zápisníka a uloží ho do lokálneho store v stave čakajúcom na schválenie.
- `GET /api/catch-photos/:id` vráti binárnu fotku z lokálneho mock storage adresára `.data/rybolov-cetin/catch-photos/`.
- `POST /api/admin/catches/:id/correction` opravuje údaje úlovku pred zverejnením a vie ponechať, presunúť alebo odpojiť väzbu na skupinový zápisník.
- `POST /api/admin/catches/:id/decision` schvaľuje, vracia do kontroly alebo zamieta úlovok pred verejným zobrazením.
- `GET/POST /api/admin/fish-registry` vracia register čipovaných rýb alebo založí novú identitu čipu.
- `PATCH /api/admin/fish-registry/:id` upraví meno, druh, poznámku a životný stav ryby; čip a pôvodné označenie nemení a zmenu stavu audituje s povinným dôvodom.
- `POST /api/admin/fish-registry/:id/observations` pridá ďalšie meranie existujúcej ryby bez zmeny jej identity.
- `GET /api/admin/catch-reports` vracia uložené konfigurácie interných reportov úlovkov.
- `POST /api/admin/catch-reports` uloží alebo aktualizuje report z aktuálneho filtra a zapíše audit udalosť.
- `POST /api/admin/catch-reports/:id/generate` vygeneruje reportový payload, uloží `lastGeneratedAt` a zapíše audit udalosť.
- `POST /api/admin/catch-reports/:id/email-draft` pripraví e-mailový draft reportu, uloží delivery log a zapíše audit udalosť.
- `POST /api/admin/catch-reports/run-due` spustí splatné týždenné a mesačné reporty, aktualizuje lokálny store a zapíše audit udalosť.
- `GET/POST /api/cron/catch-reports/run-due` spustí rovnaký plánovač pre hostingový cron, ale iba so správnym `Authorization: Bearer <secret>` alebo `x-rybolov-cron-secret`.
- `GET /api/notifications` vracia verejné oznamy a počet aktívnych PWA odberov.
- `POST /api/notifications/subscribe` uloží alebo aktualizuje verejný PWA odber zariadenia a ignoruje internú rolu alebo súťažný scope.
- `POST /api/notifications/unsubscribe` vypne uložený PWA odber zariadenia.
- `GET /api/admin/notifications` vracia interný stav oznamov, odberov a broadcastov.
- `POST /api/admin/notifications/broadcast` vytvorí verejný oznam, mock broadcast a audit udalosť.
- `POST /api/admin/notifications/subscriptions` uloží alebo aktualizuje mock interný odber pre rolu, turnaj, sektor alebo kontrolóra.
- `POST /api/admin/notifications/subscriptions/:id/disable` vypne konkrétny odber zariadenia podľa ID a zapíše audit udalosť.
- `POST /api/logbooks` vytvorí aktívny osobný, skupinový alebo súťažný zápisník výpravy s menej tipovateľným kódom.
- `GET /api/logbooks/:code` otvorí konkrétny zápisník podľa kódu a vráti jeho úlovky bez interných review polí.
- `GET /api/account/logbooks` vyžaduje mock rybársku session a vracia iba zápisníky vlastnené alebo člensky priradené k danému účtu. `POST /api/logbooks` pri prihlásenej session určuje vlastníka serverovo a ignoruje pokus podsunúť iné meno vlastníka.
- `GET /api/tournaments` vracia verejné turnaje a iba overené súťažné úlovky bez kontrolórov, hlásení, trestov, kontrol, prihlášok tímov a interných poznámok.
- `GET /api/account/tournament-state` vracia prihlásenému tímu iba jeho sektor a prihlásenému kontrolórovi iba jeho identitu a pridelené sektory.
- `GET /api/admin/tournaments` vracia plný súťažný stav oprávneným interným rolám okrem kontrolóra, ktorý používa výhradne scoped account endpoint.
- `GET /api/tournaments/:id/leaderboard` vracia public JSON feed výsledkovky pre externú obrazovku alebo integráciu.
- `POST /api/tournament-requests` validuje tímové hlásenie, uloží ho do súťažného dispečingu a pripraví mock notifikačný broadcast pre súťažný okruh.
- `GET /api/admin/tournaments/:id/leaderboard-export` vráti CSV export aktuálnej výsledkovky.
- `GET /api/admin/tournaments/:id/organizer-export` vráti širší CSV balík pre organizátora: výsledkovku, váženia, tresty, hlásenia, kontroly, prihlášky tímov a kontrolórov.
- `PUT /api/admin/tournaments/:id/sectors` uloží operačné nastavenia súťažných sektorov, tímov, váh a bodových pozícií.
- `POST /api/admin/tournaments/requests/:id/action` priraďuje kontrolóra alebo uzatvára hlásenie; priradenie pripraví mock notifikačný broadcast pre kontrolórsky tok.
- `POST /api/admin/tournaments/catches/:id/verify` overuje čakajúce súťažné váženie; pri rovnakom `clientMutationId` vráti pôvodné overenie.
- `POST /api/admin/tournaments/penalties` vytvorí trest a zrkadlí ho do kontroly pravidiel; pri rovnakom `clientMutationId` nevytvorí duplicitu.
- `POST /api/admin/tournaments/rule-checks` vytvorí samostatnú kontrolu pravidiel sektora; pri rovnakom `clientMutationId` nevytvorí duplicitu.
- Kontrolórske mutácie requestov, vážení, trestov a kontrol serverovo overujú účet, `marshalId`, súťaž aj sektor. Organizačné zmeny sektorov, režimu súťaže a schvaľovanie tímov vyžadujú plný prístup k modulu.
- `GET /api/admin/audit` vracia posledné audit udalosti pre internú obrazovku `/admin/audit`.

Admin endpointy sú chránené mock access guardom podľa rovnakej matrix ako UI. Endpointy sú stále backend-agnostické. Ich zmysel je ustáliť kontrakt pred tým, než sa lokálny JSON store nahradí Supabase repository.

## Validácie vstupov

Doménové formuláre používajú Zod schémy v `app/schemas/pondSchemas.ts`.

Aktuálne validované vstupy:

- žiadosť o rezerváciu,
- úlovok,
- fotka úlovku,
- admin korekcia úlovku,
- admin rozhodnutie o úlovku,
- skupinový zápisník výpravy,
- nastavenia súťažných sektorov,
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
- `tests/closureApiService.test.ts` kontroluje tvorbu, aktualizáciu, validáciu a public sanitizáciu uzávierok.
- `tests/localClosureStore.test.ts` kontroluje JSON store pre uzávierky, sezóny a servisné blokácie.
- `tests/localCatchReportStore.test.ts` kontroluje JSON store pre uložené reporty úlovkov.
- `tests/localCatchPhotoStore.test.ts` kontroluje lokálne uloženie a načítanie binárnych fotiek úlovkov.
- `tests/tournamentApiService.test.ts` kontroluje lokálny API kontrakt pre súťažné hlásenia, priradenie kontrolóra, overenie váženia, tresty, kontroly pravidiel a idempotentný retry kontrolórskych úkonov.
- `tests/tournamentStateVisibility.test.ts`, `tests/tournamentVisibilityRoutes.test.ts` a `tests/tournamentMarshalScope.test.ts` kontrolujú verejnú redakciu súťažných dát, tímový a kontrolórsky scope aj odmietnutie cudzieho sektora alebo identity.
- `tests/notificationService.test.ts` kontroluje verejné a interné push odbery, admin vypnutie odberu, orezanie interného scope z public vstupu, počítanie príjemcov broadcastu a delivery log podľa provideru.
- `tests/tournamentNotificationDispatcher.test.ts` kontroluje prípravu mock súťažného broadcastu podľa odberu okruhu `tournaments` aj interného audience scope.
- `tests/tournamentExport.test.ts` kontroluje organizačný CSV export súťaže a jeho súhrn.
- `tests/offlineTournamentAdminActionQueueService.test.ts` kontroluje offline frontu pre admin overenie váženia, tresty a kontroly pravidiel.
- `tests/localTournamentStore.test.ts` kontroluje JSON store pre súťažný dispečing.
- `tests/auditLogService.test.ts` kontroluje tvorbu a filtrovanie audit udalostí.
- `tests/localAuditLogStore.test.ts` kontroluje JSON store pre lokálny audit log.
- `tests/observabilityService.test.ts` kontroluje health rollup, sanitizáciu error payloadu a štatistiky posledných chýb.
- `tests/localErrorLogStore.test.ts` kontroluje JSON store pre lokálny error log.
- `tests/pondSchemas.test.ts` kontroluje Zod vstupy pre rezervácie, úlovky, skupinové zápisníky, súťažné hlásenia a mapové body.
- `tests/pondService.test.ts` kontroluje konzistenciu seed referencií a základné helpery `pondService`.
- `tests/adminAccess.test.ts` a `tests/adminAccessGuard.test.ts` kontrolujú mock RBAC matrix, route prístupy a serverové API rozhodnutia.

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
5. Nastaviť produkčné VAPID kľúče a otestovať reálne browser push endpointy.
