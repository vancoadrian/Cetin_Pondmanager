# Verejná a chránená časť

## Prístupový model

Rybolov Cetín používa jednu prihlasovaciu obrazovku `/login` s e-mailom a heslom. Po prihlásení sa používateľ presmeruje do priestoru zodpovedajúceho jeho role. Verejná navigácia neukazuje interné moduly ani odkaz „Admin“.

Verejný header po prihlásení ukáže iba jeden rolovo správny vstup do osobného alebo pracovného priestoru a samostatné odhlásenie. Rybár tak vidí účet, tím tímový panel, kontrolór svoj kontrolórsky panel a interné roly svoj prevádzkový priestor bez toho, aby verejná navigácia miešala administračné moduly medzi verejné odkazy.

Aktuálna lokálna autentifikácia používa cookie `rybolov_cetin_mock_session`. Rovnakú session používa verejné rozhranie, rybársky účet, tímový účet aj interné API guardy. Rozhranie a route guardy sú pripravené na nahradenie produkčným identity providerom bez zmeny informačnej architektúry.

## Verejné routy

| Route | Verejný obsah |
| --- | --- |
| `/` | prehľad revíru, dostupnosť a dôležité oznamy |
| `/reviry` | zoznam jazier, fotky, základné pravidlá a priame akcie na detail, mapu a rezerváciu |
| `/reviry/[slug]` | detail konkrétneho jazera, pravidlá a najbližšia dostupnosť |
| `/mapa` | publikovaná mapa, lovné miesta, chaty a dostupnosť |
| `/rezervacie` | žiadosť o rezerváciu, doplnkové služby a predvybraná výbava alebo chata z verejných odkazov |
| `/ulovky` | iba úlovky schválené správcom; otvorenie zápisníka platným kódom |
| `/sutaze` | verejný program, sektory, prihláška tímu a výsledkovka |
| `/sutaze/vysledkovka` | verejná výsledkovka |
| `/notifikacie` | verejné výstrahy a oznamy |
| `/info` | pravidlá, cenník, výbava, chaty a priame prekliky do rezervácie s predvýberom služby |
| `/kontakt` | kontakt na správcu, telefonát a príprava SMS správy podľa typu požiadavky |
| `/sponzori` | partneri revíru a súťaží |

Verejné odpovede nesmú obsahovať interné poznámky, súkromné kontakty rybárov, prístupové kódy, rozpracované mapové vrstvy ani živý súťažný dispečing.

## Chránené priestory

| Rola | Vstup | Viditeľný obsah |
| --- | --- | --- |
| `angler` | `/konto` | vlastné rezervácie podľa e-mailu účtu, zápisníky, výpravy a história úlovkov |
| `tournament_team` | `/sutaze/tim` | vlastný sektor, privolanie kontrolóra, hlásenia a stav tímu |
| `marshal` | `/admin/sutaze/kontrolor` | pridelené sektory, váženia, kontroly a tresty |
| `tournament_organizer` | `/admin/sutaze` | súťažný dispečing, tímy, sektory, kontrolóri a výsledky |
| `worker` | `/admin/hlasenia` | rezervácie, hlásenia, mapa v režime prehľadu a požičovňa |
| `accountant` | `/admin/rezervacie` | rezervácie, úlovkové reporty, požičovňa, súťažné a sponzorské podklady iba na čítanie |
| `manager` | `/admin` | rezervácie, úlovky, ryby, mapa, uzávierky, notifikácie a denná prevádzka |
| `owner` | `/admin` | všetky interné moduly a systémové nastavenia |

## Ochrana rout

Globálny middleware:

- presmeruje neprihláseného používateľa z chránenej routy na `/login`,
- po prihlásení rešpektuje pôvodný bezpečný interný redirect,
- nepustí rybára ani súťažný tím do `/admin`,
- nepustí inú rolu do rybárskeho účtu alebo tímového panelu,
- používa `app/utils/adminAccess.ts` pre modulové oprávnenia interných rolí.

Serverový guard pre `/api/admin/*` používa rovnakú access matrix. Neprihlásená požiadavka dostane `401`, rola bez dostatočného oprávnenia `403`.

Kontrolór má výnimku na úrovni konkrétnej routy: modul súťaží používa iba cez `/admin/sutaze/kontrolor`. Nemá prístup k organizačnému dispečingu `/admin/sutaze` ani k plnému admin súťažnému feedu.

## Súťažné API

| Endpoint | Obsah |
| --- | --- |
| `GET /api/tournaments` | verejné turnaje a iba overené úlovky bez interných poznámok a identity kontrolóra |
| `GET /api/account/tournament-state` | sektor prihláseného tímu alebo pridelené sektory prihláseného kontrolóra |
| `GET /api/admin/tournaments` | plný súťažný stav pre oprávnené interné roly okrem kontrolóra |

Kontrolórske zápisy server overuje voči `marshalId`, súťaži a aktuálnemu zoznamu pridelených sektorov. Klientom poslaná cudzia identita alebo sektor sa odmietne stavom `403`.

## Obsahové pravidlá

- Úlovok je verejný až po schválení správcom.
- Zápisník možno otvoriť platným linkom alebo kódom, ale vytváranie osobných zápisníkov patrí prihlásenému rybárovi.
- Verejná súťaž ukazuje výsledky a publikované informácie, nie živé hlásenia, kontakty kontrolórov ani interné kontroly, a to aj keď ju otvorí prihlásená interná rola.
- Prihlásený tím môže z verejnej súťažnej stránky prejsť do tímového panelu, ale verejná výsledkovka neponúka sektorové odkazy ani operačné akcie pri jednotlivých tímoch.
- Verejné skóre a najväčší úlovok sa počítajú iba z úlovkov potvrdených kontrolórom. Čakajúce a sporné váženia sa nezobrazujú ani nezapočítavajú.
- Verejné obrazovky nepoužívajú texty o mock dátach, lokálnom store, API feedoch, administračných slotoch ani internom workflow.
- Offline centrum zobrazuje iba fronty primerané aktuálnej role: verejné rezervácie, úlovky a hlásenia nedostatkov sú dostupné návštevníkovi, tímové súťažné hlásenia až tímu alebo internej súťažnej role a kontrolórske úkony iba role s operačným prístupom k súťažiam.
- Tímové hlásenia patria do tímového panelu.
- Tímový účet je pevne viazaný na konkrétnu súťaž a sektor; klient ani server neprijmú hlásenie za iný sektor.
- Kontrolór vidí iba súťažné úlohy a sektory, ktoré potrebuje pre výkon svojej role.
- Rozpracovaná mapa a interné servisné body sa zobrazujú iba oprávneným interným rolám.
- Každé citlivé rozhodnutie správcu má auditnú stopu.
