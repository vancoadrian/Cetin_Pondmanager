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
- Seed dáta sú v `tournamentMarshals`, `tournamentRequests`, `tournamentCatches`, `tournamentPenalties`, `tournamentRuleChecks`.
- `/admin/sutaze` zobrazuje súhrn súťažných hlásení, vie priradiť kontrolóra, uzavrieť hlásenie, overiť čakajúce váženie, zapísať trest a zapísať kontrolu pravidiel.
- Lokálny stav sa ukladá do `.data/rybolov-cetin/tournament-state.json`.
- Súťažné zásahy sa zapisujú aj do `.data/rybolov-cetin/audit-log.json` a sú viditeľné v `/admin/audit`.
- API kontrakt: `GET /api/tournaments`, `POST /api/tournament-requests`, `POST /api/admin/tournaments/requests/:id/action`, `POST /api/admin/tournaments/catches/:id/verify`, `POST /api/admin/tournaments/penalties`, `POST /api/admin/tournaments/rule-checks`.

## Ďalšie kroky

- Prihlasovanie tímov.
- Live výsledkovka.
- Push notifikácie kontrolórom.
- Export výsledkov pre organizátora.
