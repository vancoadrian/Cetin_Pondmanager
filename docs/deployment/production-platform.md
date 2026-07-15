# Produkčná platforma

## Odporúčané rozdelenie zodpovedností

| Oblasť | Odporúčaný provider | Úloha |
| --- | --- | --- |
| Nuxt SSR, server API a preview deploymenty | Vercel | build a beh Nuxt/Nitro aplikácie |
| PostgreSQL, Auth, RLS, Realtime a Storage | Supabase Cloud | jediný trvalý zdroj aplikačných dát |
| DNS | Cloudflare DNS alebo Vercel DNS | autoritatívne DNS záznamy |
| Ochrana formulárov | Cloudflare Turnstile | registrácia, obnova hesla, rezervácia a verejné hlásenia |
| Chyby a výkon | Sentry | client/server exceptions, release, source mapy a sampled tracing |
| Transakčný e-mail | Resend | obnova hesla, rezervácie a plánované reporty |
| Push | štandardný Web Push + VAPID | odbery v Supabase, odosielanie iba zo servera |
| Plánované úlohy | Vercel Cron | spustenie idempotentných chránených endpointov |
| Dostupnosť | nezávislý uptime monitor | kontrola `/api/health` mimo Vercelu a Sentry |

Nuxt na Verceli podporuje SSR aj server API bez vlastného servera. Produkcia však **nesmie** zapisovať do dnešného `.data` adresára: filesystem serverless funkcie nie je trvalá databáza. Nasadenie na Vercel je preto blokované dovtedy, kým rezervačné, účtové, notifikačné, mapové, úlovkové a ďalšie mutácie nebudú za Supabase repository/Storage vrstvou.

## Cloudflare a Vercel

Odporúčaný prvý variant je:

1. doména je spravovaná v Cloudflare,
2. aplikačný DNS záznam smeruje na Vercel v režime **DNS only**,
3. TLS, CDN, cache a aplikačný firewall obsluhuje Vercel,
4. Cloudflare Turnstile sa používa samostatne a nevyžaduje proxy nad aplikáciou.

Cloudflare proxy pred Vercelom nezapínať automaticky. Dvojitá proxy zhoršuje viditeľnosť prevádzky pre Vercel Firewall, komplikuje cache invalidáciu a môže pridať latenciu. Ak bude neskôr konkrétny dôvod používať Cloudflare WAF alebo proxy, treba najprv pripraviť samostatný staging test pre origin, cache pravidlá, IP hlavičky, Web Push service worker, uploady a rollback.

Zdroje:

