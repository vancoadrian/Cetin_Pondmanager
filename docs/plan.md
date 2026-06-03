# Plán projektu

## Vízia

Rybolov Cetín má byť použiteľná PWA pre rybárske revíry: verejný prehľad pre rybárov, interný nástroj pre správcu a súťažný dispečing pre organizátorov pretekov.

Projekt nemá zostať viazaný iba na Cetín. Produkčný smer je samostatná inštancia pre každého majiteľa alebo prevádzkovateľa; jedna inštancia môže mať 1 až X rybníkov, ktoré môžu byť pri sebe alebo na rôznych miestach na mape.

## Stav prototypu

- Public web: prehľad, revíry, mapa, rezervácie, úlovky, súťaže, výstrahy, info, kontakt, sponzori.
- Interná časť: mock login, cookie session, admin dashboard a samostatné admin moduly.
- Dáta: typované seed dáta v `app/data/pond.ts`.
- Dátová vrstva: `usePondData()` číta cez `pondService` a `pondRepository`, seed dáta už nie sú importované priamo v stránkach.
- Validácie: prvé Zod schémy pre rezervácie, úlovky, skupinové zápisníky, súťažné hlásenia, mapové body, servisné body a polygonové plochy.
- PWA: manifest, ikony, inštalačný prompt, service worker, offline stránka, stavový banner pripojenia a offline fronty pre rezervácie, úlovky, súťažné hlásenia a kontrolórske admin úkony.
- Branding: finálny pracovný brand je `Rybolov Cetín`, nové SVG logo.
- Dostupnosť miest: prvý availability engine v `app/utils/availability.ts` napojený na mapu, rezervácie a admin.
- Požičovňa: kapacitný výpočet v `app/utils/rentals.ts` je napojený na verejnú rezerváciu a admin požičovňu; katalóg položiek a doplnkov má lokálny store a správca vie pridať novú položku, meniť aktivitu, sklad, odporúčanie, cenníkový text a bezpečne odstrániť nepoužité položky.
- Admin rezervácie: prvý schvaľovací detail ukazuje kontakt, miesto, chatu, výbavu, doplnky, konflikty a internú poznámku; uloženie rozhodnutia už ide cez mock service/composable workflow. Správca vie vytvoriť telefonickú alebo osobnú rezerváciu priamo v adminovi.
- Admin kalendár: týždňová aj mesačná mriežka obsadenosti po miestach a chatách v `/admin/rezervacie`; na mobile je dostupný denný súhrn bez širokej tabuľky.
- Úlovky: verejný denník doplnený o mock skupinové zápisníky výprav.
- Úlovky: verejne sa zobrazujú až po schválení správcom; nové public zápisy sú v stave `pending` a `/admin/ulovky` ich vie schváliť, ponechať v kontrole alebo zamietnuť.
- Úlovky: `/admin/ulovky` vie pred zverejnením opraviť chybné údaje a ponechať, presunúť alebo odpojiť väzbu na zápisník výpravy.
- Úlovkové dáta: `/admin/ulovky` má prvý interný report podľa druhu, miesta, nástrahy, jazera, váhy a času.
- Fotky úlovkov: verejný formulár ukladá JPG/PNG/WebP fotku do lokálneho mock storage a vytvára AI-ready metadata.
- Uložené reporty: `/admin/ulovky` vie uložiť aktuálny filter ako manuálny, týždenný alebo mesačný report pre správcu, majiteľa alebo účtovníka, vygenerovať z neho aktuálny reportový payload, pripraviť e-mailový draft s CSV prílohami a ručne spustiť plánovač splatných týždenných alebo mesačných reportov.
- Platby: pripravené sú vypínateľné metódy hotovosť, bankový prevod a budúca platobná brána; aktuálne sa dajú prepínať v admin rezerváciách cez lokálny payment store.
- Rezervačné API: verejná rezervácia má `GET/POST /api/reservations`, admin vytvorenie má `POST /api/admin/reservations` a admin rozhodnutie má `POST /api/admin/reservations/:id/decision`.
- Lokálna perzistencia: rezervácie, platobné metódy, katalóg požičovne/doplnkov, cenníkové chaty, sponzori vrátane log/variantov, umiestnení/kampaní, mapový editor, úlovky, skupinové zápisníky, súťažný dispečing a audit log sa ukladajú do `.data/rybolov-cetin/`, kým nebude pripravený Supabase. Mapový editor už ukladá lovné miesta, chaty, ich rezervačné režimy, väzbu miesta s chatou na cenníkový produkt, servisné body, polygonové plochy, nahraté podkladové obrázky jazier, ich napasovanie a väzbu súťažných polygonov na konkrétnu súťaž/sektor. Admin súťaže vedia uložiť označenia sektorov, tímy, priebežné váhy a bodové pozície. Admin sponzori už vedia varianty loga aj hromadne vygenerovať z jedného zdroja cez canvas, doladiť X/Y ohnisko pre každý variant posuvníkom alebo priamo v náhľade, uložiť zdrojové logo pre ďalšie prepočítanie a uložiť crop preset k variantu.
- Sponzorské sloty: verejná súťažná stránka aj admin dispečing už používajú aktívne sloty `tournament`, `sector` a `scoreboard`; výsledkovka má fallback na partnerov súťaže, aby nezostala prázdna pri chýbajúcom špeciálnom bannere.
- Lokálna perzistencia: uzávierky, sezóny a servisné blokácie majú samostatný store `.data/rybolov-cetin/closure-state.json`; vstupujú do serverovej validácie rezervácií, public mapy, admin mapy, dashboardu a sezónnych okien reportov. Admin uzávierky vie správca vytvoriť aj spätne upraviť.
- Lokálna perzistencia: uložené reporty úlovkov majú samostatný store `.data/rybolov-cetin/catch-reports.json`.
- Testy: Vitest je pridaný pre dostupnosť, požičovňu, katalóg požičovne, admin workflow rezervácií, rezervačné API, lokálne store vrstvy, audit log, Zod formuláre, súťažný workflow a seed/service kontrakty.

