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
- Úlovky: verejne sa zobrazujú až po schválení správcom; nové public zápisy sú v stave `pending`, public `GET /api/catches` vracia iba schválené úlovky a `/admin/ulovky` ich cez chránené `GET /api/admin/catches` vie schváliť, ponechať v kontrole alebo zamietnuť.
- Úlovky: `/admin/ulovky` vie pred zverejnením opraviť chybné údaje a ponechať, presunúť alebo odpojiť väzbu na zápisník výpravy.
- Úlovkové dáta: `/admin/ulovky` má prvý interný report podľa druhu, miesta, nástrahy, jazera, váhy a času.
- Fotky úlovkov: verejný formulár ukladá JPG/PNG/WebP fotku do lokálneho mock storage a vytvára AI-ready metadata; public fotka je dostupná až po schválení úlovku, admin ju vidí počas moderácie.
- Uložené reporty: `/admin/ulovky` vie uložiť aktuálny filter ako manuálny, týždenný alebo mesačný report pre správcu, majiteľa alebo účtovníka, vygenerovať z neho aktuálny reportový payload, pripraviť e-mailový draft s CSV prílohami a ručne spustiť plánovač splatných týždenných alebo mesačných reportov.
- Platby: pripravené sú vypínateľné metódy hotovosť, bankový prevod a budúca platobná brána; aktuálne sa dajú prepínať v admin rezerváciách cez lokálny payment store.
- Rezervačné API: verejná rezervácia má `GET/POST /api/reservations`, admin vytvorenie má `POST /api/admin/reservations` a admin rozhodnutie má `POST /api/admin/reservations/:id/decision`.
- Lokálna perzistencia: rezervácie, platobné metódy, katalóg požičovne/doplnkov, cenníkové chaty, sponzori vrátane log/variantov, umiestnení/kampaní, mapový editor, úlovky, skupinové zápisníky, súťažný dispečing a audit log sa ukladajú do `.data/rybolov-cetin/`, kým nebude pripravený Supabase. Mapový editor už ukladá lovné miesta, chaty, ich rezervačné režimy, väzbu miesta s chatou na cenníkový produkt, servisné body, polygonové plochy vrátane pomenovaných a typovaných vrcholov, pracovnú legendu vrcholov s filtrami, tlačou a CSV exportom, nahraté podkladové obrázky jazier, ich napasovanie, exportné rámy pre tlačové pomery, kontrolu kvality pred publikovaním, prehľad zmien draftu oproti verejnej mape a väzbu súťažných polygonov na konkrétnu súťaž/sektor vrátane hromadného doplnenia aj zarovnania sektorových polygonov podľa bodu alebo najbližšej brehovej/súťažnej línie. Public `GET /api/map` je filtrovaný bez interných servisných bodov, zón a vrstiev, admin `GET /api/admin/map` vracia rozpracovaný draft, verejná mapa sa mení až po publikovaní cez `POST /api/admin/map/publish` a draft sa dá zahodiť cez `POST /api/admin/map/discard-draft`. Admin súťaže čítajú pre mapové pokrytie sektorov draft mapy, takže organizátor vidí pripravované polygony ešte pred publikovaním, vedia uložiť označenia sektorov, tímy, priebežné váhy a bodové pozície a majú prepínač režimu `public-only` / `registration-only` / `full-dispatch`. Admin sponzori už vedia varianty loga aj hromadne vygenerovať z jedného zdroja cez canvas, doladiť X/Y ohnisko pre každý variant posuvníkom alebo priamo v náhľade, uložiť zdrojové logo pre ďalšie prepočítanie a uložiť crop preset k variantu.
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
- Podporiť skupinové výpravy, kde si partia zapisuje úlovky do spoločnej tabuľky. Lokálny store, API a UI pre vytvorenie zápisníka sú pripravené; public stránka vie zápisník otvoriť kódom bez toho, aby `GET /api/catches` vracal všetky share kódy. Nové share kódy majú prefix jazera, krátky názvový diel a náhodný suffix.
- Verejné zobrazovanie úlovkov viazať na schválenie správcom; zápisník má fungovať aj cez link alebo kód bez účtu. Prvý admin schvaľovací workflow je hotový v `/admin/ulovky` a public API už nevracia pending ani zamietnuté úlovky.
- Rozšíriť admin schvaľovanie o úpravu chybného miesta, času alebo nástrahy pred zverejnením. Korekcia vrátane väzby na zápisník je hotová.
- Vytvoriť analytiku podľa miesta, času, nástrahy, počasia a ryby. Interný report má filtre, výber sezónneho okna z pravidiel revíru, surový CSV export, manažérsky CSV export trendových signálov, prvé agregácie počasia, sezónne porovnanie aktuálneho obdobia s rovnakým obdobím minulý rok, mesačný trend, trend podľa druhu ryby a trend kombinácie druh + lovné miesto; nové úlovky dostávajú automatický mock weather snapshot cez provider pripravený na reálne API.
- Pridať upload fotiek a úložisko. Prvá lokálna verzia je hotová cez `.data/rybolov-cetin/catch-photos/`.
- Pripraviť dátový model pre budúcu AI identifikáciu rýb. Prvé metadata sú v `catchPhotos` a Supabase tabuľke `catch_photos`.
- Rozšíriť analytiku o konkrétny asynchrónny adaptér pre zvolenú meteoslužbu alebo lokálnu stanicu.
- Doplniť cron plánovač nad už pripravenými reportovými e-mail draftmi. Cron-ready endpoint so secretom je pripravený; po výbere hostingu treba nastaviť konkrétny schedule.

