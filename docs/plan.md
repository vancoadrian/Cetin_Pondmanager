# Plán projektu

## Vízia

Rybolov Cetín má byť použiteľná PWA pre rybárske revíry: verejný prehľad pre rybárov, interný nástroj pre správcu a súťažný dispečing pre organizátorov pretekov.

Projekt nemá zostať viazaný iba na Cetín. Produkčný smer je samostatná inštancia pre každého majiteľa alebo prevádzkovateľa; jedna inštancia môže mať 1 až X rybníkov, ktoré môžu byť pri sebe alebo na rôznych miestach na mape.

## Stav prototypu

- Public web: prehľad, revíry, mapa, rezervácie, úlovky, súťaže, výstrahy, info, kontakt, sponzori. Kontakt nemá slepé odosielanie formulára; pripraví SMS správcovi, umožní skopírovať text a ponúkne rýchle prekliky podľa typu požiadavky.
- Prístup: jednotné prihlásenie e-mailom a heslom, cookie session, cieľová obrazovka podľa role a samostatné verejné, rybárske, tímové, kontrolórske, organizačné a prevádzkové priestory. Serverové admin API, tímový účet aj rybársky účet čítajú rovnakú hlavnú session; starší rybársky cookie formát ostáva iba ako kompatibilný fallback. Rybársky login prijíma aj overený e-mailový alias rovnakého účtu, aby importovaná história nezostala oddelená. Kontrolór má iba vlastný panel a sektory, brigádnik prevádzkové moduly a účtovník čítacie obchodné podklady.
- Dáta: typované seed dáta v `app/data/pond.ts`.
- Dátová vrstva: `usePondData()` číta cez `pondService` a `pondRepository`, seed dáta už nie sú importované priamo v stránkach.
- Validácie: prvé Zod schémy pre rezervácie, úlovky, skupinové zápisníky, súťažné hlásenia, mapové body, servisné body a polygonové plochy.
- PWA: manifest, ikony, inštalačný prompt, service worker, offline stránka, stavový banner pripojenia a čakajúce odoslania pre rezervácie, úlovky, hlásenia nedostatkov, súťažné hlásenia a kontrolórske admin úkony.
- Branding: finálny pracovný brand je `Rybolov Cetín`, nové SVG logo.
- Dostupnosť miest: prvý availability engine v `app/utils/availability.ts` napojený na mapu, rezervácie a admin.
- Dostupnosť miest: public prehľad, mapa a rezervácia používajú spoločný rozsah cez query parametre `od`, `do`, `jazero` a `miesto`; mapa vie zobraziť iba rezervovateľné miesta a výber prenesie do rezervačného formulára.
- Požičovňa: kapacitný výpočet v `app/utils/rentals.ts` je napojený na verejnú rezerváciu a admin požičovňu; katalóg položiek a doplnkov má lokálny store a správca vie pridať novú položku, meniť aktivitu, sklad, odporúčanie, cenníkový text a bezpečne odstrániť nepoužité položky. Verejné info vie poslať rybára do rezervácie s predvybranou výbavou, doplnkom alebo chatou cez query parametre.
- Admin rezervácie: prvý schvaľovací detail ukazuje kontakt, miesto, chatu, výbavu, doplnky, konflikty a internú poznámku; uloženie rozhodnutia už ide cez mock service/composable workflow a pripraví správu pre hosťa cez e-mailový draft, SMS alebo telefonický text. Rezervačné rozhodnutia majú voliteľný provider `mock`, `resend` alebo `disabled`, takže admin vidí, či sa e-mail iba pripravil, odoslal, preskočil alebo zlyhal. Nové webové žiadosti vytvoria interný push broadcast pre prevádzkové roly, push otvorí konkrétny detail v `/admin/rezervacie` a detail ukáže aj súhrn doručenia interného upozornenia. Správca vie vytvoriť telefonickú alebo osobnú rezerváciu priamo v adminovi.
- Admin kalendár: týždňová aj mesačná mriežka obsadenosti po miestach a chatách v `/admin/rezervacie`; na mobile je dostupný denný súhrn bez širokej tabuľky.
- Úlovky: verejný denník doplnený o mock skupinové zápisníky výprav.
- Úlovky: verejne sa zobrazujú až po schválení správcom; nové public zápisy sú v stave `pending`, public `GET /api/catches` vracia iba schválené úlovky a `/admin/ulovky` ich cez chránené `GET /api/admin/catches` vie schváliť, ponechať v kontrole alebo zamietnuť.
- Úlovky: `/admin/ulovky` vie pred zverejnením opraviť chybné údaje a ponechať, presunúť alebo odpojiť väzbu na zápisník výpravy.
- Úlovkové dáta: `/admin/ulovky` má prvý interný report podľa druhu, miesta, nástrahy, jazera, váhy a času.
- Čipované ryby: `/admin/ryby` má prvý interný register s vyhľadaním podľa čísla čipu, mena alebo druhu, históriou meraní, grafom váhy a dĺžky, väzbou na lovné miesto a voliteľným ID bežného alebo súťažného úlovku. Register podporuje CSV export, hromadný import a bezpečnú úpravu mena, druhu, poznámky a životného stavu. Čip a pôvodné označenie sú nemeniteľné; zmena stavu vyžaduje dôvod a zapisuje audit.
- Čipované ryby: register odvodzuje pracovnú frontu úlovkov nad konfigurovaným limitom konkrétneho jazera, ktoré ešte nemajú väzbu na konkrétny čip. Správca vie z kandidáta pridať meranie existujúcej rybe alebo založiť nový čip s predvyplnenými údajmi z úlovku.
- Fotky úlovkov: verejný formulár ukladá JPG/PNG/WebP fotku do lokálneho mock storage a vytvára AI-ready metadata; public fotka je dostupná až po schválení úlovku, admin ju vidí počas moderácie.
- Uložené reporty: `/admin/ulovky` vie uložiť aktuálny filter ako manuálny, týždenný alebo mesačný report pre správcu, majiteľa alebo účtovníka, vygenerovať z neho aktuálny reportový payload, pripraviť e-mailový draft s CSV prílohami a ručne spustiť plánovač splatných týždenných alebo mesačných reportov.
- Platby: pripravené sú vypínateľné metódy hotovosť, bankový prevod a budúca platobná brána; aktuálne sa dajú prepínať v admin rezerváciách cez lokálny payment store. Verejná informačná stránka ukazuje iba zapnuté metódy a pravidlá bez zdrojových odkazov z pôvodného webu.
- Rezervačné API: verejná rezervácia má `GET/POST /api/reservations`, admin vytvorenie má `POST /api/admin/reservations` a admin rozhodnutie má `POST /api/admin/reservations/:id/decision`.
- Hlásenia nedostatkov: public mapa vie nahlásiť problém na jazere, lovnom mieste alebo servisnom bode; `/admin/hlasenia` má chránený zoznam, prioritu, stav, priradenie, internú poznámku a audit.
- Lokálna perzistencia: rezervácie, platobné metódy, katalóg požičovne/doplnkov, cenníkové chaty, sponzori vrátane log/variantov, umiestnení/kampaní, mapový editor, úlovky, skupinové zápisníky, súťažný dispečing a audit log sa ukladajú do `.data/rybolov-cetin/`, kým nebude pripravený Supabase. Mapový editor už ukladá lovné miesta, chaty, ich rezervačné režimy, väzbu miesta s chatou na cenníkový produkt, servisné body, polygonové plochy vrátane pomenovaných a typovaných vrcholov, pracovnú legendu vrcholov s filtrami, tlačou a CSV exportom, nahraté podkladové obrázky jazier, ich napasovanie, exportné rámy pre tlačové pomery, pracovné režimy vrstiev, signalizáciu a samodoplnenie chýbajúcich pracovných vrstiev pre konkrétne jazero, kontrolu kvality pred publikovaním vrátane upozornení na existujúce prvky v chýbajúcej alebo vypnutej vrstve, prehľad zmien draftu oproti verejnej mape a väzbu súťažných polygonov na konkrétnu súťaž/sektor vrátane hromadného doplnenia aj zarovnania sektorových polygonov podľa bodu alebo najbližšej brehovej/súťažnej línie. Public `GET /api/map` je filtrovaný bez interných servisných bodov, zón a vrstiev, admin `GET /api/admin/map` vracia rozpracovaný draft, verejná mapa sa mení až po publikovaní cez `POST /api/admin/map/publish` a draft sa dá zahodiť cez `POST /api/admin/map/discard-draft`. Publish endpoint pred zápisom public mapy serverovo kontroluje kritické mapové nálezy proti živému katalógu chát a živému tournament store. Admin súťaže čítajú pre mapové pokrytie sektorov draft mapy, takže organizátor vidí pripravované polygony ešte pred publikovaním, vedia uložiť označenia sektorov, tímy, priebežné váhy a bodové pozície a majú prepínač režimu `public-only` / `registration-only` / `full-dispatch`. Admin sponzori už vedia varianty loga aj hromadne vygenerovať z jedného zdroja cez canvas, doladiť X/Y ohnisko pre každý variant posuvníkom alebo priamo v náhľade, uložiť zdrojové logo pre ďalšie prepočítanie a uložiť crop preset k variantu.
- Sponzorské sloty: verejná súťažná stránka aj admin dispečing už používajú aktívne sloty `tournament`, `sector` a `scoreboard`; výsledkovka má fallback na partnerov súťaže, aby nezostala prázdna pri chýbajúcom špeciálnom bannere.
- Lokálna perzistencia: uzávierky, sezóny a servisné blokácie majú samostatný store `.data/rybolov-cetin/closure-state.json`; vstupujú do serverovej validácie rezervácií, public mapy, admin mapy, dashboardu a sezónnych okien reportov. Admin uzávierky vie správca vytvoriť aj spätne upraviť.
- Lokálna perzistencia: hlásenia nedostatkov majú samostatný store `.data/rybolov-cetin/place-issue-state.json`.
- Lokálna perzistencia: uložené reporty úlovkov majú samostatný store `.data/rybolov-cetin/catch-reports.json`.
- Testy: Vitest je pridaný pre dostupnosť, požičovňu, katalóg požičovne, admin workflow rezervácií, rezervačné API, lokálne store vrstvy, audit log, Zod formuláre, súťažný workflow a seed/service kontrakty.

