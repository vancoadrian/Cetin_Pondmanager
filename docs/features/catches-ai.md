# Úlovky a budúca AI vrstva

## Cieľ

Evidencia úlovkov má byť užitočná pre rybára aj správcu. Rybár získa vlastný zápisník výprav, správca získa dáta o rybách, miestach, nástrahách a čase.

## Osobný a skupinový zápisník

Používateľ má vedieť vytvoriť:

- osobný zápisník,
- skupinový zápisník výpravy,
- súťažný zápisník tímu.

Skupina rybárov si vie zapisovať úlovky jednotlivo, ale pod jednou výpravou.

Zápisník má fungovať aj bez účtu cez link alebo kód. Účet rybára je pridaná hodnota pre vlastnú históriu, opakované výpravy a prístup k osobným dátam.

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

## Stav v prototype

- `/ulovky` má verejný prototyp denníka napojený na lokálny JSON store.
- Seed dáta sú v `catches`.
- Skupinové výpravy majú prvý mock model v `tripLogbooks` a `tripLogbookEntries`.
- Verejná stránka zobrazuje spoločnú tabuľku partie, členov, váhu a stav fotky pre AI-ready zápisy.
- Formulár úlovku a skupinového zápisníka používa Zod validácie a zapisuje cez `POST /api/catches` a `POST /api/logbooks`.
- Nový úlovok sa uloží ako čakajúci na schválenie. Verejný zoznam filtruje iba schválené úlovky.
- Verejný formulár podporuje JPG, PNG a WebP fotku do 6 MB. Server ju uloží do `.data/rybolov-cetin/catch-photos/` a metadata do `catchPhotos`.
- Fotka sa číta cez `GET /api/catch-photos/:id`; v produkcii sa tento kontrakt nahradí Supabase Storage URL.
- Metadata fotky už obsahujú `storagePath`, `publicUrl`, `aiStatus`, `aiNotes`, MIME typ a veľkosť súboru.
- `/admin/ulovky` má prvý schvaľovací workflow: správca vie úlovok schváliť, ponechať v kontrole alebo zamietnuť s poznámkou.
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
- Plánovač reportov sa dá spustiť cez `POST /api/admin/catch-reports/run-due`; prejde aktívne týždenné a mesačné reporty, spracuje iba splatné položky, aktualizuje `lastGeneratedAt`, delivery logy a audit udalosť `catch.report.schedule.run`.
- Hostingový cron môže volať `GET/POST /api/cron/catch-reports/run-due`; endpoint vyžaduje `RYBOLOV_REPORT_SCHEDULER_SECRET` cez `Authorization: Bearer <secret>` alebo `x-rybolov-cron-secret` a audit detail `source: cron`.
- Doručovací provider je konfigurovateľný cez `.env`: `mock`, `resend` alebo `disabled`. `mock` je bezpečný režim bez odoslania, `disabled` iba zaznamená preskočené doručenie a `resend` odošle report cez Resend Email API, ak je nastavený `RYBOLOV_RESEND_API_KEY`.
- Úlovky majú prvý weather snapshot: podmienky, teplotu vzduchu a vody, tlak, trend tlaku, vietor, smer vetra, oblačnosť a zdroj dát.
- Nový verejný zápis úlovku dostane weather snapshot automaticky cez `catchWeatherService`; v prototype je deterministický mock podľa jazera, lovného miesta a času.
- Weather resolver má provider konfiguráciu cez `.env`: `mock`, `station`, `manual`, `weather-api` alebo `disabled`. Stanica a manuálny režim môžu posielať kompletný snapshot; neúplný provider bezpečne padá na mock, ak je zapnutý fallback.
- Ak správca opraví čas, jazero alebo lovné miesto úlovku, korekcia prepočíta aj weather snapshot, aby analytika neskôr nepracovala s nesprávnym kontextom.
- Admin report počíta priemernú vodu, vzduch, tlak, vietor a najčastejšie podmienky pri zábere.
- Lokálny stav sa ukladá do `.data/rybolov-cetin/catch-state.json`.
- Súťažné úlovky sú oddelené v `tournamentCatches`.

## Ďalšie kroky

- Napájať skupinové výpravy na reálne účty a pozvánky.
- Dopracovať asynchrónny adaptér pre konkrétnu meteoslužbu alebo lokálnu stanicu.
- Po výbere hostingu nastaviť reálny cron schedule nad `/api/cron/catch-reports/run-due`.
- Napájať upload fotiek na Supabase Storage a pravidlá prístupu podľa schválenia úlovku.
- Vytvoriť prvý AI job nad `catchPhotos.aiStatus`.
