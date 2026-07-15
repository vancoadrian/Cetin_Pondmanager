# Lighthouse, performance, accessibility a PWA audit

**Projekt:** Rybolov Cetín  
**Dátum auditu:** 14.–15. júla 2026  
**Auditované prostredie:** produkčný Nuxt build na `http://127.0.0.1:3000`  
**Nástroje:** Lighthouse 13.4.0, Headless Chrome 138, Playwright a manuálne overenie v prehliadači

## Výsledok

Audit odstránil najväčšie problémy verejnej časti bez vypnutia alebo zjednodušenia jej funkcií:

- mobilné Performance skóre sa posunulo z rozsahu **48–57** na **83–94**;
- desktopové Performance skóre sa posunulo z **80–87** na **99–100**;
- všetkých desať stránok dosahuje po úpravách **Accessibility 100**, **Best Practices 100** a **SEO 100** v mobilnom aj desktopovom profile;
- mobilný LCP klesol z **8,55–12,38 s** na **2,53–3,68 s**;
- desktopový LCP klesol z **1,62–2,49 s** na **0,60–0,76 s**;
- finálny CLS je na každej trase **0**;
- prenos pri mobilnom profile klesol z **1,40–2,36 MB** na **0,25–0,57 MB**;
- Workbox precache klesol zo **128 položiek / 6 539,56 KiB** na **17 položiek / 502,51 KiB**;
- online navigácia, riadený offline fallback, štyri požadované verejné flowy aj preposlanie admin session pri SSR sú pokryté E2E smoke testami.