## Fáza 1: Produktový prototyp

- Verejná a interná navigácia sú oddelené; verejný header ukazuje iba verejné moduly a po prihlásení zobrazí jeden rolovo správny vstup do osobného alebo pracovného priestoru. Zoznam revírov má samostatné akcie na detail, mapu a rezerváciu konkrétneho jazera.
- Pridať chýbajúce empty/error/loading stavy. Prvý shared komponent je v prototype; rybársky účet už má jasný stav načítania, chyby a opakovania načítania zápisníkov, verejné výstrahy majú stav načítania, chyby aj prázdneho zoznamu, verejná súťažná výsledkovka vie čitateľne zobraziť prázdne poradie aj výpadok obnovy s posledným dostupným stavom a verejná mapa, rezervácie, úlovky aj sponzori majú stavové upozornenie pri načítaní alebo výpadku dostupnostných dát.
- Upraviť mapu jazera smerom k SVG/editor modelu. SVG editor lovných miest, chát, rezervačných režimov miest, servisných bodov, polygonových plôch, režimov voda/zákaz/súťaž/servis, očíslovaných vrcholov, kreslenia polygonu klikmi/dvojklikom, mriežky/snapu, uploadu, napasovania a priameho posunu podkladového obrázka je v prototype.
- Rozšíriť admin o samostatné obrazovky: rezervácie, uzávierky, požičovňa, sponzori, súťaže. Hotové ako mock routy.
- Zjednotiť statusy a badge systém. Prvý shared `AvailabilityBadge` je napojený na hlavné rezervovateľné miesta.

