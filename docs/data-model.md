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
| `map_layers` | mapové podklady: obrázok, SVG, súťažná mapa a nastavenie napasovania podkladu |
| `map_facilities` | servisné a prevádzkové body na mape: WC, sprchy, sklad, drevo, rozvodňa, vjazd, recepcia |
| `map_shapes` | polygonové plochy na mape: vodná plocha, ostrov, zóna, súťažný sektor, servisná zóna; sektorový tvar môže byť naviazaný na súťaž a sektor |
| `users` | používateľské účty |
| `user_roles` | roly a väzba na venue, jazero, súťaž alebo tím |
| `account_deletions` | stopa zmazania identity a anonymizačného spracovania bez obnovenia prihlasovacieho účtu |
| `audit_events` | append-only stopa dôležitých mutácií a rozhodnutí |

## Prevádzka revíru

| Entita | Účel |
| --- | --- |
| `reservations` | rezervácie lovných miest, chát a doplnkov |
| `reservation_items` | položky rezervácie: povolenka, chata, požičovňa, doplnok |
| `cabin_products` | cenník chát, kapacita, minimum a povinné poznámky k povolenkám |
| `cabin_product_pegs` | väzba cenníkovej chaty na mapové miesto alebo viac miest |
| `payment_methods` | zapínateľné platobné metódy: hotovosť, prevod, budúca brána |
| `rental_items` | požičovňa výbavy |
| `rental_bookings` | rezervované kusy výbavy k termínu |
| `lake_closures` | uzávierky jazera alebo celého strediska |
| `peg_closures` | uzávierky konkrétnych miest alebo chát |
| `season_rules` | sezónne pravidlá, neres, zimný režim, otváracie obdobia |
| `place_issues` | nahlásené nedostatky na lovných miestach, chatách, jazerách a servisných bodoch |
| `alerts` | výstrahy a prevádzkové oznamy |

## Úlovky

| Entita | Účel |
| --- | --- |
| `catch_records` | úlovok s miestom, časom, váhou, mierou, nástrahou, počasím a stavom schválenia |
| `catch_photos` | fotky úlovku |
| `angler_trip_logs` | skupinová alebo osobná zápisová tabuľka výpravy |
| `trip_members` | rybári v spoločnej výprave |
| `tagged_fish` | stabilná identita fyzicky čipovanej ryby, číslo čipu, meno a údaje o označení |
| `fish_observations` | opakované merania ryby v čase vrátane miesta, váhy, dĺžky a väzby na úlovok |
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

V prototype súťažné sektory a tímové prihlášky žijú v lokálnom store `.data/rybolov-cetin/tournament-state.json`. Public stránka vie vytvoriť prihlášku tímu s kontaktom, preferovaným sektorom a poznámkou. Admin editor mení označenie, tím, priebežnú váhu a bodovú pozíciu sektora; sektorové ID ostáva stabilné, pretože sa naň viažu hlásenia, váženia, tresty, kontrolóri aj mapové polygony. Schválenie prihlášky tímu priradí tím do sektora a tým aktualizuje súťažnú výsledkovku. Tímový panel má dočasnú klientsku session v `localStorage`; je to pohodlný návrat k sektoru v jednom zariadení, nie serverový účet ani bezpečnostná autentifikácia. Kontrolórske admin mutácie používajú `clientMutationId`: pri prevzatí alebo uzavretí hlásenia sa uloží na hlásenie ako `actionClientMutationId`, pri vážení na úlovok ako `verificationClientMutationId`, pri trestoch a kontrolách priamo na nový záznam. Produkčná databáza má pre tieto polia unikátne indexy v rámci súťaže.

## Sponzori

| Entita | Účel |
| --- | --- |
| `sponsors` | partneri revíru alebo súťaže |
| `sponsor_assets` | logá a vizuály |
| `sponsor_placements` | umiestnenie: homepage, súťaž, sektor, výsledkovka |

