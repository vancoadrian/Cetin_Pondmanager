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

## Pokryté oblasti

Prvý export pokrýva:

- venue, jazerá, lovné miesta a mapové vrstvy,
- povolenky, chaty, povinnú výbavu, požičovňu, doplnky a platobné metódy,
- rezervácie, položky rezervácií a výpožičky,
- uzávierky jazier a konkrétnych miest,
- úlovky, fotky úlovkov, zápisníky výprav a riadky zápisníkov,
- súťaže, sektory, tímy, kontrolórov, hlásenia, úlovky, tresty a kontroly pravidiel,
- sponzorov a ich umiestnenia,
- verejné výstrahy.

## Validácia

Export používa `validateSupabaseSeedPayload()`, ktorá kontroluje:

- prítomnosť kľúčových tabuliek,
- duplicitné ID v tabuľkách,
- väzby rezervácií na jazerá a miesta,
- väzby položiek rezervácií na rezervácie,
- väzby súťažných sektorov na súťaže.

Testy sú v `tests/supabaseSeedService.test.ts`.