## Fáza 2: Dátová architektúra

- Zaviesť Supabase projekt.
- Navrhnúť PostgreSQL schému pre multi-tenant model: `venues`, `lakes`, `pegs`, `reservations`, `lake_closures`.
- Prvá Supabase migrácia s multi-tenant jadrom, rezerváciami, úlovkami, súťažami, sponzormi, push odbermi a RLS je pripravená.
- Seed/export skript pre aktuálne Cetín dáta je pripravený cez `pnpm seed:export` a generuje `supabase/seed/rybolov-cetin.seed.json`.
- Presunúť mock dáta z `app/data/pond.ts` do repository/service vrstvy. Prvý mock repository/service mostík je hotový.
- Zaviesť Zod validácie pre formuláre a doménové vstupy. Prvá sada schém je hotová v `app/schemas/pondSchemas.ts`.
- Ustáliť API kontrakty pred Supabase. Prvé endpointy pre rezervácie, úlovky a admin rozhodnutia sú hotové.
- Pridať lokálny JSON store ako dočasné úložisko pred Supabase. Prvá verzia pre rezervácie, požičovňu, sponzorov, mapový editor, hlásenia nedostatkov, úlovky, skupinové zápisníky a súťažný dispečing je hotová.
- Doplniť audit log lokálnych a budúcich Supabase mutácií. Prvá lokálna verzia je hotová cez `audit-log.json`, `/admin/audit` a tabuľku `audit_events` v migrácii.
- Nastaviť RLS politiky podľa rolí.
- Dopĺňať roly `tournament_organizer`, `accountant` a `worker` popri owner, manager, marshal, tournament team a angler. Mock admin už má spoločnú access matrix pre navigáciu, dashboard, route guard, write/read obmedzenia vo všetkých hlavných admin moduloch a serverový guard pre `/api/admin/*`.