## Fáza 1: Produktový prototyp

- Doladiť public vs admin navigáciu.
- Pridať chýbajúce empty/error/loading stavy. Prvý shared komponent je v prototype.
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
- Pridať lokálny JSON store ako dočasné úložisko pred Supabase. Prvá verzia pre rezervácie, požičovňu, sponzorov, mapový editor, úlovky, skupinové zápisníky a súťažný dispečing je hotová.
- Doplniť audit log lokálnych a budúcich Supabase mutácií. Prvá lokálna verzia je hotová cez `audit-log.json`, `/admin/audit` a tabuľku `audit_events` v migrácii.
- Nastaviť RLS politiky podľa rolí.
- Dopĺňať roly `tournament_organizer`, `accountant` a `worker` popri owner, manager, marshal, tournament team a angler. Mock admin už má spoločnú access matrix pre navigáciu, dashboard, route guard, write/read obmedzenia vo všetkých hlavných admin moduloch a serverový guard pre `/api/admin/*`.

## Fáza 3: Rezervácie a dostupnosť

- Implementovať availability engine. Prvá mock verzia je hotová.
- Kombinovať rezervácie, uzávierky, údržbu, sezóny, neres, súťaže a pravidlá chát. Uzávierky sú už samostatný lokálny API/store modul a public mapa, admin mapa, dashboard aj rezervácie ich čítajú ako živý stav; `/admin/uzavierky` ich vie vytvárať aj upravovať. Cenníkové chaty majú samostatný lokálny store, admin mapa vie upraviť väzbu chata ↔ mapové miesto a verejná aj admin rezervácia podľa tejto väzby dopočíta položku chaty.
- Započítať dostupnosť požičovne podľa termínu. Prvá mock verzia cez `rentalBookings` je hotová.
- Vytvoriť kalendár obsadenosti po jazerách, miestach a chatách. Týždenný, mesačný a mobilný prehľad v adminovi je hotový.
- Pridať schvaľovanie rezervácií, interné poznámky a telefonické/osobné vytvorenie rezervácie správcom. Prvý mock service workflow v `/admin/rezervacie` je hotový.
- Pripraviť platobné metódy ako voliteľný modul. Aktuálne má byť dostupná hotovosť na mieste a bankový prevod; platobná brána zostáva pripravená a všetky metódy sú zapínateľné cez admin.