Sponzori majú prechodový lokálny store `.data/rybolov-cetin/sponsor-state.json`; public stránka číta iba aktívnych partnerov cez `/api/sponsors` a `/admin/sponzori` vie zoznam upraviť cez `/api/admin/sponsors`. Prototyp už drží aj typ umiestnenia (`homepage`, `footer`, `sponsors`, `tournament`, `sector`, `scoreboard`), poradie, voliteľnú platnosť kampane a väzbu na súťaž alebo sektor. Logo assety sa ukladajú lokálne do `.data/rybolov-cetin/sponsor-assets/`, metadata sú na sponzorovi vrátane šírky/výšky, voliteľného zdrojového loga pre generovanie variantov, variantov podľa umiestnenia a crop presetov s režimom, odsadením a X/Y ohniskom. Produkčný export mapuje hlavné logo, zdrojové logo aj varianty do `sponsor_assets`; varianty nesú crop preset v metadata poli.

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
Skupinové zápisníky výprav sú v prototype cez `tripLogbooks` a `tripLogbookEntries`. Link alebo kód funguje bez účtu; prihlásený mock rybár sa zapisuje cez `ownerUserId` a člen môže mať voliteľné `userId`. E-mail zostáva iba v identity vrstve a nekopíruje sa do zápisníka. Produkčne sa tieto polia mapujú na `trip_logbooks.owner_user_id` a `trip_logbook_members.user_id`.
Mapový prototyp používa `mapLayers`, `mapFacilities`, `mapShapes` a pomocné SVG funkcie v `app/utils/map.ts`. Publikovaný stav je v `.data/rybolov-cetin/map-state.json`, rozpracovaný draft v `.data/rybolov-cetin/map-draft-state.json`; admin ho vie uložiť, publikovať alebo zahodiť späť na publikovanú verziu. Admin odpovede vracajú aj `draftChanges`, súhrn počtov a názvov rozdielov draftu voči publikovanej mape. Admin editor vie pridať a presúvať lovné miesta, chaty, servisné body a polygonové plochy; polygon sa dá vytvoriť aj klikmi priamo do mapy. Ak zvolené jazero ešte nemá potrebnú pracovnú vrstvu, editor vytvorí validnú draft vrstvu a `PUT /api/admin/map` ju prijme ako pridaný `map_layers` záznam. Vrchol polygonu môže mať okrem X/Y aj voliteľný typ a krátky názov pre hranice, brehy, vstupy, kotvy podkladu alebo servisné body. Legenda označených vrcholov je odvodená z `mapShapes` a exportuje sa ako pracovný `shapePointLegend`, nie ako samostatný zdroj pravdy. Podkladový obrázok jazera sa dá nahrať lokálne do `.data/rybolov-cetin/map-assets/` a vrstva si drží `imageSettings` pre režim napasovania, mierku, X/Y posun a priehľadnosť. Exportné rámy pre 4:3, A4/A3, štvorec a 16:9 sú odvodené z viewBoxu, takže zatiaľ nemenia perzistentný mapový model. Kontrola kvality pred publikovaním je pure helper nad mapovým modelom; sleduje väzby chát na produkty, viditeľnosť servisných vrstiev, vodnú oblasť, podklad, mapové pokrytie súťažných sektorov a objekty, ktoré by sa nezobrazili pre chýbajúcu alebo vypnutú vrstvu. Serverový publish ju spúšťa nad draftom, živým `cabin-catalog-state.json` a živým `tournament-state.json`, pričom kritické nálezy vracia ako 422. Súťažné sektorové polygony majú voliteľné `tournamentId` a `sectorId`; `/sutaze` a `/admin/sutaze` ich čítajú cez `app/utils/tournamentMap.ts`. Súťaže majú prechodové pole `operationsMode` s hodnotami `public-only`, `registration-only` a `full-dispatch`; lokálny store starším záznamom doplní default `full-dispatch`.
Cenníkové chaty majú prechodový lokálny store `.data/rybolov-cetin/cabin-catalog-state.json`; `/admin/mapa` vie pre miesto typu `cabin` nastaviť cenníkový produkt chaty a validácia nedovolí priradiť jedno miesto k viacerým produktom alebo priradiť bežné brehové miesto. Public aj admin rezervácia používajú živý katalóg, takže položka chaty nevychádza iba zo seedu.
Požičovňa má prvý prechodový model cez `rentalBookings`; dostupnosť kusov podľa termínu počíta `app/utils/rentals.ts`.
Katalóg požičovne a doplnkov má prechodový lokálny store `.data/rybolov-cetin/rental-catalog-state.json`; `/admin/pozicovna` vie pridať novú výbavu alebo doplnok, meniť `active`, sklad, odporúčanie a cenníkový text a odstrániť iba nepoužité položky. Public/admin rezervácie používajú iba aktívne položky a história rezervácií chráni použité položky pred fyzickým zmazaním.
Rezervácie už v mock modeli nesú kontaktný telefón, povolenku, voliteľnú chatu, výbavu, doplnky, zdroj žiadosti a internú poznámku správcu.
Platobné metódy sú v `paymentMethods`: hotovosť a prevod sú zapnuté, platobná brána je pripravená ako vypnutý budúci modul. Aktuálny zapnutý stav sa dočasne ukladá do `.data/rybolov-cetin/payment-method-state.json` a číta ho public rezervácia, info stránka aj admin vytvorenie rezervácie.
Admin kalendár skladá `reservations`, živý closure state a `pegs` do týždňovej alebo mesačnej mriežky cez helpery v `app/utils/calendar.ts`. Rovnaký closure state používa public mapa, admin mapa, dashboard aj serverová validácia rezervácie.
Hlásenia nedostatkov sú v prototype cez `placeIssues` a lokálny store `.data/rybolov-cetin/place-issue-state.json`. Public mapa vie vytvoriť hlásenie pre jazero, lovné miesto alebo verejný servisný bod; pri výpadku signálu ho podrží klientsky IndexedDB store `place-issues` a `/offline` ho vie neskôr odoslať na `POST /api/place-issues`. `/admin/hlasenia` ho vie prijať, priradiť, zmeniť prioritu a uzavrieť.
Admin schvaľovanie používa lokálnu kópiu `reservations` a `rentalBookings` cez `useAdminReservationWorkflow()` a čistú mutačnú logiku v `reservationWorkflowService`; produkčne sa rovnaké rozhranie nahradí repository/Supabase mutáciou.
Rezervácia nesie povinný telefón a voliteľný `contactEmail`. Rozhodnutie správcu pripraví `communicationDraft`, ktorý sa dá použiť ako e-mailový draft alebo ako SMS/telefonický text bez nutnosti mať e-mail. Admin API zároveň vracia `communicationDelivery` s providerom `mock`, `resend` alebo `disabled`; pri zapnutom Resende vie rozhodnutie rovno odoslať e-mail a pri ostatných režimoch jasne označí draft, preskočenie alebo zlyhanie. Nová webová žiadosť pridá interný `NotificationBroadcast` na topic `reservations` s `requestId` rezervácie; verejné alerty sa tým nemenia.
Rybársky účet používa čítací pohľad `AccountReservation`, ktorý z rezervácie odstráni `internalNote` a filtruje podľa primárneho `contactEmail` alebo overených aliasov prihláseného účtu. Staršie lokálne záznamy bez e-mailu sa môžu priradiť podľa mena, ale záznam s cudzím e-mailom sa podľa mena nepreberá. Mock login pre rybára prijíma primárny e-mail aj overený alias a vždy vytvorí session na rovnaký účet.
Rybárske účty používajú lokálny store `.data/rybolov-cetin/account-state.json`. `registeredAccounts` drží ID, meno, normalizovaný e-mail, čas vytvorenia a `scrypt` hash hesla; heslo v čitateľnej podobe sa neukladá. `passwordResets` drží iba ID účtu, SHA-256 hash náhodného tokenu, čas vytvorenia a expiráciu. Úspešné použitie alebo zmazanie účtu reset odstráni. Pri zmazaní sa prihlasovací záznam odstráni a ID sa pridá do `deletions`. Kontaktné údaje rezervácií a `ownerUserId`/`userId` väzby zápisníkov sa odstránia a meno pri zachovaných úlovkoch sa nahradí anonymným označením. Kompatibilná seed normalizácia doplní historické e-maily a používateľské ID iba vtedy, keď meno stále zodpovedá pôvodnej identite, takže anonymizáciu po reštarte nevráti späť.

