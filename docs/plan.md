# Plán projektu

## Vízia

Rybolov Cetín má byť použiteľná PWA pre rybárske revíry: verejný prehľad pre rybárov, interný nástroj pre správcu a súťažný dispečing pre organizátorov pretekov.

Projekt nemá zostať viazaný iba na Cetín. Produkčný smer je samostatná inštancia pre každého majiteľa alebo prevádzkovateľa; jedna inštancia môže mať 1 až X rybníkov, ktoré môžu byť pri sebe alebo na rôznych miestach na mape.

## Stav prototypu

- Public web: prehľad, revíry, mapa, rezervácie, úlovky, súťaže, výstrahy, info, kontakt, sponzori.
- Interná časť: mock login, cookie session, admin dashboard a samostatné admin moduly.
- Dáta: typované seed dáta v `app/data/pond.ts`.
- Dátová vrstva: `usePondData()` číta cez `pondService` a `pondRepository`, seed dáta už nie sú importované priamo v stránkach.
- Validácie: prvé Zod schémy pre rezervácie, úlovky, skupinové zápisníky, súťažné hlásenia a mapové body.
- PWA: manifest, ikony, inštalačný prompt, service worker, offline stránka, stavový banner pripojenia a offline fronty pre rezervácie, úlovky a súťažné hlásenia.
- Branding: finálny pracovný brand je `Rybolov Cetín`, nové SVG logo.
- Dostupnosť miest: prvý availability engine v `app/utils/availability.ts` napojený na mapu, rezervácie a admin.
- Požičovňa: prvý kapacitný výpočet v `app/utils/rentals.ts` napojený na verejnú rezerváciu a admin požičovňu.
- Admin rezervácie: prvý schvaľovací detail ukazuje kontakt, miesto, chatu, výbavu, doplnky, konflikty a internú poznámku; uloženie rozhodnutia už ide cez mock service/composable workflow.
- Admin kalendár: týždňová mriežka obsadenosti po miestach a chatách v `/admin/rezervacie`.
- Úlovky: verejný denník doplnený o mock skupinové zápisníky výprav.
- Úlovky: verejne sa zobrazujú až po schválení správcom; nové public zápisy sú v stave `pending` a `/admin/ulovky` ich vie schváliť, ponechať v kontrole alebo zamietnuť.
- Úlovky: `/admin/ulovky` vie pred zverejnením opraviť chybné údaje a ponechať, presunúť alebo odpojiť väzbu na zápisník výpravy.
- Úlovkové dáta: `/admin/ulovky` má prvý interný report podľa druhu, miesta, nástrahy, jazera, váhy a času.
- Fotky úlovkov: verejný formulár ukladá JPG/PNG/WebP fotku do lokálneho mock storage a vytvára AI-ready metadata.
- Uložené reporty: `/admin/ulovky` vie uložiť aktuálny filter ako manuálny, týždenný alebo mesačný report pre správcu, majiteľa alebo účtovníka, vygenerovať z neho aktuálny reportový payload, pripraviť e-mailový draft s CSV prílohami a ručne spustiť plánovač splatných týždenných alebo mesačných reportov.
- Platby: pripravené sú vypínateľné metódy hotovosť, bankový prevod a budúca platobná brána.
- Rezervačné API: verejná rezervácia má `GET/POST /api/reservations`, admin rozhodnutie má `POST /api/admin/reservations/:id/decision`.
- Lokálna perzistencia: rezervácie, požičovňa, mapový editor, úlovky, skupinové zápisníky, súťažný dispečing a audit log sa ukladajú do `.data/rybolov-cetin/`, kým nebude pripravený Supabase.
- Lokálna perzistencia: uzávierky, sezóny a servisné blokácie majú samostatný store `.data/rybolov-cetin/closure-state.json`; vstupujú do serverovej validácie rezervácií, public mapy, admin mapy, dashboardu a sezónnych okien reportov.
- Lokálna perzistencia: uložené reporty úlovkov majú samostatný store `.data/rybolov-cetin/catch-reports.json`.
- Testy: Vitest je pridaný pre dostupnosť, požičovňu, admin workflow rezervácií, rezervačné API, lokálne store vrstvy, audit log, Zod formuláre, súťažný workflow a seed/service kontrakty.

## Fáza 1: Produktový prototyp