## Fáza 3: Rezervácie a dostupnosť

- Implementovať availability engine. Prvá mock verzia je hotová.
- Kombinovať rezervácie, uzávierky, údržbu, sezóny, neres, súťaže a pravidlá chát. Uzávierky sú už samostatný lokálny API/store modul a public mapa, admin mapa, dashboard aj rezervácie ich čítajú ako živý stav; `/admin/uzavierky` ich vie vytvárať aj upravovať. Cenníkové chaty majú samostatný lokálny store, admin mapa vie upraviť väzbu chata ↔ mapové miesto a verejná aj admin rezervácia podľa tejto väzby dopočíta položku chaty.
- Započítať dostupnosť požičovne podľa termínu. Prvá mock verzia cez `rentalBookings` je hotová.
- Vytvoriť kalendár obsadenosti po jazerách, miestach a chatách. Týždenný, mesačný a mobilný prehľad v adminovi je hotový; verejná rezervácia má živý 14-dňový prehľad dostupnosti po miestach, detail revíru ukazuje najbližších 7 dní s preklikom na predvybraný termín a CSV export vychádza z rovnakých dát.
- Pridať schvaľovanie rezervácií, interné poznámky a telefonické/osobné vytvorenie rezervácie správcom. Prvý service workflow v `/admin/rezervacie` je hotový vrátane voliteľného e-mailu, komunikačného draftu po rozhodnutí a Resend-ready delivery výsledku.
- Pripraviť platobné metódy ako voliteľný modul. Aktuálne má byť dostupná hotovosť na mieste a bankový prevod; platobná brána zostáva pripravená a všetky metódy sú zapínateľné cez admin.

## Fáza 4: Úlovky a rybárske dáta