Používateľský export nie je ďalší perzistentný store. `anglerAccountDataService` vždy odvodí aktuálny výrez z rezervačného a úlovkového stavu, odstráni interné polia, vyberie vlastné úlovky a pri skupinových výpravách anonymizuje ostatných členov. Formát má `formatVersion: 1`, čas exportu a počtový súhrn pre budúcu kompatibilitu.
Detail admin rezervácie používa z toho istého notifikačného store odvodený `ReservationNotificationSummary`: ID rezervácie, broadcast stav, počet príjemcov, delivery počty podľa statusu a posledný pokus doručenia. Nie je to samostatná perzistentná entita, iba čítací pohľad nad `NotificationBroadcast` a `notification_delivery_logs`.
Úlovky a skupinové zápisníky majú lokálnu kópiu v `.data/rybolov-cetin/catch-state.json`; produkčne sa nahradí tabuľkami `catch_records`, `catch_photos`, `trip_logbooks` a `trip_logbook_entries`. Fotky sa v prototype ukladajú ako súbory do `.data/rybolov-cetin/catch-photos/` a metadata sú v `catchPhotos`. Verejný denník filtruje iba schválené úlovky, `/admin/ulovky` opravuje chyby pred zverejnením, pri korekcii vie presunúť alebo odpojiť väzbu na zápisník, zapisuje stav schválenia s poznámkou správcu a interný report agreguje dôveryhodné úlovky pre správcu vrátane sezónnych okien odvodených z `lakeClosures`, sezónneho porovnania, mesačného trendu, trendu podľa druhu ryby, trendu kombinácie druh + lovné miesto a CSV exportu trendových signálov. `CatchRecord.weather` je prvý prechodový weather snapshot pre teplotu vody/vzduchu, tlak, vietor a oblačnosť; nové zápisy ho dostávajú cez konfigurovateľný provider `mock`, `station`, `manual`, `weather-api` alebo `disabled` a admin korekcia ho prepočíta pri zmene času alebo miesta. Provider `weather-api` používa serverový async Open-Meteo kompatibilný hourly lookup podľa súradníc revíru, času úlovku a env timeoutu; voda sa zatiaľ odhaduje zo sezónneho modelu alebo lokálnej odchýlky. Uložené konfigurácie reportov a delivery logy majú lokálnu kópiu v `.data/rybolov-cetin/catch-reports.json` a produkčne smerujú do tabuliek typu `catch_saved_reports`, `catch_report_deliveries` a `catch_report_schedule_runs` s filtrom, periodicitou, príjemcami, voľbou payloadu, časom posledného generovania, providerom a stavom prípravy alebo odoslania.
Čipované ryby majú samostatnú lokálnu kópiu v `.data/rybolov-cetin/fish-registry-state.json`. `TaggedFish` predstavuje jednu fyzickú rybu a unikátny čip; `FishObservation` predstavuje jedno načítanie čipu a meranie. `chipCode`, `taggedAt`, `taggedPegId` a ďalšie údaje prvého označenia sú po založení identity nemeniteľné. Meno, druh, interná poznámka a stav `active`, `missing`, `transferred` alebo `dead` sa môžu opraviť cez riadenú admin mutáciu. Zmena stavu vyžaduje dôvod a vytvorí auditnú udalosť bez odstránenia histórie. Pozorovanie môže voliteľne odkazovať na `catchId` alebo `tournamentCatchId`, ale register funguje aj pri ručnom prevádzkovom zázname bez verejného úlovku. Prvé meranie vytvorené pri založení čipu uchováva aj rybára a nástrahu. Pri spracovaní živého privolania sa jeho ID uloží do poznámky merania ako prevádzková stopa a po úspešnom zápise sa privolanie uzavrie. Rovnaký lokálny stav drží `FishRegistrySettings` s pravidlom veľkej ryby pre každé jazero. Pravidlo obsahuje týždenné `availabilityWindows`, pokyn počas služby, odlišný pokyn mimo služby a voliteľný `presenceOverride`, ktorým správca na obmedzený čas potvrdí, že je fyzicky pri jazere. Produkčne sa identity mapujú na `tagged_fish` a `fish_observations`, pravidlá na stĺpce konkrétneho záznamu v `lakes`.