## Fáza 5: Súťaže

- Rozšíriť mock dispečing na reálne súťažné role. Lokálny store, API, offline fronta pre hlásenia tímov, tímový panel s priamym sektorovým odkazom a kódom, tlačiteľné tímové QR kartičky, samostatný panel kontrolóra pre pridelené sektory, tlačiteľné kontrolórske QR kartičky, offline fronta pre kontrolórske admin úkony, priradenie kontrolóra, overenie aj sporné označenie váženia, live výsledkovka, public JSON feed, samostatná kiosk/projektor obrazovka, public prihlasovanie tímov, mock súťažné broadcasty pre kontrolórov, admin CSV export výsledkovky a organizačný exportný balík sú hotové.
- Pridať tímové účty a sektorové priradenie. Sektorové polygony sú už napojené na rovnaký mapový model, admin dispečing ukazuje ich mapové pokrytie, správca vie upraviť operačné nastavenia sektorov/tímov bez zmeny stabilných sektorových ID, organizátor vie schváliť prihlášku tímu do konkrétneho sektora a vie tímu poslať mock link alebo kód `/sutaze/tim?kod=` bez účtu vrátane hromadného kopírovania, CSV exportu a tlačiteľných QR kartičiek. Tímový panel má prvý lokálny mock prístup uložený v zariadení a vie prijať aj ručne zadaný tímový kód z kartičky, aby sa partia vedela vrátiť k svojmu sektoru bez opätovného skenovania QR. Plné tímové účty ostávajú ďalší krok.
- Zaviesť hlásenia tímov: úlovok, porušenie, technická pomoc, námietka. Prvé public odoslanie hlásenia je hotové.
- Pridať kontrolórske váženia, tresty, kontroly pravidiel a live rebríček. Prvé admin overenie váženia, sporné váženie, samostatný kontrolórsky panel, formulár trestu, formulár kontroly pravidiel, spoločná výsledkovková utilita, feed a export pre public/admin sú hotové.
- Pripraviť režim, kde organizácia môže, ale nemusí používať interné funkcie aplikácie Rybolov Cetín. Prvý prepínač `operationsMode` je hotový: public-only, registration-only a full-dispatch ovplyvňujú public formuláre, admin dispečing aj serverové validácie.

## Fáza 6: PWA a notifikácie

- Pripraviť VAPID kľúče. Env miesta pre public/private kľúč sú pripravené, `pnpm push:vapid` generuje pár kľúčov a `/admin/notifikacie` ukazuje diagnostiku provideru aj chýbajúce premenné.
- Zaviesť `push_subscriptions`. Prvá lokálna verzia odberov je hotová cez `.data/rybolov-cetin/notification-state.json`; verejná PWA stránka vie vytvoriť reálny browser Web Push odber pri dostupnom service workeri a VAPID kľúči, inak použije mock fallback. Admin notifikácie vedia vytvoriť mock interný odber podľa roly, turnaja, sektora a kontrolóra, filtrovať odbery podľa stavu, typu a okruhu a vypnúť konkrétny odber zariadenia bez mazania histórie.
- Posielať výstrahy pred búrkou, servisné oznamy, zmeny rezervácie a súťažné udalosti. Mock broadcast pre výstrahy a oznamy je hotový v `/admin/notifikacie`; tímové hlásenia a priradenie kontrolóra už automaticky pripravujú broadcast do okruhu `tournaments` vrátane internej audience podľa roly, turnaja, sektora a konkrétneho kontrolóra. Public subscribe interné role neukladá. Delivery log po zariadeniach, provider režimy `mock`, `disabled`, `web-push`, serverový `web-push` adaptér, admin diagnostika, interný testovací broadcast bez verejného alertu, filtrovanie verejných vs. testovacích broadcastov a údržba starých interných testov sú pripravené; produkcia potrebuje doplniť VAPID kľúče, zapnúť provider a otestovať reálne browser endpointy.
- Podporiť offline-friendly obrazovky pri vode. `/offline`, stavový banner pripojenia, header badge čakajúcich položiek, runtime cache pre kľúčové public API a centrum všetkých čakajúcich offline položiek sú hotové vrátane chybového stavu, počtu pokusov a preklikov do príslušných formulárov.
- Pridať offline mutačnú frontu pre úlovky. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri sieťovom zlyhaní podrží validovaný úlovok aj s fotkou v zariadení a po návrate internetu ho odošle na `POST /api/catches`.
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
- Správca má vedieť potvrdiť rezerváciu priamo v aplikácii. Resend/e-mail napojenie je budúci modul; telefonické potvrdenie zostáva podporované.
- Platby sú zatiaľ bez platobnej brány: hotovosť na mieste alebo prevod na účet. Platobná brána má byť pripravená ako zapínateľná možnosť.
- Úlovky sú verejné až po schválení. Rybársky zápisník môže fungovať cez link alebo kód bez účtu; účet má byť pridaná hodnota pre vlastnú históriu.
- Mapový editor má smerovať k plnému SVG editoru s možnosťou nahrať podkladový obrázok, kresliť vrstvy a presnejšie ich umiestňovať pomocou mriežky. Draft/publish workflow je už pripravený, aby rozpracované zmeny nešli rovno na public mapu; pred publikovaním navyše beží kontrola chát, vrstiev a súťažných sektorov.
- Súťažné roly zahŕňajú organizátora, kontrolóra, tím a internú prevádzku.

## Otvorené rozhodnutia

- Aké presné vybavenie a ceny má požičovňa.
