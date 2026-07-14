# Úlovky a budúca AI vrstva

## Cieľ

Evidencia úlovkov má byť užitočná pre rybára aj správcu. Rybár získa vlastný zápisník výprav, správca získa dáta o rybách, miestach, nástrahách a čase.

## Osobný a skupinový zápisník

Používateľ má vedieť vytvoriť:

- osobný zápisník,
- skupinový zápisník výpravy,
- súťažný zápisník tímu.

Skupina rybárov si vie zapisovať úlovky jednotlivo, ale pod jednou výpravou.

Zápisník funguje aj bez účtu cez link alebo kód. Prihlásený rybár je vlastníkom cez stabilné ID účtu, nie cez textové meno ani e-mail uložený v zápisníku. V prototype používa `/konto` samostatnú mock cookie session a `GET /api/account/logbooks` vráti iba zápisníky vlastnené alebo člensky priradené k danému účtu. Produkčne sa mock ID nahradí väzbou `owner_user_id` a `trip_logbook_members.user_id` na Supabase Auth.

## Dáta úlovku

Úlovok má obsahovať:

- jazero,
- lovné miesto,
- rybára alebo tím,
- druh,
- váhu,
- mieru,
- čas,
- nástrahu,
- poznámku,
- fotku,
- či bola ryba pustená späť.
- stav schválenia pre verejné zobrazenie.

## Analytika

Z dát sa dá neskôr vyhodnotiť:

- ktoré miesta fungujú v ktorom období,
- aké nástrahy fungujú na konkrétne druhy,
- aktivita podľa hodiny a počasia,
- vývoj konkrétnych rýb,
- úspešnosť počas súťaží.

## AI vrstva

Fotky treba ukladať tak, aby sa dali neskôr použiť na:

- porovnanie opakovane chytených jedincov,
- sledovanie rastu ryby,
- detekciu druhu,
- kontrolu manipulácie s rybou nad podložkou.

AI nemá nahradiť správcu. Má pomáhať hľadať kandidátov a nezrovnalosti.

## Čipované ryby

Fyzický čip je primárna dôveryhodná identita konkrétnej ryby. Fotografia a budúca AI vrstva sú doplnkový spôsob identifikácie, najmä ak čip nebol načítaný alebo ryba ešte nebola označená.

Register oddeľuje:

- `TaggedFish`: stabilnú identitu, číslo čipu, meno, druh a prvé označenie,
- `FishObservation`: každé ďalšie načítanie čipu, váhu, dĺžku, čas a miesto.

Číslo čipu, čas a miesto prvého označenia sa po založení nemenia. Správca môže opraviť meno, druh a internú poznámku alebo zmeniť životný stav ryby na aktívnu, nezvestnú, premiestnenú či uhynutú. Zmena stavu vyžaduje dôvod, zachová celú históriu meraní a vytvorí auditnú udalosť.

Pri rybe nad prevádzkovou hranicou konkrétneho jazera má rybár počas služby kontaktovať správcu. Ak čip existuje, správca pridá meranie. Ak neexistuje, rybu označí a rybár môže navrhnúť meno. Limit, zapnutie pravidla, spôsob kontaktu, telefón, e-mail, týždenné okná služby a text postupu počas aj mimo služby sa nastavujú samostatne pre každé jazero. Predvolený prototyp má víkendovú službu v sobotu a nedeľu od 07:00 do 18:00.

