# Rybolov Cetín

PWA prototyp pre správu rybárskeho revíru Štrkovisko Kocka a Veľký Cetín. Technický základ a UI rytmus nadväzuje na `FK_KNV_Clubhouse`: Nuxt 4, Nuxt UI, Tailwind v4, PWA manifest, app shell, mobile-first navigácia a pripravenosť na push notifikácie.

## Čo je hotové

- Verejný dashboard s výstrahou, obsadenosťou, mapou a poslednými úlovkami.
- Obrazovka revírov pre dve susedné jazerá.
- Interaktívna mapa lovných miest, chát, servisných bodov a polygonových zón.
- Rezervačný prototyp s obsadenosťou, miestami a formulárom žiadosti.
- Denník úlovkov s miestom, mierou, váhou, nástrahou, časom, skupinovým zápisníkom, admin schválením, interným reportom a budúcou AI vrstvou.
- Súťažná mapa sektorov pre kaprárske preteky s kontrolórmi, hláseniami, vážením a trestami.
- Verejná stránka sponzorov.
- Mock login a interný admin dashboard pre majiteľa, správcu, organizátora, kontrolóra, súťažný tím, účtovníka a brigádnika.
- Zapínateľné platobné metódy: hotovosť na mieste, bankový prevod a vypnutá budúca platobná brána.
- Lokálne ukladanie rezervácií, požičovne, mapového editora, úlovkov, skupinových zápisníkov, uložených reportov, súťažného dispečingu a audit logu do `.data/rybolov-cetin/` ako dočasný backend pred Supabase.
- PWA inštalačný prompt a základ push service worker.

## Lokálny vývoj

```bash
pnpm install
pnpm dev
```

Potom otvor `http://localhost:3000`.

Env základ skopíruj z `.env.example`. `RYBOLOV_ENVIRONMENT` môže byť `development`, `staging` alebo `production`; admin modul `/admin/system` potom ukáže readiness kontrolu pre verejnú URL, perzistentný lokálny dátový adresár, Web Push/VAPID, Resend reporty, cron secret a weather provider.

## Dáta

Pilotné dáta sú v `app/data/pond.ts`. Sú zámerne typované, aby sa dali neskôr nahradiť Supabase tabuľkami bez prepisovania obrazoviek:

- `lakes`
- `pegs`
- `reservations`
- `paymentMethods`
- `catches`
- `lakeClosures`
- `tournaments`
- `tournamentMarshals`
- `tournamentRequests`
- `tournamentCatches`
- `tournamentPenalties`
- `sponsors`
- `alerts`

Rezervačný workflow už používa aj lokálny runtime stav v `.data/rybolov-cetin/reservation-state.json`. Súbor sa pri prvom API volaní vytvorí zo seed dát, potom doň pribúdajú webové žiadosti a admin rozhodnutia.

Mapový editor používa `.data/rybolov-cetin/map-state.json` a nahraté podklady ukladá do `.data/rybolov-cetin/map-assets/`. Admin úpravy lovných miest, chát, servisných bodov, polygonových plôch a aktívnych vrstiev sa ukladajú cez `PUT /api/admin/map`, public mapa číta rovnaký stav cez `GET /api/map`.

Notifikácie používajú `.data/rybolov-cetin/notification-state.json`. Verejná stránka číta oznamy cez `GET /api/notifications`, PWA odber uloží cez `POST /api/notifications/subscribe` a vypne cez `POST /api/notifications/unsubscribe`. Admin obrazovka `/admin/notifikacie` číta interný stav cez `GET /api/admin/notifications` a pripraví nový oznam cez `POST /api/admin/notifications/broadcast`; zatiaľ ide o mock dispatcher s audit stopou, pripravený na Web Push po doplnení `NUXT_PUBLIC_VAPID_PUBLIC_KEY`, `RYBOLOV_VAPID_PRIVATE_KEY` a odosielacieho providera.

Offline režim má stránku `/offline`, stavový banner v app shelli, service worker cache pre verejné API `/api/notifications`, `/api/map`, `/api/reservations`, `/api/catches`, `/api/tournaments` a obrázky revíru. Pri slabom signále sa zobrazí posledná uložená odpoveď, aby mapa, výstrahy a základné prehľady nepadli na prázdnu obrazovku. Verejné formuláre pre rezervácie, úlovky a súťažné hlásenia majú klientsku IndexedDB frontu: ak odoslanie zlyhá kvôli výpadku siete, validovaný payload ostane v zariadení a po návrate internetu sa odošle do príslušného API. `/offline` zároveň funguje ako centrum čakajúcich položiek s hromadným odoslaním, mazanim jednotlivých offline záznamov, počtom položiek na kontrolu, poslednou chybou a preklikom späť do príslušného formulára. App header zobrazuje badge s počtom čakajúcich offline položiek, ak v zariadení niečo ostalo neodoslané.