- Pridať používateľské zápisníky výprav. Prvá public obrazovka je v prototype a zapisuje lokálne cez API.
- Podporiť skupinové výpravy, kde si partia zapisuje úlovky do spoločnej tabuľky. Lokálny store, API a UI pre vytvorenie zápisníka sú pripravené; public stránka vie zápisník otvoriť kódom bez toho, aby `GET /api/catches` vracal všetky share kódy. Nové share kódy majú prefix jazera, krátky názvový diel a náhodný suffix.
- Rybársky účet: prvý mock e-mailový účet je dostupný v `/konto`. Prihlásený rybár vidí rezervácie priradené k e-mailu účtu alebo jeho overeným aliasom bez interných poznámok správcu; každá karta rezervácie ukazuje platobný stav, pokyny k platbe a rýchly telefonát alebo SMS správcovi. Public rezervačný formulár mu rovnaké meno/e-mail predvyplní, serverovo sa zapíše ako vlastník nového zápisníka cez `ownerUserId`, uvidí svoje aktívne aj ukončené výpravy, posledné úlovky, najväčší úlovok a súhrny výprav. Ostatní členovia môžu naďalej používať kód bez účtu. Účet používa rovnakú hlavnú session ako ostatné roly, takže po prihlásení e-mailom a heslom sa história nestráca. Produkčne cookie nahradí Supabase Auth a väzba na `auth.users`.
- Verejné zobrazovanie úlovkov viazať na schválenie správcom; zápisník má fungovať aj cez link alebo kód bez účtu. Prvý admin schvaľovací workflow je hotový v `/admin/ulovky` a public API už nevracia pending ani zamietnuté úlovky.
- Rozšíriť admin schvaľovanie o úpravu chybného miesta, času alebo nástrahy pred zverejnením. Korekcia vrátane väzby na zápisník je hotová.
- Vytvoriť analytiku podľa miesta, času, nástrahy, počasia a ryby. Interný report má filtre, výber sezónneho okna z pravidiel revíru, surový CSV export, manažérsky CSV export trendových signálov, prvé agregácie počasia, sezónne porovnanie aktuálneho obdobia s rovnakým obdobím minulý rok, mesačný trend, trend podľa druhu ryby a trend kombinácie druh + lovné miesto; nové úlovky dostávajú automatický weather snapshot cez konfigurovateľný provider.
- Pridať upload fotiek a úložisko. Prvá lokálna verzia je hotová cez `.data/rybolov-cetin/catch-photos/`.
- Pripraviť dátový model pre budúcu AI identifikáciu rýb. Prvé metadata sú v `catchPhotos` a Supabase tabuľke `catch_photos`.
- Evidovať fyzicky čipované ryby oddelene od verejných úlovkov. Prvý lokálny register je hotový cez `.data/rybolov-cetin/fish-registry-state.json`, chránené admin API a obrazovku `/admin/ryby`. Jedna nemeniteľná identita čipu má neobmedzenú históriu pozorovaní s dátumom, jazerom, stanoviskom, váhou, dĺžkou, nástrahou, rybárom, čítačom čipu a voliteľnou väzbou na bežný alebo súťažný úlovok. Správca môže opraviť popisné údaje a riadene meniť stav `active`, `missing`, `transferred` alebo `dead`.
- Podporiť prevádzkový postup pre veľké ryby. Limit, zapnutie, telefón, e-mail, spôsob kontaktu, viac týždenných okien služby a pokyn počas aj mimo služby sú nastaviteľné pre každé jazero. Správca vie navyše jedným klikom potvrdiť dočasnú prítomnosť na 2 až 12 hodín pre jedno alebo viac susediacich jazier naraz; verejný formulár vyhodnotí čas úlovku a admin úlovku otvorí priamo príslušný čipový workflow.
- Privolanie správcu pri veľkej rybe je samostatný živý workflow: rybár odošle miesto, rozmery a telefón, interné roly dostanú service push a správca odpovie s ETA alebo pokynom pustiť rybu bez neho. Po príchode správca z privolania rovno pridá meranie existujúcemu čipu alebo založí novú označenú rybu; formuláre preberú údaje úlovku a úspešné uloženie privolanie automaticky uzavrie. Rybársky formulár stav automaticky obnovuje cez privátny token, umožňuje privolanie zrušiť, po piatich minútach ponúkne telefonický fallback a staré otvorené požiadavky expiruje. Public formulár má čitateľný trojkrokový flow „privolať, počkať, zapísať“, admin dashboard ukazuje konkrétne otvorené privolania s deep-linkom do spracovania a `/admin/ryby` má operačný panel s vetvami „čip nájdený“ alebo „čip nenájdený“; tlačové QR karty nie sú súčasťou flow.
- Uloženie úlovku nad limitom jazera pripraví nenaliehavý interný service broadcast pre majiteľa a správcu s deep-linkom na konkrétnu admin moderáciu. Ak sa ten istý úlovok zhoduje s už odoslaným živým privolaním správcu, druhá notifikácia sa nevytvorí.
- Prepojiť veľké úlovky s registrom bez duplikovania dát. Kandidátska fronta je odvodená z bežných a súťažných úlovkov a z fronty zmizne až po vytvorení pozorovania s `catchId` alebo `tournamentCatchId`. Súťažný sektor sa zachová ako kontext, ale konkrétne lovné miesto musí správca potvrdiť.
- Pridať bulk import/export registra rýb. Prvý CSV round-trip je hotový, kontroluje unikátnosť čipu, jazero a miesto, aktualizuje existujúcu rybu a preskakuje rovnaké meranie.
- Neskôr prepojiť čítačku čipov s PWA cez podporovaný hardvér. Prvý praktický krok je hotový v `/admin/ryby`: správca vie vložiť alebo zoskenovať číslo čipu, existujúca ryba sa vyhľadá a neznámy čip predvyplní založenie novej označenej ryby.
- Rozšíriť analytiku o konkrétny asynchrónny adaptér pre zvolenú meteoslužbu alebo lokálnu stanicu. Prvý async adaptér je hotový pre Open-Meteo hourly API: server pri novom úlovku a admin korekcii vie načítať teplotu vzduchu, tlak, oblačnosť, vietor, dopočítať smer/trend a doplniť sezónny odhad vody; pri výpadku alebo chýbajúcich súradniciach ostáva mock fallback.
- Doplniť cron plánovač nad už pripravenými reportovými e-mail draftmi. Cron-ready endpoint so secretom je pripravený, admin spustenie aj audit vracajú provider doručovania a počty odoslaných, pripravených, preskočených a chybných reportov; po výbere hostingu treba nastaviť konkrétny schedule.