Verejný formulár pri rybe nad limitom počas služby ponúkne akciu `Privolať správcu`. Rybár doplní telefón a požiadavka vytvorí internú push notifikáciu pre správcu a majiteľa. Správca v `/admin/ryby` odpovie `Som na ceste` s ETA 5 až 30 minút alebo `Pustite bezomňa`. Po príchode otvorí `Spracovať rybu`, vyberie existujúci čip a doplní meranie, alebo založí nový čip; jazero, stanovisko, čas, rybár, druh, váha a dĺžka sa prenesú z privolania. Úspešné uloženie privolanie automaticky uzavrie, pričom zostáva aj núdzová možnosť uzavrieť ho bez merania. Verejná obrazovka obnovuje stav požiadavky každých päť sekúnd cez privátny token; požiadavka je oddelená od samotného uloženia a moderácie úlovku. Rybár môže otvorené privolanie zrušiť. Po piatich minútach bez odpovede sa zvýrazní telefonický kontakt a po 30 minútach čakania sa stará požiadavka automaticky označí ako vypršaná.

## Stav v prototype

- `/ulovky` má verejný prototyp denníka napojený na lokálny JSON store.
- Seed dáta sú v `catches`.
- Skupinové výpravy majú prvý mock model v `tripLogbooks` a `tripLogbookEntries`.
- `/konto` má prvý mock rybársky účet viazaný na e-mail. Nový zápisník vytvorený počas session dostane serverovo určené `ownerUserId` a ostane v histórii účtu aj bez znalosti kódu.
- Verejná stránka zobrazuje spoločnú tabuľku partie, členov, váhu a stav fotky pre AI-ready zápisy.
- Formulár úlovku a skupinového zápisníka používa Zod validácie a zapisuje cez `POST /api/catches` a `POST /api/logbooks`.
- Formulár úlovku má klientsku offline frontu v IndexedDB. Ak odoslanie zlyhá kvôli výpadku siete, validovaný payload vrátane fotky ostane v zariadení, UI ukáže čakajúce záznamy a po návrate internetu sa fronta odošle na `POST /api/catches`.
- Nový úlovok sa uloží ako čakajúci na schválenie. Verejný zoznam filtruje iba schválené úlovky.
- Verejný formulár podporuje JPG, PNG a WebP fotku do 6 MB. Server ju uloží do `.data/rybolov-cetin/catch-photos/` a metadata do `catchPhotos`.
- Fotka sa číta cez `GET /api/catch-photos/:id`; v produkcii sa tento kontrakt nahradí Supabase Storage URL.
- Metadata fotky už obsahujú `storagePath`, `publicUrl`, `aiStatus`, `aiNotes`, MIME typ a veľkosť súboru.
- `/admin/ulovky` má prvý schvaľovací workflow: správca vie úlovok schváliť, ponechať v kontrole alebo zamietnuť s poznámkou.
- Admin pracovisko je rozdelené na pohľady `Moderácia`, `Analytika` a `Reporty`. Analytiku a reporty možno otvoriť priamym parametrom `sekcia`; odkaz s `catchId` vždy otvorí moderáciu a konkrétny detail úlovku. Záložky podporujú šípky, Home a End a formuláre si pri prepínaní zachovávajú rozpracovaný stav.
- `/admin/ulovky` vie pred rozhodnutím opraviť rybára, druh, miesto, čas, váhu, mieru, nástrahu, pustenie ryby a poznámku.
- Pri admin korekcii sa dá väzba na zápisník ponechať, presunúť do iného kompatibilného zápisníka alebo odpojiť. Riadok zápisníka sa zosúladí s opraveným úlovkom.
- Admin rozhodnutie používa `POST /api/admin/catches/:id/decision`, zapisuje späť do lokálneho catch store a vytvára audit udalosť.
- Admin korekcia používa `POST /api/admin/catches/:id/correction`, zapisuje späť do lokálneho catch store a vytvára audit udalosť.
- Interný report v `/admin/ulovky` používa `createCatchAnalytics()` a vyhodnocuje schválené úlovky podľa druhu, miesta, nástrahy, jazera, váhy a času.
- Report sa dá filtrovať podľa obdobia, sezónneho okna z pravidiel revíru, jazera a druhu. Aktuálny výber sa dá exportovať ako surový CSV úlovkov alebo ako manažérsky CSV trendových signálov pre správcu a účtovníka.
- Report porovná aktuálne filtrované obdobie s rovnakým obdobím minulý rok; bez minuloročnej vzorky zobrazí, že porovnanie nemá bázu.
- Mesačný trend rozkladá váhu úlovkov po mesiacoch s aktivitou a porovnáva ju s rovnakými mesiacmi minulého roka.
- Druhový trend ukáže, ktoré druhy rýb tvoria váhu úlovkov oproti rovnakému obdobiu minulého roka.
- Trend druh + lovné miesto ukáže najsilnejšie rastové aj klesajúce signály na konkrétnych miestach.
- Export trendových signálov skladá sezónne, mesačné, druhové a miesto-druhové porovnania do jednej tabuľky so stavom rast/pokles/bez bázy.
- Správca si vie uložiť aktuálny filter ako manuálny, týždenný alebo mesačný report pre majiteľa, správcu alebo účtovníka.
- Uložené reporty sa čítajú a zapisujú cez `GET/POST /api/admin/catch-reports`, majú lokálny store `.data/rybolov-cetin/catch-reports.json` a audit udalosť `catch.report.saved`.
- Uložený report sa dá vygenerovať cez `POST /api/admin/catch-reports/:id/generate`; výsledok obsahuje manažérsky súhrn, voliteľný CSV export úlovkov, voliteľný CSV export trendových signálov a audit udalosť `catch.report.generated`.
- E-mailový draft reportu sa pripraví cez `POST /api/admin/catch-reports/:id/email-draft`; podľa providera vznikne lokálny draft, preskočené doručenie alebo reálne odoslanie cez Resend a vždy lokálny delivery log.
- Plánovač reportov sa dá spustiť cez `POST /api/admin/catch-reports/run-due`; prejde aktívne týždenné a mesačné reporty, spracuje iba splatné položky, aktualizuje `lastGeneratedAt`, delivery logy a audit udalosť `catch.report.schedule.run`. Výsledok aj admin panel ukazujú provider doručovania a počty odoslaných, pripravených, preskočených a chybných reportov.
- Hostingový cron môže volať `GET/POST /api/cron/catch-reports/run-due`; endpoint vyžaduje `RYBOLOV_REPORT_SCHEDULER_SECRET` cez `Authorization: Bearer <secret>` alebo `x-rybolov-cron-secret` a audit detail `source: cron`.
- Doručovací provider je konfigurovateľný cez `.env`: `mock`, `resend` alebo `disabled`. `mock` je bezpečný režim bez odoslania, `disabled` iba zaznamená preskočené doručenie a `resend` odošle report cez Resend Email API, ak je nastavený `RYBOLOV_RESEND_API_KEY`.
- Úlovky majú prvý weather snapshot: podmienky, teplotu vzduchu a vody, tlak, trend tlaku, vietor, smer vetra, oblačnosť a zdroj dát.
- Nový verejný zápis úlovku dostane weather snapshot automaticky cez `catchWeatherService`; v prototype je deterministický mock podľa jazera, lovného miesta a času.
- Weather resolver má provider konfiguráciu cez `.env`: `mock`, `station`, `manual`, `weather-api` alebo `disabled`. Stanica a manuálny režim môžu posielať kompletný snapshot; neúplný provider bezpečne padá na mock, ak je zapnutý fallback.
- Ak správca opraví čas, jazero alebo lovné miesto úlovku, korekcia prepočíta aj weather snapshot, aby analytika neskôr nepracovala s nesprávnym kontextom.
- Admin report počíta priemernú vodu, vzduch, tlak, vietor a najčastejšie podmienky pri zábere.
- Lokálny stav sa ukladá do `.data/rybolov-cetin/catch-state.json`.
- Súťažné úlovky sú oddelené v `tournamentCatches`.
- `/admin/ryby` má interný register čipovaných rýb, vyhľadávanie podľa čipu alebo mena, graf váhy a dĺžky, históriu miest a CSV import/export. Obrazovka je rozdelená na odkazovateľné pracovné pohľady `Privolania`, `Kontrola čipu`, `Register` a `Dostupnosť`; počty v navigácii ukazujú otvorené požiadavky, kandidátov, ryby a aktívne jazerné pravidlá. Na mobile sa aktívny pohľad aj aktívny admin modul automaticky posunú do viditeľnej časti navigácie.
- Register má lokálny store `.data/rybolov-cetin/fish-registry-state.json` a chránené endpointy `/api/admin/fish-registry`.
- `PATCH /api/admin/fish-registry/:id` upravuje iba meno, druh, poznámku a stav. Čip aj pôvodné označenie ostávajú nemeniteľné; zmena stavu vyžaduje dôvod a zapisuje `fish.status.changed` do auditu.
- `GET /api/admin/fish-registry/candidates` odvodzuje úlovky nad konfigurovaným limitom jazera bez čipovej väzby. Kandidát sa dá priradiť k existujúcemu čipu alebo použiť na založenie novej ryby; formuláre preberú váhu, dĺžku, čas, rybára, nástrahu a miesto.
- `/admin/ryby` upravuje pravidlá veľkej ryby cez `POST /api/admin/fish-registry/settings`; správca môže pridať viac týždenných kontaktných okien s dňami a časom. Verejný formulár úlovku číta bezpečný výber aktívnych pravidiel z `GET /api/fish-registry/rules` a pri prekročení limitu podľa času úlovku zobrazí buď kontakt, alebo pokyn mimo služby.
- Správca môže pri konkrétnom jazere jedným klikom zapnúť `Som tu a dostupný` na 2, 4, 8 alebo 12 hodín. Ak sú jazerá pri sebe, označí viac jazier a akciu `Som tu pre vybrané` odošle jedným atomickým volaním. Dočasná prítomnosť ide cez `POST /api/admin/fish-registry/presence`, má autora aj automatické vypršanie a počas platnosti má prednosť pred týždenným rozpisom.
- Detail v `/admin/ulovky` ukáže stav čipovej kontroly a otvorí konkrétny kandidát cez `/admin/ryby?catchId=...`.
- Priamy `catchId` má prednosť pred uloženým pohľadom a otvorí spracovanie konkrétneho kandidáta v `Kontrole čipu`. Priamy `privolanie` otvorí `Privolania`, zvýrazní čakajúcu požiadavku a pri stave správcu na ceste otvorí jej čipové spracovanie. Prechod na nové meranie alebo založenie ryby zachová pracovný kontext a presunie správcu do `Registra`.
- Súťažný kandidát zachová turnaj a sektor. Keďže sektor nie je automaticky totožný s lovným miestom, správca musí konkrétne miesto potvrdiť.
- Nový verejný úlovok nad limitom jazera automaticky pripraví interný service broadcast pre majiteľa a správcu s odkazom na konkrétnu admin moderáciu. Ak rovnaký úlovok už vytvoril živé privolanie správcu, fallback broadcast sa potlačí, aby správca nedostal dve notifikácie k jednej rybe.

## Ďalšie kroky

- Napájať skupinové výpravy na reálne účty a pozvánky.
- Dopracovať asynchrónny adaptér pre konkrétnu meteoslužbu alebo lokálnu stanicu.
- Po výbere hostingu nastaviť reálny cron schedule nad `/api/cron/catch-reports/run-due`.
- Napájať upload fotiek na Supabase Storage a pravidlá prístupu podľa schválenia úlovku.
- Zvážiť samostatný detail offline úlovku v `/offline`, ak bude treba pred odoslaním meniť fotku alebo údaje.
- Vytvoriť prvý AI job nad `catchPhotos.aiStatus`.
- Pri AI zhode ponúknuť správcovi kandidáta z `tagged_fish`, ale identitu potvrdiť čipom alebo manuálnym rozhodnutím.