Živé privolania správcu k veľkej rybe sú oddelené v `.data/rybolov-cetin/large-fish-assistance-state.json`. Požiadavka drží jazero, miesto, rozmery ryby, rybára, telefón, kontakt na správcu, privátny verejný token a stav `waiting`, `on-route`, `release-without-manager`, `completed`, `cancelled` alebo `expired`. Oddelenie od úlovku umožňuje poslať urgentnú požiadavku ešte pred fotkou a kompletným zápisom do denníka. Nevybavené čakanie expiruje po 30 minútach; príchod správcu dostane toleranciu ETA plus 45 minút.
Fronta veľkých úlovkov nie je samostatná perzistentná entita. `createFishCatchCandidates()` ju odvodzuje z pravidla vybraného jazera a odfiltruje záznamy, ktorých ID sa už nachádza vo `FishObservation`. Tým nevzniká druhý stav typu „spracované“ mimo samotnej dátovej väzby.
Audit udalosti majú lokálnu kópiu v `.data/rybolov-cetin/audit-log.json`; produkčne sa nahradia tabuľkou `audit_events` napojenou na venue, aktéra, entitu, závažnosť a detaily zmeny. Error reporting má samostatný prechodový store `.data/rybolov-cetin/error-log.json`, ktorý drží skrátené klientské a serverové chyby pre admin modul `/admin/system`; produkčne sa má nahradiť externým error reportingom alebo samostatnou tabuľkou incidentov.

