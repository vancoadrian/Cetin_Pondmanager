# Notifikácie

## Verejný odber

- `/notifikacie` zobrazuje aktívne výstrahy aj v zariadení bez podpory Web Push.
- Každé zariadenie si samostatne vyberá okruhy počasie, prevádzka, rezervácie a súťaže.
- Rybár vyberá aj jedno alebo viac jazier. Preferencia sa drží lokálne v zariadení a pri uložení aktualizuje existujúci push endpoint.
- Zapnutie vyžaduje aspoň jeden okruh a jedno jazero. Vypnutie odberu zachová posledný výber pre neskoršie opätovné zapnutie.
- Verejný subscribe odstráni pokus o internú rolu, turnaj, sektor alebo kontrolóra, no ponechá verejné `lakeIds`.

## Cielenie

- Odber dostane broadcast iba pri zhode aspoň jedného okruhu a aspoň jedného jazera.
- Chýbajúce alebo prázdne `lakeIds` na staršom odbere znamenajú všetky jazerá.
- Chýbajúce alebo prázdne `targetLakeIds` na broadcaste znamenajú oznam pre všetky jazerá.
- Interná audience sa vyhodnocuje navyše k okruhu a jazeru.
- Automatické rezervácie, hlásenia nedostatkov, privolania k veľkej rybe, veľké úlovky a súťažné udalosti posielajú jazero zo zdrojovej udalosti.

## Správa

- `/admin/notifikacie` pri verejnom rozoslaní ponúka všetky jazerá alebo jedno konkrétne jazero.
- Administrácia je rozdelená na pracovné pohľady `Oznamy`, `Doručovanie` a `Zariadenia`. Aktívny pohľad sa ukladá do parametra `sekcia`, takže diagnostiku alebo odbery možno otvoriť priamym odkazom a stav zostane zachovaný aj po obnovení stránky.
- Správca vyberá presný dátum a čas platnosti. Server uloží strojové `expiresAt` aj čitateľné `validUntil`.
- Verejné `GET /api/notifications` vracia iba oznamy pred `expiresAt` bez `endedAt`. Kontrolné a doručovacie záznamy ostávajú v histórii.
- Aktívny oznam sa dá ručne ukončiť cez `POST /api/admin/notifications/alerts/:id/end`; akcia doplní `endedAt`, autora do súvisiaceho broadcastu a audit udalosť `notification.alert.ended`.
- Staršie broadcasty s textom `dnes ...` dostanú pri načítaní kompatibilnú odvodenú expiráciu, takže historické demo výstrahy nezostanú verejne aktívne.
- Push payload nesie `expiresAt` a service worker oneskorenú správu po skončení platnosti nezobrazí.
- História rozoslaní aj zoznam odberov zobrazujú okruhy a jazerný rozsah.
- Audit manuálneho rozoslania ukladá `targetLakeIds`, nie osobné údaje príjemcov.
- Reálne doručenie vyžaduje service worker, povolenie prehliadača, verejný VAPID kľúč a serverový provider `web-push`.

## Lokálny reálny Web Push

Po `pnpm supabase:start && pnpm local:setup` obsahuje ignorovaný `.env` lokálny VAPID pár, provider `web-push` a zapnutý service worker pre lokálny PWA test. Produkčný build musí bežať na rovnakom secure origin/localhost origin, na ktorom používateľ odber povolí.

Verejná obrazovka načíta panel nastavení až pri priblížení k viewportu a samotný Push API helper až po kliknutí na zapnutie. Výstrahy a SSR obsah preto neťahajú Zod schémy, celé pond dáta ani PushManager kód do počiatočného route chunku.

Lokálne end-to-end overenie:

1. otvoriť `/notifikacie` v browseri s povolenými notifikáciami,
2. zapnúť aspoň jeden okruh a jazero,
3. overiť, že uložený endpoint nie je `mock://`,
4. ako správca odoslať interný test alebo verejný oznam s rovnakým topic/jazerným scope,
5. overiť HTTP odpoveď push služby, zobrazenie notifikácie a bezpečný deep link,
6. vypnúť odber a overiť, že sa lokálny PushSubscription aj serverový záznam deaktivovali.

Lokálne odbery zatiaľ zostávajú v JSON notification store, pretože aplikačné repository ešte nebolo prepnuté na Supabase. Produkcia musí uložiť odbery a delivery logy do `push_subscriptions` a `notification_delivery_logs`; pri HTTP 404/410 má dispatcher endpoint deaktivovať.
