# Observability a Sentry

## Rozsah integrácie

Vercel projekt `cetin-pondmanager` je cez existujúcu Vercel–Sentry integráciu
presne namapovaný na Sentry organizáciu/projekt
`custommadedigital/cetin-pond-manager`. Kód ani dokumentácia neobsahujú DSN,
organization token ani inú reálnu prihlasovaciu hodnotu.

Oficiálny `@sentry/nuxt` modul načíta:

- `sentry.client.config.ts` pred ostatnými klientskymi Nuxt pluginmi,
- `sentry.server.config.ts` top-level importom pred Nitro aplikáciou,
- browser tracing s Nuxt routerom a Nitro error handler,
- build-time release a source map upload po dodaní CI premenných.

Na Verceli je server tracing podľa aktuálneho SDK obmedzený; serverové výnimky sa napriek tomu zachytávajú. Nepoužívaj súčasne `autoInjectServerSentry: 'top-level-import'` a Node `--import`, pretože by sa server SDK inicializovalo dvakrát.

## Runtime premenné

| Premenná | Viditeľnosť | Účel |
| --- | --- | --- |
| `NUXT_PUBLIC_SENTRY_DSN` | klient + server | verejné DSN pre browser a serverový fallback |
| `NEXT_PUBLIC_SENTRY_DSN` | klient + server | kompatibilný alias vytvorený Vercel integráciou |
| `SENTRY_DSN` | iba server | voliteľné serverové DSN; nikdy ho nekopíruj do public runtime configu |
| `SENTRY_ENVIRONMENT` | build | explicitný environment; na hostingu nasleduje `VERCEL_ENV`, potom `RYBOLOV_ENVIRONMENT` |
| `NUXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | klient | podiel browser transakcií, predvolene `0.05` |
| `SENTRY_TRACES_SAMPLE_RATE` | server | podiel server transakcií, predvolene `0.02` |

Development eventy sa neposielajú ani pri omylom prítomnom DSN. DSN sa pred aktiváciou syntakticky validuje; neplatná neprázdna hodnota Sentry nezapne ani nevypne lokálny fallback. Vercel `preview` sa mapuje na Sentry `staging`, nie na `production`.

## Release a source mapy

Build/CI používa:

| Premenná | Účel |
| --- | --- |
| `SENTRY_ORG` | slug organizácie |
| `SENTRY_PROJECT` | slug samostatného projektu `cetin-pond-manager` |
| `SENTRY_AUTH_TOKEN` | organization token iba pre build |
| `SENTRY_RELEASE` | voliteľné stabilné release ID; fallback je deployment commit SHA a potom lokálny Git HEAD |
| `SENTRY_DISABLE_SOURCEMAP_UPLOAD` | núdzové explicitné vypnutie uploadu hodnotou `true` |

Environment a release sa vypočítajú raz pri builde. Rovnaké hodnoty sa cez Vite `define` vložia do klienta, cez Nitro `replace` do server initu a release sa odovzdá uploaderu. Server teda po štarte neprepočítava identitu z runtime `VERCEL_*`; Preview build zostane `staging` s pôvodným release aj keď funkcia tieto systémové premenné za behu nevidí.

Upload sa zapne iba s kompletnou trojicou `SENTRY_ORG`, `SENTRY_PROJECT` a
`SENTRY_AUTH_TOKEN`. Modul vtedy vytvorí hidden client aj server mapy, uploadne
ich a po úspešnom uploade odstráni verejné klientské mapy. Nitro/Vercel môže
serverové mapy ponechať iba vo vnútri neverejného function bundle. Zlyhaný
upload štandardne zlyhá spolu s buildom. Bez kompletnej trojice sú Nuxt
client/server, Vite, Nitro Rollup aj Workbox source mapy explicitne vypnuté,
takže v celom `.vercel/output` artefakte vrátane `functions` nemá zostať žiadny
`.map` súbor.

Verejná politika je preto jednoznačná: source mapy slúžia iba na privátny
upload do Sentry. Statický verejný artefakt nesmie obsahovať `.map` súbory ani
`sourceMappingURL` odkazy. Nitro mapy môžu zostať zabalené vo vnútri neverejnej
serverovej funkcie, ale nesmú mať verejnú HTTP cestu. Mapy sa nesmú sprístupniť
ako verejné assety ani pri ručnom preview deployi.

## Overený staging Preview · 2026-08-25

| Položka | Overená hodnota |
| --- | --- |
| Vercel projekt | `cetin-pondmanager` |
| Sentry cieľ | `custommadedigital/cetin-pond-manager` |
| Vetva | `codex/sentry-integration` |
| Git commit a Sentry release | `ee76164315436c621d5d6a16b250751485bc446b` |
| Sentry environment | `staging` |
| Kanonický Vercel Preview deployment / URL | [`dpl_4de3XEQTM9cNVJzT5kz86PumfoMw`](https://cetin-pondmanager-rjqiww56t-vancoadrians-projects.vercel.app) |
| Vercel target | `preview`, stav `READY` |

Build log potvrdil privátny upload client source máp aj server/Nitro source máp
do uvedeného Sentry projektu. Build-time identita vložila rovnaký release a
`staging` environment do klienta, server initu aj uploadera. Po uploade bolo
medzi 362 verejnými súbormi overených `0` `.map` súborov a `0`
`sourceMappingURL` odkazov. Ďalších 218 máp zostalo iba vo vnútri neverejného
server function bundle; nie sú servované ako verejné assety.

Preview je chránený a slúži iba na technické overenie integrácie. Nie je produkčným kanálom ani trvalým zdrojom aplikačných dát.

## Súkromie

Klient aj server explicitne vypínajú automatický zber:

- user info, cookies a HTTP hlavičiek,
- request/response body a URL query parametrov,
- GraphQL dokumentov a premenných,
- databázových query dát a stack-frame premenných,
- generatívnych AI vstupov a výstupov.

`beforeSend` a `beforeSendTransaction` navyše používajú spoločný `sanitizeObservabilityPayload()`. Odstraňuje query a fragmenty z URL, každý span/data atribút s `query` segmentom bez ohľadu na názov parametra, bearer share kódy pre `/api/logbooks/:code`, tokeny, session/cookies, authorization hodnoty, heslá, e-maily, telefóny, IP adresy, používateľský objekt a request/response body.

`beforeBreadcrumb` úplne zahodí console/stdout/stderr aj DOM/UI breadcrumbs, pretože console text, `aria-label` alebo `title` môžu obsahovať ľubovoľné osobné údaje. `beforeSendSpan` normalizuje názov každého `ui.*` spanu na konštantu a ponechá iba nízkorizikové technické Sentry atribúty; rovnaký scrub prechádza aj child spans v `beforeSendTransaction`. Ostatné breadcrumbs a spans prejdú spoločnou sanitizáciou. Replay ani Sentry Logs nie sú zapnuté.

Existujúci `client-error-reporter.client.ts` je iba fallback pre development alebo prostredie bez browser DSN. Keď je Sentry aktívne, plugin neinštaluje vlastné Vue/window handlery a `POST /api/client-errors` nič nezapíše. Tým sa jedna chyba neposiela do dvoch systémov.

Projekt momentálne neposiela Content-Security-Policy, takže nebolo čo rozširovať. Ak CSP pribudne, `connect-src` musí dostať iba presný ingest origin odvodený z DSN; nepoužívaj `*.sentry.io`.

## Produkčný blokátor

Sentry nemení stav produkčnej pripravenosti aplikácie. Viaceré mutácie stále zapisujú do `.data/rybolov-cetin`, ktoré na Vercel serverless filesysteme nie je perzistentné. Projekt sa nesmie nasadiť, kým tieto stores a assety neprejdú na Supabase alebo iné garantované perzistentné úložisko.

Produkcia preto zostáva nezmenená na deploymente `dpl_HR4reWjASCpVAjvSwJ7g8dgZt6W1` z `main` commitu `80ad05d108102cb11691e71c92ee7470fc44f3de`. Vetva `codex/sentry-integration`, jej Preview ani dočasné `/tmp` store premenné sa nesmú merge-núť alebo promotovať do Production pred dokončením perzistentnej repository/Storage migrácie. Presný preview-only store setup je v `docs/deployment/production-platform.md`.

## Staging acceptance

1. Over mapovanie `cetin-pondmanager` → `custommadedigital/cetin-pond-manager`.
2. Nastav staging DSN, org, project a build token iba v staging/preview scope; tajné hodnoty nevkladaj do repa ani dokumentácie.
3. Over úspešný client aj Nitro upload, absenciu `.map` súborov a
   `sourceMappingURL` odkazov vo verejnom statickom artefakte a neprístupnosť
   prípadných interných function máp cez HTTP.
4. Cez dočasnú neverejnú diagnostiku vyvolaj jednu browser a jednu Nitro chybu.
5. V Sentry over `environment=staging`, rovnaký release, tag `app.runtime` a symbolikované `.vue`/`.ts` riadky.
6. V raw evente over absenciu ľubovoľných `query.*` hodnôt, DOM/UI breadcrumbs a pôvodných UI span názvov, ako aj cookies, hlavičiek, e-mailov a telefónov; diagnostiku potom odstráň.

Oficiálne zdroje:

- [Sentry Nuxt manual setup](https://docs.sentry.io/platforms/javascript/guides/nuxt/manual-setup/)
- [Sentry Nuxt source maps](https://docs.sentry.io/platforms/javascript/guides/nuxt/sourcemaps/)
- [Sentry data collection](https://docs.sentry.io/platforms/javascript/guides/nuxt/data-management/data-collected/)
- [Sentry sensitive data](https://docs.sentry.io/platforms/javascript/guides/nuxt/data-management/sensitive-data/)
- [Sentry limited server tracing](https://docs.sentry.io/platforms/javascript/guides/nuxt/install/limited-server-tracing/)
