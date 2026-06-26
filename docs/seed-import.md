# Seed a import dát

## Cieľ

Aktuálne dáta v `app/data/pond.ts` sú pracovný zdroj pre prototyp. Pred napojením Supabase potrebujeme stabilný export, ktorý:

- zachová pôvodné mock ID ako referencie,
- vygeneruje deterministické UUID pre Supabase tabuľky,
- preloží UI enumy typu `weekend-free` alebo `catch-measurement` na databázové hodnoty `weekend_free` a `catch_measurement`,
- odhalí pokazené väzby ešte pred importom.

## Export

```bash
pnpm seed:export
```

Výstup sa uloží do:

```text
supabase/seed/rybolov-cetin.seed.json
```

Export je zámerne opakovateľný. Hodnota `metadata.generatedAt` je predvolene fixná na `2026-05-17T00:00:00.000Z`; pri potrebe ju vieš prepísať cez `SEED_GENERATED_AT`.

Súbor obsahuje:

- `metadata` s venue, dátumom exportu a počtami riadkov,
- `references` s mapovaním pôvodných ID na deterministické UUID,
- `tables` s riadkami v tvare blízkom Supabase schéme.

## Prečo JSON a nie finálne SQL

Supabase projekt ešte nie je založený a časť stĺpcov sa môže pri produkčnej integrácii doladiť. JSON seed je preto bezpečný prechodový kontrakt: dá sa použiť na SQL generátor, seed runner, Edge function alebo ručný import.

Tento seed export je odlišný od runtime zálohy v `/admin/system`. Seed export vychádza zo zdrojových prototypových dát a pripravuje tabuľkový import do Supabase. Admin endpoint `/api/admin/data-export` naopak exportuje aktuálny lokálny stav z `.data/rybolov-cetin/`, vrátane naklikaných rezervácií, úlovkov, sponzorov, mapy, notifikácií, reportov, auditu a voliteľného asset manifestu alebo base64 assetov. Runtime backup má SHA-256 integritný odtlačok v `integrity` bloku. Endpoint `/api/admin/data-import/preview` vie takýto backup skontrolovať bez obnovy dát: overí verziu, službu, integritu, store, súčty záznamov a spôsob prenosu assetov. Endpoint `/api/admin/data-import/restore` je určený iba pre lokálny runtime backup, nie pre Supabase seed; vyžaduje frázu `OBNOVIT DATA`, pred zápisom vytvorí safety backup a obnovuje len známe store z plného exportu. Safety backupy sa dajú v admine listovať, načítať do kontroly, stiahnuť cez `/api/admin/data-backups` a čistiť retenciou cez `/api/admin/data-backups/cleanup`.

## Pokryté oblasti

Prvý export pokrýva:

- venue, jazerá, lovné miesta, mapové vrstvy, servisné body, polygonové plochy a hlásenia nedostatkov,
- povolenky, chaty, povinnú výbavu, požičovňu, doplnky a platobné metódy,
- rezervácie, položky rezervácií a výpožičky,
- uzávierky jazier a konkrétnych miest,
- úlovky, fotky úlovkov, zápisníky výprav a riadky zápisníkov,
- súťaže, sektory, tímy, kontrolórov, hlásenia, úlovky, tresty a kontroly pravidiel,
- sponzorov, hlavné logá, zdrojové logá pre varianty, crop metadata variantov a ich umiestnenia,
- verejné výstrahy.

## Validácia

Export používa `validateSupabaseSeedPayload()`, ktorá kontroluje:

- prítomnosť kľúčových tabuliek,
- duplicitné ID v tabuľkách,
- väzby rezervácií na jazerá a miesta,
- väzby položiek rezervácií na rezervácie,
- väzby súťažných sektorov na súťaže.

Testy sú v `tests/supabaseSeedService.test.ts`.