Najväčší zostávajúci priestor je v mobilnom LCP na obsahovo bohatých obrazovkách, v TBT stránky notifikácií, v spoločnom klientskom JavaScripte a vo veľkom mapovom podklade. Tieto položky sú zdokumentované v časti [Zostávajúce riziká](#zostávajúce-riziká).

## Rozsah a metodika

Meraných bolo desať verejných trás:

1. `/`
2. `/reviry`
3. `/reviry/velky-cetin`
4. `/mapa`
5. `/rezervacie`
6. `/ulovky`
7. `/sutaze`
8. `/info`
9. `/kontakt`
10. `/notifikacie`

Pre každú trasu sa urobili tri merania v mobilnom a tri v desktopovom Lighthouse profile. Tabuľky používajú **medián každej metriky z troch meraní**, nie výsledok jedného vybraného behu. Celkovo teda baseline aj finálny stav obsahujú po 60 Lighthouse reportov.

Finálna 60-reportová matica zachytáva performance build po hlavných obrazových, SSR, CSS a accessibility opravách. Po následnom WebP fallbacku a sprísnení PWA/API cache a redakcie osobných údajov sa navyše urobil izolovaný troj-behový mobilný spot-check domovskej stránky. Jeho medián bol Performance **88**, Accessibility/Best Practices/SEO **100/100/100**, LCP **3 009 ms**, CLS **0**, TBT **205 ms** a prenos **365 963 B**. Potvrdil, že bezpečnostný hardening nespôsobil výkonnostnú regresiu; súbežné merania s Playwrightom boli z metodiky vyradené.

Merania prebehli proti produkčnému buildu. `Prenos` je Lighthouse `total-byte-weight` pre dané načítanie a `Pož.` je počet sieťových požiadaviek. Časy sú v milisekundách. Hodnoty prenosu sú zaokrúhlené na tri desatinné miesta a používajú vzťah 1 MB = 1 000 000 bajtov.

Strojovo čitateľné hodnoty všetkých behov a mediánov sú v [lighthouse-summary-2026-07-14.json](./lighthouse-summary-2026-07-14.json).

Lighthouse v laboratórnom režime nemeria reálny INP. Ako laboratórny indikátor blokovania hlavného vlákna sa preto používa TBT. Reálny INP bude potrebné doplniť z poľných dát po nasadení.

Moderný Lighthouse neposkytuje samostatné reprezentatívne PWA skóre pre celý install/offline lifecycle. PWA časť bola preto overená kombináciou kontroly manifestu a vygenerovaného service workera, online/offline testu v prehliadači a Playwright testu.

## Baseline

### Mobil

| Trasa | Perf. | A11y | FCP | LCP | CLS | TBT | Prenos | Pož. |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 48 | 87 | 8 559 | 12 381 | 0,165 | 138 | 2,242 MB | 67 |
| `/reviry` | 56 | 96 | 8 158 | 11 467 | 0 | 92 | 2,362 MB | 57 |
| `/reviry/velky-cetin` | 55 | 96 | 8 586 | 10 898 | 0,007 | 137 | 1,920 MB | 63 |
| `/mapa` | 56 | 87 | 8 970 | 10 147 | 0 | 79 | 1,782 MB | 66 |
| `/rezervacie` | 55 | 97 | 9 564 | 9 841 | 0 | 126 | 1,557 MB | 73 |
| `/ulovky` | 57 | 97 | 8 816 | 9 015 | 0,020 | 84 | 1,465 MB | 56 |
| `/sutaze` | 56 | 93 | 9 114 | 10 360 | 0 | 101 | 1,691 MB | 57 |
| `/info` | 56 | 97 | 8 584 | 9 329 | 0 | 95 | 1,401 MB | 69 |
| `/kontakt` | 57 | 97 | 8 360 | 8 550 | 0,036 | 53 | 1,410 MB | 53 |
| `/notifikacie` | 51 | 96 | 8 660 | 8 854 | 0,018 | 267 | 1,427 MB | 58 |

### Desktop

| Trasa | Perf. | A11y | FCP | LCP | CLS | TBT | Prenos | Pož. |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 81 | 87 | 1 622 | 2 256 | 0,0001 | 11 | 2,391 MB | 88 |
| `/reviry` | 80 | 96 | 1 529 | 2 492 | 0,0001 | 1 | 3,093 MB | 90 |
| `/reviry/velky-cetin` | 82 | 96 | 1 619 | 2 174 | 0,0002 | 15 | 2,333 MB | 88 |
| `/mapa` | 84 | 87 | 1 677 | 1 896 | 0,0002 | 0 | 1,931 MB | 88 |
| `/rezervacie` | 83 | 97 | 1 794 | 1 870 | 0,0001 | 16 | 1,728 MB | 95 |
| `/ulovky` | 86 | 97 | 1 637 | 1 695 | 0,0122 | 0 | 1,624 MB | 79 |
| `/sutaze` | 84 | 93 | 1 656 | 1 872 | 0,0004 | 6 | 1,921 MB | 80 |
| `/info` | 86 | 97 | 1 633 | 1 682 | 0,0001 | 1 | 1,659 MB | 88 |
| `/kontakt` | 87 | 97 | 1 552 | 1 623 | 0,0034 | 0 | 1,623 MB | 82 |
| `/notifikacie` | 86 | 96 | 1 600 | 1 672 | 0,0001 | 39 | 1,630 MB | 86 |

Best Practices a SEO boli na všetkých baseline trasách 100. Hlavné problémy baseline boli pomalé doručenie obrázkov, veľký počiatočný prenos, globálne načítané fonty a moduly, rozsiahly SSR rezervačného kalendára, farebný kontrast a niekoľko sémantických a ARIA chýb.

## Finálny stav

### Mobil

| Trasa | Perf. | A11y | FCP | LCP | CLS | TBT | Prenos | Pož. |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 83 | 100 | 2 507 | 3 422 | 0 | 171 | 0,305 MB | 59 |
| `/reviry` | 88 | 100 | 2 391 | 3 267 | 0 | 132 | 0,333 MB | 45 |
| `/reviry/velky-cetin` | 85 | 100 | 2 513 | 3 385 | 0 | 148 | 0,292 MB | 59 |
| `/mapa` | 84 | 100 | 2 813 | 3 537 | 0 | 113 | 0,560 MB | 61 |
| `/rezervacie` | 83 | 100 | 2 965 | 3 675 | 0 | 125 | 0,291 MB | 65 |
| `/ulovky` | 90 | 100 | 2 665 | 3 000 | 0 | 100 | 0,292 MB | 47 |
| `/sutaze` | 86 | 100 | 2 815 | 3 383 | 0 | 90 | 0,567 MB | 48 |
| `/info` | 87 | 100 | 2 545 | 3 269 | 0 | 102 | 0,266 MB | 64 |
| `/kontakt` | 94 | 100 | 2 352 | 2 525 | 0 | 48 | 0,253 MB | 40 |
| `/notifikacie` | 88 | 100 | 2 513 | 2 771 | 0 | 254 | 0,276 MB | 48 |

### Desktop

| Trasa | Perf. | A11y | FCP | LCP | CLS | TBT | Prenos | Pož. |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 100 | 100 | 556 | 688 | 0 | 3 | 0,739 MB | 87 |
| `/reviry` | 100 | 100 | 512 | 759 | 0 | 0 | 0,491 MB | 88 |
| `/reviry/velky-cetin` | 100 | 100 | 592 | 705 | 0 | 25 | 0,466 MB | 86 |
| `/mapa` | 100 | 100 | 624 | 725 | 0 | 14 | 0,641 MB | 86 |
| `/rezervacie` | 99 | 100 | 713 | 763 | 0 | 11 | 0,370 MB | 93 |
| `/ulovky` | 100 | 100 | 596 | 687 | 0 | 3 | 0,364 MB | 77 |
| `/sutaze` | 100 | 100 | 639 | 718 | 0 | 5 | 0,643 MB | 78 |
| `/info` | 100 | 100 | 560 | 642 | 0 | 3 | 0,367 MB | 86 |
| `/kontakt` | 100 | 100 | 513 | 600 | 0 | 0 | 0,363 MB | 80 |
| `/notifikacie` | 99 | 100 | 573 | 631 | 0 | 68 | 0,364 MB | 84 |

Best Practices a SEO zostali na všetkých finálnych trasách 100.

Izolované post-hardening kontrolné behy domovskej stránky dosiahli Performance **88 / 89 / 79**, LCP **2 958 / 3 009 / 3 575 ms** a TBT **205 / 175 / 270 ms**. Reportovaný medián vyššie používa nezávislý medián každej metriky rovnako ako hlavná matica.

## Zmena oproti baseline

### Mobil

| Trasa | Δ Performance | Δ A11y | Δ LCP | Δ prenos | Δ požiadavky |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | +35 | +13 | −8 959 ms | −1,937 MB | −8 |
| `/reviry` | +32 | +4 | −8 200 ms | −2,030 MB | −12 |
| `/reviry/velky-cetin` | +30 | +4 | −7 513 ms | −1,628 MB | −4 |
| `/mapa` | +28 | +13 | −6 610 ms | −1,222 MB | −5 |
| `/rezervacie` | +28 | +3 | −6 166 ms | −1,267 MB | −8 |
| `/ulovky` | +33 | +3 | −6 015 ms | −1,173 MB | −9 |
| `/sutaze` | +30 | +7 | −6 977 ms | −1,125 MB | −9 |
| `/info` | +31 | +3 | −6 060 ms | −1,135 MB | −5 |
| `/kontakt` | +37 | +3 | −6 025 ms | −1,158 MB | −13 |
| `/notifikacie` | +37 | +4 | −6 083 ms | −1,151 MB | −10 |

### Desktop

| Trasa | Δ Performance | Δ A11y | Δ LCP | Δ prenos | Δ požiadavky |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | +19 | +13 | −1 568 ms | −1,652 MB | −1 |
| `/reviry` | +20 | +4 | −1 733 ms | −2,602 MB | −2 |
| `/reviry/velky-cetin` | +18 | +4 | −1 469 ms | −1,866 MB | −2 |
| `/mapa` | +16 | +13 | −1 171 ms | −1,290 MB | −2 |
| `/rezervacie` | +16 | +3 | −1 107 ms | −1,358 MB | −2 |
| `/ulovky` | +14 | +3 | −1 008 ms | −1,260 MB | −2 |
| `/sutaze` | +16 | +7 | −1 154 ms | −1,278 MB | −2 |
| `/info` | +14 | +3 | −1 040 ms | −1,292 MB | −2 |
| `/kontakt` | +13 | +3 | −1 023 ms | −1,260 MB | −2 |
| `/notifikacie` | +13 | +4 | −1 041 ms | −1,266 MB | −2 |

TBT sa na mobile nezlepšil rovnomerne. Na rezerváciách, súťažiach, kontakte a notifikáciách klesol, ale na ostatných trasách mierne stúpol. Absolútne hodnoty okrem notifikácií zostali do 171 ms. Tento výsledok je prijateľný voči výraznému zníženiu LCP a prenosu, no spoločný klientsky JavaScript zostáva kandidátom na ďalšie delenie.

Jeden z troch mobilných behov detailu Veľkého Cetína dosiahol Performance 64; ďalšie dva dosiahli 85 a 90, preto je reportovaný medián 85. Kolísanie je uvedené ako riziko a nie je prekryté výberom najlepšieho behu.

## Implementované opravy

### Obrázky, LCP a prenášané dáta

- Bolo vytvorených 32 optimalizovaných AVIF a 32 WebP variantov pre verejné fotografie. WebP `srcset` zachováva úsporu aj v prehliadačoch bez AVIF podpory.
- Domovský hero používa `<picture>`, responzívny `srcset`, explicitné rozmery a vysokú prioritu načítania. Varianty majú približne 20 KiB pri 640 px, 55 KiB pri 960 px, 98 KiB pri 1 440 px a 174 KiB pri 1 920 px.
- Karty revírov, galérie a detail revíru používajú responzívne zdroje; obrázky mimo prvého viewportu sú lazy-loaded.
- Domovská mapa sa načíta až po priblížení k viewportu cez `IntersectionObserver` a lazy komponent.
- Pôvodné kartové fotografie s veľkosťou približne 348–394 KiB boli pri bežnom zobrazení nahradené variantmi okolo 36–37 KiB.
- Detailný mapový podklad zostal zachovaný pre čitateľnosť pracovnej mapy. Jeho ďalšie delenie alebo formátovanie je samostatné riziko, nie skrytá strata funkcie.

### JavaScript, CSS, SSR a kompresia

- Súhrn offline fronty už neimportuje päť validačných a workflow modulov. Jedna readonly IndexedDB transakcia číta záznamy a ľahkou kontrolou integrity odfiltruje poškodené položky, aby nevznikal neodstrániteľný „phantom“ badge.
- Automatické webfonty Nuxt UI boli vypnuté; používajú sa systémové fallbacky. Vstupný CSS súbor klesol zo 193,10 kB na 173,32 kB raw a z 26,49 kB na 23,93 kB gzip.
- Štrnásťdňová rezervačná matica sa nevyrenderuje do SSR, kým ju používateľ neotvorí. SSR rezervácií klesol približne zo 146,5 kB / 1 058 elementov na 90,9 kB / 509 elementov.
- HTML odpovede Nitro nad 1 KiB používajú Brotli alebo gzip podľa kvalitatívnych hodnôt `Accept-Encoding` a posielajú `Vary: Accept-Encoding`; `br;q=0` sa už nepovažuje za povolený Brotli.
- Funkcie rezervácií, máp, úlovkov, súťaží ani offline fronty neboli kvôli skóre odstránené.

### Accessibility

- Farebné rampy boli upravené na bezpečnejší kontrast; primárna `500` používa `#197267` a warning `500` používa `#9a5207`.
- Stránka má skip link, stabilný cieľ hlavného obsahu a route announcer.
- Interaktívne prvky mapy dostali správne SVG roly, názvy, `aria-pressed`, klávesnicové ovládanie a viditeľný focus.
- Boli opravené zakázané ARIA kombinácie, sémantika zoznamov, poradie nadpisov a dekoratívne obrázky.
- Formuláre používajú labely, `fieldset`/`legend` a natívny submit; prepínače komunikujú stav cez `aria-pressed`.
- Tap targety na dotykových ovládacích prvkoch majú minimálne 44 px tam, kde boli predtým príliš malé.
- Inštalačný prompt je oznamovaný ako pomenovaný región bez automatického kradnutia focusu, tlačidlá ostávajú klávesnicovo dostupné a prechod rešpektuje reduced motion.
- Finálne Lighthouse Accessibility skóre je 100 na všetkých 20 kombináciách trasa/profil. Automatizované skóre však nenahrádza test so screen readerom a fyzickou klávesnicou.

### PWA a offline režim

- Manifest má stabilné `id`, `start_url` a `scope` nastavené na `/`, slovenský jazyk, `standalone` režim, konzistentný `theme_color` a `background_color`.
- K dispozícii sú PNG ikony 192×192 a 512×512 s `purpose: any`, samostatná 512×512 maskable deklarácia a 180×180 Apple touch ikona.
- Precache bol zúžený zo 128 položiek / 6 539,56 KiB na 17 položiek / 502,51 KiB. Obsahuje offline dokument, shell CSS a ikony, nie celý verejný web.
- Pôvodný `navigateFallback: '/'` odkazoval na URL, ktorá nebola v precache, a mohol vyvolať Workbox `non-precached-url`. Navyše sa pri vizuálnej kontrole odhalil stav, keď sa offline fallback zobrazil aj pri online navigácii.
- Finálne riešenie používa `navigateFallback: null`, `NetworkOnly` pre dokumentové navigácie a `PrecacheFallbackPlugin` smerovaný na statický offline dokument. SSR HTML sa zámerne neukladá do Cache Storage, pretože spoločný header sa mení podľa prihláseného účtu.
- Do krátkej `NetworkFirst` cache idú iba nízkorizikové verejné katalógy, mapa, schválené úlovky a sponzori. Výstrahy, uzávierky, obsadenosť a súťažné live dáta sú vždy sieťové a majú `Cache-Control: no-store`, aby pomalé pripojenie potichu nevrátilo neaktuálnu bezpečnostnú informáciu.
- Verejný `GET /api/reservations` vracia iba redigovaný availability DTO so syntetickými ID, bez mena hosťa, e-mailu, telefónu, internej poznámky a interných väzieb požičovne. Úplný prevádzkový zoznam vrátane interných poznámok poskytuje iba rolou chránený `GET /api/admin/reservations`; prihlásený rybár vidí cez účtové API iba vlastné rezervácie bez internej poznámky. Súkromné HTML a účtové/admin API navyše posielajú `private, no-store`.
- Aktivácia service workera aj odhlásenie mažú staré `rybolov-pages` a `rybolov-public-api` cache, ktoré mohli zostať z predchádzajúcej verzie.
- Vývojový service worker je predvolene vypnutý a aktivuje sa iba explicitným `NUXT_PWA_DEV=true`, aby lokálny vývoj nepracoval so zastaranou cache.
- Push handler bezpečne spracuje neplatný JSON, obmedzuje cieľové URL na rovnaký origin, používa presnejšie zhodovanie existujúcich okien a pri neúspešnej navigácii otvorí nové okno.
- Prehliadačový test overil, že online navigácia na `/info` načíta živú stránku a offline navigácia na neznámu trasu zobrazí riadený fallback.
- Route testy overujú redakciu verejného rezervačného DTO a admin guard; Playwright PWA test navyše kontroluje `Cache-Control: no-store` a absenciu `contactPhone` a `internalNote` vo verejnej odpovedi.

### SEO

- Všetkých desať verejných stránok používa stránkovo špecifický title a description.
- Každá stránka deklaruje canonical URL, Open Graph metadata a Twitter card; detail revíru používa doménový obrázok.
- Globálne je nastavené `lang="sk"`, konzistentná theme color, názov aplikácie a Apple mobile metadata.
- Bol doplnený `robots.txt`; súkromné HTML obrazovky posielajú `X-Robots-Tag: noindex, nofollow, noarchive`. Odpovede `/api/account/*` a `/api/admin/*` používajú `private, no-store` a celý `/api` priestor je zakázaný aj v `robots.txt`.
- Lighthouse SEO je 100 pre všetkých 20 finálnych kombinácií. Build s `RYBOLOV_ENVIRONMENT=production` teraz bez `NUXT_PUBLIC_SITE_URL` zlyhá, takže produkcia nemôže potichu publikovať canonical a Open Graph URL s localhost originom.

## Funkčné a vizuálne overenie

Playwright smoke testy pokrývajú v mobilnom aj desktopovom projekte tieto požadované flowy:

1. výber jazera → mapa → rezervácia;
2. priama rezervácia bez tichého predvolenia miesta, výbavy, doplnkov a platby (jazero, termín a základná povolenka ostávajú explicitným východiskovým kontextom);
3. prihlásenie rybára cez lokálny mock účet;
4. otvorenie zápisníka cez kód.

Štyri flowy boli spustené v mobilnom aj desktopovom projekte; všetkých osem testov prešlo. Samostatné PWA online/offline overenie prešlo v oboch projektoch, teda 2/2. Regresný test navyše v oboch profiloch overil, že admin rezervácie a požičovňa pri SSR preposielajú session do chráneného API bez 401 a seed fallbacku. Celá Playwright sada tak skončila **12/12**.

Vizuálne boli skontrolované pracovné obrazovky pri 390 × 844 a 1280 × 900:

- [Domov – mobil 390 × 844](./screenshots/mobile-home-390x844.png)
- [Mapa – mobil 390 × 844](./screenshots/mobile-map-390x844.png)
- [Rezervácia bez tichých predvolieb – mobil 390 × 844](./screenshots/mobile-reservation-390x844.png)
- [Prihlásenie – mobil 390 × 844](./screenshots/mobile-login-390x844.png)
- [Domov – desktop 1280 × 900](./screenshots/desktop-home-1280x900.png)
- [Mapa – desktop 1280 × 900](./screenshots/desktop-map-1280x900.png)
- [Rezervácia – desktop 1280 × 900](./screenshots/desktop-reservation-1280x900.png)

## Zostávajúce riziká

1. **Mobilný LCP ešte nie je všade v dobrom pásme.** Finálne hodnoty 3,0–3,68 s na obsahovo bohatých trasách sú veľký posun, ale cieľ pre 75. percentil poľných dát je najviac 2,5 s. Prioritou má byť RUM a optimalizácia podľa skutočných zariadení a siete.
2. **INP nie je pokrytý laboratórnym auditom.** TBT je iba proxy. Po nasadení treba zbierať Web Vitals a sledovať najmä filtre mapy, kalendár rezervácií a notifikačné nastavenia.
3. **Notifikácie majú mobilný TBT 254 ms.** Je to pod baseline 267 ms, ale výrazne viac než ostatné finálne verejné stránky. Nasledujúci krok je profilovať hydration a event handlery tejto obrazovky.
4. **Spoločný klientsky bundle má ďalší priestor.** Lighthouse na mobilných trasách stále odhaduje približne 31–34 KiB nepoužitého JavaScriptu a hlavný CSS blokuje prvé vykreslenie približne o 150 ms.
5. **Mapový podklad je najväčší pracovný asset.** Mapa a súťaže prenášajú približne 266 KiB JPEG podklad, preto majú finálny prenos okolo 0,56 MB. Ďalšia optimalizácia musí zachovať čitateľnosť miest a sektorov; vhodné sú responzívne varianty alebo dlaždice, nie plošné zníženie kvality.
6. **Obrázky revírov majú menšie zostávajúce úspory.** Lighthouse odhaduje približne 41 KiB na zozname revírov a 16 KiB na detaile. Ide o nižšiu prioritu než JavaScript, INP a mapa.
7. **Výsledky na mobile kolíšu.** Detail Veľkého Cetína mal jeden Performance beh 64 pri ďalších výsledkoch 85 a 90. Treba sledovať poľné percentily a neopierať rozhodnutia o jediný Lighthouse run.
8. **PWA treba potvrdiť na fyzických zariadeniach.** Zostáva manuálny test inštalácie, aktualizácie service workera, cold offline štartu a návratu online na aktuálnom iOS Safari a Android Chrome. iOS a Android majú odlišné install flowy.
9. **Push nie je produkčne end-to-end overený.** Bez VAPID dispatcheru, reálnej subscription databázy a Supabase prostredia sa dá overiť klientský lifecycle, nie spoľahlivosť doručenia a obnova expirovaných odberov.
10. **Automatizovaná accessibility kontrola nie je úplná záruka WCAG.** Pred produkciou zostáva test screen readerom, klávesnicou bez myši, pri 200 % zoome, v systéme s vysokým kontrastom a s dlhšími reálnymi textami.
11. **Produkčný origin musí byť explicitný.** Ochrana buildu ho pri `RYBOLOV_ENVIRONMENT=production` vynúti; staging a produkčný deployment preto musia nastaviť správne `NUXT_PUBLIC_SITE_URL`.

## Odporúčané ďalšie poradie

1. nasadiť Web Vitals/RUM a vyhodnotiť 75. percentil LCP a INP podľa trasy a zariadenia;
2. profilovať klientsky runtime notifikácií a zdieľaný verejný bundle;
3. pripraviť responzívny alebo dlaždicový mapový podklad so zachovaním detailu;
4. vykonať fyzický iOS/Android PWA test vrátane aktualizácie service workera;
5. dokončiť manuálny screen-reader a klávesnicový audit;
6. po sprístupnení backendu spraviť end-to-end audit push notifikácií, rezervácií a offline synchronizácie s reálnymi pravidlami RLS.