## Fáza 4: Úlovky a rybárske dáta

- Pridať používateľské zápisníky výprav. Prvá public obrazovka je v prototype a zapisuje lokálne cez API.
- Podporiť skupinové výpravy, kde si partia zapisuje úlovky do spoločnej tabuľky. Lokálny store, API a UI pre vytvorenie zápisníka sú pripravené.
- Verejné zobrazovanie úlovkov viazať na schválenie správcom; zápisník má fungovať aj cez link alebo kód bez účtu. Prvý admin schvaľovací workflow je hotový v `/admin/ulovky`.
- Rozšíriť admin schvaľovanie o úpravu chybného miesta, času alebo nástrahy pred zverejnením. Korekcia vrátane väzby na zápisník je hotová.
- Vytvoriť analytiku podľa miesta, času, nástrahy, počasia a ryby. Interný report má filtre, výber sezónneho okna z pravidiel revíru, surový CSV export, manažérsky CSV export trendových signálov, prvé agregácie počasia, sezónne porovnanie aktuálneho obdobia s rovnakým obdobím minulý rok, mesačný trend, trend podľa druhu ryby a trend kombinácie druh + lovné miesto; nové úlovky dostávajú automatický mock weather snapshot cez provider pripravený na reálne API.
- Pridať upload fotiek a úložisko. Prvá lokálna verzia je hotová cez `.data/rybolov-cetin/catch-photos/`.
- Pripraviť dátový model pre budúcu AI identifikáciu rýb. Prvé metadata sú v `catchPhotos` a Supabase tabuľke `catch_photos`.
- Rozšíriť analytiku o konkrétny asynchrónny adaptér pre zvolenú meteoslužbu alebo lokálnu stanicu.
- Doplniť cron plánovač nad už pripravenými reportovými e-mail draftmi. Cron-ready endpoint so secretom je pripravený; po výbere hostingu treba nastaviť konkrétny schedule.

## Fáza 5: Súťaže

- Rozšíriť mock dispečing na reálne súťažné role. Lokálny store, API, offline fronta pre hlásenia tímov, offline fronta pre kontrolórske admin úkony, priradenie kontrolóra, overenie váženia, live výsledkovka, public JSON feed, samostatná kiosk/projektor obrazovka, public prihlasovanie tímov, mock súťažné broadcasty pre kontrolórov, admin CSV export výsledkovky a organizačný exportný balík sú hotové.
- Pridať tímové účty a sektorové priradenie. Sektorové polygony sú už napojené na rovnaký mapový model, admin dispečing ukazuje ich mapové pokrytie, správca vie upraviť operačné nastavenia sektorov/tímov bez zmeny stabilných sektorových ID a organizátor vie schváliť prihlášku tímu do konkrétneho sektora.
- Zaviesť hlásenia tímov: úlovok, porušenie, technická pomoc, námietka. Prvé public odoslanie hlásenia je hotové.
- Pridať kontrolórske váženia, tresty, kontroly pravidiel a live rebríček. Prvé admin overenie váženia, formulár trestu, formulár kontroly pravidiel, spoločná výsledkovková utilita, feed a export pre public/admin sú hotové.
- Pripraviť režim, kde organizácia môže, ale nemusí používať interné funkcie aplikácie Rybolov Cetín.

## Fáza 6: PWA a notifikácie

