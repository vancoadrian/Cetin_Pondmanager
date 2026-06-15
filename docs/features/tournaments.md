# Súťaže

## Cieľ

Súťažný modul má pokryť organizáciu kaprárskych pretekov: sektory, tímy, kontrolórov, hlásenia, váženie, tresty a live výsledky.

Organizátor môže používať iba verejnú mapu a výsledky, alebo celý interný dispečing aplikácie Rybolov Cetín.

## Role

| Rola | Úloha |
| --- | --- |
| organizátor | vytvára súťaž, pravidlá, tímy, sektory |
| kontrolór | kontroluje sektory, váži úlovky, zapisuje tresty |
| tím | hlási úlovok, porušenie, technickú pomoc alebo námietku |
| účtovník | pripravuje podklady k štartovnému alebo službám, ak ich organizátor používa |
| brigádnik | pomáha pri nástupoch, výbave, servise sektorov a prevádzke |
| divák | vidí verejné výsledky podľa nastavenia |

## Požiadavky tímu

Tím vie vytvoriť hlásenie:

- `catch-measurement` — požaduje príchod kontrolóra k úlovku,
- `rule-report` — hlási porušenie pravidiel iného tímu,
- `technical-help` — potrebuje technickú pomoc,
- `other` — iná udalosť.

Každé hlásenie má sektor, tím, prioritu, stav, čas a voliteľne priradeného kontrolóra.

## Kontrolór

Kontrolór má:

- pridelené sektory,
- stav služby,
- front hlásení,
- možnosť zapísať meranie úlovku,
- možnosť zapísať kontrolu pravidiel,
- možnosť udeliť trest alebo napomenutie.

## Tresty

Podporované typy:

- napomenutie,
- zákaz lovu na N hodín,
- zníženie počtu prútov na N hodín,
- stav na posúdenie organizátorom.

Trest musí obsahovať dôvod, kontrolóra, čas, sektor, tím a stav.

## Úlovky

Súťažný úlovok musí byť overený kontrolórom.

Záznam obsahuje:

- sektor,
- tím,
- druh,
- váhu,
- mieru,
- čas chytenia,
- čas merania,
- kontrolóra,
- fotku alebo označenie fotky,
- stav: čaká, overené, sporné.

## Stav v prototype