## Fáza 5: Súťaže

- Rozšíriť mock dispečing na reálne súťažné role. Lokálny store, API, čakajúce odoslania hlásení tímov, tímový panel s priamym sektorovým odkazom a kódom, digitálne zdieľanie prístupov bez tlačenia kartičiek, samostatný panel kontrolóra pre pridelené sektory, čakajúce odoslania kontrolórskych admin úkonov, priradenie kontrolóra, overenie aj sporné označenie váženia, live výsledkovka, public JSON feed, samostatná kiosk/projektor obrazovka, public prihlasovanie tímov, mock súťažné broadcasty pre kontrolórov, admin CSV export výsledkovky a organizačný exportný balík sú hotové.
- Pridať tímové účty a sektorové priradenie. Sektorové polygony sú napojené na rovnaký mapový model, admin dispečing ukazuje ich mapové pokrytie a organizátor vie schváliť prihlášku tímu do konkrétneho sektora. Mock tímový účet sa prihlasuje e-mailom a heslom, je serverovo viazaný na jednu súťaž a sektor a klient mu neponúka zmenu identity. Starší link alebo kód zostáva ako prechodový prístup pre zariadenia bez účtu; produkčne cookie nahradí Supabase Auth.
- Súťažné dáta sú oddelené podľa publika: verejný endpoint vracia iba publikovateľné dáta a overené úlovky, tímový a kontrolórsky účet dostanú serverovo filtrovaný stav a plný admin feed je chránený. Kontrolórske mutácie server kontroluje voči pridelenej súťaži, identite a sektorom.
- Zaviesť hlásenia tímov: úlovok, porušenie, technická pomoc, námietka. Prvé public odoslanie hlásenia je hotové.
- Pridať kontrolórske váženia, tresty, kontroly pravidiel a live rebríček. Prvé admin overenie váženia, sporné váženie, samostatný kontrolórsky panel, formulár trestu, formulár kontroly pravidiel, spoločná výsledkovková utilita, feed a export pre public/admin sú hotové.
- Pripraviť režim, kde organizácia môže, ale nemusí používať interné funkcie aplikácie Rybolov Cetín. Prvý prepínač `operationsMode` je hotový: public-only, registration-only a full-dispatch ovplyvňujú public formuláre, admin dispečing aj serverové validácie.