- Pripraviť VAPID kľúče. Env miesta pre public/private kľúč sú pripravené, `pnpm push:vapid` generuje pár kľúčov a `/admin/notifikacie` ukazuje diagnostiku provideru aj chýbajúce premenné.
- Zaviesť `push_subscriptions`. Prvá lokálna verzia odberov je hotová cez `.data/rybolov-cetin/notification-state.json`; verejná PWA stránka vie vytvoriť reálny browser Web Push odber pri dostupnom service workeri a VAPID kľúči, inak použije mock fallback. Admin notifikácie vedia vytvoriť mock interný odber podľa roly, turnaja, sektora a kontrolóra.
- Posielať výstrahy pred búrkou, servisné oznamy, zmeny rezervácie a súťažné udalosti. Mock broadcast pre výstrahy a oznamy je hotový v `/admin/notifikacie`; tímové hlásenia a priradenie kontrolóra už automaticky pripravujú broadcast do okruhu `tournaments` vrátane internej audience podľa roly, turnaja, sektora a konkrétneho kontrolóra. Public subscribe interné role neukladá. Delivery log po zariadeniach, provider režimy `mock`, `disabled`, `web-push`, serverový `web-push` adaptér a admin diagnostika sú pripravené; produkcia potrebuje doplniť VAPID kľúče, zapnúť provider a otestovať reálne browser endpointy.
- Podporiť offline-friendly obrazovky pri vode. `/offline`, stavový banner pripojenia, header badge čakajúcich položiek, runtime cache pre kľúčové public API a centrum všetkých čakajúcich offline položiek sú hotové vrátane chybového stavu, počtu pokusov a preklikov do príslušných formulárov.
- Pridať offline mutačnú frontu pre úlovky. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri sieťovom zlyhaní podrží validovaný úlovok aj s fotkou v zariadení a po návrate internetu ho odošle na `POST /api/catches`.
- Pridať offline mutačnú frontu pre súťažné hlásenia tímov. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri výpadku podrží privolanie kontrolóra, hlásenie porušenia alebo technickú pomoc a po návrate internetu ho odošle na `POST /api/tournament-requests`.
- Pridať offline mutačnú frontu pre kontrolórske admin úkony. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri výpadku podrží overenie váženia, trest alebo kontrolu pravidiel a po návrate internetu ich odošle na admin endpointy súťažného dispečingu. Admin úkony už nesú `clientMutationId`, takže retry nevytvorí duplicitný trest, kontrolu ani audit.
- Pridať offline mutačnú frontu pre rezervácie. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri výpadku podrží žiadosť o miesto, chatu, výbavu a doplnky a po návrate internetu ju odošle na `POST /api/reservations`.

## Fáza 7: Produkčné nasadenie

- Nastaviť environmenty dev/stage/prod.
- Pridať monitoring a error reporting.
- Rozšíriť testy pre budúce Supabase mutácie a API routes. Prvá Vitest sada pre availability, rental, reservation workflow, rezervačné API, closure API/store, lokálny store, audit log, Zod formuláre, service kontrakty a mock RBAC guardy je hotová.
- Pripraviť import dát zo súčasných tabuliek alebo ručných zoznamov. Prvý JSON seed export z mock dát je hotový.
- Prejsť obsah a ceny so správcom revíru.

## Potvrdené rozhodnutia

- Finálny názov a brand: `Rybolov Cetín`.
- Každý majiteľ má samostatnú inštanciu. V nej môže mať viac rybníkov, aj geograficky oddelených.
- Správca má vedieť potvrdiť rezerváciu priamo v aplikácii. Resend/e-mail napojenie je budúci modul; telefonické potvrdenie zostáva podporované.
- Platby sú zatiaľ bez platobnej brány: hotovosť na mieste alebo prevod na účet. Platobná brána má byť pripravená ako zapínateľná možnosť.
- Úlovky sú verejné až po schválení. Rybársky zápisník môže fungovať cez link alebo kód bez účtu; účet má byť pridaná hodnota pre vlastnú históriu.
- Mapový editor má smerovať k plnému SVG editoru s možnosťou nahrať podkladový obrázok, kresliť vrstvy a presnejšie ich umiestňovať pomocou mriežky.
- Súťažné roly zahŕňajú organizátora, kontrolóra, tím a internú prevádzku.

## Otvorené rozhodnutia

- Aké presné vybavenie a ceny má požičovňa.