- `/sutaze` obsahuje verejný aj pracovný náhľad dispečingu napojený na lokálny JSON store.
- Verejná súťažná mapa číta podklad a sektorové polygony z rovnakého `/api/map` modelu ako revírová mapa; statický súťažný obrázok ostáva iba fallback.
- `/sutaze` zobrazuje live výsledkovku tímov podľa sektorového skóre, najväčšieho úlovku a overovacích stavov úlovkov.
- Výsledkovka má public JSON feed pre externé obrazovky, admin CSV export samotnej výsledkovky a širší organizačný CSV balík.
- `/sutaze/vysledkovka` je samostatná verejná obrazovka pre kiosk alebo projektor. Číta public feed, vie prepínať súťaž cez `turnaj`, zobrazuje top tímy, štatistiky, čakajúce merania a sponzorský scoreboard slot.
- `/sutaze` obsahuje public prihlášku tímu bez účtu: názov tímu, kontakt, telefón, voliteľný e-mail, počet členov, mesto, preferovaný sektor a poznámku pre organizátora.
- `/sutaze/tim?turnaj=<id>&sektor=<id>` a kratší variant `/sutaze/tim?kod=<kod>` sú tímové panely bez účtu s predvoleným sektorom. Tím odtiaľ vie rýchlo požiadať o meranie úlovku, nahlásiť porušenie pravidiel, technickú pomoc alebo inú udalosť; používa rovnakú offline frontu ako formulár na `/sutaze`. Kód je v prototype praktická navigácia, nie bezpečnostná autentifikácia.
- Tímový panel má mock lokálny tímový prístup v zariadení cez `localStorage`. Partia si vie aktivovať aktuálny sektor, zadať tímový kód ručne bez QR skenovania, vrátiť sa k nemu bez opätovného skenovania QR kódu a odhlásiť zariadenie. Produkčné tímové účty neskôr nahradia túto vrstvu skutočným identity providerom.
- Turnaj má `operationsMode`: `public-only`, `registration-only` alebo `full-dispatch`. Public stránka podľa neho zobrazí iba mapu/výsledkovku, povolí online prihlášky alebo otvorí celý tímový dispečing. Server rovnaký režim kontroluje pri odoslaní prihlášky, tímového hlásenia aj kontrolórskych úkonov.
- `/admin/sutaze` ukazuje mapové pokrytie sektorov, teda koľko súťažných sektorov má naviazaný polygon z admin editora mapy. Admin pohľad najprv číta rozpracovaný draft cez `/api/admin/map`, aby organizátor videl aj pripravované sektorové polygony pred publikovaním; pri nedostupnom admin prístupe spadne späť na publikovanú public mapu.
- Z mapového pokrytia a sektorového operačného editora vedie priamy preklik do `/admin/mapa?turnaj=<id>&sektor=<id>`. Mapový editor podľa neho otvorí existujúci polygon sektora alebo pripraví nový neuložený draft sektorového polygonu.
- Mapový editor vie pre danú súťaž jedným klikom pripraviť neuložené draft polygony pre všetky sektory, ktoré ešte nemajú SVG tvar.
- `/admin/sutaze` vie prepínať režim používania súťaže medzi public prezentáciou, online prihláškami a plným dispečingom. Zmena sa zapisuje do lokálneho turnajového store a audit logu.
- `/admin/sutaze` generuje tímový odkaz pri každom sektore, hromadný zoznam tímových kódov, CSV export a preklik na `/admin/sutaze/karticky`, kde si organizátor vie vytlačiť kartičky s QR kódom pre každý sektor.
- `/admin/sutaze/kontrolor?turnaj=<id>&kontrolor=<id>` je interný mock panel kontrolóra. Zobrazuje iba pridelené sektory, otvorené tímové hlásenia, čakajúce váženia, aktívne tresty, rýchle formuláre kontroly a trestu a používa tú istú offline frontu kontrolórskych úkonov ako hlavný admin dispečing.
- `/admin/sutaze/kontrolori-karticky?turnaj=<id>` generuje tlačiteľné QR kartičky pre kontrolórov s menom, telefónom, pridelenými sektormi a priamym odkazom do kontrolórskeho panelu.
- `/admin/sutaze` má operačný editor sektorov a tímov: správca vie upraviť označenie sektora, tím, priebežnú váhu a percentuálnu pozíciu bodu. Stabilné sektorové ID sa počas súťaže nemení, aby sa nerozbili hlásenia, váženia, tresty, kontrolóri a mapové väzby.
- `/admin/sutaze` má front prihlášok tímov. Organizátor vie tím schváliť do sektora, zaradiť do poradovníka alebo zamietnuť. Schválenie tímu prepíše tím v sektore a tým sa prejaví aj vo výsledkovke.
- Nové tímové hlásenie a priradenie kontrolóra vytvára mock notifikačný broadcast pre okruh `tournaments` s internou audience vrstvou a delivery logom po zariadeniach. Hlásenie tímu cieli organizátora súťaže a kontrolórov pridelených k sektoru; priradenie hlásenia cieli konkrétneho kontrolóra cez `marshalIds`. Mock odbery pre organizátora, kontrolóra alebo tím sa dajú vytvoriť v `/admin/notifikacie`.
- `/admin/sutaze` používa tú istú výsledkovkovú utilitu ako verejná stránka a ukazuje súčet skóre, aktívne tímy, čakajúce/sporné váženia a odvodené váhy z úlovkov.
- Seed dáta sú v `tournamentTeamRegistrations`, `tournamentMarshals`, `tournamentRequests`, `tournamentCatches`, `tournamentPenalties`, `tournamentRuleChecks`.
- Tímový formulár na `/sutaze` má klientsku IndexedDB offline frontu. Ak výpadok siete zastaví odoslanie hlásenia, validovaný payload zostane v zariadení, UI ukáže čakajúce hlásenia a po návrate internetu sa fronta odošle na `POST /api/tournament-requests`.
- `/offline` zobrazuje čakajúce súťažné hlásenia spolu s ostatnými offline položkami, vie ich hromadne odoslať alebo odstrániť zo zariadenia.
- `/admin/sutaze` aj `/admin/sutaze/kontrolor` majú klientsku IndexedDB offline frontu pre kontrolórske úkony: prevzatie hlásenia, uzavretie hlásenia, overenie váženia, sporné váženie, trest a kontrolu pravidiel. Pri výpadku signálu ostanú v zariadení a po návrate internetu sa odosielajú na existujúce admin endpointy.
- Kontrolórske admin úkony nesú `clientMutationId`; opakovaný sync prevzatia hlásenia, uzavretia hlásenia, overenia váženia, trestu alebo kontroly pravidiel vráti pôvodný výsledok a nevytvorí duplicitný audit ani záznam.
- `/offline` zobrazuje aj čakajúce kontrolórske úkony z admin dispečingu, vie ich hromadne odoslať alebo odstrániť zo zariadenia.
- `/admin/sutaze` zobrazuje súhrn súťažných hlásení, vie priradiť kontrolóra, uzavrieť hlásenie, overiť čakajúce váženie, zapísať trest a zapísať kontrolu pravidiel. Z každej karty kontrolóra vedie preklik na jeho samostatný panel.
- Lokálny stav sa ukladá do `.data/rybolov-cetin/tournament-state.json`.
- Súťažné zásahy sa zapisujú aj do `.data/rybolov-cetin/audit-log.json` a sú viditeľné v `/admin/audit`.
- API kontrakt: `GET /api/tournaments`, `GET /api/tournaments/:id/leaderboard`, `POST /api/tournament-team-registrations`, `POST /api/tournament-requests`, `GET /api/admin/tournaments/:id/leaderboard-export`, `GET /api/admin/tournaments/:id/organizer-export`, `PUT /api/admin/tournaments/:id/sectors`, `PUT /api/admin/tournaments/:id/operations-mode`, `POST /api/admin/tournaments/team-registrations/:id/decision`, `POST /api/admin/tournaments/requests/:id/action`, `POST /api/admin/tournaments/catches/:id/verify`, `POST /api/admin/tournaments/penalties`, `POST /api/admin/tournaments/rule-checks`.

## Ďalšie kroky

- Produkčne otestovať Web Push provider s reálnymi browser endpointmi a VAPID kľúčmi.