## Fáza 6: PWA a notifikácie

- Pripraviť VAPID kľúče. Env miesta pre public/private kľúč sú pripravené, `pnpm push:vapid` generuje pár kľúčov a `/admin/notifikacie` ukazuje diagnostiku provideru aj chýbajúce premenné.
- Zaviesť `push_subscriptions`. Prvá lokálna verzia odberov je hotová cez `.data/rybolov-cetin/notification-state.json`; verejná PWA stránka vie vytvoriť reálny browser Web Push odber pri dostupnom service workeri a VAPID kľúči, inak použije mock fallback. Admin notifikácie vedia vytvoriť mock interný odber podľa roly, turnaja, sektora a kontrolóra, filtrovať odbery podľa stavu, typu a okruhu a vypnúť konkrétny odber zariadenia bez mazania histórie.
- Posielať výstrahy pred búrkou, servisné oznamy, zmeny rezervácie a súťažné udalosti. Mock broadcast pre výstrahy a oznamy je hotový v `/admin/notifikacie`; nové webové rezervácie automaticky pripravujú interný broadcast do okruhu `reservations` pre owner, manager a worker roly; tímové hlásenia a priradenie kontrolóra už automaticky pripravujú broadcast do okruhu `tournaments` vrátane internej audience podľa roly, turnaja, sektora a konkrétneho kontrolóra. Hlásenia nedostatkov z mapy automaticky pripravujú service broadcast pre owner, manager a worker odbery. Public subscribe interné role neukladá. Delivery log po zariadeniach, provider režimy `mock`, `disabled`, `web-push`, serverový `web-push` adaptér, admin diagnostika, interný testovací broadcast bez verejného alertu, filtrovanie verejných vs. testovacích broadcastov, údržba starých interných testov a samostatný prevádzkový panel pre service push k veľkým rybám sú pripravené vrátane rýchlej akcie na založenie interného zariadenia správcu pre okruh prevádzka; produkcia potrebuje doplniť VAPID kľúče, zapnúť provider a otestovať reálne browser endpointy.
- Podporiť offline-friendly obrazovky pri vode. `/offline`, stavový banner pripojenia, header badge čakajúcich položiek, runtime cache pre kľúčové public API a centrum všetkých čakajúcich offline položiek sú hotové vrátane chybového stavu, počtu pokusov a preklikov do príslušných formulárov.
- Pridať offline mutačnú frontu pre úlovky. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri sieťovom zlyhaní podrží validovaný úlovok aj s fotkou v zariadení a po návrate internetu ho odošle na `POST /api/catches`.
- Pridať offline mutačnú frontu pre hlásenia nedostatkov. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri výpadku podrží nahlásený problém na jazere, lovnom mieste, chate alebo servisnom bode a po návrate internetu ho odošle na `POST /api/place-issues`.
- Pridať offline mutačnú frontu pre súťažné hlásenia tímov. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri výpadku podrží privolanie kontrolóra, hlásenie porušenia alebo technickú pomoc a po návrate internetu ho odošle na `POST /api/tournament-requests`.
- Pridať offline mutačnú frontu pre kontrolórske admin úkony. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri výpadku podrží prevzatie hlásenia, uzavretie hlásenia, overenie váženia, sporné váženie, trest alebo kontrolu pravidiel a po návrate internetu ich odošle na admin endpointy súťažného dispečingu. Admin úkony už nesú `clientMutationId`, takže retry nevytvorí duplicitnú akciu, trest, kontrolu ani audit.
- Pridať offline mutačnú frontu pre rezervácie. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri výpadku podrží žiadosť o miesto, chatu, výbavu a doplnky a po návrate internetu ju odošle na `POST /api/reservations`.