- [Nuxt on Vercel](https://vercel.com/docs/frameworks/full-stack/nuxt)
- [Vercel: Cloudflare pred Vercelom](https://vercel.com/kb/guide/cloudflare-with-vercel)
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/)

## Prostredia

Minimálne tri oddelené prostredia:

| Prostredie | Vercel | Supabase | E-mail/push |
| --- | --- | --- | --- |
| local | lokálny Nuxt | Docker Supabase | lokálne VAPID; Mailpit/mock e-mail |
| staging | chránený Vercel deployment | samostatný staging projekt/branch | testovacia Resend doména a samostatný VAPID pár |
| production | produkčná doména | produkčný projekt | produkčná doména a produkčný VAPID pár |

Preview deployment nesmie potichu používať produkčnú databázu. Vercel rozlišuje Development, Preview a Production env scope; staging musí mať vlastné scoped premenné alebo vlastné Vercel environment nastavenie. Supabase Auth musí mať presnú produkčnú `SITE_URL` a povolené iba potrebné lokálne, preview a staging redirecty.

Zdroje:

- [Supabase a Vercel environmenty](https://supabase.com/docs/guides/troubleshooting/vercel-integration-environment-variables-not-syncing-for-persistent-git-branches-b9191e)
- [Supabase Auth redirect URL](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)

## Tajomstvá a verejné premenné

Verejné a bezpečné pre klienta:

- `NUXT_PUBLIC_SITE_URL`
- `NUXT_PUBLIC_SUPABASE_URL`
- `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NUXT_PUBLIC_VAPID_PUBLIC_KEY`

Iba server/CI:

- `SUPABASE_SECRET_KEY` alebo service-role kľúč,
- `SUPABASE_DB_URL`, iba ak ho server alebo migrácie naozaj potrebujú,
- `RYBOLOV_VAPID_PRIVATE_KEY`,
- `RYBOLOV_RESEND_API_KEY`,
- `RYBOLOV_REPORT_SCHEDULER_SECRET`,
- budúci `SENTRY_AUTH_TOKEN` pre upload source máp,
- budúci `CLOUDFLARE_TURNSTILE_SECRET_KEY`.

Service-role, VAPID private key a Resend key nikdy nedávať pod prefix `NUXT_PUBLIC_`. Produkcia a staging musia používať odlišné hodnoty. Rotácia musí mať vlastníka a dátum; pri VAPID rotácii treba rátať s opätovným vytvorením odberov zariadení.

## Supabase prechod

Lokálny Docker stack je vývojový cieľ, nie produkčný hosting. Poradie migrácie:

1. vytvoriť Supabase client factory pre browser a server bez priameho query v komponentoch,
2. zaviesť repository implementácie za existujúce service kontrakty,
3. presunúť Auth a `user_roles`, potom rezervácie/dostupnosť,
4. presunúť push odbery a delivery logy,
5. presunúť úlovky, mapové a sponzorské assety do Storage,
6. presunúť ostatné lokálne stores a audit,
7. spustiť RLS integračné testy pre každú rolu,
8. až potom odstrániť produkčnú závislosť od `.data`.

Migrácie sa majú aplikovať cez CI na staging a následne produkciu; nie ručným `db push` z notebooku. Pred produkciou treba zapnúť databázové zálohy/PITR podľa zvoleného Supabase plánu, Security Advisor a obnovovací test.

## Web Push

Aktuálny klient vytvára štandardný Push API odber a server používa `web-push` s VAPID. Produkčný tok má byť:

```text
prehliadač → service worker/PushManager → server subscribe API
           → push_subscriptions v Supabase
admin alebo doménová udalosť → server dispatcher → push služba prehliadača
                              → delivery log → service worker → notifikácia
```

Po migrácii sa endpoint, `p256dh`, `auth`, topic a jazerný scope ukladajú iba v Supabase. Server má pri HTTP 404 alebo 410 odber deaktivovať, nie ho donekonečna skúšať. Vercel funkcia nesmie čakať na rozsiahly broadcast po stovkách endpointov; väčšie dávky treba deliť do idempotentných jobov alebo queue. VAPID private key ostáva iba na serveri.

Pred ostrým spustením treba na fyzickom Android Chrome a nainštalovanej iOS PWA overiť: opt-in, doručenie na pozadí, klik/deep link, expiráciu, odhlásenie, zmenu VAPID kľúča a obnovu expirovaného endpointu.

## Sentry a Web Vitals

Sentry pridať až s reálnym DSN a dohodnutými pravidlami súkromia:

- samostatné staging/production projekty alebo jednoznačné `environment`,
- release viazaný na commit/deployment,
- client aj Nitro/server capture,
- upload source máp počas buildu; source mapy po uploade verejne neservovať,
- odstránenie hesiel, reset tokenov, VAPID kľúčov, cookies, telefónov a e-mailov cez `beforeSend`,
- nízky počiatočný trace sample rate, vyšší iba na kritických trasách,
- Web Vitals LCP, CLS a INP podľa route, viewportu a efektívneho pripojenia,
- alerty na nové regresie, error rate, p95 latency a zlyhané push/e-mail joby.

Aktuálny lokálny error log zostáva dev fallback. V produkcii nesmie byť jediným monitoringom.

Zdroj: [Sentry source map troubleshooting](https://docs.sentry.io/platforms/javascript/guides/hono/sourcemaps/troubleshooting_js/)

## Resend

Odporúčaná odosielacia subdoména je napríklad `notify.domena.sk`, aby bola reputácia transakčných správ oddelená od bežnej pošty. V Cloudflare DNS treba pridať presné SPF a DKIM záznamy z Resendu a následne DMARC. Použiť adresy s funkčným reply-to, napríklad `rezervacie@...` a `ucet@...`.

Produkčne zapnúť tri existujúce providery `resend`: obnova hesla, rozhodnutia rezervácií a reporty. Správy musia mať idempotency/delivery log a webhook pre delivered, bounced a complained stav. API kľúč má byť obmedzený na potrebné odosielanie a uložený iba vo Vercel secrets.

Zdroj: [Resend – správa a overenie domény](https://resend.com/docs/dashboard/domains/introduction)

## Ochrana formulárov a API

Turnstile zaradiť až pri serverovej validácii tokenu. Samotný widget nie je ochrana. Token je krátkodobý a single-use; samostatné widgety/kľúče majú mať local, staging a production.

Prioritné endpointy:

- registrácia a obnova hesla,
- verejná rezervácia,
- verejný zápis úlovku a vytvorenie zápisníka,
- hlásenie nedostatku,
- push subscribe/unsubscribe.

K tomu treba per-IP a per-account rate limits, limit veľkosti body/uploadu, origin/CSRF kontrolu mutácií, audit admin akcií a bezpečnostné hlavičky. Turnstile nesmie nahradiť RLS ani autorizáciu.

Zdroj: [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

## Release brány

Pred produkčným deployom musia prejsť:

1. lint, typecheck, Vitest a plné Playwright E2E,
2. Lighthouse CI budgety pre `/`, `/mapa`, `/rezervacie` a `/notifikacie`,
3. `supabase db reset` a RLS integračné testy,
4. preview smoke test s vlastným preview Supabase prostredím,
5. kontrola source máp a testovací Sentry event bez PII,
6. test Resend odoslania a bounce webhooku,
7. reálny test Web Push na Android aj iOS PWA,
8. databázový backup a overený rollback migrácie/aplikácie,
9. manuálna klávesnica, screen reader a 200 % zoom kontrola.

Po deployi sa overí `/api/health`, jedna čítacia public cesta, jedna autentifikovaná cesta, testovací push a testovací e-mail. Rollback aplikácie na Verceli nesmie automaticky spätne vracať databázovú schému; migrácie musia byť spätne kompatibilné aspoň počas jedného release okna.
