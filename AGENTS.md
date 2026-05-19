# AGENTS.md — Rybolov Cetín

> Primárny brief pre AI asistentov pracujúcich v tomto repe. Cieľ je tvoriť projekt rovnakou kvalitou, disciplínou a štýlom ako `FK_KNV_Clubhouse`, ale s rybárskou doménou pre Štrkovisko Kocka a Veľký Cetín.

## Projekt

**Rybolov Cetín** — moderná PWA aplikácia pre správu rybárskeho revíru **Štrkovisko Kocka** a **Veľký Cetín**.

Projekt má pokryť verejný prehľad revíru, lovné miesta, chaty, rezervácie, obsadenosť, úlovky, súťaže, výstrahy a neskôr administráciu správcu.

## Referenčný projekt

Ako hlavný vzor používaj susedný projekt:

```text
/Users/adrian.vanco/Repos/FK_KNV_Clubhouse
```

Preberaj z neho spôsob práce, nie futbalovú doménu:

- Nuxt 4 + Vue 3 + TypeScript strict.
- Tailwind v4 tokeny v `app/assets/css/main.css`.
- Nuxt UI v3 a spoločné komponenty.
- PWA shell, manifest, service worker a inštalačný prompt.
- Mobile-first verejný web s budúcou admin vrstvou.
- Vrstvená architektúra pri dátach.
- Dokumentácia v `docs/`.
- Slovenské UI texty, anglický kód.

## Tech stack

Nuxt 4 · Vue 3 · TypeScript · Tailwind v4 · Nuxt UI v3 · @vite-pwa/nuxt · Zod · Supabase neskôr pre Auth, PostgreSQL, Storage, RLS a Realtime.

## Priority

1. Kvalitná architektúra.
2. Konzistentnosť s `FK_KNV_Clubhouse`.
3. Použiteľnosť pre správcu revíru aj bežného rybára.
4. Mobile-first UX.
5. Type safety.
6. Pripravenosť na Supabase.
7. Jasná doménová štruktúra.
8. PWA a notifikácie.
9. Dokumentácia.
10. Žiadne zbytočné komplikovanie MVP.

## Vrstvená architektúra

Pri napojení reálnych dát drž rovnaký vzor ako vo FK projekte:

```text
Page / Component  →  Composable  →  Service  →  Repository  →  Supabase / Nuxt server API
```

- Komponenty riešia UI a interakciu.
- Composables prepájajú service s Vue/Nuxt stavom.
- Services obsahujú business logiku, Zod validácie a mapping.
- Repositories komunikujú so Supabase.
- Server API používaj iba pre operácie mimo bežného klientského RLS flow.

Do komponentov nedávaj priame Supabase query.

## Doména

Hlavné entity:

- `lakes` — jazerá: Veľký Cetín, Štrkovisko Kocka.
- `pegs` — lovné miesta a chaty, vrátane pozície na mape.
- `reservations` — rezervácie miest, chát a termínov.
- `catch_records` — úlovky: druh, váha, miera, nástraha, čas, miesto, fotka.
- `catch_photos` — fotky pre budúcu AI identifikáciu rýb.
- `alerts` — búrky, vietor, servis, prevádzkové výstrahy.
- `tournaments` — súťaže.
- `tournament_sectors` — sektor, tím, priebežná váha.
- `push_subscriptions` — web push odbery.

Aktuálne mock dáta sú v:

```text
app/data/pond.ts
```

Sú zámerne typované, aby sa dali neskôr nahradiť repository/service vrstvou.

## UI/UX pravidlá

- Mobile-first, lebo rybár bude appku používať pri vode.
- Rozhranie má byť pokojné, praktické, skenovateľné a dôveryhodné.
- Nepoužívaj marketingové landing-page rozloženie tam, kde má byť pracovná appka.
- Mapy, obsadenosť a úlovky sú primárne pracovné plochy, nie dekorácia.
- Karty používaj na konkrétne položky, nie na obaľovanie celej stránky.
- Lovné miesta a sektory musia mať jasné statusy.
- Tlačidlá a interaktívne prvky musia byť pohodlné na mobile.
- Pri každej feature rieš loading, empty, error a data stav.

## Dizajnový systém

Tokeny sú v:

```text
app/assets/css/main.css
```

Nuxt UI mapovanie je v:

```text
app/app.config.ts
```

Štýl má zostať príbuzný FK projektu, ale s rybárskou paletou:

- hlboká zeleno-tyrkysová ako primary,
- vodná modrá ako sekundárna doménová farba,
- jantárový akcent pre CTA a upozornenia,
- čitateľné neutrálne plochy.

## PWA a notifikácie

PWA je základ projektu, nie doplnok.

Podporuj:

- inštalačný prompt,
- offline-friendly shell,
- service worker,
- budúce push notifikácie pre búrky, vietor, rezervácie a súťažné oznamy.

Push notifikácie musia byť používateľsky jasné a bezpečné. Reálne odosielanie bude neskôr cez VAPID, `push_subscriptions` a serverový dispatcher.

## Rezervácie

Rezervačný systém má podporovať:

- lovné miesto,
- chatu,
- jazero,
- termín od/do,
- stav: čaká, potvrdené, blokované, zrušené,
- obsadenosť po kalendári,
- budúce platby alebo zálohy.

Pri ďalšom vývoji preferuj kalendárnu dátovú štruktúru pred ručnou tabuľkou ako obrázkom.

## Úlovky a budúca AI vrstva

Každý úlovok má zbierať štruktúrované dáta:

- jazero,
- lovné miesto,
- rybár,
- druh ryby,
- váha,
- miera,
- nástraha,
- čas,
- fotka,
- poznámka,
- pustená späť áno/nie.

Fotky ukladaj tak, aby sa neskôr dali použiť na AI porovnanie opakovaných jedincov a sledovanie rastu.

## Súťaže

Súťažná mapa má vedieť prepnúť lovné miesta na sektory:

- sektor,
- tím,
- priebežná váha,
- rozhodcovský zápis,
- live rebríček,
- push oznamy.

Použi existujúci obrázkový podklad Veľkého Cetína ako prvú vrstvu, ale architektúru nechaj pripravenú na ďalšie mapy.

## Dokumentácia

Pri väčších moduloch dopĺňaj `docs/`.

Aktuálne základné dokumenty:

- `README.md`
- `docs/plan.md`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/public-admin.md`
- `docs/source-web-assets.md`

Pri novej veľkej feature pridaj `docs/features/<feature>.md`.

## Pravidlá pri zmenách

1. Najprv pochop existujúci FK vzor, potom implementuj.
2. Neprepisuj veci mimo zadania.
3. Kód po anglicky, UI texty po slovensky.
4. Nepoužívaj priame DB polia v UI, keď už existuje domain mapper.
5. Žiadne magic stringy pre statusy, používaj typy alebo const mapy.
6. Pridávaj abstrakcie až keď naozaj znižujú komplexitu.
7. Každú väčšiu zmenu over `pnpm typecheck`, `pnpm lint` a podľa rizika `pnpm build`.
8. Po výraznej frontend zmene over appku v prehliadači.
9. Nezabúdaj na mobilný viewport.
10. Projekt má pôsobiť ako seriózny prevádzkový nástroj pre rybársky revír, nie ako demo stránka.