Denník úlovkov používa `.data/rybolov-cetin/catch-state.json`. Verejná stránka číta iba schválené úlovky cez `GET /api/catches`, interný admin stav číta chránený endpoint `GET /api/admin/catches`, nové úlovky sa ukladajú cez `POST /api/catches` a skupinové zápisníky cez `POST /api/logbooks`. Public feed nevracia cudzie zápisníky ani ich share kódy; konkrétny zápisník sa dá otvoriť cez `GET /api/logbooks/:code` a nové kódy majú prefix jazera, skrátený názov a náhodný suffix. Fotky úlovkov sa v prototype ukladajú do `.data/rybolov-cetin/catch-photos/` a čítajú cez `GET /api/catch-photos/:id`; public prístup k fotke je povolený až po schválení úlovku, admin s prístupom k úlovkom ju vidí aj počas moderácie. Nové úlovky čakajú na schválenie pred verejným zobrazením a dostávajú automatický weather snapshot cez provider `mock`, `station`, `manual`, `weather-api` alebo `disabled`; `/admin/ulovky` ich vie opraviť cez `POST /api/admin/catches/:id/correction`, pri korekcii ponechať, presunúť alebo odpojiť väzbu na zápisník a následne schváliť, ponechať v kontrole alebo zamietnuť cez `POST /api/admin/catches/:id/decision`. Interný report má filtre podľa obdobia, sezónneho okna, jazera a druhu, vie exportovať schválené úlovky do surového CSV aj manažérsky CSV export trendových signálov, počíta prvé weather signály pri zábere, porovnáva aktuálne obdobie s rovnakým obdobím minulý rok a zobrazuje mesačný, druhový aj kombinovaný trend druh + lovné miesto. Uložené reporty správcu sa ukladajú do `.data/rybolov-cetin/catch-reports.json` cez `GET/POST /api/admin/catch-reports`; `POST /api/admin/catch-reports/:id/generate` vygeneruje súhrn, CSV úlovkov a CSV trendových signálov, `POST /api/admin/catch-reports/:id/email-draft` pripraví e-mailový draft s prílohami a `POST /api/admin/catch-reports/run-due` spustí splatné týždenné alebo mesačné reporty naraz. Pre hostingový cron je pripravené aj `GET/POST /api/cron/catch-reports/run-due`, ktoré vyžaduje `RYBOLOV_REPORT_SCHEDULER_SECRET` v hlavičke `Authorization: Bearer <secret>` alebo `x-rybolov-cron-secret`. Provider `RYBOLOV_REPORT_DELIVERY_PROVIDER=mock` draft len uloží, `disabled` preskočí doručenie a `resend` odošle report cez Resend API, ak je nastavený `RYBOLOV_RESEND_API_KEY`.

Súťažný dispečing používa `.data/rybolov-cetin/tournament-state.json`. Verejná stránka číta stav cez `GET /api/tournaments` a hlásenia tímov ukladá cez `POST /api/tournament-requests`; admin akcie používajú endpointy pod `/api/admin/tournaments` vrátane priradenia kontrolóra, overenia váženia, trestov a kontrol pravidiel.

Audit log používa `.data/rybolov-cetin/audit-log.json`. Admin obrazovka `/admin/audit` číta udalosti cez `GET /api/admin/audit`; udalosti sa zapisujú pri rezerváciách, úlovkoch, zápisníkoch, mapových úpravách, súťažných akciách a systémových backup/restore úkonoch.

Systémový monitoring má verejný `GET /api/health`, admin detail `/api/admin/system` a lokálny error log `.data/rybolov-cetin/error-log.json`. Klientsky runtime reporter posiela skrátené chyby na `POST /api/client-errors`; `/admin/system` zobrazuje health checky, environment readiness, posledné chyby, lokálny data export, prevádzkový checklist backup workflow a posledné audit udalosti backupov.

Lokálne dáta sa dajú pred Supabase zálohovať cez admin endpoint `GET /api/admin/data-export`. V `/admin/system` je panel so súhrnom store, počtom záznamov, asset súbormi a downloadom JSON exportu. Režim `assets=manifest` uloží dáta a zoznam súborov, `assets=inline` vloží obrázky a logá priamo ako base64 do JSON zálohy. Každý nový export obsahuje SHA-256 integritný odtlačok; preview ho overí a upravený alebo poškodený súbor označí ako neplatný. Ten istý panel vie cez `POST /api/admin/data-import/preview` ne-deštruktívne skontrolovať nahratý backup, porovnať store a ukázať upozornenia ešte pred restore. Ostrá obnova ide cez `POST /api/admin/data-import/restore`, vyžaduje frázu `OBNOVIT DATA` a pred prepísaním store uloží safety backup aktuálneho stavu do `.data/rybolov-cetin/backups/`. Admin vie safety backupy listovať cez `GET /api/admin/data-backups`, priamo načítať do kontroly obnovy, stiahnuť konkrétny súbor cez `GET /api/admin/data-backups/:id?download=1` a čistiť staršie safety backupy cez dvojkrokový `POST /api/admin/data-backups/cleanup` s náhľadom a frázou `VYCISTIT BACKUPY`.

Seed export pre budúci Supabase import spustíš cez `pnpm seed:export`. Vygeneruje `supabase/seed/rybolov-cetin.seed.json` s deterministickými UUID a tabuľkovým payloadom podľa aktuálneho dátového kontraktu.

## Podklady

Obsahový základ bol pripravený podľa existujúceho webu:

- https://strkoviskokocka.sk/
- https://strkoviskokocka.sk/strkovisko-velky-cetin/home/
- https://strkoviskokocka.sk/strkovisko-kocka/home/

Lokálne obrazové podklady sú skopírované do `public/images/`.

## Dokumentácia

- `docs/plan.md` — produktový plán a roadmapa.
- `docs/architecture.md` — architektúra, tabuľky, roly, public vs interné.
- `docs/data-model.md` — návrh dátového modelu a availability engine.
- `docs/public-admin.md` — rozdelenie verejnej a internej časti.
- `docs/features/reservations.md` — rezervačný systém.
- `docs/features/tournaments.md` — súťažný workflow.
- `docs/features/maps.md` — mapy a editor miest.
- `docs/features/catches-ai.md` — úlovky a budúca AI vrstva.
- `docs/features/sponsors.md` — sponzori.
- `docs/seed-import.md` — export mock dát do Supabase seed formátu.
- `docs/source-web-assets.md` — zdrojové webové podklady a overené fakty.