- Doladiť public vs admin navigáciu.
- Pridať chýbajúce empty/error/loading stavy. Prvý shared komponent je v prototype.
- Upraviť mapu jazera smerom k SVG/editor modelu. Prvá SVG vrstva a admin editor sú v prototype.
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
- Pridať lokálny JSON store ako dočasné úložisko pred Supabase. Prvá verzia pre rezervácie, požičovňu, mapový editor, úlovky, skupinové zápisníky a súťažný dispečing je hotová.
- Doplniť audit log lokálnych a budúcich Supabase mutácií. Prvá lokálna verzia je hotová cez `audit-log.json`, `/admin/audit` a tabuľku `audit_events` v migrácii.
- Nastaviť RLS politiky podľa rolí.
- Dopĺňať roly `tournament_organizer`, `accountant` a `worker` popri owner, manager, marshal, tournament team a angler. Mock admin už má spoločnú access matrix pre navigáciu, dashboard, route guard, write/read obmedzenia vo všetkých hlavných admin moduloch a serverový guard pre `/api/admin/*`.

## Fáza 3: Rezervácie a dostupnosť

- Implementovať availability engine. Prvá mock verzia je hotová.
- Kombinovať rezervácie, uzávierky, údržbu, sezóny, neres, súťaže a pravidlá chát. Uzávierky sú už samostatný lokálny API/store modul a public mapa, admin mapa, dashboard aj rezervácie ich čítajú ako živý stav.
- Započítať dostupnosť požičovne podľa termínu. Prvá mock verzia cez `rentalBookings` je hotová.
- Vytvoriť kalendár obsadenosti po jazerách, miestach a chatách. Prvá týždňová mriežka v adminovi je hotová.
- Pridať schvaľovanie rezervácií a interné poznámky správcu. Prvý mock service workflow v `/admin/rezervacie` je hotový.
- Pripraviť platobné metódy ako voliteľný modul. Aktuálne má byť dostupná hotovosť na mieste a bankový prevod; platobná brána zostáva pripravená, ale vypnutá.

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

- Rozšíriť mock dispečing na reálne súťažné role. Lokálny store, API a offline fronta pre hlásenia tímov, priradenie kontrolóra a overenie váženia sú hotové.
- Pridať tímové účty a sektorové priradenie.
- Zaviesť hlásenia tímov: úlovok, porušenie, technická pomoc, námietka. Prvé public odoslanie hlásenia je hotové.
- Pridať kontrolórske váženia, tresty, kontroly pravidiel a live rebríček. Prvé admin overenie váženia, formulár trestu a formulár kontroly pravidiel sú hotové.
- Pripraviť režim, kde organizácia môže, ale nemusí používať interné funkcie aplikácie Rybolov Cetín.

## Fáza 6: PWA a notifikácie

- Pripraviť VAPID kľúče. Env miesta pre public/private kľúč sú pripravené.
- Zaviesť `push_subscriptions`. Prvá lokálna verzia odberov je hotová cez `.data/rybolov-cetin/notification-state.json`.
- Posielať výstrahy pred búrkou, servisné oznamy, zmeny rezervácie a súťažné udalosti. Mock broadcast pre výstrahy a oznamy je hotový v `/admin/notifikacie`; reálne Web Push odosielanie čaká na provider.
- Podporiť offline-friendly obrazovky pri vode. `/offline`, stavový banner pripojenia, header badge čakajúcich položiek, runtime cache pre kľúčové public API a centrum všetkých čakajúcich offline položiek sú hotové vrátane chybového stavu, počtu pokusov a preklikov do príslušných formulárov.
- Pridať offline mutačnú frontu pre úlovky. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri sieťovom zlyhaní podrží validovaný úlovok aj s fotkou v zariadení a po návrate internetu ho odošle na `POST /api/catches`.
- Pridať offline mutačnú frontu pre súťažné hlásenia tímov. Prvá verzia je hotová cez klientsku IndexedDB frontu, ktorá pri výpadku podrží privolanie kontrolóra, hlásenie porušenia alebo technickú pomoc a po návrate internetu ho odošle na `POST /api/tournament-requests`.
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
- Mapový editor má smerovať k plnému SVG editoru s možnosťou nahrať podkladový obrázok.
- Súťažné roly zahŕňajú organizátora, kontrolóra, tím a internú prevádzku.

## Otvorené rozhodnutia

- Aké presné vybavenie a ceny má požičovňa.