## Fáza 7: Produkčné nasadenie

- Nastaviť environmenty dev/stage/prod. Prvá readiness vrstva je hotová cez `RYBOLOV_ENVIRONMENT`, `.env.example`, health check `environment-readiness` a panel „Environment pripravenosť“ v `/admin/system`.
- Pridať monitoring a error reporting. Prvá verzia je hotová cez `/api/health`, admin modul `/admin/system`, lokálny `error-log.json` a klientsky reporter pre Vue/runtime chyby.
- Pridať zálohu lokálneho runtime stavu pred Supabase. Prvá verzia je hotová cez `/api/admin/data-export`, manifest/inline asset režimy a panel lokálnych dát v `/admin/system`; nové exporty majú SHA-256 integritný odtlačok a bezpečný import preview cez `/api/admin/data-import/preview` ho overuje pred restore. Restore cez `/api/admin/data-import/restore` vyžaduje frázu `OBNOVIT DATA` aj safety backup aktuálneho stavu. `/admin/system` zároveň ukazuje posledné audit udalosti exportu, kontroly backupu a obnovy a vie listovať, načítať do kontroly aj stiahnuť automaticky vytvorené safety backupy. Archív safety backupov má dvojkrokovú retenciu cez `/api/admin/data-backups/cleanup`: najprv náhľad, potom zmazanie po fráze `VYCISTIT BACKUPY`.
- Rozšíriť testy pre budúce Supabase mutácie a API routes. Prvá Vitest sada pre availability, rental, reservation workflow, rezervačné API, closure API/store, lokálny store, audit log, error log, observability kontrakt, Zod formuláre, service kontrakty a mock RBAC guardy je hotová.
- Pripraviť import dát zo súčasných tabuliek alebo ručných zoznamov. Prvý JSON seed export z mock dát je hotový.
- Prejsť obsah a ceny so správcom revíru.

## Potvrdené rozhodnutia

- Finálny názov a brand: `Rybolov Cetín`.
- Každý majiteľ má samostatnú inštanciu. V nej môže mať viac rybníkov, aj geograficky oddelených.
- Správca má vedieť potvrdiť rezerváciu priamo v aplikácii. E-mailové potvrdenie má provider `mock`, `resend` alebo `disabled`; telefonické potvrdenie zostáva podporované.
- Platby sú zatiaľ bez platobnej brány: hotovosť na mieste alebo prevod na účet. Platobná brána má byť pripravená ako zapínateľná možnosť.
- Úlovky sú verejné až po schválení. Rybársky zápisník funguje cez link alebo kód bez účtu; prvý mock účet už drží vlastnú históriu cez stránku `/konto`.
- Čipované ryby sú interný register. Jedna ryba má unikátne číslo čipu, môže mať meno a každé ďalšie chytenie vytvára nové pozorovanie, nie novú identitu ryby.
- Mapový editor má smerovať k plnému SVG editoru s možnosťou nahrať podkladový obrázok, kresliť vrstvy a presnejšie ich umiestňovať pomocou mriežky. Draft/publish workflow je už pripravený, aby rozpracované zmeny nešli rovno na public mapu; pred publikovaním navyše beží kontrola chát, vrstiev a súťažných sektorov.
- Súťažné roly zahŕňajú organizátora, kontrolóra, tím a internú prevádzku.

## Otvorené rozhodnutia

- Aké presné vybavenie a ceny má požičovňa.