Notifikácie majú lokálnu kópiu v `.data/rybolov-cetin/notification-state.json`; produkčne sa rozdelia na tabuľky `alerts`, `push_subscriptions` a `notification_delivery_logs`. Odber zariadenia nesie endpoint, voliteľné Web Push keys, povolenie, okruhy `weather`, `service`, `reservations`, `tournaments`, stav zapnutia, čas posledného videnia a voliteľnú internú väzbu `audienceRole`, `tournamentIds`, `sectorIds`, `marshalId`. Verejný subscribe internú väzbu neukladá a klientsky rozlišuje reálny browser Web Push endpoint od mock fallbacku podľa podpory `Notification`, `serviceWorker`, `PushManager` a verejného VAPID kľúča. Mock interné odbery vytvára admin cez `/admin/notifikacie`, aby sa dalo testovať cielenie organizátora, kontrolóra alebo tímu; správca vie odbery filtrovať podľa aktívnosti, verejného alebo interného typu a odoberaného okruhu a konkrétny odber vypnúť podľa ID bez zmazania histórie delivery logov. Broadcast vytvára verejný alert, cieľové okruhy, voliteľnú audience vrstvu, stav dispatcheru, počet oslovených odberov, delivery log po zariadeniach a audit stopu. Interný testovací broadcast má `alertId` s prefixom `test-`, ukladá sa iba do broadcast logu a delivery logov, nie do verejných alertov; admin UI ho vie filtrovať samostatne od verejných oznamov a údržba vie podľa retencie odstrániť staré testy aj ich delivery logy bez zásahu do verejných broadcastov. Delivery provider má režim `mock`, `disabled` a `web-push`; serverový `web-push` adaptér reálne odosiela iba odbery so skutočným endpointom a kľúčmi p256dh/auth. Admin notifikačný endpoint vracia aj diagnostiku provideru: pripravenosť VAPID, chýbajúce env premenné, TTL, timeout a urgentnosť. VAPID pár sa generuje príkazom `pnpm push:vapid`. Súťažné hlásenia a priradenie kontrolóra teraz automaticky pripravujú mock broadcast pre okruh `tournaments` s rolami a sektorovým alebo kontrolórskym scope. Offline admin úkony sú klientsky IndexedDB store `admin-tournament-actions` a zároveň idempotentné admin API mutácie, aby opakovaný sync po výpadku nevyrábal duplicitné akcie hlásení, tresty, kontroly alebo audity.
